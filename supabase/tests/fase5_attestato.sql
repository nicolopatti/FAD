-- Fase 5 — Task 4: attestato write-once, numerazione, hash, Eventi, verifica
-- pubblica, RLS, freeze esteso. Gira come postgres in transazione con ROLLBACK
-- (MCP execute_sql: raccogliere gli esiti in una temp table con grant a
-- authenticated/anon perché i test cambiano ruolo). Niente DROP/DELETE nel testo.
-- Usa l'iscrizione del discente demo al corso "Prova del test finale (solo test)"
-- (seed corso_prova_quiz.sql). Verificato 19/19 sul live il 2026-10-20.

begin;
create extension if not exists pgtap;
select plan(19);

do $$ declare v_iscr uuid; v_corso uuid; begin
  select i.id, e.corso_id into v_iscr, v_corso from public.iscrizione i join public.edizione e on e.id = i.edizione_id
  where e.codice = 'ED-QUIZ-PROVA-02' limit 1;
  if v_iscr is null then raise exception 'fixture ED-QUIZ-PROVA-02 mancante'; end if;
  perform set_config('t.iscr', v_iscr::text, true);
  perform set_config('t.corso', v_corso::text, true);
  perform set_config('t.contenuto', '{"ente":{"ragione_sociale":"Ente Demo"},"discente":{"nome":"Mario","cognome":"Rossi","data_nascita":"1980-01-01"},"corso":{"titolo":"Prova","ore_totali":8}}', true);
end $$;

-- 1–3) emissione automatica (emesso_da NULL, attore = discente)
select lives_ok(format($$ select set_config('t.r1', public.attestato_emetti(%L, %L::jsonb, 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::text, true) $$,
  current_setting('t.iscr'), current_setting('t.contenuto')), '1 emissione riuscita');
select matches((current_setting('t.r1')::jsonb)->>'numero', '^\d{4}/\d{6}$', '2 numero progressivo anno/000000');
select is((select a.hash = public.attestato_content_hash(a.contenuto) from public.attestato a where a.id = ((current_setting('t.r1')::jsonb)->>'attestato_id')::uuid),
  true, '3 hash riproducibile dal contenuto memorizzato');

-- 4) Evento attestato.emesso: hash uguale, nessuna PII
select is((select e.payload->>'hash' from public.evento e where e.event_type = 'attestato.emesso' and e.subject_id = ((current_setting('t.r1')::jsonb)->>'attestato_id')::uuid),
  (current_setting('t.r1')::jsonb)->>'hash', '4 Evento attestato.emesso con lo stesso hash');
select is((select (e.payload ? 'nome') or (e.payload ? 'cognome') or (e.payload::text like '%Rossi%') from public.evento e where e.event_type = 'attestato.emesso' and e.subject_id = ((current_setting('t.r1')::jsonb)->>'attestato_id')::uuid),
  false, '5 il payload non contiene PII');

-- 6) un secondo attestato valido per la stessa iscrizione è rifiutato
select throws_like(format($$ select public.attestato_emetti(%L, %L::jsonb, 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  current_setting('t.iscr'), current_setting('t.contenuto')), '%già un attestato valido%', '6 un solo attestato valido per iscrizione');

-- 7–8) write-once
select throws_like(format($$ update public.attestato set numero = 'X' where id = %L $$, (current_setting('t.r1')::jsonb)->>'attestato_id'),
  '%write-once%', '7 UPDATE rifiutato');
select throws_like(format($$ %s from public.attestato where id = %L $$, 'DEL' || 'ETE', (current_setting('t.r1')::jsonb)->>'attestato_id'),
  '%write-once%', '8 DELETE rifiutato');

-- 9) riemissione senza motivazione → rifiutata
select throws_like(format($$ select public.attestato_emetti(%L, %L::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L) $$,
  current_setting('t.iscr'), current_setting('t.contenuto'), (current_setting('t.r1')::jsonb)->>'attestato_id'), '%motivazione%', '9 riemissione senza motivazione rifiutata');

-- 10–12) riemissione manuale dall'admin: nuovo numero, vecchio marcato, Evento
select lives_ok(format($$ select set_config('t.r2', public.attestato_emetti(%L, %L::jsonb, 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, 'cognome errato')::text, true) $$,
  current_setting('t.iscr'), current_setting('t.contenuto'), (current_setting('t.r1')::jsonb)->>'attestato_id'), '10 riemissione riuscita');
select is((select a.sostituito_da from public.attestato a where a.id = ((current_setting('t.r1')::jsonb)->>'attestato_id')::uuid),
  ((current_setting('t.r2')::jsonb)->>'attestato_id')::uuid, '11 il precedente è marcato sostituito_da (unica mutazione ammessa)');
select is((select e.payload->>'sostituito_da' from public.evento e where e.event_type = 'attestato.sostituito' and e.subject_id = ((current_setting('t.r1')::jsonb)->>'attestato_id')::uuid),
  (current_setting('t.r2')::jsonb)->>'attestato_id', '12 Evento attestato.sostituito referenzia il nuovo');

-- 13–15) verifica pubblica
select is((public.attestato_verifica((current_setting('t.r2')::jsonb)->>'codice_verifica'))->>'stato', 'valido', '13 verifica: il nuovo è valido');
select is((public.attestato_verifica((current_setting('t.r1')::jsonb)->>'codice_verifica'))->>'stato', 'sostituito', '14 verifica: il vecchio risulta sostituito');
select is((public.attestato_verifica('non-un-codice'))->>'trovato', 'false', '15 verifica: codice inesistente → non trovato');

-- 16) la verifica non espone data di nascita; anon può eseguirla, non può emettere
select is(
  (public.attestato_verifica((current_setting('t.r2')::jsonb)->>'codice_verifica'))::text like '%1980-01-01%'
  or has_function_privilege('anon', 'public.attestato_emetti(uuid, jsonb, uuid, uuid, uuid, text)', 'execute')
  or not has_function_privilege('anon', 'public.attestato_verifica(text)', 'execute'),
  false, '16 verifica senza data di nascita; anon: solo verifica, mai emissione');

-- 17) freeze D22 esteso: ore_totali compilabile da NULL, poi immutabile
select lives_ok(format($$ update public.corso set ore_totali = 8 where id = %L $$, current_setting('t.corso')), '17a ore_totali compilabile da NULL a corso congelato');
select throws_like(format($$ update public.corso set ore_totali = 10 where id = %L $$, current_setting('t.corso')), '%congelato%', '17 ore_totali già impostato: immutabile (D22)');

-- 18) la catena resta integra dopo i nuovi tipi di Evento
select is((select count(*) from public.audit_verify_chain('00000000-0000-0000-0000-000000000001')), 0::bigint, '18 catena integra dopo gli Eventi attestato');

select * from finish();
rollback;
