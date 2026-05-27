-- Fase 3 — Task 1: entità del Gruppo 3 (Azienda, Piano, Incarico, Sessione) +
-- Report di partecipazione grezzo (write-once), estensioni di iscrizione/corso.
--
-- Ogni tabella nuova nasce con tenant_id NOT NULL e RLS attiva nella stessa
-- migration (D2). Il Report di partecipazione grezzo è write-once come `evento`
-- (REVOKE + trigger, D20). L'append degli Eventi resta l'unica via del log
-- (audit_append, Fase 1) — qui non si scrive nessun evento.
--
-- Decisioni: D2, D9, D16, D17/D33, D20, D27, D30, D32, D33.
-- Nota: il brief Fase 3 assumeva che `email_riconciliazione`, `ore_frequentate`
-- e `frequenza_percentuale` esistessero già su `iscrizione`: non c'erano nello
-- schema di Fase 1, quindi vengono aggiunte qui (coerenti con v7).

-- ===========================================================================
-- 0) ENUM
-- ===========================================================================
create type public.sessione_modalita as enum ('aula', 'vcs');
-- D7: l'enum ammette teams e zoom; in Fase 3 si IMPLEMENTA solo teams.
create type public.vcs_piattaforma as enum ('teams', 'zoom');
create type public.incarico_ruolo as enum (
  'docente', 'tutor_contenuto', 'tutor_processo', 'responsabile_progetto'
);
create type public.report_fonte as enum ('api_teams', 'api_zoom', 'csv');

-- ===========================================================================
-- 1) AZIENDA (D16) — una sola sede per ora
-- ===========================================================================
create table public.azienda (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  ragione_sociale text not null,
  partita_iva text,
  codice_fiscale text,
  codice_ateco text,
  sede_indirizzo text,
  sede_cap text,
  sede_comune text,
  sede_provincia text,
  creato_il timestamptz not null default now()
);
alter table public.azienda enable row level security;
create index azienda_tenant_idx on public.azienda(tenant_id);

-- ===========================================================================
-- 2) PIANO FORMATIVO FINANZIATO (D27: nessuna FK diretta a Edizione; D32:
--    contabilità di dettaglio fuori scope)
-- ===========================================================================
create table public.piano_formativo_finanziato (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  titolo text not null,
  codice text,
  fondo text, -- es. 'fondimpresa','foncoop' — usato dal generatore report (Fase 4)
  creato_il timestamptz not null default now()
);
alter table public.piano_formativo_finanziato enable row level security;
create index piano_tenant_idx on public.piano_formativo_finanziato(tenant_id);

-- ===========================================================================
-- 3) INCARICO (Persona ↔ Edizione, ruolo ASR). D30 staff multiplo additivo,
--    D31 qualifiche fuori scope.
-- ===========================================================================
create table public.incarico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  edizione_id uuid not null references public.edizione(id) on delete cascade,
  persona_id uuid not null references public.persona(id),
  ruolo public.incarico_ruolo not null,
  creato_il timestamptz not null default now(),
  unique (edizione_id, persona_id, ruolo)
);
alter table public.incarico enable row level security;
create index incarico_tenant_idx on public.incarico(tenant_id);
create index incarico_edizione_idx on public.incarico(edizione_id);

-- ===========================================================================
-- 4) SESSIONE (evento sincrono datato dentro un'Edizione). D30: un solo
--    incarico_id nullable verso il docente di giornata.
-- ===========================================================================
create table public.sessione (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  edizione_id uuid not null references public.edizione(id) on delete cascade,
  titolo text not null,
  data_ora timestamptz,
  durata_minuti int,
  modalita public.sessione_modalita not null,
  vcs_piattaforma public.vcs_piattaforma,
  vcs_meeting_id text,
  incarico_id uuid references public.incarico(id),
  annullato_at timestamptz,
  creato_il timestamptz not null default now(),
  constraint sessione_vcs_shape check (
    modalita <> 'vcs' or vcs_piattaforma is not null
  )
);
alter table public.sessione enable row level security;
create index sessione_tenant_idx on public.sessione(tenant_id);
create index sessione_edizione_idx on public.sessione(edizione_id);

-- D30: l'incarico assegnato a una Sessione deve appartenere alla STESSA
-- Edizione ed essere un ruolo didattico (docente/tutor). Trigger leggero.
create or replace function public.tg_sessione_incarico_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ed uuid;
  v_ruolo public.incarico_ruolo;
begin
  if NEW.incarico_id is null then
    return NEW;
  end if;
  select edizione_id, ruolo into v_ed, v_ruolo
    from public.incarico where id = NEW.incarico_id;
  if v_ed is distinct from NEW.edizione_id then
    raise exception 'D30: incarico % non appartiene all''edizione % della sessione',
      NEW.incarico_id, NEW.edizione_id;
  end if;
  if v_ruolo not in ('docente', 'tutor_contenuto', 'tutor_processo') then
    raise exception 'D30: l''incarico di una sessione deve essere un ruolo didattico (docente/tutor), non %', v_ruolo;
  end if;
  return NEW;
end$$;

create trigger sessione_incarico_check
  before insert or update on public.sessione
  for each row execute function public.tg_sessione_incarico_check();

-- ===========================================================================
-- 5) REPORT DI PARTECIPAZIONE GREZZO (D20) — write-once
-- ===========================================================================
-- Più report grezzi per Sessione sono ammessi (API + CSV di fallback). Il
-- `contenuto` jsonb tiene le righe COME RICEVUTE (con nomi/email: D20 lo
-- legittima come prova-staging) → la RLS di lettura è ristretta ad admin/auditor.
create table public.report_partecipazione_grezzo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  sessione_id uuid not null references public.sessione(id),
  fonte public.report_fonte not null,
  contenuto jsonb not null,
  importato_da uuid references public.persona(id), -- NULL = import automatico (D20)
  creato_il timestamptz not null default now()
);
alter table public.report_partecipazione_grezzo enable row level security;
create index grezzo_tenant_idx on public.report_partecipazione_grezzo(tenant_id);
create index grezzo_sessione_idx on public.report_partecipazione_grezzo(sessione_id);

