-- Fase 6 — sconti a tempo sulle offerte e offerte chiuse nel catalogo.
--
-- * offerta.chiusa_visibile: quando le iscrizioni si chiudono in modo definitivo
--   (edizione conclusa/annullata/chiusa, vendita terminata, edizione a date già
--   iniziata, posti esauriti) l'offerta SPARISCE dall'elenco del catalogo, salvo
--   che l'admin scelga di lasciarla visibile con "iscrizioni chiuse". La scheda
--   resta raggiungibile dal suo indirizzo e dice che le iscrizioni sono chiuse.
-- * offerta.sconti: periodi di sconto [{dal, al, prezzo_centesimi, etichetta}]
--   (giorni interi a Roma, estremi inclusi, al massimo 10, senza sovrapposizioni,
--   prezzo scontato IVA inclusa ≥ 0,50 € e minore del prezzo di listino). Validati
--   dal trigger dell'offerta.
-- * ordine: l'ordine copia il prezzo del giorno (listino o scontato) e conserva il
--   listino e lo sconto a tempo applicato (per la fattura e l'export).

alter table public.offerta
  add column if not exists chiusa_visibile boolean not null default false,
  add column if not exists sconti jsonb not null default '[]'::jsonb;

comment on column public.offerta.chiusa_visibile is
  'Con le iscrizioni chiuse in modo definitivo: false = fuori dall''elenco del catalogo; true = resta con "iscrizioni chiuse".';
comment on column public.offerta.sconti is
  'Sconti a tempo: [{dal, al, prezzo_centesimi, etichetta}] (date ISO, giorni di Roma inclusi; prezzo IVA inclusa).';

alter table public.ordine
  add column if not exists listino_centesimi integer check (listino_centesimi is null or listino_centesimi >= 0),
  add column if not exists sconto_tempo_centesimi integer not null default 0 check (sconto_tempo_centesimi >= 0),
  add column if not exists sconto_tempo_etichetta text check (sconto_tempo_etichetta is null or length(sconto_tempo_etichetta) <= 40);

comment on column public.ordine.listino_centesimi is 'Prezzo di listino dell''offerta al momento dell''ordine (null negli ordini precedenti agli sconti a tempo).';
comment on column public.ordine.sconto_tempo_centesimi is 'Sconto a tempo applicato (listino − prezzo del giorno). Lo sconto dei codici Stripe sta in sconto_centesimi.';

-- --------------------------------------------------------------------------
-- Validazione (trigger dell'offerta, già esistente: si estende)
-- --------------------------------------------------------------------------
create or replace function public.tg_offerta_coerenza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s jsonb;
  v_dal date;
  v_al date;
  v_prezzo numeric;
begin
  if not exists (select 1 from public.edizione e where e.id = new.edizione_id and e.tenant_id = new.tenant_id) then
    raise exception 'offerta: edizione di un altro ente';
  end if;
  if new.sconti is null or jsonb_typeof(new.sconti) <> 'array' then
    raise exception 'offerta: sconti non validi (serve un elenco)';
  end if;
  if jsonb_array_length(new.sconti) > 10 then
    raise exception 'offerta: al massimo 10 sconti a tempo';
  end if;
  for v_s in select value from jsonb_array_elements(new.sconti) loop
    if jsonb_typeof(v_s) <> 'object'
       or coalesce(v_s ->> 'dal', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(v_s ->> 'al', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(v_s -> 'prezzo_centesimi') is distinct from 'number' then
      raise exception 'offerta: sconto non valido (servono dal, al e prezzo)';
    end if;
    v_dal := (v_s ->> 'dal')::date;
    v_al := (v_s ->> 'al')::date;
    v_prezzo := (v_s ->> 'prezzo_centesimi')::numeric;
    if v_al < v_dal then raise exception 'offerta: sconto con fine prima dell''inizio'; end if;
    if v_prezzo <> floor(v_prezzo) or v_prezzo < 50 then raise exception 'offerta: prezzo scontato minimo 0,50 €'; end if;
    if v_prezzo >= new.prezzo_centesimi then raise exception 'offerta: il prezzo scontato deve essere minore del prezzo di listino'; end if;
    if v_s ? 'etichetta' and jsonb_typeof(v_s -> 'etichetta') <> 'null'
       and (jsonb_typeof(v_s -> 'etichetta') <> 'string' or length(v_s ->> 'etichetta') > 40) then
      raise exception 'offerta: etichetta dello sconto troppo lunga (max 40)';
    end if;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(new.sconti) with ordinality a(s, i)
    join jsonb_array_elements(new.sconti) with ordinality b(s, j) on a.i < b.j
    where (a.s ->> 'dal')::date <= (b.s ->> 'al')::date and (b.s ->> 'dal')::date <= (a.s ->> 'al')::date
  ) then
    raise exception 'offerta: due sconti a tempo si sovrappongono';
  end if;
  new.aggiornato_il := now();
  return new;
end;
$$;
revoke all on function public.tg_offerta_coerenza() from public, anon, authenticated;

-- Sconto valido in un giorno (il primo che lo comprende), null se nessuno.
create or replace function public.offerta_sconto_attivo(p_sconti jsonb, p_giorno date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select s
  from jsonb_array_elements(coalesce(p_sconti, '[]'::jsonb)) s
  where (s ->> 'dal')::date <= p_giorno and (s ->> 'al')::date >= p_giorno
  order by (s ->> 'dal')::date
  limit 1;
$$;
revoke all on function public.offerta_sconto_attivo(jsonb, date) from public, anon, authenticated;
grant execute on function public.offerta_sconto_attivo(jsonb, date) to service_role;

-- Motivi per cui le iscrizioni sono chiuse in modo definitivo (non "non ancora aperta").
create or replace function public.offerta_chiusa_definitiva(p_motivo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_motivo in ('vendita chiusa', 'edizione chiusa', 'edizione conclusa', 'edizione annullata',
                      'edizione già iniziata', 'posti esauriti');
$$;
revoke all on function public.offerta_chiusa_definitiva(text) from public, anon, authenticated;
grant execute on function public.offerta_chiusa_definitiva(text) to service_role;

-- --------------------------------------------------------------------------
-- Catalogo pubblico: prezzo del giorno, listino barrato, offerte chiuse nascoste
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
        'prezzo_centesimi', coalesce((m.sconto ->> 'prezzo_centesimi')::integer, o.prezzo_centesimi),
        'listino_centesimi', case when m.sconto is not null then o.prezzo_centesimi end,
        'sconto_etichetta', m.sconto ->> 'etichetta',
        'sconto_fino_al', m.sconto ->> 'al',
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
        'in_vendita', m.motivo is null,
        'motivo', m.motivo
      ) as riga
    from public.offerta o
    join public.edizione e on e.id = o.edizione_id
    join public.corso c on c.id = e.corso_id
    cross join lateral (
      select public.offerta_motivo_non_vendibile(o.id) as motivo,
             public.offerta_sconto_attivo(o.sconti, (now() at time zone 'Europe/Rome')::date) as sconto
    ) m
    where o.tenant_id = (select id from t) and o.stato = 'pubblicata' and c.archiviato_at is null
      and (m.motivo is null or not public.offerta_chiusa_definitiva(m.motivo) or o.chiusa_visibile)
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
  v_motivo text;
  v_sconto jsonb;
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
  v_motivo := public.offerta_motivo_non_vendibile(v.id);
  v_sconto := public.offerta_sconto_attivo(v.sconti, (now() at time zone 'Europe/Rome')::date);

  return jsonb_build_object(
    'offerta_id', v.id,
    'slug', v.slug,
    'ente', (select coalesce(nullif(trim(ragione_sociale), ''), nome) from public.tenant where id = v_tenant),
    'titolo', coalesce(v.titolo_pubblico, v.corso_titolo),
    'descrizione', coalesce(v.descrizione_pubblica, v.corso_descrizione),
    'categoria', v.categoria,
    'cover_path', coalesce(v.cover_path, v.corso_cover),
    'prezzo_centesimi', coalesce((v_sconto ->> 'prezzo_centesimi')::integer, v.prezzo_centesimi),
    'listino_centesimi', case when v_sconto is not null then v.prezzo_centesimi end,
    'sconto_etichetta', v_sconto ->> 'etichetta',
    'sconto_fino_al', v_sconto ->> 'al',
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
    'in_vendita', v_motivo is null,
    'motivo', v_motivo,
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
-- Ordine: prezzo del giorno (listino o sconto a tempo)
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
  v_sconto jsonb;
  v_prezzo integer;
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
  v_sconto := public.offerta_sconto_attivo(v_off.sconti, (now() at time zone 'Europe/Rome')::date);
  v_prezzo := coalesce((v_sconto ->> 'prezzo_centesimi')::integer, v_off.prezzo_centesimi);
  insert into public.ordine (tenant_id, persona_id, offerta_id, importo_centesimi, valuta,
                             aliquota_iva, natura_iva, fatturazione, consensi, scade_il,
                             listino_centesimi, sconto_tempo_centesimi, sconto_tempo_etichetta)
  values (v_off.tenant_id, p_persona_id, p_offerta_id, v_prezzo, v_off.valuta,
          v_off.aliquota_iva, v_off.natura_iva, p_fatturazione, p_consensi, now() + interval '31 minutes',
          v_off.prezzo_centesimi, v_off.prezzo_centesimi - v_prezzo, v_sconto ->> 'etichetta')
  returning * into v_ordine;
  perform public.audit_append(v_off.tenant_id, 'ordine.created',
    jsonb_build_object('persona_id', p_persona_id, 'type', 'persona'),
    'ordine', v_ordine.id,
    jsonb_build_object('offerta_id', p_offerta_id, 'edizione_id', v_off.edizione_id,
                       'importo_centesimi', v_ordine.importo_centesimi, 'valuta', v_ordine.valuta,
                       'listino_centesimi', v_off.prezzo_centesimi, 'sconto_a_tempo', v_sconto is not null));
  return jsonb_build_object('ordine_id', v_ordine.id, 'importo_centesimi', v_ordine.importo_centesimi,
    'listino_centesimi', v_off.prezzo_centesimi, 'sconto_etichetta', v_sconto ->> 'etichetta',
    'valuta', v_ordine.valuta, 'scade_il', v_ordine.scade_il, 'codici_sconto', v_off.codici_sconto,
    'sessioni_da_scadere', to_jsonb(v_vecchie));
end;
$$;
revoke all on function public.ordine_crea(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ordine_crea(uuid, uuid, jsonb, jsonb) to service_role;
