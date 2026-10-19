-- Hardening Tappa 1 (2026-10-19) — verifica dei grant e delle guardie dopo la
-- migration 20261019000001_hardening_grants.sql.
--   • audit_append NON eseguibile da anon/authenticated, SÌ da service_role;
--   • le altre funzioni SECURITY DEFINER e trigger non eseguibili da anon;
--   • search_path fissato sulle 7 funzioni segnalate dall'advisor;
--   • 8 indici sulle FK presenti;
--   • un discente autenticato (JWT simulato) che chiama audit_append riceve
--     "permission denied"; un admin autenticato passa ancora per le RPC
--     SECURITY DEFINER (presenza manuale) che appendono internamente;
--   • i trigger (freeze D22) scattano ancora sotto `authenticated` nonostante
--     la revoca di EXECUTE sulle funzioni trigger;
--   • service_role appende e la catena resta integra.
-- Usa i dati demo del tenant 00000000-…0001 (utenti discente/admin, corso
-- c0c01111 congelato, sessione webinar 33333333-…05e1). Eseguire via psql o
-- MCP execute_sql in transazione (ROLLBACK finale).

begin;
create extension if not exists pgtap;

select plan(14);

-- 1) grant su audit_append
select ok(not has_function_privilege('anon','public.audit_append(uuid,text,jsonb,text,uuid,jsonb)','EXECUTE'),
  '1 anon non può eseguire audit_append');
select ok(not has_function_privilege('authenticated','public.audit_append(uuid,text,jsonb,text,uuid,jsonb)','EXECUTE'),
  '2 authenticated non può eseguire audit_append');
select ok(has_function_privilege('service_role','public.audit_append(uuid,text,jsonb,text,uuid,jsonb)','EXECUTE'),
  '3 service_role può eseguire audit_append');

-- 2) anon sulle altre funzioni esposte
select is(
  (select count(*) from unnest(array[
    'public.audit_verify_chain(uuid)','public.current_persona_id()','public.current_stream_id()',
    'public.current_tenant_id()','public.helper_corso_has_edizioni(uuid)','public.reorder_struttura(uuid,uuid[])',
    'public.tg_sessione_incarico_check()','public.evento_block_mutations()','public.tg_corso_freeze()',
    'public.tg_struttura_freeze()','public.grezzo_block_mutations()','public.report_fondo_block_mutations()']) f
   where has_function_privilege('anon', f, 'EXECUTE')),
  0::bigint, '4 nessuna funzione definer/trigger eseguibile da anon');

-- 3) search_path fissato
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proconfig is null
     and p.proname in ('is_admin','is_auditor','evento_block_mutations','grezzo_block_mutations',
                       'report_fondo_block_mutations','tg_corso_freeze','tg_struttura_freeze')),
  0::bigint, '5 search_path fissato sulle 7 funzioni');

-- 4) indici FK
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
    'incarico_persona_idx','iscrizione_azienda_idx','iscrizione_piano_idx','report_fondo_generato_da_idx',
    'report_fondo_piano_idx','grezzo_importato_da_idx','sessione_incarico_idx','struttura_lo_idx')),
  8::bigint, '6 otto indici sulle chiavi esterne');

-- 5) privilegi di default: le funzioni nuove non ricevono EXECUTE per anon
create function public.__tmp_hardening_probe() returns int language sql as $$ select 1 $$;
select ok(not has_function_privilege('anon','public.__tmp_hardening_probe()','EXECUTE'),
  '7 una funzione nuova non è eseguibile da anon (default privileges)');

-- 6) discente autenticato
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"discente"}}';
select throws_ok(
  $$ select public.audit_append('00000000-0000-0000-0000-000000000001','video.ended',
       '{"persona_id":"aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa","type":"persona"}'::jsonb,
       'learning_object','10102222-1010-1010-1010-101010101010','{}'::jsonb) $$,
  '42501', null, '8 il discente non può chiamare audit_append direttamente');
select lives_ok(
  $$ select * from public.audit_verify_chain('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '9 audit_verify_chain resta chiamabile da authenticated');
select is((select count(*) from public.persona), 1::bigint,
  '10 policy persona: il discente vede solo sé stesso');
reset role;

-- 7) admin autenticato: trigger freeze ancora attivo, update non strutturale ok,
--    RPC definer che appende internamente ok
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}';
select throws_like(
  $$ update public.corso set titolo = titolo || ' X' where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '%congelat%', '11 freeze D22 scatta ancora sotto authenticated (trigger non bloccato dalla revoca)');
select lives_ok(
  $$ update public.corso set creato_il = creato_il where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '12 campo non strutturale aggiornabile su corso congelato');
select lives_ok(
  $$ select public.presenza_inserisci_manuale('33333333-0000-0000-0000-0000000005e1',
       '33333333-0000-0000-0000-000000015003','30','test hardening') $$,
  '13 admin: RPC definer appende ancora (guardia tenant/admin passa)');
reset role;

-- 8) service_role appende, catena integra
set local role service_role;
select is(
  (select count(*) from public.audit_verify_chain(
     (public.audit_append('00000000-0000-0000-0000-000000000001','test.hardening',
        '{"persona_id":"aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa","type":"persona"}'::jsonb,
        'persona','aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}'::jsonb)).stream_id)),
  0::bigint, '14 service_role appende e la catena resta integra');
reset role;

select * from finish();
rollback;
