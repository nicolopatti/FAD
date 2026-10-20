-- Corso di prova con test finale (Fase 5, 2026-10-20). Crea nel tenant demo un
-- corso a due passi: il video "Lezione 01" del corso di prova a 6 video (riusato
-- dalla libreria, senza visione integrale: basta arrivare alla fine) e un test
-- finale a 5 domande (soglia 70%, tentativi illimitati, ordine casuale, correzione
-- mostrata se superato). Poi un'edizione e l'iscrizione del discente demo.
-- Eventi via audit_append / quiz_domande_salva — mai INSERT su evento.
--
-- Gira come postgres via MCP execute_sql (o psql). Idempotente sul codice edizione.
-- Le domande vanno salvate PRIMA dell'edizione: dopo, il corso è congelato (D22).

do $$
declare
  v_tenant   uuid := '00000000-0000-0000-0000-000000000001';
  v_admin    uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';   -- persona admin demo
  v_discente uuid := 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';   -- persona discente demo
  v_video_lo uuid := '5e5b5688-777a-4aab-b2fb-3d1e9eb2e4f3';   -- "Lezione 01 - Perché esistono i finanziamenti"
  v_titolo   text := 'Prova del test finale';
  v_descr    text := 'Un video introduttivo e un test di cinque domande. Il test si supera con almeno il 70% di risposte giuste e si può ripetere.';
  v_codice   text := 'ED-QUIZ-PROVA-01';
  v_cfg_quiz jsonb := '{"soglia_percentuale": 70, "tentativi_max": null, "ordine_casuale": true, "mostra_correzione": true}'::jsonb;
  v_domande jsonb := '[
    {"testo": "Perché esistono i finanziamenti pubblici alla formazione?", "tipo": "scelta_singola",
     "risposte": [{"testo": "Per sostenere competenze che il mercato da solo non svilupperebbe", "corretta": true},
                  {"testo": "Per sostituire del tutto la formazione privata", "corretta": false},
                  {"testo": "Per finanziare esclusivamente le grandi imprese", "corretta": false}]},
    {"testo": "Quali tra questi sono soggetti che possono finanziare la formazione?", "tipo": "scelta_multipla",
     "risposte": [{"testo": "Fondi interprofessionali", "corretta": true},
                  {"testo": "Regioni e Stato", "corretta": true},
                  {"testo": "L''ufficio postale", "corretta": false},
                  {"testo": "Le stesse imprese, con risorse proprie", "corretta": true}]},
    {"testo": "Che cos''è un fondo interprofessionale?", "tipo": "scelta_singola",
     "risposte": [{"testo": "Un fondo pensione per i lavoratori autonomi", "corretta": false},
                  {"testo": "Un organismo che raccoglie contributi delle imprese e finanzia piani formativi", "corretta": true},
                  {"testo": "Una banca specializzata in prestiti alle scuole", "corretta": false}]},
    {"testo": "Cosa distingue un finanziamento pubblico da uno privato?", "tipo": "scelta_singola",
     "risposte": [{"testo": "La fonte delle risorse e le regole di rendicontazione", "corretta": true},
                  {"testo": "Solo l''importo massimo erogabile", "corretta": false},
                  {"testo": "Nulla: sono la stessa cosa", "corretta": false},
                  {"testo": "Il colore del modulo di domanda", "corretta": false}]},
    {"testo": "Per rendicontare un corso finanziato, cosa serve dimostrare?", "tipo": "scelta_multipla",
     "risposte": [{"testo": "La partecipazione effettiva dei discenti", "corretta": true},
                  {"testo": "Il completamento delle attività previste", "corretta": true},
                  {"testo": "Il numero di telefono del docente", "corretta": false}]}
  ]'::jsonb;
  v_corso uuid; v_ediz uuid; v_iscr uuid; v_quiz uuid; v_str uuid;
  v_actor jsonb;
