-- Blocco B #5/#7: RPC unica degli eventi del player + policy RLS unite.
-- Gira come postgres in transazione con ROLLBACK (MCP execute_sql: raccogliere
-- gli esiti in una temp table con grant a authenticated, perché i test cambiano
-- ruolo). Usa le Persone demo reali (discente 11111111-…, auditor 22222222-…,
-- admin 33333333-…). Niente DROP/DELETE nel testo. Verificato 14/14 sul live il 2026-10-20.

begin;
create extension if not exists pgtap;
select plan(14);

-- Setup: corso a 2 video con sblocco sequenziale, edizione, iscrizione del
-- discente demo e di un'altra persona (l'auditor demo, usata solo come "altro").
do $$ declare v_corso uuid; v_lo1 uuid; v_lo2 uuid; v_ed uuid; v_i1 uuid; v_i2 uuid; begin
  insert into public.corso (tenant_id, titolo, sblocco_sequenziale) values ('00000000-0000-0000-0000-000000000001', 'pgTAP rpc player', true) returning id into v_corso;
  insert into public.learning_object (tenant_id, type, titolo, config) values ('00000000-0000-0000-0000-000000000001', 'video', 'pgTAP v1', '{"vimeo_id":"1","durata_secondi":60}') returning id into v_lo1;
  insert into public.learning_object (tenant_id, type, titolo, config) values ('00000000-0000-0000-0000-000000000001', 'video', 'pgTAP v2', '{"vimeo_id":"2","durata_secondi":60}') returning id into v_lo2;
  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento) values
    ('00000000-0000-0000-0000-000000000001', v_corso, v_lo1, 1, true, '{"tipo":"video_ended"}'),
    ('00000000-0000-0000-0000-000000000001', v_corso, v_lo2, 2, true, '{"tipo":"video_ended"}');
  insert into public.edizione (tenant_id, corso_id, codice) values ('00000000-0000-0000-0000-000000000001', v_corso, 'PGTAP-RPC-01') returning id into v_ed;
  insert into public.iscrizione (tenant_id, persona_id, edizione_id) values ('00000000-0000-0000-0000-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_ed) returning id into v_i1;
  insert into public.iscrizione (tenant_id, persona_id, edizione_id) values ('00000000-0000-0000-0000-000000000001', 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_ed) returning id into v_i2;
  perform set_config('t.lo1', v_lo1::text, true); perform set_config('t.lo2', v_lo2::text, true);
  perform set_config('t.i1', v_i1::text, true); perform set_config('t.i2', v_i2::text, true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"discente"}}';

select lives_ok(format($$ select public.evento_player_registra(%L, %L, 'video.play', '{"posizione_secondi": 0}') $$, current_setting('t.i1'), current_setting('t.lo1')), '1 play sul primo contenuto');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i1'), current_setting('t.lo2')), '%non sbloccato%', '2 D26: il secondo contenuto è bloccato finché il primo non è completato');
select lives_ok(format($$ select public.evento_player_registra(%L, %L, 'video.ended', '{"posizione_secondi": 60}') $$, current_setting('t.i1'), current_setting('t.lo1')), '3 ended sul primo');
select lives_ok(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i1'), current_setting('t.lo2')), '4 dopo ended il secondo si apre');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'documento.opened') $$, current_setting('t.i1'), current_setting('t.lo1')), '%non coerente%', '5 evento documento su un video → rifiutato');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i2'), current_setting('t.lo1')), '%iscrizione non valida%', '6 iscrizione di un''altra persona → rifiutata');
select throws_like(format($$ select public.evento_player_registra(%L, '00000000-0000-0000-0000-00000000dead', 'video.play') $$, current_setting('t.i1')), '%LO non in corso%', '7 contenuto fuori dal corso → rifiutato');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'auth.login') $$, current_setting('t.i1'), current_setting('t.lo1')), '%non ammesso%', '8 tipo di evento non del player → rifiutato');
-- policy unite: il discente vede solo sé stesso e le proprie iscrizioni
select is((select count(*) from public.persona), 1::bigint, '9 il discente legge solo la propria Persona');
select is((select count(*) from public.iscrizione where persona_id <> 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0::bigint, '10 il discente non legge iscrizioni altrui');
reset role;

select is((select e.actor->>'persona_id' = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and e.payload->>'iscrizione_id' = current_setting('t.i1') from public.evento e where e.subject_id = current_setting('t.lo1')::uuid and e.event_type = 'video.ended' order by seq desc limit 1), true, '11 Evento con attore = discente e iscrizione nel payload');

-- admin: con la policy unita legge gli eventi del player e del test, le persone e gli attestati
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*) > 0 from public.evento where event_type in ('quiz.submitted','video.play')) and (select count(*) > 1 from public.persona) and (select count(*) > 0 from public.attestato), true, '12 admin: eventi del player, persone e attestati leggibili');
reset role;

select is((select count(*) from (select tablename, cmd, roles from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE' group by 1, 2, 3 having count(*) > 1) x), 0::bigint, '13 nessuna policy permissiva multipla (advisor 0006)');
select is(has_function_privilege('anon', 'public.evento_player_registra(uuid, uuid, text, jsonb)', 'execute'), false, '14 anon non può eseguire la RPC');

select * from finish();
rollback;
