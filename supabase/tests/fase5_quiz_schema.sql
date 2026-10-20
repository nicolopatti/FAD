-- Fase 5 — Task 1: schema del test finale (LO quiz, domande, freeze D22, RPC).
-- Gira come postgres in transazione con ROLLBACK finale (MCP execute_sql o
-- SQL Editor). Niente DROP/DELETE nel testo: l'MCP blocca quei batch (#13).

begin;
create extension if not exists pgtap;
select plan(15);
-- (Via MCP: raccogliere gli esiti in una temp table con grant a `authenticated`,
-- perché i test 11–15 cambiano ruolo. Verificato 15/15 sul live il 2026-10-20.)

-- Setup: un corso in bozza, un LO quiz, struttura.
do $$ declare v_corso uuid; v_lo uuid; begin
  insert into public.corso (tenant_id, titolo) values ('00000000-0000-0000-0000-000000000001', 'pgTAP corso quiz') returning id into v_corso;
  insert into public.learning_object (tenant_id, type, titolo, config)
    values ('00000000-0000-0000-0000-000000000001', 'quiz', 'pgTAP test finale', '{"soglia_percentuale": 70, "tentativi_max": null, "ordine_casuale": true, "mostra_correzione": true}'::jsonb)
    returning id into v_lo;
  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values ('00000000-0000-0000-0000-000000000001', v_corso, v_lo, 1, true, '{"tipo": "quiz_passed"}'::jsonb);
  perform set_config('q.corso', v_corso::text, true);
  perform set_config('q.lo', v_lo::text, true);
end $$;

-- 1) config senza soglia → rifiutato
select throws_like(
  $$ insert into public.learning_object (tenant_id, type, titolo, config) values ('00000000-0000-0000-0000-000000000001', 'quiz', 'x', '{}'::jsonb) $$,
  '%config_shape%', '1 un quiz senza soglia_percentuale è rifiutato');

-- 2) RPC salva 3 domande (postgres: tenant nullo → bypass guardia admin, attore esplicito)
select lives_ok(
  format($$ select public.quiz_domande_salva(%L, '[
    {"testo":"Domanda 1","tipo":"scelta_singola","risposte":[{"testo":"A","corretta":true},{"testo":"B","corretta":false}]},
    {"testo":"Domanda 2","tipo":"scelta_multipla","risposte":[{"testo":"A","corretta":true},{"testo":"B","corretta":true},{"testo":"C","corretta":false}]},
    {"testo":"Domanda 3","tipo":"scelta_singola","risposte":[{"testo":"Sì","corretta":false},{"testo":"No","corretta":true}]}
  ]'::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, current_setting('q.lo')),
  '2 quiz_domande_salva inserisce le domande');
select is((select count(*) from public.quiz_domanda where learning_object_id = current_setting('q.lo')::uuid), 3::bigint, '3 tre domande salvate con ordine');
select is((select ordine from public.quiz_domanda where learning_object_id = current_setting('q.lo')::uuid and testo = 'Domanda 3'), 3, '4 ordine progressivo');

-- 5) Evento scritto, senza testo delle domande
select is(
  (select payload from public.evento where event_type = 'quiz.domande_aggiornate' and subject_id = current_setting('q.lo')::uuid order by seq desc limit 1),
  '{"n_domande": 3}'::jsonb, '5 Evento quiz.domande_aggiornate con il solo conteggio');

-- 6) risposte non valide: scelta singola con 2 corrette → rifiutata
select throws_like(
  format($$ select public.quiz_domande_salva(%L, '[{"testo":"D","tipo":"scelta_singola","risposte":[{"testo":"A","corretta":true},{"testo":"B","corretta":true}]}]'::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, current_setting('q.lo')),
  '%quiz_domanda_risposte%', '6 scelta singola con due corrette è rifiutata');
-- 7) e il set precedente è intatto (transazione della RPC fallita per intero)
select is((select count(*) from public.quiz_domanda where learning_object_id = current_setting('q.lo')::uuid), 3::bigint, '7 il salvataggio fallito non ha toccato le domande esistenti');

-- 8) sostituzione: 2 domande al posto di 3
select lives_ok(
  format($$ select public.quiz_domande_salva(%L, '[
    {"testo":"Nuova 1","risposte":[{"testo":"A","corretta":true},{"testo":"B"}]},
    {"testo":"Nuova 2","risposte":[{"testo":"A"},{"testo":"B","corretta":true}]}
  ]'::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, current_setting('q.lo')),
  '8 il set si sostituisce per intero');
select is((select count(*) from public.quiz_domanda where learning_object_id = current_setting('q.lo')::uuid), 2::bigint, '9 due domande dopo la sostituzione');

-- 10) freeze: creata un'edizione, le domande sono immutabili
do $$ begin
  insert into public.edizione (tenant_id, corso_id, codice) values ('00000000-0000-0000-0000-000000000001', current_setting('q.corso')::uuid, 'PGTAP-QUIZ-01');
end $$;
select throws_like(
  format($$ select public.quiz_domande_salva(%L, '[{"testo":"X","risposte":[{"testo":"A","corretta":true},{"testo":"B"}]}]'::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, current_setting('q.lo')),
  '%congelato%', '10 D22: domande non modificabili se il test è in un corso con edizioni');

-- 11) il discente non legge le domande (nessuna policy) e non può chiamare la RPC
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"discente"}}';
select is((select count(*) from public.quiz_domanda), 0::bigint, '11 il discente non vede le domande (RLS)');
select throws_like(
  format($$ select public.quiz_domande_salva(%L, '[]'::jsonb) $$, current_setting('q.lo')),
  '%solo un admin%', '12 il discente non può salvare domande');
reset role;

-- 13–15) quiz_domande_pubbliche: il discente demo REALE, iscritto all'edizione
-- del corso di prova, legge le domande senza `corretta`; su un test di un corso
-- a cui non è iscritto la RPC rifiuta.
do $$ declare v_lo2 uuid; begin
  insert into public.iscrizione (tenant_id, persona_id, edizione_id)
    select '00000000-0000-0000-0000-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id
    from public.edizione where codice = 'PGTAP-QUIZ-01';
  insert into public.learning_object (tenant_id, type, titolo, config)
    values ('00000000-0000-0000-0000-000000000001', 'quiz', 'pgTAP test orfano', '{"soglia_percentuale": 70}'::jsonb)
    returning id into v_lo2;
  perform set_config('q.lo2', v_lo2::text, true);
  perform set_config('q.claims', jsonb_build_object('sub', (select auth_user_id from public.persona where id = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'role', 'authenticated', 'app_metadata', jsonb_build_object('role', 'discente'))::text, true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', current_setting('q.claims'), true);
select is((select count(*) from public.quiz_domande_pubbliche(current_setting('q.lo')::uuid)), 2::bigint, '13 il discente iscritto legge le 2 domande via RPC');
select is(
  (select bool_and(not (r ? 'corretta')) from public.quiz_domande_pubbliche(current_setting('q.lo')::uuid) d, jsonb_array_elements(d.risposte) r),
  true, '14 le risposte arrivano senza il flag corretta');
select throws_like(
  format($$ select * from public.quiz_domande_pubbliche(%L) $$, current_setting('q.lo2')),
  '%non iscritto%', '15 test di un corso senza iscrizione → rifiutato');
reset role;

select * from finish();
rollback;
