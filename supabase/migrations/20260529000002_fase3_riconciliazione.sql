-- Fase 3 — Task 4: riconciliazione presenze (stadio c della pipeline) + coda di
-- risoluzione dei match ambigui. → gate M3a.
--
-- L'algoritmo legge il `contenuto` del grezzo (write-once) e, per ogni riga,
-- cerca un'Iscrizione attiva sull'Edizione della Sessione, PRIMA per
-- `iscrizione.email_riconciliazione`, POI (se nulla) per `persona.email`
-- (D17/D33) — implementato come `coalesce(email_riconciliazione, persona.email)`.
-- Esiti, SEMPRE via audit_append (mai INSERT diretto su evento):
--   • 1 candidato      → Evento `presenza_webinar_registrata` (actor=discente)
--   • ≥2 candidati     → riga in CODA (tipo='ambiguo'), nessun Evento di presenza
--   • 0 con email      → riga in CODA (tipo='assente'), nessun Evento
--   • riga senza email → Evento `partecipante_non_riconciliato` (identificatore
--                        stabile = hash dei campi; nome NON nel payload)
-- La verità resta negli Eventi; la coda è solo working-state operativo.
-- Decisioni §10: blocco+risoluzione manuale per gli ambigui; riconciliazione
-- automatica all'import + ri-esecuzione manuale.
--
-- NB: il parsing della durata (stringa grezza → minuti) è di compliance.ts
-- (ricalcolo cache, M3a #9): qui la presenza porta durata/join/leave "come ricevuti".

-- ===========================================================================
-- 1) Coda di risoluzione (working-state; gli Eventi restano la verità)
-- ===========================================================================
create table public.coda_riconciliazione (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  grezzo_id uuid not null references public.report_partecipazione_grezzo(id),
  sessione_id uuid not null references public.sessione(id),
  riga int not null,                              -- valore del campo 'riga' nel contenuto
  tipo text not null check (tipo in ('ambiguo', 'assente')),
  candidati jsonb not null default '[]'::jsonb,   -- iscrizione_id candidati (ambiguo)
  risolto_at timestamptz,                         -- quando l'admin ha agito
  esito text check (esito in ('presenza', 'ignorato')),
  evento_id uuid,                                 -- Evento di risoluzione
  creato_il timestamptz not null default now(),
  unique (grezzo_id, riga)
);
alter table public.coda_riconciliazione enable row level security;
create index coda_tenant_idx on public.coda_riconciliazione(tenant_id);
create index coda_sessione_idx on public.coda_riconciliazione(sessione_id);
create index coda_pending_idx on public.coda_riconciliazione(tenant_id) where risolto_at is null;

-- Lettura admin/auditor del tenant. Nessuna policy write: si scrive solo dalle
-- funzioni SECURITY DEFINER qui sotto.
revoke all on public.coda_riconciliazione from anon, authenticated;
grant select on public.coda_riconciliazione to authenticated;
create policy coda_read_admin_auditor on public.coda_riconciliazione
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_admin() or public.is_auditor()));

