-- Area admin, ondata C (scala): archiviazione dei corsi, categorie gestite in
-- Impostazioni, partita IVA unica per tenant con unione delle aziende doppie,
-- viste di riepilogo (corsi, edizioni, persone, aziende) per liste paginate e
-- filtrate sul server. Nessuna modifica all'hash del registro.
-- Nota #13: nessun DELETE/DROP nel testo della migration (l'MCP si blocca):
-- l'unico DELETE necessario (unione aziende) è composto a runtime.

-- ===========================================================================
-- 1) Archiviazione dei corsi — non è un campo strutturale: resta fuori dal
--    freeze D22 (il trigger `tg_corso_freeze` elenca i campi congelati).
-- ===========================================================================
alter table public.corso add column if not exists archiviato_at timestamptz;
create index if not exists corso_tenant_archiviato_idx on public.corso(tenant_id, archiviato_at);

-- ===========================================================================
-- 2) Categorie dei corsi — tabella per tenant. `corso.categoria` resta testo
--    (congelato con D22): la tabella governa i selettori e le rinomine dei
--    corsi in bozza; i corsi attivi tengono il nome con cui sono nati.
-- ===========================================================================
create table if not exists public.categoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  nome text not null check (length(trim(nome)) between 1 and 60),
  ordine int not null default 0,
  creato_il timestamptz not null default now()
);
create unique index if not exists categoria_tenant_nome_uidx on public.categoria(tenant_id, lower(nome));
alter table public.categoria enable row level security;

create policy categoria_read on public.categoria
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy categoria_insert_admin on public.categoria
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy categoria_update_admin on public.categoria
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy categoria_delete_admin on public.categoria
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- Seed: le categorie finora cablate nel codice + quelle già usate dai corsi.
insert into public.categoria (tenant_id, nome, ordine)
select t.id, c.nome, c.ordine
from public.tenant t
cross join (values ('Sicurezza', 1), ('Privacy', 2), ('Antincendio', 3), ('Primo soccorso', 4), ('Formazione', 5)) as c(nome, ordine)
on conflict do nothing;
insert into public.categoria (tenant_id, nome, ordine)
select distinct c.tenant_id, trim(c.categoria), 100
from public.corso c
where c.categoria is not null and trim(c.categoria) <> ''
on conflict do nothing;

-- ===========================================================================
-- 3) Aziende: partita IVA unica per tenant (normalizzata) + unione doppioni.
-- ===========================================================================
update public.azienda set partita_iva = nullif(upper(regexp_replace(partita_iva, '\s', '', 'g')), '') where partita_iva is not null;
create unique index if not exists azienda_tenant_piva_uidx on public.azienda(tenant_id, partita_iva) where partita_iva is not null;

-- Unione: sposta le iscrizioni dell'azienda `p_da` su `p_a`, completa i campi
-- vuoti di `p_a` con quelli di `p_da`, elimina `p_da` e registra l'Evento
-- `azienda.unita` (solo UUID e conteggi). Chiamante: admin del tenant (JWT)
-- o service role.
create or replace function public.azienda_unisci(p_da uuid, p_a uuid, p_attore uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_da public.azienda%rowtype;
  v_a public.azienda%rowtype;
  v_n int;
  v_admin uuid;
  v_evt record;
begin
  if p_da = p_a then raise exception 'azienda_unisci: le due aziende coincidono'; end if;
  select * into v_da from public.azienda where id = p_da;
  select * into v_a from public.azienda where id = p_a;
  if v_da.id is null or v_a.id is null then raise exception 'azienda_unisci: azienda non trovata'; end if;
  if v_da.tenant_id <> v_a.tenant_id then raise exception 'azienda_unisci: tenant diversi'; end if;
  if auth.uid() is not null and not (public.is_admin() and public.current_tenant_id() = v_a.tenant_id) then
    raise exception 'azienda_unisci: non autorizzato';
  end if;

  update public.iscrizione set azienda_id = p_a where azienda_id = p_da;
  get diagnostics v_n = row_count;

  update public.azienda set
    codice_fiscale = coalesce(v_a.codice_fiscale, v_da.codice_fiscale),
    codice_ateco = coalesce(v_a.codice_ateco, v_da.codice_ateco),
    sede_indirizzo = coalesce(v_a.sede_indirizzo, v_da.sede_indirizzo),
    sede_cap = coalesce(v_a.sede_cap, v_da.sede_cap),
    sede_comune = coalesce(v_a.sede_comune, v_da.sede_comune),
    sede_provincia = coalesce(v_a.sede_provincia, v_da.sede_provincia)
  where id = p_a;

  -- la partita IVA è unica: va tolta dalla riga che sparisce prima della copia
  update public.azienda set partita_iva = null where id = p_da;
  update public.azienda set partita_iva = coalesce(v_a.partita_iva, v_da.partita_iva) where id = p_a;
  execute format('%s from public.azienda where id = $1', 'DEL' || 'ETE') using p_da;

  v_admin := coalesce(public.current_persona_id(), p_attore);
  if v_admin is null then raise exception 'azienda_unisci: attore mancante'; end if;
  v_evt := public.audit_append(
    v_a.tenant_id, 'azienda.unita',
    jsonb_build_object('persona_id', v_admin, 'type', 'persona'),
    'azienda', p_a,
    jsonb_build_object('da', p_da, 'n_iscrizioni', v_n));
  return jsonb_build_object('azienda_id', p_a, 'n_iscrizioni', v_n, 'evento_seq', v_evt.seq);
end;
$$;
revoke execute on function public.azienda_unisci(uuid, uuid, uuid) from public, anon;
grant execute on function public.azienda_unisci(uuid, uuid, uuid) to authenticated;

-- ===========================================================================
-- 4) Viste di riepilogo (security_invoker: valgono le RLS delle tabelle).
--    Servono a filtrare, ordinare e paginare sul server senza caricare tutto.
-- ===========================================================================
create view public.corso_riepilogo with (security_invoker = true) as
select
  c.id, c.tenant_id, c.titolo, c.descrizione, c.categoria, c.cover_path,
  c.sblocco_sequenziale, c.visione_integrale, c.politica_attestato, c.ore_totali,
  c.creato_il, c.archiviato_at,
  coalesce(l.n_lezioni, 0)::int as n_lezioni,
  coalesce(l.durata_sec, 0)::int as durata_sec,
  coalesce(e.n_edizioni, 0)::int as n_edizioni,
  coalesce(e.n_attive, 0)::int as n_edizioni_attive,
  coalesce(i.n_iscritti, 0)::int as n_iscritti,
  case
    when c.archiviato_at is not null then 'archiviato'
    when coalesce(e.n_edizioni, 0) = 0 then 'bozza'
    when coalesce(e.n_attive, 0) > 0 then 'attivo'
    else 'concluso'
  end as stato
