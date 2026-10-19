-- Hardening Tappa 1 (bis) — 2026-10-19
-- Postgres concede EXECUTE a PUBLIC su ogni funzione nuova e `anon` è membro di
-- PUBLIC: la sola revoca di default per `anon` (migration 20261019000001) non
-- basta (verificato: una funzione nuova risultava ancora eseguibile da anon con
-- ACL `=X/postgres`). Da ora le funzioni nuove in `public` create da postgres
-- nascono eseguibili solo da authenticated e service_role (i default privileges
-- espliciti di Supabase restano); l'accesso per anon va concesso a mano quando
-- serve davvero.
--
-- NOTA (verificato dopo l'apply): i default privileges PER SCHEMA si sommano a
-- quelli globali e NON possono togliere ciò che il default built-in concede
-- (EXECUTE a PUBLIC): una funzione nuova nasce ancora con `=X/postgres`. Questa
-- migration resta applicata ma è, in pratica, un no-op. L'invariante "nessuna
-- funzione di public eseguibile da anon" è garantito dalla regola di metodo
-- (revoca esplicita in ogni migration che crea funzioni) e dal test pgTAP
-- hardening_grants.sql #7, che enumera tutte le funzioni dello schema.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
