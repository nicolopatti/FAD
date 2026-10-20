-- Blocco B #8: RPC tenant_crea. Gira come postgres in transazione con ROLLBACK
-- (MCP execute_sql: raccogliere gli esiti in una temp table con grant a
-- authenticated, perché un test cambia ruolo). L'utente Auth dell'admin è
-- simulato con un INSERT in auth.users (trabocchetto #11: i 4 token a '').
-- Verificato 10/10 sul live il 2026-10-20.

begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@nuovo-ente.test', '', now(),
  '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now(), '', '', '', '');

select lives_ok($$ select set_config('t.res', public.tenant_crea('Ente di prova pgTAP', '99999999-9999-9999-9999-999999999999', 'Giulia', 'Neri', 'Admin@Nuovo-Ente.test', 'Ente di prova S.r.l.', 'Bergamo')::text, true) $$,
  '1 tenant_crea con la service role (auth.uid() nullo)');
select is((select count(*) from public.tenant where id = (current_setting('t.res')::jsonb->>'tenant_id')::uuid and nome = 'Ente di prova pgTAP' and ragione_sociale = 'Ente di prova S.r.l.' and citta = 'Bergamo'), 1::bigint, '2 tenant creato con i dati dell''ente');
select is((select count(*) from public.stream_audit where tenant_id = (current_setting('t.res')::jsonb->>'tenant_id')::uuid and scope = 'tenant'), 1::bigint, '3 un solo stream del registro per il tenant (D11/D19)');
select is((select tenant_id = (current_setting('t.res')::jsonb->>'tenant_id')::uuid and auth_user_id = '99999999-9999-9999-9999-999999999999' and email = 'admin@nuovo-ente.test' from public.persona where id = (current_setting('t.res')::jsonb->>'persona_id')::uuid), true, '4 Persona del primo admin nel tenant, email normalizzata');
select is((select array_agg(event_type order by seq) from public.evento where tenant_id = (current_setting('t.res')::jsonb->>'tenant_id')::uuid), array['tenant.created', 'persona.created'], '5 due Eventi di nascita, seq 1 e 2, sullo stream nuovo');
select is((select count(*) from public.audit_verify_chain((current_setting('t.res')::jsonb->>'stream_id')::uuid)), 0::bigint, '6 catena del nuovo stream integra');
select throws_like($$ select public.tenant_crea('Doppione', '99999999-9999-9999-9999-999999999999', 'G', 'N', 'x@y.z') $$, '%già collegato%', '7 lo stesso utente Auth non può diventare admin di due tenant');

-- Isolamento: il nuovo admin vede solo il proprio tenant (il tenant demo ha corsi e persone).
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*) from public.persona) = 1 and (select count(*) from public.corso) = 0 and (select count(*) from public.evento) = 2, true, '8 il nuovo admin legge solo il proprio tenant (1 persona, 0 corsi, 2 eventi)');
select throws_like($$ select public.tenant_crea('Da utente', '99999999-9999-9999-9999-999999999999', 'G', 'N', 'x@y.z') $$, '%', '9 un utente autenticato non può eseguire tenant_crea');
reset role;

select is(has_function_privilege('anon', 'public.tenant_crea(text, uuid, text, text, text, text, text, uuid)', 'execute') or has_function_privilege('authenticated', 'public.tenant_crea(text, uuid, text, text, text, text, text, uuid)', 'execute'), false, '10 EXECUTE negato ad anon e authenticated');

select * from finish();
rollback;
