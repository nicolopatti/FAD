-- Stress test 21/10 — B6: persone_ruoli restituisce il ruolo di accesso solo a
-- staff del tenant. Utenti demo: discente 11111111-…, auditor 22222222-…,
-- admin 33333333-… (Persone aaaa1111/2222/3333). In rollback; niente DROP.
-- Verificato sul live il 2026-10-21 (DO block chiuso da RAISE): admin 3 ruoli
-- (admin, auditor, discente), auditor 3, discente 0.
begin;
create extension if not exists pgtap;
select plan(4);
select set_config('t.ids', '{aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa,aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa,aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa}', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select ruolo from public.persone_ruoli(current_setting('t.ids')::uuid[]) where persona_id = 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'auditor', '1 l''admin vede il ruolo reale dell''auditor (non "discente")');
select is((select ruolo from public.persone_ruoli(current_setting('t.ids')::uuid[]) where persona_id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'admin', '2 e quello dell''admin');
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"discente"}}';
select is((select count(*) from public.persone_ruoli(current_setting('t.ids')::uuid[])), 0::bigint, '3 il discente non legge i ruoli');
reset role;
select ok(not has_function_privilege('anon', 'public.persone_ruoli(uuid[])', 'EXECUTE'), '4 anon senza EXECUTE');
select * from finish();
rollback;