-- ===========================================================================
-- 2) RLS — l'admin deve poter leggere Persone e Iscrizioni del proprio tenant
--    (per scegliere l'iscritto giusto nella risoluzione dei match ambigui).
--    Policy ADDITIVE: si sommano (OR) a quelle esistenti (self/auditor).
-- ===========================================================================
create policy persona_read_admin on public.persona
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

create policy iscrizione_read_admin on public.iscrizione
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- ===========================================================================
-- 3) pipeline_riconcilia_grezzo — stadio (c). Idempotente: salta le righe che
--    hanno già un Evento di presenza/non-riconciliazione (auto-run + ri-run).
-- ===========================================================================
create or replace function public.pipeline_riconcilia_grezzo(p_grezzo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_grezzo public.report_partecipazione_grezzo;
  v_edizione uuid;
  v_importer uuid;
  v_row jsonb;
  v_idx int;
  v_riga int;
  v_email text;
  v_ident text;
  v_ncand int;
  v_only_iscr uuid;
  v_only_persona uuid;
  v_iscr_arr uuid[];
  v_persona_arr uuid[];
  v_registrate int := 0; v_ambigui int := 0; v_assenti int := 0;
  v_anonimi int := 0; v_gia int := 0;
begin
  select * into v_grezzo from public.report_partecipazione_grezzo where id = p_grezzo_id;
  if not found then
    raise exception 'pipeline_riconcilia_grezzo: grezzo % inesistente', p_grezzo_id;
  end if;

  -- authz come pipeline_ingest_grezzo (anon è privo di EXECUTE; vedi grant).
  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_grezzo.tenant_id) then
    raise exception 'pipeline_riconcilia_grezzo: solo un admin del tenant può riconciliare';
  end if;

  select edizione_id into v_edizione from public.sessione where id = v_grezzo.sessione_id;
  v_importer := v_grezzo.importato_da; -- attore degli Eventi non_riconciliato all'auto-run

  for v_idx in 0 .. jsonb_array_length(v_grezzo.contenuto) - 1 loop
    v_row := v_grezzo.contenuto -> v_idx;
    v_riga := coalesce((v_row->>'riga')::int, v_idx + 1);
    v_email := nullif(btrim(lower(coalesce(v_row->>'email', ''))), '');

    -- idempotenza: riga già esitata (presenza o non-riconciliazione) → skip
    if exists (
      select 1 from public.evento e
      where e.tenant_id = v_grezzo.tenant_id
        and e.event_type in ('presenza_webinar_registrata', 'partecipante_non_riconciliato')
        and (e.payload->>'grezzo_id')::uuid = p_grezzo_id
        and (e.payload->>'riga')::int = v_riga
    ) then
      v_gia := v_gia + 1;
      continue;
    end if;

    -- riga anonima (senza email) → non_riconciliato con identificatore stabile
    if v_email is null then
      v_ident := encode(digest(
        coalesce(v_row->>'nome','') || '|' || coalesce(v_row->>'join','') || '|' ||
        coalesce(v_row->>'leave','') || '|' || coalesce(v_row->>'durata',''), 'sha256'), 'hex');
      perform public.audit_append(
        v_grezzo.tenant_id, 'partecipante_non_riconciliato',
        jsonb_build_object('persona_id', v_importer, 'type', 'persona'),
        'sessione', v_grezzo.sessione_id,
        jsonb_build_object('grezzo_id', p_grezzo_id, 'riga', v_riga, 'identificatore', v_ident,
          'motivo', 'anonimo', 'durata', v_row->>'durata', 'join', v_row->>'join', 'leave', v_row->>'leave'));
      v_anonimi := v_anonimi + 1;
      continue;
    end if;

    -- candidati: coalesce(email_riconciliazione, persona.email) = email della riga
    select count(*), array_agg(i.id), array_agg(i.persona_id)
      into v_ncand, v_iscr_arr, v_persona_arr
    from public.iscrizione i
    join public.persona p on p.id = i.persona_id
    where i.edizione_id = v_edizione
      and lower(coalesce(nullif(i.email_riconciliazione, ''), p.email)) = v_email;

    if v_ncand = 1 then
      v_only_iscr := v_iscr_arr[1];
      v_only_persona := v_persona_arr[1];
      perform public.audit_append(
        v_grezzo.tenant_id, 'presenza_webinar_registrata',
        jsonb_build_object('persona_id', v_only_persona, 'type', 'persona'),
        'sessione', v_grezzo.sessione_id,
        jsonb_build_object('iscrizione_id', v_only_iscr, 'grezzo_id', p_grezzo_id, 'riga', v_riga,
          'durata', v_row->>'durata', 'join', v_row->>'join', 'leave', v_row->>'leave', 'match', 'automatico'));
      v_registrate := v_registrate + 1;
      -- se esisteva una coda pending per la riga (es. dopo correzione email + ri-run), chiudila
      update public.coda_riconciliazione
        set risolto_at = now(), esito = 'presenza'
        where grezzo_id = p_grezzo_id and riga = v_riga and risolto_at is null;
    elsif v_ncand >= 2 then
      insert into public.coda_riconciliazione (tenant_id, grezzo_id, sessione_id, riga, tipo, candidati)
      select v_grezzo.tenant_id, p_grezzo_id, v_grezzo.sessione_id, v_riga, 'ambiguo',
        (select coalesce(jsonb_agg(i.id), '[]'::jsonb)
           from public.iscrizione i join public.persona p on p.id = i.persona_id
          where i.edizione_id = v_edizione
            and lower(coalesce(nullif(i.email_riconciliazione, ''), p.email)) = v_email)
      on conflict (grezzo_id, riga) do nothing;
      v_ambigui := v_ambigui + 1;
    else
      insert into public.coda_riconciliazione (tenant_id, grezzo_id, sessione_id, riga, tipo, candidati)
      values (v_grezzo.tenant_id, p_grezzo_id, v_grezzo.sessione_id, v_riga, 'assente', '[]'::jsonb)
      on conflict (grezzo_id, riga) do nothing;
      v_assenti := v_assenti + 1;
    end if;
  end loop;

  return jsonb_build_object('registrate', v_registrate, 'ambigui', v_ambigui,
    'assenti', v_assenti, 'anonimi', v_anonimi, 'gia_risolte', v_gia);
