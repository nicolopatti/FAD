-- Fase 5 — Task 1 (parte 1/2): valore `quiz` nell'enum lo_type (D23).
--
-- Migration separata da quella che lo usa: un valore aggiunto con
-- ALTER TYPE … ADD VALUE non è utilizzabile nella stessa transazione
-- (stesso schema della Fase 2 per `documento`). Idempotente via pg_enum.

do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'lo_type'
       and e.enumlabel = 'quiz'
  ) then
    alter type public.lo_type add value 'quiz';
  end if;
end$$;
