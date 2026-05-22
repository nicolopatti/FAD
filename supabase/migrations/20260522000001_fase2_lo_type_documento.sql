-- Fase 2 — Task 1 (parte 1/2): aggiunta del valore `documento` all'enum lo_type.
--
-- Sta in una migration separata da quella che lo *usa* perché in Postgres un
-- valore di enum aggiunto con ALTER TYPE … ADD VALUE non può essere usato
-- nella stessa transazione: serve un commit in mezzo. Supabase applica ogni
-- migration in una transazione, quindi spezziamo: questa aggiunge il valore,
-- la successiva (`…000002_…_admin_storage.sql`) lo usa nel CHECK.
--
-- Idempotente: ALTER TYPE … ADD VALUE non lo è di per sé, ma il guard via
-- catalog pg_enum lo rende tale.

do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'lo_type'
       and e.enumlabel = 'documento'
  ) then
    alter type public.lo_type add value 'documento';
  end if;
end$$;
