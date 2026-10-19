-- Hardening Tappa 1 (bis) — 2026-10-19
-- Postgres concede EXECUTE a PUBLIC su ogni funzione nuova e `anon` è membro di
-- PUBLIC: la sola revoca di default per `anon` (migration 20261019000001) non
-- basta (verificato: una funzione nuova risultava ancora eseguibile da anon con
-- ACL `=X/postgres`). Da ora le funzioni nuove in `public` create da postgres
-- nascono eseguibili solo da authenticated e service_role (i default privileges
-- espliciti di Supabase restano); l'accesso per anon va concesso a mano quando
-- serve davvero.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