-- Write-once: stessa tecnica di `evento`. UPDATE/DELETE/TRUNCATE bloccati dal
-- trigger anche per ruoli alti; l'INSERT passerà solo per la funzione di
-- ingestione del Task 2 (SECURITY DEFINER) — nessun path diretto dall'app.
revoke all on public.report_partecipazione_grezzo from anon, authenticated;
grant select on public.report_partecipazione_grezzo to anon, authenticated;

create or replace function public.grezzo_block_mutations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'report_partecipazione_grezzo è write-once: UPDATE non permesso (D20)';
  elsif tg_op = 'DELETE' then
    raise exception 'report_partecipazione_grezzo è write-once: DELETE non permesso (D20)';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'report_partecipazione_grezzo è write-once: TRUNCATE non permesso (D20)';
  end if;
  return null;
end;
$$;

create trigger grezzo_no_update
  before update on public.report_partecipazione_grezzo
  for each row execute function public.grezzo_block_mutations();
create trigger grezzo_no_delete
  before delete on public.report_partecipazione_grezzo
  for each row execute function public.grezzo_block_mutations();
create trigger grezzo_no_truncate
  before truncate on public.report_partecipazione_grezzo
  execute function public.grezzo_block_mutations();

-- Hash canonico del contenuto del grezzo (D18/D20). jsonb::text è
-- deterministico (Postgres normalizza/ordina le chiavi) → hash stabile e
-- indipendente dall'ordine di input. Il valore va in payload.hash dell'Evento
-- `report_grezzo_importato` (Task 2); nessuna colonna hash sulla tabella.
create or replace function public.grezzo_content_hash(p_contenuto jsonb)
returns bytea
language sql
immutable
set search_path = public, extensions
as $$ select digest(p_contenuto::text, 'sha256') $$;

-- ===========================================================================
-- 6) ISCRIZIONE — campi della Fase 3 (mancanti nello schema di Fase 1) + FK
-- ===========================================================================
alter table public.iscrizione
  add column if not exists email_riconciliazione text,                 -- D17/D33 chiave di match
  add column if not exists ore_frequentate numeric(6,2) not null default 0,        -- cache (D8)
  add column if not exists frequenza_percentuale numeric(5,2) not null default 0;  -- cache (D8)

-- Le FK su azienda_id / piano_id (i campi esistono dalla Fase 1 come uuid nudi).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'iscrizione_azienda_fk') then
    alter table public.iscrizione
      add constraint iscrizione_azienda_fk foreign key (azienda_id)
      references public.azienda(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'iscrizione_piano_fk') then
    alter table public.iscrizione
      add constraint iscrizione_piano_fk foreign key (piano_id)
      references public.piano_formativo_finanziato(id);
  end if;
end$$;

-- ===========================================================================
-- 7) CORSO — soglia di frequenza per l'idoneità automatica (corsi di presenza)
-- ===========================================================================
-- Decisione ratificata: idoneità "auto alla soglia". Per i corsi con presenza,
-- la cache di compliance promuove a idoneo quando frequenza_percentuale ≥
-- soglia_frequenza_percentuale. NULL = nessun requisito di frequenza (es. corso
-- FAD puro). Campo strutturale → congelato da D22 dopo la prima Edizione.
alter table public.corso
  add column if not exists soglia_frequenza_percentuale numeric(5,2);

-- Estende il freeze D22 al nuovo campo strutturale.
create or replace function public.tg_corso_freeze()
returns trigger
language plpgsql
as $$
begin
  if public.helper_corso_has_edizioni(OLD.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.descrizione is distinct from OLD.descrizione
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.soglia_frequenza_percentuale is distinct from OLD.soglia_frequenza_percentuale then
      raise exception
        'D22: il corso % è congelato (ha almeno un''Edizione): titolo/descrizione/sblocco_sequenziale/soglia_frequenza non modificabili',
        OLD.id;
    end if;
  end if;
  return NEW;
end$$;

-- ===========================================================================
-- 8) RLS — letture per-tenant; scritture solo admin del tenant
-- ===========================================================================
-- Azienda / Piano / Incarico / Sessione: lettura per tutto il tenant (come
-- corso/edizione). Scrittura: solo admin. Niente DELETE (annullamento soft
-- dove serve, es. sessione.annullato_at).

create policy azienda_read on public.azienda
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy azienda_insert_admin on public.azienda
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy azienda_update_admin on public.azienda
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy piano_read on public.piano_formativo_finanziato
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy piano_insert_admin on public.piano_formativo_finanziato
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy piano_update_admin on public.piano_formativo_finanziato
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy incarico_read on public.incarico
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy incarico_insert_admin on public.incarico
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy incarico_update_admin on public.incarico
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy sessione_read on public.sessione
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy sessione_insert_admin on public.sessione
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy sessione_update_admin on public.sessione
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- Grezzo: lettura ristretta ad admin/auditor (contiene PII di staging, D20).
-- Nessuna policy di write: la REVOKE + la funzione di ingestione (Task 2,
-- SECURITY DEFINER) sono l'unico path.
create policy grezzo_read_admin_auditor on public.report_partecipazione_grezzo
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or public.is_auditor())
  );