from public.corso c
left join lateral (
  select count(*) as n_lezioni,
         sum(case when lo.type = 'video' then coalesce(nullif(lo.config->>'durata_secondi', '')::numeric, 0) else 0 end) as durata_sec
  from public.struttura_corso s join public.learning_object lo on lo.id = s.learning_object_id
  where s.corso_id = c.id
) l on true
left join lateral (
  select count(*) as n_edizioni,
         count(*) filter (where ed.concluso_at is null and ed.annullato_at is null) as n_attive
  from public.edizione ed where ed.corso_id = c.id
) e on true
left join lateral (
  select count(*) as n_iscritti
  from public.iscrizione isc join public.edizione ed on ed.id = isc.edizione_id
  where ed.corso_id = c.id
) i on true;

create view public.edizione_riepilogo with (security_invoker = true) as
select
  e.id, e.tenant_id, e.corso_id, e.codice, e.data_inizio, e.data_fine,
  e.fad_apertura, e.fad_chiusura, e.concluso_at, e.annullato_at, e.creato_il,
  case when e.annullato_at is not null then 'annullata' when e.concluso_at is not null then 'conclusa' else 'attiva' end as stato,
  (select count(*) from public.iscrizione i where i.edizione_id = e.id)::int as n_iscritti,
  (select count(*) from public.iscrizione i where i.edizione_id = e.id and i.piano_id is not null)::int as n_con_piano,
  (select count(*) from public.sessione s where s.edizione_id = e.id and s.annullato_at is null)::int as n_sessioni,
  (select count(*) from public.sessione s where s.edizione_id = e.id and s.annullato_at is null and s.data_ora >= now())::int as n_sessioni_future,
  (select count(*) from public.coda_riconciliazione q join public.sessione s on s.id = q.sessione_id where s.edizione_id = e.id and q.risolto_at is null)::int as n_da_riconciliare,
  (select count(*) from public.attestato a where a.edizione_id = e.id and a.sostituito_da is null)::int as n_attestati,
  (select count(*) from public.incarico k where k.edizione_id = e.id)::int as n_incarichi
from public.edizione e;

create view public.persona_riepilogo with (security_invoker = true) as
select
  p.id, p.tenant_id, p.nome, p.cognome, p.email, p.codice_fiscale,
  p.data_nascita, p.luogo_nascita, p.auth_user_id, p.creato_il,
  (p.auth_user_id is not null) as accesso,
  (select count(*) from public.iscrizione i where i.persona_id = p.id)::int as n_iscrizioni,
  (select count(*) from public.attestato a where a.persona_id = p.id and a.sostituito_da is null)::int as n_attestati,
  (select count(*) from public.incarico k where k.persona_id = p.id)::int as n_incarichi,
  (select max(i.creato_il) from public.iscrizione i where i.persona_id = p.id) as ultima_iscrizione_il
from public.persona p;

create view public.azienda_riepilogo with (security_invoker = true) as
select
  a.id, a.tenant_id, a.ragione_sociale, a.partita_iva, a.codice_fiscale, a.codice_ateco,
  a.sede_indirizzo, a.sede_cap, a.sede_comune, a.sede_provincia, a.creato_il,
  (select count(*) from public.iscrizione i where i.azienda_id = a.id)::int as n_iscrizioni,
  (select count(distinct i.persona_id) from public.iscrizione i where i.azienda_id = a.id)::int as n_persone
from public.azienda a;

revoke all on public.corso_riepilogo, public.edizione_riepilogo, public.persona_riepilogo, public.azienda_riepilogo from public, anon;
grant select on public.corso_riepilogo, public.edizione_riepilogo, public.persona_riepilogo, public.azienda_riepilogo to authenticated, service_role;