end;
$$;

-- ===========================================================================
-- 4) Aggancio dell'auto-riconciliazione all'import (decisione §10): lo stadio
--    (c) di pipeline_ingest_grezzo ora chiama la riconciliazione, stessa
--    transazione. CREATE OR REPLACE: rimpiazza la versione del Task 2.
-- ===========================================================================
create or replace function public.pipeline_ingest_grezzo(
  p_tenant_id uuid,
  p_sessione_id uuid,
  p_fonte public.report_fonte,
  p_contenuto jsonb,
  p_importato_da uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_sessione public.sessione;
  v_grezzo_id uuid;
  v_hash_hex text;
  v_righe int;
  v_evento public.evento;
  v_ric jsonb;
begin
  if p_tenant_id is null then raise exception 'pipeline_ingest_grezzo: tenant_id mancante'; end if;
  if p_sessione_id is null then raise exception 'pipeline_ingest_grezzo: sessione_id mancante'; end if;
  if p_fonte is null then raise exception 'pipeline_ingest_grezzo: fonte mancante'; end if;
  if p_contenuto is null or jsonb_typeof(p_contenuto) <> 'array' then
    raise exception 'pipeline_ingest_grezzo: contenuto deve essere un array JSON di righe';
  end if;
  v_righe := jsonb_array_length(p_contenuto);
  if v_righe = 0 then
    raise exception 'pipeline_ingest_grezzo: contenuto vuoto (0 righe): probabile errore di parsing a monte';
  end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null then
    if not (public.is_admin() and v_caller_tenant = p_tenant_id) then
      raise exception 'pipeline_ingest_grezzo: solo un admin del tenant può importare un grezzo';
    end if;
  end if;

  select s.* into v_sessione from public.sessione s where s.id = p_sessione_id;
  if not found then
    raise exception 'pipeline_ingest_grezzo: sessione % inesistente', p_sessione_id;
  end if;
  if v_sessione.tenant_id <> p_tenant_id then
    raise exception 'pipeline_ingest_grezzo: la sessione % non appartiene al tenant %', p_sessione_id, p_tenant_id;
  end if;

  if p_importato_da is null then
    raise exception 'pipeline_ingest_grezzo: import automatico (importato_da NULL) non ancora supportato — vedi Task 6 (adattatore API Teams)';
  end if;
  if not exists (select 1 from public.persona pe where pe.id = p_importato_da and pe.tenant_id = p_tenant_id) then
    raise exception 'pipeline_ingest_grezzo: importato_da % non è una Persona del tenant %', p_importato_da, p_tenant_id;
  end if;

  -- (a) grezzo write-once
  insert into public.report_partecipazione_grezzo (tenant_id, sessione_id, fonte, contenuto, importato_da)
  values (p_tenant_id, p_sessione_id, p_fonte, p_contenuto, p_importato_da)
  returning id into v_grezzo_id;

  -- (b) Evento di import
  v_hash_hex := encode(public.grezzo_content_hash(p_contenuto), 'hex');
  v_evento := public.audit_append(
    p_tenant_id, 'report_grezzo_importato',
    jsonb_build_object('persona_id', p_importato_da, 'type', 'persona'),
    'report_partecipazione_grezzo', v_grezzo_id,
    jsonb_build_object('fonte', p_fonte::text, 'hash', v_hash_hex, 'righe', v_righe));

  -- (c) riconciliazione automatica all'import (decisione §10)
  v_ric := public.pipeline_riconcilia_grezzo(v_grezzo_id);

  return jsonb_build_object(
    'grezzo_id', v_grezzo_id, 'evento_id', v_evento.id, 'evento_seq', v_evento.seq,
    'hash', v_hash_hex, 'righe', v_righe, 'riconciliazione', v_ric);
end;
$$;

-- ===========================================================================
-- 5) Risoluzione manuale di un item della coda → scrive gli Eventi (mai UPDATE).
-- ===========================================================================
-- (a) Scelta dell'iscritto corretto: presenza + match_risolto_manualmente.
create or replace function public.riconcilia_risolvi_match(
  p_coda_id uuid,
  p_iscrizione_id uuid,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_coda public.coda_riconciliazione;
  v_grezzo public.report_partecipazione_grezzo;
  v_row jsonb;
  v_persona uuid;
  v_admin uuid;
  v_evt public.evento;
begin
  if p_motivazione is null or length(btrim(p_motivazione)) = 0 then
    raise exception 'riconcilia_risolvi_match: motivazione obbligatoria';
  end if;
  select * into v_coda from public.coda_riconciliazione where id = p_coda_id;
  if not found then raise exception 'riconcilia_risolvi_match: item % inesistente', p_coda_id; end if;
  if v_coda.risolto_at is not null then raise exception 'riconcilia_risolvi_match: item già risolto'; end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_coda.tenant_id) then
    raise exception 'riconcilia_risolvi_match: solo un admin del tenant';
  end if;

  -- attore (admin); fallback all'importatore per chiamate service_role/test
  v_admin := public.current_persona_id();
  if v_admin is null then
    select importato_da into v_admin from public.report_partecipazione_grezzo where id = v_coda.grezzo_id;
  end if;

  -- l'iscrizione scelta deve appartenere all'Edizione della Sessione (stesso tenant)
  if not exists (
    select 1 from public.iscrizione i join public.sessione s on s.edizione_id = i.edizione_id
    where i.id = p_iscrizione_id and s.id = v_coda.sessione_id and i.tenant_id = v_coda.tenant_id
  ) then
    raise exception 'riconcilia_risolvi_match: iscrizione % non valida per la sessione', p_iscrizione_id;
  end if;
  -- per gli ambigui dev'essere uno dei candidati proposti
  if v_coda.tipo = 'ambiguo' and not (v_coda.candidati ? p_iscrizione_id::text) then
    raise exception 'riconcilia_risolvi_match: iscrizione % non è tra i candidati', p_iscrizione_id;
  end if;

  select persona_id into v_persona from public.iscrizione where id = p_iscrizione_id;
  select * into v_grezzo from public.report_partecipazione_grezzo where id = v_coda.grezzo_id;
  select elem into v_row from jsonb_array_elements(v_grezzo.contenuto) elem
    where (elem->>'riga')::int = v_coda.riga limit 1;

  v_evt := public.audit_append(
    v_coda.tenant_id, 'presenza_webinar_registrata',
    jsonb_build_object('persona_id', v_persona, 'type', 'persona'),
    'sessione', v_coda.sessione_id,
    jsonb_build_object('iscrizione_id', p_iscrizione_id, 'grezzo_id', v_coda.grezzo_id, 'riga', v_coda.riga,
      'durata', v_row->>'durata', 'join', v_row->>'join', 'leave', v_row->>'leave',
      'match', 'manuale', 'risolto_da', v_admin, 'motivazione', p_motivazione));

  perform public.audit_append(
    v_coda.tenant_id, 'match_risolto_manualmente',
    jsonb_build_object('persona_id', v_admin, 'type', 'persona'),
    'sessione', v_coda.sessione_id,
    jsonb_build_object('grezzo_id', v_coda.grezzo_id, 'riga', v_coda.riga,
      'iscrizione_id', p_iscrizione_id, 'coda_id', p_coda_id, 'motivazione', p_motivazione));

  update public.coda_riconciliazione
    set risolto_at = now(), esito = 'presenza', evento_id = v_evt.id
    where id = p_coda_id;

  return jsonb_build_object('presenza_evento_id', v_evt.id, 'iscrizione_id', p_iscrizione_id);
