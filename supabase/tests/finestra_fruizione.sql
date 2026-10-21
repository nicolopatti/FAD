-- Stress test 21/10 — A1/R2: la RPC del player rifiuta gli eventi fuori dalla
-- finestra di fruizione dell'edizione (blocco totale, anche chiamandola
-- direttamente). Gira come postgres in transazione con ROLLBACK; via MCP
-- execute_sql raccogliere gli esiti in una temp table (i test cambiano ruolo).
-- Usa il discente demo (persona aaaa1111-…, utente 11111111-…). Niente DROP/DELETE.
-- Verificato 10/10 sul live il 2026-10-21 (DO block chiuso da RAISE: rollback garantito).

begin;
create extension if not exists pgtap;
select plan(10);

do $$ declare v_corso uuid; v_lo uuid; v_ed uuid; v_i uuid; r record; begin
  insert into public.corso (tenant_id, titolo, sblocco_sequenziale) values ('00000000-0000-0000-0000-000000000001', 'pgTAP finestra', false) returning id into v_corso;
  insert into public.learning_object (tenant_id, type, titolo, config) values ('00000000-0000-0000-0000-000000000001', 'video', 'pgTAP finestra v1', '{"vimeo_id":"1","durata_secondi":60}') returning id into v_lo;
  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values ('00000000-0000-0000-0000-000000000001', v_corso, v_lo, 1, true, '{"tipo":"video_ended"}');
  perform set_config('t.lo', v_lo::text, true);
  for r in select * from (values
    ('aperta',     current_date - 1, current_date + 1, null::date,       null::date,       false),
    ('non_aperta', current_date - 1, current_date + 30, current_date + 10, null::date,      false),
    ('chiusa_fad', current_date - 30, current_date + 30, null::date,     current_date - 5, false),
    ('chiusa_ed',  current_date - 30, current_date - 2, null::date,       null::date,       false),
    ('conclusa',   current_date - 1, current_date + 1, null::date,       null::date,       true)
  ) as t(k, di, df, fa, fc, concl) loop
    insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura)
      values ('00000000-0000-0000-0000-000000000001', v_corso, 'PGTAP-FIN-' || r.k, r.di, r.df, r.fa, r.fc) returning id into v_ed;
    if r.concl then update public.edizione set concluso_at = now() where id = v_ed; end if;
    insert into public.iscrizione (tenant_id, persona_id, edizione_id) values ('00000000-0000-0000-0000-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_ed) returning id into v_i;
    perform set_config('t.ed_' || r.k, v_ed::text, true);
    perform set_config('t.i_' || r.k, v_i::text, true);
  end loop;
end $$;

select is(public.edizione_finestra_stato(current_setting('t.ed_aperta')::uuid), 'aperta', '1 date che comprendono oggi → aperta');
select is(public.edizione_finestra_stato(current_setting('t.ed_non_aperta')::uuid), 'non_aperta', '2 fad_apertura futura vince su data_inizio passata → non aperta');
select is(public.edizione_finestra_stato(current_setting('t.ed_chiusa_fad')::uuid), 'chiusa', '3 fad_chiusura passata vince su data_fine futura → chiusa');
select is(public.edizione_finestra_stato(current_setting('t.ed_chiusa_ed')::uuid), 'chiusa', '4 senza finestra FAD vale data_fine → chiusa');
select is(public.edizione_finestra_stato(current_setting('t.ed_conclusa')::uuid), 'conclusa', '5 edizione conclusa → chiusa anche con le date giuste');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"discente"}}';

select lives_ok(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i_aperta'), current_setting('t.lo')), '6 dentro la finestra l''evento passa');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i_non_aperta'), current_setting('t.lo')), '%non disponibili%non aperta%', '7 prima dell''apertura → rifiutato dalla RPC');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.ended') $$, current_setting('t.i_chiusa_fad'), current_setting('t.lo')), '%non disponibili%chiusa%', '8 dopo la chiusura FAD → rifiutato');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i_chiusa_ed'), current_setting('t.lo')), '%non disponibili%chiusa%', '9 dopo la fine dell''edizione → rifiutato');
select throws_like(format($$ select public.evento_player_registra(%L, %L, 'video.play') $$, current_setting('t.i_conclusa'), current_setting('t.lo')), '%non disponibili%conclusa%', '10 edizione conclusa → rifiutato');

select * from finish();
rollback;
