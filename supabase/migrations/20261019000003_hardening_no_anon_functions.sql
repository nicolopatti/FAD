-- Hardening Tappa 1 (ter) — 2026-10-19
-- Nessuna funzione di `public` eseguibile da `anon`. Restavano i 4 helper di
-- hashing (puri, senza accesso ai dati): revocati per avere un invariante
-- semplice, verificato dal test pgTAP hardening_grants.sql (#7): "zero funzioni
-- in public eseguibili da anon". Ogni migration futura che crea una funzione in
-- `public` deve revocare EXECUTE ad anon (e PUBLIC) nella stessa migration.
revoke execute on function public.audit_canonical(uuid, bigint, text, timestamptz, jsonb, text, uuid, jsonb, bytea) from public, anon;
revoke execute on function public.audit_genesis_hash(uuid) from public, anon;
revoke execute on function public.grezzo_content_hash(jsonb) from public, anon;
revoke execute on function public.report_fondo_content_hash(jsonb) from public, anon;