end;
$$;

-- (b) Ignora definitivamente la riga → partecipante_non_riconciliato.
create or replace function public.riconcilia_ignora(
  p_coda_id uuid,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_coda public.coda_riconciliazione;
  v_grezzo public.report_partecipazione_grezzo;
  v_row jsonb;
  v_admin uuid;
  v_ident text;
  v_evt public.evento;
begin
  if p_motivazione is null or length(btrim(p_motivazione)) = 0 then
    raise exception 'riconcilia_ignora: motivazione obbligatoria';
  end if;
  select * into v_coda from public.coda_riconciliazione where id = p_coda_id;
  if not found then raise exception 'riconcilia_ignora: item % inesistente', p_coda_id; end if;
  if v_coda.risolto_at is not null then raise exception 'riconcilia_ignora: item già risolto'; end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_coda.tenant_id) then
    raise exception 'riconcilia_ignora: solo un admin del tenant';
  end if;

  v_admin := public.current_persona_id();
  if v_admin is null then
    select importato_da into v_admin from public.report_partecipazione_grezzo where id = v_coda.grezzo_id;
  end if;

  select * into v_grezzo from public.report_partecipazione_grezzo where id = v_coda.grezzo_id;
  select elem into v_row from jsonb_array_elements(v_grezzo.contenuto) elem
    where (elem->>'riga')::int = v_coda.riga limit 1;
  v_ident := encode(digest(
    coalesce(v_row->>'nome','') || '|' || coalesce(v_row->>'join','') || '|' ||
    coalesce(v_row->>'leave','') || '|' || coalesce(v_row->>'durata',''), 'sha256'), 'hex');

  v_evt := public.audit_append(
    v_coda.tenant_id, 'partecipante_non_riconciliato',
    jsonb_build_object('persona_id', v_admin, 'type', 'persona'),
    'sessione', v_coda.sessione_id,
    jsonb_build_object('grezzo_id', v_coda.grezzo_id, 'riga', v_coda.riga, 'identificatore', v_ident,
      'motivo', 'ignorato', 'motivazione', p_motivazione,
      'durata', v_row->>'durata', 'join', v_row->>'join', 'leave', v_row->>'leave'));

  update public.coda_riconciliazione
    set risolto_at = now(), esito = 'ignorato', evento_id = v_evt.id
    where id = p_coda_id;

  return jsonb_build_object('evento_id', v_evt.id);
end;
$$;

-- ===========================================================================
-- 6) Grant: niente public/anon; authenticated (admin via guardia) + service_role.
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.pipeline_riconcilia_grezzo(uuid)',
    'public.riconcilia_risolvi_match(uuid, uuid, text)',
    'public.riconcilia_ignora(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end$$;
