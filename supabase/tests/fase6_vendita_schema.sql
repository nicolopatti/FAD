-- Fase 6 — Task 1: schema della vendita. Gira come postgres dentro un DO block che
-- finisce con RAISE EXCEPTION 'ROLLBACK_RESULTS: …': tutto viene annullato (senza
-- istruzioni distruttive, trabocchetto #13). Usa l'edizione demo ED-001 (aperta fino al
-- 31/07/2027) e un utente Auth simulato. Esito atteso: tutte le righe "ok".
do $$
declare
  r text := '';
  t constant uuid := '00000000-0000-0000-0000-000000000001';
  ed constant uuid := 'ed011111-ed01-ed01-ed01-ed01ed01ed01';
  lo constant uuid := '10101111-1010-1010-1010-101010101010';
  v_uid uuid := gen_random_uuid();
  v_uid2 uuid := gen_random_uuid();
  v_off uuid;
  v_persona uuid;
  v_persona2 uuid;
  v_res jsonb;
  v_ord uuid;
  v_iscr uuid;
  v_n int;
  v_txt text;
  v_cat jsonb;
begin
  -- Utenti Auth simulati (email confermata) + registrazione.
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'acquirente-test-f6@fad.local', now(), '{}', '{}', '', '', '', ''),
         (v_uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'acquirente2-test-f6@fad.local', now(), '{}', '{}', '', '', '', '');
  v_res := public.persona_da_registrazione(v_uid, t, 'Anna', 'Prova');
  v_persona := (v_res ->> 'persona_id')::uuid;
  r := r || case when v_res ->> 'esito' = 'creata' then '1 ok persona creata; ' else '1 FAIL ' || v_res::text || '; ' end;
  v_res := public.persona_da_registrazione(v_uid, t, 'Anna', 'Prova');
  r := r || case when v_res ->> 'esito' = 'esistente' and (v_res ->> 'persona_id')::uuid = v_persona then '2 ok seconda volta = esistente; ' else '2 FAIL; ' end;
  -- Persona già in anagrafica (iscritta dall'admin) → collegata, non duplicata.
  insert into public.persona (tenant_id, nome, cognome, email) values (t, 'Bruno', 'Esistente', 'acquirente2-test-f6@fad.local') returning id into v_persona2;
  v_res := public.persona_da_registrazione(v_uid2, t, 'Altro', 'Nome');
  r := r || case when v_res ->> 'esito' = 'collegata' and (v_res ->> 'persona_id')::uuid = v_persona2 then '3 ok persona esistente collegata; ' else '3 FAIL ' || v_res::text || '; ' end;

  -- Dominio e offerta (online, 30 giorni, 1 posto).
  insert into public.tenant_dominio (host, tenant_id) values ('negozio-test.example', t), ('fad-*-test.example', t);
  r := r || case when public.tenant_da_host('NEGOZIO-test.example') = t and public.tenant_da_host('fad-abc123-test.example') = t
                  and public.tenant_da_host('altro.example') is null then '4 ok host esatto, jolly, sconosciuto; ' else '4 FAIL; ' end;
  insert into public.offerta (tenant_id, edizione_id, slug, stato, prezzo_centesimi, posti_max, accesso_giorni)
  values (t, ed, 'prova-vendita-f6', 'bozza', 4900, 1, 30) returning id into v_off;
  v_cat := public.catalogo_pubblico('negozio-test.example');
  r := r || case when not exists (select 1 from jsonb_array_elements(v_cat -> 'offerte') x where x ->> 'slug' = 'prova-vendita-f6')
                  then '5 ok bozza non in catalogo; ' else '5 FAIL; ' end;
  update public.offerta set stato = 'pubblicata', pubblicata_il = now() where id = v_off;
  v_cat := public.catalogo_pubblico('negozio-test.example');
  r := r || case when exists (select 1 from jsonb_array_elements(v_cat -> 'offerte') x
                              where x ->> 'slug' = 'prova-vendita-f6' and (x ->> 'in_vendita')::boolean and x ->> 'tipo' = 'online')
                  then '6 ok pubblicata in catalogo e in vendita; ' else '6 FAIL ' || v_cat::text || '; ' end;
  r := r || case when (public.catalogo_pubblico('altro.example') -> 'offerte') = '[]'::jsonb
                  and public.catalogo_offerta('altro.example', 'prova-vendita-f6') is null
                  then '7 ok altro host non vede nulla; ' else '7 FAIL; ' end;
  v_cat := public.catalogo_offerta('negozio-test.example', 'prova-vendita-f6');
  r := r || case when (v_cat ->> 'posti_rimasti')::int = 1 and jsonb_array_length(v_cat -> 'lezioni') >= 1
                  and v_cat::text not ilike '%@%' then '8 ok scheda con lezioni, posti, nessuna email; ' else '8 FAIL; ' end;

  -- Ordine: dati incompleti rifiutati; poi ordine valido; il posto è occupato.
  begin
    perform public.ordine_crea(v_persona, v_off, '{}'::jsonb, '{"termini":"v1"}'::jsonb);
    r := r || '9 FAIL fatturazione vuota accettata; ';
  exception when others then r := r || '9 ok fatturazione incompleta rifiutata; '; end;
  v_res := public.ordine_crea(v_persona, v_off, '{"tipo":"privato","codice_fiscale":"PRVNNA80A41F205X"}'::jsonb,
                              '{"termini":"v1","recesso":"v1"}'::jsonb);
  v_ord := (v_res ->> 'ordine_id')::uuid;
  r := r || case when (v_res ->> 'importo_centesimi')::int = 4900 then '10 ok ordine in attesa; ' else '10 FAIL; ' end;
  begin
    perform public.ordine_crea(v_persona2, v_off, '{"codice_fiscale":"XXXXXX80A01F205X"}'::jsonb, '{"termini":"v1"}'::jsonb);
    r := r || '11 FAIL posto doppio; ';
  exception when others then
    get stacked diagnostics v_txt = message_text;
    r := r || case when v_txt like '%posti esauriti%' then '11 ok ultimo posto occupato dall''ordine in attesa; ' else '11 FAIL ' || v_txt || '; ' end;
  end;
  -- Stessa persona che riprova: il vecchio ordine si annulla, il nuovo prende il posto.
  perform public.ordine_imposta_sessione(v_ord, 'cs_test_vecchia_f6');
  v_res := public.ordine_crea(v_persona, v_off, '{"codice_fiscale":"PRVNNA80A41F205X"}'::jsonb, '{"termini":"v1"}'::jsonb);
  r := r || case when v_res -> 'sessioni_da_scadere' ? 'cs_test_vecchia_f6'
                  and (select stato from public.ordine where id = v_ord) = 'annullato'
                  then '12 ok riprova: vecchio ordine annullato, sessione da far scadere; ' else '12 FAIL ' || v_res::text || '; ' end;
  v_ord := (v_res ->> 'ordine_id')::uuid;
  perform public.ordine_imposta_sessione(v_ord, 'cs_test_f6');

  -- Pagamento (webhook) idempotente.
  v_res := public.ordine_pagato('cs_test_f6', 'pi_test_f6', 4900, 0);
  v_iscr := (v_res ->> 'iscrizione_id')::uuid;
  select count(*) into v_n from public.iscrizione where id = v_iscr and origine = 'acquisto'
    and accesso_dal = (now() at time zone 'Europe/Rome')::date and accesso_fino_al = (now() at time zone 'Europe/Rome')::date + 30;
  r := r || case when v_n = 1 and (v_res ->> 'nuova_iscrizione')::boolean then '13 ok pagato → iscrizione con accesso 30 giorni; ' else '13 FAIL ' || v_res::text || '; ' end;
  v_res := public.ordine_pagato('cs_test_f6', 'pi_test_f6', 4900, 0);
  select count(*) into v_n from public.evento where subject_id = v_ord and event_type = 'ordine.paid';
  r := r || case when (v_res ->> 'gia_registrato')::boolean and v_n = 1
                  and (select count(*) from public.iscrizione where persona_id = v_persona and edizione_id = ed) = 1
                  then '14 ok webhook ripetuto: un solo pagamento e una sola iscrizione; ' else '14 FAIL; ' end;
  -- Sessione vecchia pagata lo stesso: si onora (ordine annullato → pagato), nessuna seconda iscrizione.
  v_res := public.ordine_pagato('cs_test_vecchia_f6', 'pi_test_vecchia_f6', 4900, 0);
  r := r || case when (select count(*) from public.iscrizione where persona_id = v_persona and edizione_id = ed) = 1
                  and not (v_res ->> 'nuova_iscrizione')::boolean then '15 ok sessione vecchia pagata: onorata senza doppioni; ' else '15 FAIL; ' end;
  begin
    perform public.ordine_crea(v_persona, v_off, '{"codice_fiscale":"PRVNNA80A41F205X"}'::jsonb, '{"termini":"v1"}'::jsonb);
    r := r || '16 FAIL acquisto doppio; ';
  exception when others then
    get stacked diagnostics v_txt = message_text;
    r := r || case when v_txt like '%già iscritto%' or v_txt like '%posti esauriti%' then '16 ok già iscritto non riacquista; ' else '16 FAIL ' || v_txt || '; ' end;
  end;

  -- Finestra per iscrizione e RPC del player.
  r := r || case when public.iscrizione_finestra_stato(v_iscr) = 'aperta' then '17 ok accesso aperto; ' else '17 FAIL ' || public.iscrizione_finestra_stato(v_iscr) || '; ' end;
  update public.iscrizione set accesso_dal = (now() at time zone 'Europe/Rome')::date - 40,
                               accesso_fino_al = (now() at time zone 'Europe/Rome')::date - 10 where id = v_iscr;
  r := r || case when public.iscrizione_finestra_stato(v_iscr) = 'scaduta' then '18 ok accesso scaduto; ' else '18 FAIL; ' end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
  execute 'set local role authenticated';
  begin
    perform public.evento_player_registra(v_iscr, lo, 'video.play', '{}'::jsonb);
    r := r || '19 FAIL evento a accesso scaduto; ';
  exception when others then
    get stacked diagnostics v_txt = message_text;
    r := r || case when v_txt like '%accesso scaduta%' then '19 ok RPC del player rifiuta a accesso scaduto; ' else '19 FAIL ' || v_txt || '; ' end;
  end;
  begin
    perform public.ordine_crea(v_persona, v_off, '{"codice_fiscale":"X"}'::jsonb, '{"termini":"v1"}'::jsonb);
    r := r || '20 FAIL ordine_crea eseguibile da authenticated; ';
  exception when insufficient_privilege then r := r || '20 ok ordine_crea negata ad authenticated; ';
            when others then get stacked diagnostics v_txt = message_text; r := r || '20 FAIL ' || v_txt || '; '; end;
  select count(*) into v_n from public.ordine;
  r := r || case when v_n = 2 then '21 ok l''acquirente vede solo i propri 2 ordini; ' else '21 FAIL vede ' || v_n || '; ' end;
  select count(*) into v_n from public.offerta;
  r := r || case when v_n = 0 then '22 ok l''acquirente non legge le offerte direttamente; ' else '22 FAIL; ' end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.ordine;
    r := r || case when v_n = 0 then '23 ok anon non vede ordini; ' else '23 FAIL; ' end;
  exception when insufficient_privilege then r := r || '23 ok anon non vede ordini; '; end;
  r := r || case when (public.catalogo_pubblico('negozio-test.example') -> 'offerte') <> '[]'::jsonb then '24 ok anon legge il catalogo; ' else '24 FAIL; ' end;
  execute 'reset role';

  -- Rimborso: accesso revocato, idempotente.
  update public.iscrizione set accesso_dal = null, accesso_fino_al = null where id = v_iscr;
  perform public.ordine_rimborsato('pi_test_f6', null);
  r := r || case when public.iscrizione_finestra_stato(v_iscr) = 'revocata' and (select stato from public.ordine where id = v_ord) = 'rimborsato'
                  then '25 ok rimborso → accesso revocato; ' else '25 FAIL; ' end;
  v_res := public.ordine_rimborsato('pi_test_f6', null);
  r := r || case when (v_res ->> 'gia_registrato')::boolean then '26 ok rimborso ripetuto senza effetti; ' else '26 FAIL; ' end;
  r := r || case when public.ordine_annulla('cs_inesistente') ->> 'esito' = 'sconosciuta' then '27 ok annullo di sessione sconosciuta; ' else '27 FAIL; ' end;

  -- Invarianti.
  select count(*) into v_n from public.evento e
  where e.subject_id in (v_ord, v_iscr, v_persona, v_persona2)
    and (e.payload ?| array['nome','cognome','email','codice_fiscale']);
  r := r || case when v_n = 0 then '28 ok nessuna chiave PII negli Eventi nuovi; ' else '28 FAIL; ' end;
  select string_agg(p.proname, ',') into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('attestato_verifica', 'catalogo_pubblico', 'catalogo_offerta', 'tenant_da_host');
  r := r || case when v_txt is null then '29 ok nessuna altra funzione eseguibile da anon; ' else '29 FAIL ' || v_txt || '; ' end;
  select count(*) into v_n from public.audit_verify_chain((select id from public.stream_audit where tenant_id = t));
  r := r || case when v_n = 0 then '30 ok catena integra' else '30 FAIL catena: ' || v_n end;

  raise exception 'ROLLBACK_RESULTS: %', r;
end $$;
