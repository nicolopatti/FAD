-- Fase 2 — Task 3: Authoring Edizioni + congelamento D22.
-- Estende `edizione` con le due coppie di date (D29) e il ciclo di vita soft
-- (`concluso_at`/`annullato_at`), aggiunge le policy RLS per l'admin,
-- e installa i trigger di congelamento D22 che impediscono di toccare i
-- campi strutturali del Corso e la Struttura una volta che il Corso ha
-- almeno un'Edizione.
--
-- Brief: docs/brief-fase-2.md §5 Task 3 + §10 (preferenza per controllo
-- a livello DB, non solo UI). Decisioni: D22 (congelamento), D29 (ciclo
-- di vita soft delle Edizioni).

-- ===========================================================================
-- 1) Schema edizione: rinomina `inizio`/`fine` + nuove colonne
-- ===========================================================================
-- I dati di Fase 1 hanno solo `inizio`/`fine`: il rename preserva i valori,
-- gli altri 4 campi nuovi nascono NULL.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='edizione' and column_name='inizio'
  ) then
    alter table public.edizione rename column inizio to data_inizio;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='edizione' and column_name='fine'
  ) then
    alter table public.edizione rename column fine to data_fine;
  end if;
end$$;

alter table public.edizione
  add column if not exists fad_apertura date,
  add column if not exists fad_chiusura date,
  add column if not exists concluso_at timestamptz,
  add column if not exists annullato_at timestamptz;

-- Vincolo morbido: se entrambe presenti, fad_chiusura ≥ fad_apertura.
-- Idem per data_fine ≥ data_inizio. Niente CHECK rigido fino al Task 5 che
-- ne avrà modo di verificarli con dati reali — per ora bastano controlli
-- in input lato API.

-- ===========================================================================
-- 2) RLS — edizione: admin può INSERT/UPDATE nel suo tenant
-- ===========================================================================

drop policy if exists edizione_insert_admin on public.edizione;
create policy edizione_insert_admin on public.edizione
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

drop policy if exists edizione_update_admin on public.edizione;
create policy edizione_update_admin on public.edizione
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

-- ===========================================================================
-- 3) D22 — Congelamento del Corso una volta che ha almeno un'Edizione
-- ===========================================================================
-- Strategia: trigger BEFORE su `corso` e `struttura_corso` che controllano
-- l'esistenza di una qualsiasi Edizione del Corso e, se sì, rifiutano la
-- write. Esempio di test: tentare un UPDATE corso/struttura su un corso
-- con Edizioni deve sollevare exception, indipendentemente dal ruolo
-- (anche admin). Brief §10: "fatto rispettare lato server/DB, non solo
-- disabilitato in UI".
--
-- Implementazione: niente SECURITY DEFINER né bypass — i trigger girano nel
-- contesto della transazione del caller, quindi vedono lo stesso scope di
-- RLS. La query `exists(... from edizione where corso_id = …)` però va in
-- bypass-RLS automatico perché i trigger BEFORE girano col privilegio del
-- proprietario della funzione (per default, l'owner della tabella) → in
-- pratica può leggere tutte le edizioni del corso. Va bene per il check.

create or replace function public.helper_corso_has_edizioni(p_corso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.edizione where corso_id = p_corso_id);
$$;

-- Trigger su corso: blocca UPDATE dei campi strutturali se il corso è
-- congelato. I campi strutturali oggi sono titolo/descrizione/sblocco_seq;
-- quando il modello del Corso si arricchirà (ore_*, classe_rischio, ecc.)
-- vanno aggiunti qui.

create or replace function public.tg_corso_freeze()
returns trigger
language plpgsql
as $$
begin
  if public.helper_corso_has_edizioni(OLD.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.descrizione is distinct from OLD.descrizione
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale then
      raise exception
        'D22: il corso % è congelato (ha almeno un''Edizione), titolo/descrizione/sblocco_sequenziale non modificabili',
        OLD.id;
    end if;
  end if;
  return NEW;
end$$;

drop trigger if exists corso_freeze on public.corso;
create trigger corso_freeze
  before update on public.corso
  for each row execute function public.tg_corso_freeze();

-- Trigger su struttura_corso: blocca INSERT/UPDATE/DELETE quando il corso
-- ha già un'Edizione. Single function che gestisce i 3 casi (TG_OP).

create or replace function public.tg_struttura_freeze()
returns trigger
language plpgsql
as $$
declare v_corso_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_corso_id := OLD.corso_id;
  else
    v_corso_id := NEW.corso_id;
  end if;
  if public.helper_corso_has_edizioni(v_corso_id) then
    raise exception
      'D22: la Struttura del corso % è congelata (ha almeno un''Edizione), aggiunte/modifiche/rimozioni non ammesse',
      v_corso_id;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end$$;

drop trigger if exists struttura_freeze on public.struttura_corso;
create trigger struttura_freeze
  before insert or update or delete on public.struttura_corso
  for each row execute function public.tg_struttura_freeze();

-- Nota: la RPC reorder_struttura() del Task 2 ora fallirà su corsi congelati
-- perché internamente fa UPDATE su struttura_corso e il trigger BEFORE UPDATE
-- la rifiuta. È esattamente il comportamento voluto da D22.
