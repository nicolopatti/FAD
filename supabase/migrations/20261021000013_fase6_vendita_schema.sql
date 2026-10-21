-- ===========================================================================
-- Fase 6 — Vendita dei corsi, Task 1: schema (docs/brief-fase-6-vendita.md §6).
--
-- * tenant_dominio: host → ente (premessa del multi-ente; '*' vale come jolly).
-- * offerta: cosa si vende (un'edizione, prezzo IVA inclusa, posti, durata
--   dell'accesso, finestra di vendita, testi pubblici).
-- * ordine: lo stato del pagamento; contiene i dati di fatturazione (PII: è il
--   documento, come l'attestato), modificabile SOLO dalle RPC qui sotto
--   (service role, chiamate dal server e dal webhook di Stripe).
-- * iscrizione: accesso per singolo iscritto (accesso_dal/fino_al, revoca) e
--   origine. La finestra effettiva = edizione ∩ iscrizione (R2 esteso).
-- * Catalogo pubblico: lettura anonima SOLO via catalogo_pubblico/catalogo_offerta
--   (security definer, campi pubblici, nessun dato di persone).
--
-- Eventi nuovi (audit_append, nessuna PII): ordine.created/paid/refunded/cancelled,
-- iscrizione.created/updated/revoked {origine: 'acquisto'}, persona.created/
-- persona.registrata {origine: 'registrazione'}.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Iscrizione: accesso per iscritto
-- --------------------------------------------------------------------------
alter table public.iscrizione
  add column if not exists accesso_dal date,
  add column if not exists accesso_fino_al date,
  add column if not exists accesso_revocato_at timestamptz,
  add column if not exists origine text not null default 'admin';

alter table public.iscrizione
  add constraint iscrizione_origine_check check (origine in ('admin', 'import', 'acquisto')),
  add constraint iscrizione_accesso_coerente check (
    accesso_dal is null or accesso_fino_al is null or accesso_fino_al >= accesso_dal);

comment on column public.iscrizione.accesso_fino_al is
  'Ultimo giorno (Europe/Rome) di accesso del singolo iscritto (vendita con accesso a scadenza). Null = vale solo la finestra dell''edizione.';
comment on column public.iscrizione.accesso_revocato_at is
  'Accesso revocato (es. rimborso). L''iscrizione e i suoi Eventi restano: il registro è append-only.';

create or replace function public.iscrizione_finestra_stato(p_iscrizione_id uuid, p_at timestamptz default now())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_i record;
  v_ed text;
  v_oggi date := (p_at at time zone 'Europe/Rome')::date;
begin
  select id, edizione_id, accesso_dal, accesso_fino_al, accesso_revocato_at into v_i
  from public.iscrizione where id = p_iscrizione_id;
  if not found then return null; end if;
  if v_i.accesso_revocato_at is not null then return 'revocata'; end if;
  v_ed := public.edizione_finestra_stato(v_i.edizione_id, p_at);
  if v_ed is distinct from 'aperta' then return v_ed; end if;
  if v_i.accesso_dal is not null and v_oggi < v_i.accesso_dal then return 'non_aperta'; end if;
  if v_i.accesso_fino_al is not null and v_oggi > v_i.accesso_fino_al then return 'scaduta'; end if;
  return 'aperta';
end;
$$;

revoke all on function public.iscrizione_finestra_stato(uuid, timestamptz) from public, anon;
grant execute on function public.iscrizione_finestra_stato(uuid, timestamptz) to authenticated, service_role;

comment on function public.iscrizione_finestra_stato(uuid, timestamptz) is
  'Finestra effettiva di un iscritto: stato dell''edizione, poi accesso_dal/fino_al e revoca. aperta | non_aperta | chiusa | conclusa | annullata | scaduta | revocata. Stessa regola di src/lib/finestra.ts.';

-- La RPC del player usa ora la finestra dell'iscrizione (corpo identico a
-- 20261021000008 salvo il controllo della finestra).
create or replace function public.evento_player_registra(
  p_iscrizione_id uuid,
  p_learning_object_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_persona uuid := public.current_persona_id();
  v_iscr record;
  v_item record;
  v_prev record;
  v_tipo_lo text;
  v_evento public.evento;
  v_payload jsonb;
  v_finestra text;
begin
  if v_persona is null then raise exception 'evento_player_registra: non autenticato'; end if;
  if p_event_type is null or p_event_type not in (
    'video.play', 'video.pause', 'video.seek', 'video.progress', 'video.ended',
    'documento.opened', 'documento.completed', 'quiz.started'
  ) then
    raise exception 'evento_player_registra: event_type non ammesso';
  end if;

  select i.id, i.tenant_id, i.persona_id, i.edizione_id, e.corso_id, c.sblocco_sequenziale
    into v_iscr
  from public.iscrizione i
  join public.edizione e on e.id = i.edizione_id
  join public.corso c on c.id = e.corso_id
  where i.id = p_iscrizione_id;
  if not found or v_iscr.persona_id <> v_persona then
    raise exception 'evento_player_registra: iscrizione non valida';
  end if;

  -- R2 (+ Fase 6): fuori dalla finestra dell'edizione o dell'accesso niente eventi.
  v_finestra := public.iscrizione_finestra_stato(p_iscrizione_id);
  if v_finestra is distinct from 'aperta' then
    if v_finestra in ('scaduta', 'revocata') then
      raise exception 'evento_player_registra: lezioni non disponibili (accesso %)', v_finestra;
    end if;
    raise exception 'evento_player_registra: lezioni non disponibili (edizione %)', replace(v_finestra, '_', ' ');
  end if;

  select s.ordine, s.obbligatorio, l.type::text as lo_type
    into v_item
  from public.struttura_corso s
  join public.learning_object l on l.id = s.learning_object_id
  where s.corso_id = v_iscr.corso_id and s.learning_object_id = p_learning_object_id;
  if not found then raise exception 'evento_player_registra: LO non in corso'; end if;

  v_tipo_lo := split_part(p_event_type, '.', 1);
  if (v_tipo_lo = 'video' and v_item.lo_type <> 'video')
     or (v_tipo_lo = 'documento' and v_item.lo_type <> 'documento')
     or (v_tipo_lo = 'quiz' and v_item.lo_type <> 'quiz') then
    raise exception 'evento_player_registra: tipo di evento non coerente con il contenuto';
  end if;

  -- D26: sblocco sequenziale "per Eventi" (tutti gli obbligatori precedenti completati).
  if v_iscr.sblocco_sequenziale then
    for v_prev in
      select s.learning_object_id, s.regola_completamento ->> 'tipo' as regola
      from public.struttura_corso s
      where s.corso_id = v_iscr.corso_id and s.ordine < v_item.ordine and s.obbligatorio
    loop
      if not exists (
        select 1 from public.evento ev
        where ev.tenant_id = v_iscr.tenant_id
          and ev.subject_id = v_prev.learning_object_id
          and (ev.actor ->> 'persona_id')::uuid = v_persona
          and ev.payload ->> 'iscrizione_id' = p_iscrizione_id::text
          and ev.event_type = case v_prev.regola
                                when 'video_ended' then 'video.ended'
                                when 'documento_completed' then 'documento.completed'
                                when 'quiz_passed' then 'quiz.submitted'
                                else '__nessuno__' end
          and (v_prev.regola <> 'quiz_passed' or ev.payload ->> 'superato' = 'true')
      ) then
        raise exception 'evento_player_registra: LO non sbloccato (sblocco_sequenziale)';
      end if;
    end loop;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('iscrizione_id', p_iscrizione_id);
  v_evento := public.audit_append(
    v_iscr.tenant_id, p_event_type,
    jsonb_build_object('persona_id', v_persona, 'type', 'persona'),
    'learning_object', p_learning_object_id, v_payload);
  return jsonb_build_object('evento_id', v_evento.id, 'seq', v_evento.seq, 'persona_id', v_persona, 'tenant_id', v_iscr.tenant_id);
end;
$$;

revoke all on function public.evento_player_registra(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.evento_player_registra(uuid, uuid, text, jsonb) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Host → ente
-- --------------------------------------------------------------------------
create table if not exists public.tenant_dominio (
  host text primary key check (host = lower(host) and length(host) between 3 and 253),
  tenant_id uuid not null references public.tenant(id),
  creato_il timestamptz not null default now()
);
alter table public.tenant_dominio enable row level security;
-- Nessuna policy: lo leggono solo tenant_da_host (security definer) e la service role.
create index if not exists tenant_dominio_tenant_idx on public.tenant_dominio(tenant_id);

comment on table public.tenant_dominio is
  'Indirizzo → ente (catalogo pubblico, registrazione). host esatto (con eventuale :porta) oppure con ''*'' come jolly (es. ''fad-*-nicolopattis-projects.vercel.app''); vince l''esatto.';

create or replace function public.tenant_da_host(p_host text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_dominio
  where host = lower(p_host)
     or (position('*' in host) > 0
         and lower(p_host) like replace(replace(replace(host, '\', '\\'), '_', '\_'), '*', '%'))
  order by (host = lower(p_host)) desc, length(host) desc
  limit 1;
$$;

revoke all on function public.tenant_da_host(text) from public;
grant execute on function public.tenant_da_host(text) to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Offerta
-- --------------------------------------------------------------------------
create table if not exists public.offerta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  edizione_id uuid not null references public.edizione(id),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  stato text not null default 'bozza' check (stato in ('bozza', 'pubblicata', 'ritirata')),
  prezzo_centesimi integer not null check (prezzo_centesimi >= 50 and prezzo_centesimi <= 10000000),
  valuta text not null default 'eur' check (valuta = 'eur'),
  aliquota_iva numeric(5,2) not null default 22 check (aliquota_iva >= 0 and aliquota_iva <= 100),
  natura_iva text check (natura_iva is null or length(natura_iva) <= 120),
  posti_max integer check (posti_max is null or posti_max > 0),
  accesso_giorni integer check (accesso_giorni is null or accesso_giorni between 1 and 3650),
  vendita_dal date,
  vendita_al date,
  codici_sconto boolean not null default false,
  titolo_pubblico text check (titolo_pubblico is null or length(titolo_pubblico) <= 200),
  descrizione_pubblica text check (descrizione_pubblica is null or length(descrizione_pubblica) <= 20000),
  cover_path text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  pubblicata_il timestamptz,
  ritirata_il timestamptz,
  unique (tenant_id, slug),
  check (vendita_dal is null or vendita_al is null or vendita_al >= vendita_dal)
);
alter table public.offerta enable row level security;
create index if not exists offerta_tenant_idx on public.offerta(tenant_id);
create index if not exists offerta_edizione_idx on public.offerta(edizione_id);

comment on column public.offerta.prezzo_centesimi is 'Prezzo finale pagato (IVA inclusa), in centesimi.';
comment on column public.offerta.natura_iva is 'Per le operazioni non imponibili/esenti (es. "Esente art. 10 c.1 n.20 DPR 633/72"); null se imponibile.';
comment on column public.offerta.accesso_giorni is 'Corso "sempre disponibile": giorni di accesso dall''acquisto. Null = edizione a date (vale la finestra dell''edizione).';

create policy offerta_read_staff on public.offerta
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_admin() or public.is_auditor()));
create policy offerta_insert_admin on public.offerta
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy offerta_update_admin on public.offerta
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- L'edizione dell'offerta deve essere dello stesso ente.
create or replace function public.tg_offerta_coerenza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.edizione e where e.id = new.edizione_id and e.tenant_id = new.tenant_id) then
    raise exception 'offerta: edizione di un altro ente';
  end if;
  new.aggiornato_il := now();
  return new;
end;
$$;
revoke all on function public.tg_offerta_coerenza() from public, anon, authenticated;
create trigger offerta_coerenza before insert or update on public.offerta
  for each row execute function public.tg_offerta_coerenza();

-- --------------------------------------------------------------------------
-- Ordine
-- --------------------------------------------------------------------------
create table if not exists public.ordine (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  persona_id uuid not null references public.persona(id),
  offerta_id uuid not null references public.offerta(id),
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'pagato', 'rimborsato', 'annullato')),
  importo_centesimi integer not null check (importo_centesimi >= 0),
  sconto_centesimi integer not null default 0 check (sconto_centesimi >= 0),
  valuta text not null default 'eur',
  aliquota_iva numeric(5,2) not null,
  natura_iva text,
  fatturazione jsonb not null,
  consensi jsonb not null,
  stripe_session_id text unique,
  stripe_payment_intent text unique,
  iscrizione_id uuid references public.iscrizione(id),
  scade_il timestamptz not null,
  creato_il timestamptz not null default now(),
  pagato_il timestamptz,
  rimborsato_il timestamptz,
  annullato_il timestamptz
);
alter table public.ordine enable row level security;
create index if not exists ordine_tenant_idx on public.ordine(tenant_id, creato_il desc);
create index if not exists ordine_persona_idx on public.ordine(persona_id);
create index if not exists ordine_offerta_idx on public.ordine(offerta_id, stato);
create index if not exists ordine_iscrizione_idx on public.ordine(iscrizione_id);

comment on table public.ordine is
  'Ordini della vendita. Dati di fatturazione e consensi = documento (PII ammessa, mai nel registro). Si scrive solo dalle RPC ordine_* (service role).';

create policy ordine_read on public.ordine
  for select to authenticated
  using (
    persona_id = public.current_persona_id()
    or (tenant_id = public.current_tenant_id() and (public.is_admin() or public.is_auditor()))
  );
revoke insert, update, delete on public.ordine from anon, authenticated;

-- --------------------------------------------------------------------------
-- Vendibilità di un'offerta (una sola regola per catalogo e acquisto, §10.7)
-- --------------------------------------------------------------------------
create or replace function public.offerta_motivo_non_vendibile(p_offerta_id uuid, p_at timestamptz default now())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_oggi date := (p_at at time zone 'Europe/Rome')::date;
  v_ed text;
  v_occupati integer;
begin
  select o.*, e.data_inizio, e.annullato_at, e.concluso_at into v
  from public.offerta o join public.edizione e on e.id = o.edizione_id
  where o.id = p_offerta_id;
  if not found then return 'offerta inesistente'; end if;
  if v.stato <> 'pubblicata' then return 'non in vendita'; end if;
  if v.vendita_dal is not null and v_oggi < v.vendita_dal then return 'vendita non ancora aperta'; end if;
  if v.vendita_al is not null and v_oggi > v.vendita_al then return 'vendita chiusa'; end if;
  v_ed := public.edizione_finestra_stato(v.edizione_id, p_at);
  if v_ed in ('chiusa', 'conclusa', 'annullata') then return 'edizione ' || v_ed; end if;
  -- Edizione a date: la vendita chiude dopo il giorno di inizio.
  if v.accesso_giorni is null and v.data_inizio is not null and v_oggi > v.data_inizio then
    return 'edizione già iniziata';
  end if;
  if v.posti_max is not null then
    select count(*) into v_occupati from public.ordine
    where offerta_id = p_offerta_id
      and (stato = 'pagato' or (stato = 'in_attesa' and scade_il > p_at));
    if v_occupati >= v.posti_max then return 'posti esauriti'; end if;
  end if;
  return null;
end;
$$;
revoke all on function public.offerta_motivo_non_vendibile(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.offerta_motivo_non_vendibile(uuid, timestamptz) to service_role;

-- --------------------------------------------------------------------------
-- Catalogo pubblico (anon)
-- --------------------------------------------------------------------------
create or replace function public.catalogo_pubblico(p_host text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with t as (select public.tenant_da_host(p_host) as id)
  select jsonb_build_object(
    'ente', (select coalesce(nullif(trim(ragione_sociale), ''), nome) from public.tenant where id = (select id from t)),
    'offerte', coalesce(jsonb_agg(x.riga order by x.ordine_data nulls last, x.titolo), '[]'::jsonb)
  )
  from (
    select
      coalesce(o.titolo_pubblico, c.titolo) as titolo,
      coalesce(e.data_inizio, '2999-12-31'::date) as ordine_data,
      jsonb_build_object(
        'slug', o.slug,
        'titolo', coalesce(o.titolo_pubblico, c.titolo),
        'descrizione', left(coalesce(o.descrizione_pubblica, c.descrizione, ''), 400),
        'categoria', c.categoria,
        'cover_path', coalesce(o.cover_path, c.cover_path),
        'prezzo_centesimi', o.prezzo_centesimi,
        'valuta', o.valuta,
        'ore_totali', c.ore_totali,
        'tipo', case when o.accesso_giorni is null then 'date' else 'online' end,
        'accesso_giorni', o.accesso_giorni,
        'data_inizio', e.data_inizio,
        'data_fine', e.data_fine,
        'attestato', coalesce(c.politica_attestato, 'nessuna') <> 'nessuna',
        'n_lezioni', (select count(*) from public.struttura_corso s where s.corso_id = c.id),
        'durata_secondi', (select coalesce(sum((l.config ->> 'durata_secondi')::numeric), 0)
                           from public.struttura_corso s join public.learning_object l on l.id = s.learning_object_id
                           where s.corso_id = c.id and l.type = 'video'),
        'in_vendita', public.offerta_motivo_non_vendibile(o.id) is null,
        'motivo', public.offerta_motivo_non_vendibile(o.id)
      ) as riga
    from public.offerta o
    join public.edizione e on e.id = o.edizione_id
    join public.corso c on c.id = e.corso_id
    where o.tenant_id = (select id from t) and o.stato = 'pubblicata' and c.archiviato_at is null
  ) x;
$$;

revoke all on function public.catalogo_pubblico(text) from public;
grant execute on function public.catalogo_pubblico(text) to anon, authenticated, service_role;

create or replace function public.catalogo_offerta(p_host text, p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_da_host(p_host);
  v record;
  v_posti integer;
begin
  if v_tenant is null then return null; end if;
  select o.*, e.data_inizio, e.data_fine, e.codice as edizione_codice,
         c.id as corso_id, c.titolo as corso_titolo, c.descrizione as corso_descrizione,
         c.categoria, c.cover_path as corso_cover, c.ore_totali, c.politica_attestato,
         c.riferimento_normativo, c.sblocco_sequenziale, c.visione_integrale
    into v
  from public.offerta o
  join public.edizione e on e.id = o.edizione_id
  join public.corso c on c.id = e.corso_id
  where o.tenant_id = v_tenant and o.slug = lower(p_slug) and o.stato = 'pubblicata' and c.archiviato_at is null;
  if not found then return null; end if;

  if v.posti_max is not null then
    select greatest(v.posti_max - count(*), 0) into v_posti from public.ordine
    where offerta_id = v.id and (stato = 'pagato' or (stato = 'in_attesa' and scade_il > now()));
  end if;

  return jsonb_build_object(
    'offerta_id', v.id,
    'slug', v.slug,
    'ente', (select coalesce(nullif(trim(ragione_sociale), ''), nome) from public.tenant where id = v_tenant),
    'titolo', coalesce(v.titolo_pubblico, v.corso_titolo),
    'descrizione', coalesce(v.descrizione_pubblica, v.corso_descrizione),
    'categoria', v.categoria,
    'cover_path', coalesce(v.cover_path, v.corso_cover),
    'prezzo_centesimi', v.prezzo_centesimi,
    'valuta', v.valuta,
    'aliquota_iva', v.aliquota_iva,
    'natura_iva', v.natura_iva,
    'ore_totali', v.ore_totali,
    'riferimento_normativo', v.riferimento_normativo,
    'attestato', coalesce(v.politica_attestato, 'nessuna') <> 'nessuna',
    'tipo', case when v.accesso_giorni is null then 'date' else 'online' end,
    'accesso_giorni', v.accesso_giorni,
    'data_inizio', v.data_inizio,
    'data_fine', v.data_fine,
    'posti_max', v.posti_max,
    'posti_rimasti', v_posti,
    'codici_sconto', v.codici_sconto,
    'in_vendita', public.offerta_motivo_non_vendibile(v.id) is null,
    'motivo', public.offerta_motivo_non_vendibile(v.id),
    'lezioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ordine', s.ordine, 'titolo', l.titolo, 'tipo', l.type,
        'durata_secondi', case when l.type = 'video' then (l.config ->> 'durata_secondi')::numeric end,
        'obbligatoria', s.obbligatorio) order by s.ordine)
      from public.struttura_corso s join public.learning_object l on l.id = s.learning_object_id
      where s.corso_id = v.corso_id), '[]'::jsonb),
    'sessioni', coalesce((
      select jsonb_agg(jsonb_build_object('titolo', se.titolo, 'data_ora', se.data_ora, 'durata_minuti', se.durata_minuti, 'modalita', se.modalita) order by se.data_ora nulls last)
      from public.sessione se
      where se.edizione_id = v.edizione_id and se.annullato_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.catalogo_offerta(text, text) from public;
grant execute on function public.catalogo_offerta(text, text) to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Registrazione: collega o crea la Persona dell'utente Auth nell'ente
-- --------------------------------------------------------------------------
create or replace function public.persona_da_registrazione(
  p_auth_user_id uuid, p_tenant_id uuid, p_nome text, p_cognome text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_confermata timestamptz;
  v_persona public.persona;
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_cognome text := nullif(trim(coalesce(p_cognome, '')), '');
begin
  if auth.uid() is not null then raise exception 'persona_da_registrazione: solo dal server'; end if;
  select lower(email), email_confirmed_at into v_email, v_confermata from auth.users where id = p_auth_user_id;
  if v_email is null then raise exception 'persona_da_registrazione: utente inesistente'; end if;
  if v_confermata is null then raise exception 'persona_da_registrazione: email non confermata'; end if;

  select * into v_persona from public.persona where auth_user_id = p_auth_user_id;
  if found then
    return jsonb_build_object('persona_id', v_persona.id, 'tenant_id', v_persona.tenant_id, 'esito', 'esistente');
  end if;

  select * into v_persona from public.persona
  where tenant_id = p_tenant_id and lower(email) = v_email
  for update;
  if found then
    if v_persona.auth_user_id is not null then
      raise exception 'persona_da_registrazione: email già collegata a un altro accesso';
    end if;
    update public.persona set auth_user_id = p_auth_user_id where id = v_persona.id;
    perform public.audit_append(p_tenant_id, 'persona.registrata',
      jsonb_build_object('persona_id', v_persona.id, 'type', 'persona'),
      'persona', v_persona.id, jsonb_build_object('origine', 'registrazione', 'collegata', true));
    return jsonb_build_object('persona_id', v_persona.id, 'tenant_id', p_tenant_id, 'esito', 'collegata');
  end if;

  if v_nome is null or v_cognome is null then
    raise exception 'persona_da_registrazione: nome e cognome obbligatori';
  end if;
  insert into public.persona (tenant_id, auth_user_id, nome, cognome, email)
  values (p_tenant_id, p_auth_user_id, v_nome, v_cognome, v_email)
  returning * into v_persona;
  perform public.audit_append(p_tenant_id, 'persona.created',
    jsonb_build_object('persona_id', v_persona.id, 'type', 'persona'),
    'persona', v_persona.id, jsonb_build_object('origine', 'registrazione', 'ha_codice_fiscale', false));
  return jsonb_build_object('persona_id', v_persona.id, 'tenant_id', p_tenant_id, 'esito', 'creata');
end;
$$;

revoke all on function public.persona_da_registrazione(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.persona_da_registrazione(uuid, uuid, text, text) to service_role;

-- --------------------------------------------------------------------------
-- Ordini: transizioni (solo service role). Ogni transizione = un Evento.
-- --------------------------------------------------------------------------
create or replace function public.ordine_crea(
  p_persona_id uuid, p_offerta_id uuid, p_fatturazione jsonb, p_consensi jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_off record;
  v_persona public.persona;
  v_motivo text;
  v_ordine public.ordine;
  v_vecchie text[] := '{}';
  v_prec record;
begin
  if auth.uid() is not null then raise exception 'ordine_crea: solo dal server'; end if;
  select * into v_persona from public.persona where id = p_persona_id;
  if not found then raise exception 'ordine_crea: persona inesistente'; end if;

  -- Lock sull'offerta: due acquisti dell'ultimo posto non passano insieme.
  select o.* into v_off from public.offerta o where o.id = p_offerta_id for update;
  if not found or v_off.tenant_id <> v_persona.tenant_id then raise exception 'ordine_crea: offerta inesistente'; end if;

  -- Ordini in attesa precedenti della stessa persona per la stessa offerta: annullati
  -- (la sessione Stripe va fatta scadere dal chiamante; se viene pagata lo stesso,
  -- ordine_pagato la onora).
  for v_prec in
    update public.ordine set stato = 'annullato', annullato_il = now()
    where offerta_id = p_offerta_id and persona_id = p_persona_id and stato = 'in_attesa'
    returning id, stripe_session_id
  loop
    if v_prec.stripe_session_id is not null then v_vecchie := v_vecchie || v_prec.stripe_session_id; end if;
    perform public.audit_append(v_persona.tenant_id, 'ordine.cancelled',
      jsonb_build_object('persona_id', p_persona_id, 'type', 'persona'), 'ordine', v_prec.id,
      jsonb_build_object('offerta_id', p_offerta_id, 'motivo', 'sostituito'));
  end loop;

  v_motivo := public.offerta_motivo_non_vendibile(p_offerta_id);
  if v_motivo is not null then raise exception 'ordine_crea: %', v_motivo; end if;

  if exists (
    select 1 from public.iscrizione i
    where i.persona_id = p_persona_id and i.edizione_id = v_off.edizione_id
      and public.iscrizione_finestra_stato(i.id) in ('aperta', 'non_aperta')
  ) then
    raise exception 'ordine_crea: già iscritto';
  end if;

  if p_fatturazione is null or jsonb_typeof(p_fatturazione) <> 'object'
     or coalesce(p_fatturazione ->> 'codice_fiscale', p_fatturazione ->> 'partita_iva', '') = '' then
    raise exception 'ordine_crea: dati di fatturazione incompleti';
  end if;
  if p_consensi is null or coalesce(p_consensi ->> 'termini', '') = '' then
    raise exception 'ordine_crea: consenso ai termini mancante';
  end if;

  insert into public.ordine (tenant_id, persona_id, offerta_id, importo_centesimi, valuta,
                             aliquota_iva, natura_iva, fatturazione, consensi, scade_il)
  values (v_off.tenant_id, p_persona_id, p_offerta_id, v_off.prezzo_centesimi, v_off.valuta,
          v_off.aliquota_iva, v_off.natura_iva, p_fatturazione, p_consensi, now() + interval '31 minutes')
  returning * into v_ordine;

  perform public.audit_append(v_off.tenant_id, 'ordine.created',
    jsonb_build_object('persona_id', p_persona_id, 'type', 'persona'),
    'ordine', v_ordine.id,
    jsonb_build_object('offerta_id', p_offerta_id, 'edizione_id', v_off.edizione_id,
                       'importo_centesimi', v_ordine.importo_centesimi, 'valuta', v_ordine.valuta));

  return jsonb_build_object('ordine_id', v_ordine.id, 'importo_centesimi', v_ordine.importo_centesimi,
    'valuta', v_ordine.valuta, 'scade_il', v_ordine.scade_il, 'codici_sconto', v_off.codici_sconto,
    'sessioni_da_scadere', to_jsonb(v_vecchie));
end;
$$;

revoke all on function public.ordine_crea(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ordine_crea(uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.ordine_imposta_sessione(p_ordine_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then raise exception 'ordine_imposta_sessione: solo dal server'; end if;
  update public.ordine set stripe_session_id = p_session_id
  where id = p_ordine_id and stato = 'in_attesa' and stripe_session_id is null;
  if not found then raise exception 'ordine_imposta_sessione: ordine non in attesa o sessione già impostata'; end if;
end;
$$;
revoke all on function public.ordine_imposta_sessione(uuid, text) from public, anon, authenticated;
grant execute on function public.ordine_imposta_sessione(uuid, text) to service_role;

-- Pagamento confermato da Stripe (webhook). Idempotente sulla sessione.
create or replace function public.ordine_pagato(
  p_session_id text, p_payment_intent text, p_importo_pagato integer, p_sconto integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ord public.ordine;
  v_off public.offerta;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_dal date;
  v_fino date;
  v_iscr_id uuid;
  v_nuova boolean;
  v_attore jsonb;
begin
  if auth.uid() is not null then raise exception 'ordine_pagato: solo dal server'; end if;
  select * into v_ord from public.ordine where stripe_session_id = p_session_id for update;
  if not found then raise exception 'ordine_pagato: sessione sconosciuta'; end if;
  if v_ord.stato in ('pagato', 'rimborsato') then
    return jsonb_build_object('ordine_id', v_ord.id, 'iscrizione_id', v_ord.iscrizione_id, 'gia_registrato', true);
  end if;
  -- Anche un ordine annullato si onora: il denaro è arrivato (sessione vecchia pagata).

  select * into v_off from public.offerta where id = v_ord.offerta_id;
  v_attore := jsonb_build_object('persona_id', v_ord.persona_id, 'type', 'persona');
  if v_off.accesso_giorni is not null then
    v_dal := v_oggi;
    v_fino := v_oggi + v_off.accesso_giorni;
  end if;

  insert into public.iscrizione (tenant_id, persona_id, edizione_id, origine, accesso_dal, accesso_fino_al)
  values (v_ord.tenant_id, v_ord.persona_id, v_off.edizione_id, 'acquisto', v_dal, v_fino)
  on conflict (persona_id, edizione_id) do update
    set accesso_revocato_at = null,
        accesso_dal = excluded.accesso_dal,
        accesso_fino_al = excluded.accesso_fino_al
  returning id, (xmax = 0) into v_iscr_id, v_nuova;

  if v_nuova then
    perform public.audit_append(v_ord.tenant_id, 'iscrizione.created', v_attore, 'iscrizione', v_iscr_id,
      jsonb_build_object('edizione_id', v_off.edizione_id, 'persona_id', v_ord.persona_id,
                         'origine', 'acquisto', 'ordine_id', v_ord.id));
  else
    perform public.audit_append(v_ord.tenant_id, 'iscrizione.updated', v_attore, 'iscrizione', v_iscr_id,
      jsonb_build_object('campi', jsonb_build_array('accesso'), 'origine', 'acquisto', 'ordine_id', v_ord.id));
  end if;

  update public.ordine
  set stato = 'pagato', pagato_il = now(), stripe_payment_intent = p_payment_intent,
      importo_centesimi = coalesce(p_importo_pagato, importo_centesimi),
      sconto_centesimi = coalesce(p_sconto, 0), iscrizione_id = v_iscr_id
  where id = v_ord.id;

  perform public.audit_append(v_ord.tenant_id, 'ordine.paid', v_attore, 'ordine', v_ord.id,
    jsonb_build_object('offerta_id', v_ord.offerta_id, 'iscrizione_id', v_iscr_id,
                       'importo_centesimi', coalesce(p_importo_pagato, v_ord.importo_centesimi),
                       'sconto_centesimi', coalesce(p_sconto, 0), 'valuta', v_ord.valuta,
                       'era_annullato', v_ord.stato = 'annullato'));

  return jsonb_build_object('ordine_id', v_ord.id, 'iscrizione_id', v_iscr_id, 'gia_registrato', false,
                            'nuova_iscrizione', v_nuova, 'persona_id', v_ord.persona_id, 'tenant_id', v_ord.tenant_id);
end;
$$;

revoke all on function public.ordine_pagato(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ordine_pagato(text, text, integer, integer) to service_role;

-- Rimborso confermato da Stripe (webhook charge.refunded). Revoca l'accesso.
create or replace function public.ordine_rimborsato(p_payment_intent text, p_attore_persona uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ord public.ordine;
  v_attore jsonb;
begin
  if auth.uid() is not null then raise exception 'ordine_rimborsato: solo dal server'; end if;
  select * into v_ord from public.ordine where stripe_payment_intent = p_payment_intent for update;
  if not found then raise exception 'ordine_rimborsato: pagamento sconosciuto'; end if;
  if v_ord.stato = 'rimborsato' then
    return jsonb_build_object('ordine_id', v_ord.id, 'gia_registrato', true);
  end if;
  if v_ord.stato <> 'pagato' then raise exception 'ordine_rimborsato: ordine non pagato'; end if;
  v_attore := jsonb_build_object('persona_id', coalesce(p_attore_persona, v_ord.persona_id), 'type', 'persona');

  update public.ordine set stato = 'rimborsato', rimborsato_il = now() where id = v_ord.id;
  if v_ord.iscrizione_id is not null then
    update public.iscrizione set accesso_revocato_at = now()
    where id = v_ord.iscrizione_id and accesso_revocato_at is null;
    perform public.audit_append(v_ord.tenant_id, 'iscrizione.revoked', v_attore, 'iscrizione', v_ord.iscrizione_id,
      jsonb_build_object('origine', 'rimborso', 'ordine_id', v_ord.id));
  end if;
  perform public.audit_append(v_ord.tenant_id, 'ordine.refunded', v_attore, 'ordine', v_ord.id,
    jsonb_build_object('offerta_id', v_ord.offerta_id, 'importo_centesimi', v_ord.importo_centesimi, 'valuta', v_ord.valuta));
  return jsonb_build_object('ordine_id', v_ord.id, 'gia_registrato', false);
end;
$$;

revoke all on function public.ordine_rimborsato(text, uuid) from public, anon, authenticated;
grant execute on function public.ordine_rimborsato(text, uuid) to service_role;

-- Sessione scaduta o abbandonata (webhook checkout.session.expired).
create or replace function public.ordine_annulla(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ord public.ordine;
begin
  if auth.uid() is not null then raise exception 'ordine_annulla: solo dal server'; end if;
  select * into v_ord from public.ordine where stripe_session_id = p_session_id for update;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  if v_ord.stato <> 'in_attesa' then
    -- Già annullato (con il suo Evento), pagato o rimborsato: niente da fare.
    return jsonb_build_object('ordine_id', v_ord.id, 'esito', v_ord.stato);
  end if;
  update public.ordine set stato = 'annullato', annullato_il = now() where id = v_ord.id;
  perform public.audit_append(v_ord.tenant_id, 'ordine.cancelled',
    jsonb_build_object('persona_id', v_ord.persona_id, 'type', 'persona'), 'ordine', v_ord.id,
    jsonb_build_object('offerta_id', v_ord.offerta_id, 'motivo', 'sessione_scaduta'));
  return jsonb_build_object('ordine_id', v_ord.id, 'esito', 'annullato');
end;
$$;

revoke all on function public.ordine_annulla(text) from public, anon, authenticated;
grant execute on function public.ordine_annulla(text) to service_role;