begin
  v_actor := jsonb_build_object('persona_id', v_admin, 'type', 'persona');
  if exists (select 1 from public.edizione where tenant_id = v_tenant and codice = v_codice) then
    raise notice 'Edizione % già presente: nessuna modifica.', v_codice;
    return;
  end if;
  if not exists (select 1 from public.learning_object where id = v_video_lo and tenant_id = v_tenant) then
    raise exception 'Video % non trovato nella libreria del tenant', v_video_lo;
  end if;

  insert into public.corso (tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale)
  values (v_tenant, v_titolo, v_descr, true, false) returning id into v_corso;
  perform public.audit_append(v_tenant, 'corso.created', v_actor, 'corso', v_corso,
    jsonb_build_object('titolo', v_titolo, 'origine', 'seed corso_prova_quiz'));

  -- 1. il video (riuso dalla libreria)
  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
  values (v_tenant, v_corso, v_video_lo, 1, true, '{"tipo":"video_ended"}'::jsonb) returning id into v_str;
  perform public.audit_append(v_tenant, 'struttura.added', v_actor, 'struttura_corso', v_str,
    jsonb_build_object('corso_id', v_corso, 'learning_object_id', v_video_lo, 'ordine', 1));

  -- 2. il test finale
  insert into public.learning_object (tenant_id, type, titolo, config)
  values (v_tenant, 'quiz', 'Test finale - I finanziamenti', v_cfg_quiz) returning id into v_quiz;
  perform public.audit_append(v_tenant, 'learning_object.created', v_actor, 'learning_object', v_quiz,
    jsonb_build_object('type', 'quiz', 'titolo', 'Test finale - I finanziamenti', 'config', v_cfg_quiz));
  perform public.quiz_domande_salva(v_quiz, v_domande, v_admin);

  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
  values (v_tenant, v_corso, v_quiz, 2, true, '{"tipo":"quiz_passed"}'::jsonb) returning id into v_str;
  perform public.audit_append(v_tenant, 'struttura.added', v_actor, 'struttura_corso', v_str,
    jsonb_build_object('corso_id', v_corso, 'learning_object_id', v_quiz, 'ordine', 2));

  insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine)
  values (v_tenant, v_corso, v_codice, current_date, current_date + 90) returning id into v_ediz;
  perform public.audit_append(v_tenant, 'edizione.created', v_actor, 'edizione', v_ediz,
    jsonb_build_object('corso_id', v_corso, 'codice', v_codice));

  insert into public.iscrizione (tenant_id, persona_id, edizione_id)
  values (v_tenant, v_discente, v_ediz) returning id into v_iscr;
  perform public.audit_append(v_tenant, 'iscrizione.created', v_actor, 'iscrizione', v_iscr,
    jsonb_build_object('edizione_id', v_ediz, 'persona_id', v_discente));

  raise notice 'Creato corso % (%), test % con % domande, edizione % (%), iscrizione %',
    v_titolo, v_corso, v_quiz, jsonb_array_length(v_domande), v_codice, v_ediz, v_iscr;
end $$;

-- Secondo corso: SOLO il test (stesso LO riusato dalla libreria), così il test
-- è subito aperto senza passare dal video. Le due iscrizioni hanno esiti
-- indipendenti: la compliance filtra gli Eventi per iscrizione.
do $$
declare
  v_tenant   uuid := '00000000-0000-0000-0000-000000000001';
  v_admin    uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_discente uuid := 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_titolo   text := 'Prova del test finale (solo test)';
  v_descr    text := 'Solo il test di cinque domande, subito disponibile: per provare consegna, esito e nuovi tentativi.';
  v_codice   text := 'ED-QUIZ-PROVA-02';
  v_corso uuid; v_ediz uuid; v_iscr uuid; v_quiz uuid; v_str uuid; v_actor jsonb;
begin
  v_actor := jsonb_build_object('persona_id', v_admin, 'type', 'persona');
  if exists (select 1 from public.edizione where tenant_id = v_tenant and codice = v_codice) then
    raise notice 'Edizione % già presente: nessuna modifica.', v_codice;
    return;
  end if;
  select id into v_quiz from public.learning_object where tenant_id = v_tenant and type = 'quiz' and titolo = 'Test finale - I finanziamenti' limit 1;
  if v_quiz is null then raise exception 'Test "Test finale - I finanziamenti" non trovato: lanciare prima il primo blocco'; end if;

  insert into public.corso (tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale)
  values (v_tenant, v_titolo, v_descr, true, false) returning id into v_corso;
  perform public.audit_append(v_tenant, 'corso.created', v_actor, 'corso', v_corso,
    jsonb_build_object('titolo', v_titolo, 'origine', 'seed corso_prova_quiz'));
  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
  values (v_tenant, v_corso, v_quiz, 1, true, '{"tipo":"quiz_passed"}'::jsonb) returning id into v_str;
  perform public.audit_append(v_tenant, 'struttura.added', v_actor, 'struttura_corso', v_str,
    jsonb_build_object('corso_id', v_corso, 'learning_object_id', v_quiz, 'ordine', 1));
  insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine)
  values (v_tenant, v_corso, v_codice, current_date, current_date + 90) returning id into v_ediz;
  perform public.audit_append(v_tenant, 'edizione.created', v_actor, 'edizione', v_ediz,
    jsonb_build_object('corso_id', v_corso, 'codice', v_codice));
  insert into public.iscrizione (tenant_id, persona_id, edizione_id)
  values (v_tenant, v_discente, v_ediz) returning id into v_iscr;
  perform public.audit_append(v_tenant, 'iscrizione.created', v_actor, 'iscrizione', v_iscr,
    jsonb_build_object('edizione_id', v_ediz, 'persona_id', v_discente));
  raise notice 'Creato corso % (%), edizione % (%), iscrizione %', v_titolo, v_corso, v_codice, v_ediz, v_iscr;
end $$;
