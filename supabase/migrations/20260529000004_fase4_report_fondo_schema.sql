-- Fase 4 — Task 1: schema dell'entità "Report fondo depositato" (snapshot
-- write-once) + estensione della testata del Piano formativo finanziato.
--
-- Il generatore di report fondi (Fase 4) LEGGE Piano/Azienda/Sessione/Incarico/
-- Iscrizione/Evento e PRODUCE un unico artefatto: lo snapshot depositato, prova
-- write-once di ciò che si è consegnato al fondo. L'unico Evento prodotto dalla
-- fase (`report_fondo_depositato`, con `payload.hash`) passa per `audit_append`
-- nel Task 6 — qui si crea SOLO lo schema, nessun Evento.
--
-- Decisioni: D2 (tenant_id NOT NULL + RLS nella stessa migration), D18 (hash
-- canonico; PII solo nell'artefatto, mai nel log), D20 (write-once: REVOKE U/D +
-- trigger, l'Evento attesta l'integrità; più snapshot per (Edizione, Piano)
-- ammessi), D27 (nessuna FK Piano↔Edizione: il legame vive su
-- `iscrizione.piano_id`; qui le due FK su `report_fondo_depositato` sono solo le
-- coordinate dello snapshot), D32 (campi di testata del Piano disponibili;
-- contabilità di dettaglio FUORI scope — qui nessun importo/voce di spesa).

-- ===========================================================================
-- 1) PIANO FORMATIVO FINANZIATO — campi di testata della rendicontazione (D32)
-- ===========================================================================
-- Lo schema di Fase 3 creò il Piano in forma minima (titolo/codice/fondo). La
-- testata del report fondo (brief §3/§6) richiede CUP, avviso, canale e le date:
-- il documento v8 li prevede sul Piano, quindi qui si allinea lo schema — stessa
-- situazione della Fase 3, che aggiunse i campi mancanti su `iscrizione`. Il
-- `codice` esistente funge da codice_piano. Nessun campo di contabilità (D32).
alter table public.piano_formativo_finanziato
  add column if not exists cup text,
  add column if not exists avviso text,
  add column if not exists canale text,
  add column if not exists data_avvio date,
  add column if not exists data_chiusura date,
  add column if not exists chiuso_at timestamptz;

comment on column public.piano_formativo_finanziato.cup is
  'Codice Unico di Progetto (D32): obbligatorio sui documenti amministrativi del fondo.';
comment on column public.piano_formativo_finanziato.avviso is
  'Avviso/bando del fondo: parametrizza il tracciato del report (gli adattatori divergono per avviso).';
comment on column public.piano_formativo_finanziato.canale is
  'Canale Fondimpresa (es. conto formazione / conto di sistema).';

-- ===========================================================================
-- 2) REPORT FONDO DEPOSITATO — snapshot write-once (D20)
-- ===========================================================================
-- `contenuto` jsonb: il dataset di rendicontazione RISOLTO AL MOMENTO dello
-- snapshot (con PII: nomi/CF/azienda — è un documento amministrativo; D18 lo
-- legittima come prova, esattamente come il grezzo). La RLS di lettura è perciò
-- ristretta ad admin/auditor. L'integrità è attestata dall'Evento
-- `report_fondo_depositato` (payload.hash), NON da una colonna hash sulla tabella
-- (coerente con D20). Più snapshot per (edizione_id, piano_id) coesistono:
-- la rigenerazione è additiva, i precedenti restano invariati.
create table public.report_fondo_depositato (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  edizione_id uuid not null references public.edizione(id),
  piano_id uuid not null references public.piano_formativo_finanziato(id),
  fondo text not null,
  formato text not null,            -- 'fondimpresa' | 'foncoop' (adattatore usato)
  avviso text,                      -- avviso del Piano al momento dello snapshot
  contenuto jsonb not null,         -- dataset risolto (con PII): la prova consegnata
  generato_da uuid references public.persona(id),  -- pseudonimo (id), mai PII nel log
  generato_at timestamptz not null default now()
);
alter table public.report_fondo_depositato enable row level security;
create index report_fondo_tenant_idx on public.report_fondo_depositato(tenant_id);
create index report_fondo_ed_piano_idx on public.report_fondo_depositato(edizione_id, piano_id);

-- Write-once: stessa tecnica di `evento` / `report_partecipazione_grezzo`.
-- UPDATE/DELETE/TRUNCATE bloccati dal trigger anche per ruoli alti; l'INSERT
-- passerà SOLO per la funzione di deposito del Task 6 (SECURITY DEFINER).
revoke all on public.report_fondo_depositato from anon, authenticated;
grant select on public.report_fondo_depositato to anon, authenticated;

create or replace function public.report_fondo_block_mutations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'report_fondo_depositato è write-once: UPDATE non permesso (D20)';
  elsif tg_op = 'DELETE' then
    raise exception 'report_fondo_depositato è write-once: DELETE non permesso (D20)';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'report_fondo_depositato è write-once: TRUNCATE non permesso (D20)';
  end if;
  return null;
end;
$$;

create trigger report_fondo_no_update
  before update on public.report_fondo_depositato
  for each row execute function public.report_fondo_block_mutations();
create trigger report_fondo_no_delete
  before delete on public.report_fondo_depositato
  for each row execute function public.report_fondo_block_mutations();
create trigger report_fondo_no_truncate
  before truncate on public.report_fondo_depositato
  execute function public.report_fondo_block_mutations();

-- Hash canonico del contenuto (D18/D20). `jsonb::text` è deterministico
-- (Postgres normalizza e ordina le chiavi) → hash stabile e indipendente
-- dall'ordine di input. Il valore va in `payload.hash` dell'Evento
-- `report_fondo_depositato` (Task 6); nessuna colonna hash sulla tabella.
-- Gemello di `grezzo_content_hash` (Fase 3).
create or replace function public.report_fondo_content_hash(p_contenuto jsonb)
returns bytea
language sql
immutable
set search_path = public, extensions
as $$ select digest(p_contenuto::text, 'sha256') $$;

-- ===========================================================================
-- 3) RLS — lettura ristretta ad admin/auditor (il contenuto ha PII, D18/D20).
--    Nessuna policy di write: REVOKE + funzione di deposito (Task 6,
--    SECURITY DEFINER) sono l'unico path, come per il grezzo.
-- ===========================================================================
create policy report_fondo_read_admin_auditor on public.report_fondo_depositato
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or public.is_auditor())
  );
