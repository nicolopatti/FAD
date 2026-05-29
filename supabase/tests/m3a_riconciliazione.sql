-- M3a (Task 4) — riconciliazione presenze + coda risoluzione ambigui.
-- Copre i criteri di MATCH di M3a su uno scenario sintetico riproducibile:
--   #4 match esatto → 1 Evento presenza_webinar_registrata, payload senza PII
--      (+ fallback su persona.email quando email_riconciliazione è NULL, e
--       priorità: l'email_riconciliazione esclude la persona.email);
--   #5 match ambiguo (≥2 candidati) → coda, NESSUNA presenza automatica; una
--      volta risolto dall'admin → presenza + match_risolto_manualmente (motivazione);
--   #6 partecipante anonimo (riga senza email) → partecipante_non_riconciliato con
--      identificatore stabile (hash), nome NON nel payload;
--   #8 tutti gli Eventi sullo stream unico del tenant.
-- Più: idempotenza della ri-esecuzione (no Eventi duplicati) e integrità catena.
--
-- Gira come postgres (current_tenant_id() NULL → bypass guardia admin, come un
-- import server-side). Eseguire: `psql ... -f supabase/tests/m3a_riconciliazione.sql`
-- o via MCP execute_sql (transazione con ROLLBACK: non lascia dati).

begin;
create extension if not exists pgtap;

select plan(20);

do $$
declare
  v_t uuid; v_stream uuid; v_pa uuid; v_corso uuid; v_ediz uuid; v_sess uuid;
  v_pm uuid; v_pl uuid; v_pc uuid; v_pd uuid;
  v_im uuid; v_il uuid; v_ic uuid; v_id uuid;
  v_contenuto jsonb; v_res jsonb; v_grezzo uuid;
  v_coda_amb uuid; v_coda_ass uuid; v_rerun jsonb;
begin
  insert into public.tenant(nome) values ('pgTAP T4') returning id into v_t;
  insert into public.stream_audit(tenant_id, scope) values (v_t,'tenant') returning id into v_stream;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Admin','T4','admin.t4@x.local') returning id into v_pa;
  insert into public.corso(tenant_id,titolo,sblocco_sequenziale,soglia_frequenza_percentuale)
    values (v_t,'Corso T4',false,80) returning id into v_corso;
  insert into public.edizione(tenant_id,corso_id,codice) values (v_t,v_corso,'T4-ED') returning id into v_ediz;
  insert into public.sessione(tenant_id,edizione_id,titolo,modalita,vcs_piattaforma,vcs_meeting_id)
    values (v_t,v_ediz,'Webinar T4','vcs','teams','MEET-T4') returning id into v_sess;

  -- iscritti: Mario (match diretto), Lucia (fallback persona.email), Carla
  -- (email_ric diversa → la persona.email NON matcha: priorità), Dup (crea
  -- ambiguità con Mario sulla stessa email_riconciliazione).
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Mario','B','mario@x.it') returning id into v_pm;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Lucia','V','lucia@x.it') returning id into v_pl;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Carla','N','carla@x.it') returning id into v_pc;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Dup','M','dup@x.it') returning id into v_pd;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id,email_riconciliazione) values (v_t,v_pm,v_ediz,'mario@x.it') returning id into v_im;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id,email_riconciliazione) values (v_t,v_pl,v_ediz,null) returning id into v_il;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id,email_riconciliazione) values (v_t,v_pc,v_ediz,'carla-ext@y.it') returning id into v_ic;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id,email_riconciliazione) values (v_t,v_pd,v_ediz,'mario@x.it') returning id into v_id;

  v_contenuto := jsonb_build_array(
    jsonb_build_object('riga',1,'nome','Mario B','email','mario@x.it','durata','120'),
    jsonb_build_object('riga',2,'nome','Lucia V','email','lucia@x.it','durata','110'),
    jsonb_build_object('riga',3,'nome','Carla N','email','carla-ext@y.it','durata','95'),
    jsonb_build_object('riga',4,'nome','Carla Bis','email','carla@x.it','durata','30'),
    jsonb_build_object('riga',5,'nome','Anonimo','email',null,'durata','45')
  );

  v_res := public.pipeline_ingest_grezzo(v_t, v_sess, 'csv'::public.report_fonte, v_contenuto, v_pa);
  v_grezzo := (v_res->>'grezzo_id')::uuid;

  select id into v_coda_amb from public.coda_riconciliazione where grezzo_id=v_grezzo and tipo='ambiguo';
  select id into v_coda_ass from public.coda_riconciliazione where grezzo_id=v_grezzo and tipo='assente';

  perform public.riconcilia_risolvi_match(v_coda_amb, v_im, 'Mario iscritto, non il duplicato');
  perform public.riconcilia_ignora(v_coda_ass, 'Email non corrisponde');

  v_rerun := public.pipeline_riconcilia_grezzo(v_grezzo);

  perform set_config('t4.t', v_t::text, true);
  perform set_config('t4.stream', v_stream::text, true);
  perform set_config('t4.grezzo', v_grezzo::text, true);
  perform set_config('t4.il', v_il::text, true);
  perform set_config('t4.ic', v_ic::text, true);
  perform set_config('t4.im', v_im::text, true);
  perform set_config('t4.imp_reg', (v_res->'riconciliazione'->>'registrate'), true);
  perform set_config('t4.imp_amb', (v_res->'riconciliazione'->>'ambigui'), true);
  perform set_config('t4.imp_ass', (v_res->'riconciliazione'->>'assenti'), true);
  perform set_config('t4.imp_anon', (v_res->'riconciliazione'->>'anonimi'), true);
  perform set_config('t4.rerun_gia', (v_rerun->>'gia_risolte'), true);
  perform set_config('t4.rerun_reg', (v_rerun->>'registrate'), true);
end $$;

-- --- esiti dell'import automatico ------------------------------------------
select is(current_setting('t4.imp_reg')::int, 2, '1) (M3a#4) import: 2 presenze automatiche (fallback Lucia + Carla via email_ric)');
select is(current_setting('t4.imp_amb')::int, 1, '2) (M3a#5) import: 1 match ambiguo → coda');
select is(current_setting('t4.imp_ass')::int, 1, '3) import: 1 assente (priorità email_ric esclude persona.email)');
select is(current_setting('t4.imp_anon')::int, 1, '4) (M3a#6) import: 1 anonimo');

-- --- fallback / priorità espliciti -----------------------------------------
select ok(
  exists(select 1 from public.evento where event_type='presenza_webinar_registrata'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and (payload->>'iscrizione_id')::uuid=current_setting('t4.il')::uuid),
  '5) (M3a#4) fallback: presenza per Lucia (match su persona.email, email_ric NULL)');
select ok(
  exists(select 1 from public.evento where event_type='presenza_webinar_registrata'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and (payload->>'iscrizione_id')::uuid=current_setting('t4.ic')::uuid),
  '6) (M3a#4) presenza per Carla (match su email_riconciliazione)');

-- --- ambiguo: coda, nessuna presenza automatica per la riga 1 --------------
select is(
  (select jsonb_array_length(candidati) from public.coda_riconciliazione
    where grezzo_id=current_setting('t4.grezzo')::uuid and tipo='ambiguo'),
  2, '7) (M3a#5) ambiguo: 2 candidati nella coda');

-- --- dopo risoluzione manuale ----------------------------------------------
select ok(
  exists(select 1 from public.evento where event_type='presenza_webinar_registrata'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and (payload->>'riga')::int=1 and payload->>'match'='manuale'
    and (payload->>'iscrizione_id')::uuid=current_setting('t4.im')::uuid),
  '8) (M3a#5) risolto: presenza per riga 1 (Mario), match=manuale');
select ok(
  exists(select 1 from public.evento where event_type='match_risolto_manualmente'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and length(payload->>'motivazione')>0),
  '9) (M3a#5) risolto: Evento match_risolto_manualmente con motivazione');

-- --- ignora assente --------------------------------------------------------
select ok(
  exists(select 1 from public.evento where event_type='partecipante_non_riconciliato'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and (payload->>'riga')::int=4 and payload->>'motivo'='ignorato' and length(payload->>'motivazione')>0),
  '10) ignora: partecipante_non_riconciliato (riga 4) con motivazione');

-- --- conteggi + coda svuotata ----------------------------------------------
select is(
  (select count(*)::int from public.evento where event_type='presenza_webinar_registrata'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid),
  3, '11) presenze totali = 3 (Lucia + Carla + Mario risolto)');
select is(
  (select count(*)::int from public.evento where event_type='partecipante_non_riconciliato'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid),
  2, '12) non_riconciliato totali = 2 (anonimo + ignorato)');
select is(
  (select count(*)::int from public.coda_riconciliazione
    where grezzo_id=current_setting('t4.grezzo')::uuid and risolto_at is null),
  0, '13) coda: 0 item pending dopo le risoluzioni');

-- --- no PII -----------------------------------------------------------------
select ok(
  not exists(select 1 from public.evento where (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid
    and event_type in ('presenza_webinar_registrata','partecipante_non_riconciliato','match_risolto_manualmente')
    and (payload ? 'nome' or payload ? 'cognome' or payload ? 'email')),
  '14) (M3a#4/#6) nessuna PII (nome/cognome/email) nei payload di presenza/non-ric/match');

-- --- anonimo: identificatore stabile, nome assente -------------------------
select ok(
  exists(select 1 from public.evento where event_type='partecipante_non_riconciliato'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid and (payload->>'riga')::int=5
    and length(payload->>'identificatore')=64 and not (payload ? 'nome')),
  '15) (M3a#6) anonimo: identificatore hash(64) presente, nome assente');

-- --- idempotenza ri-esecuzione ---------------------------------------------
select is(current_setting('t4.rerun_reg')::int, 0, '16) ri-run: 0 nuove presenze');
select is(current_setting('t4.rerun_gia')::int, 5, '17) ri-run: 5 righe già risolte (idempotente)');
select is(
  (select count(*)::int from public.evento where event_type='presenza_webinar_registrata'
    and (payload->>'grezzo_id')::uuid=current_setting('t4.grezzo')::uuid),
  3, '18) ri-run: nessun Evento di presenza duplicato (ancora 3)');

-- --- stream unico + catena integra -----------------------------------------
select is(
  (select count(distinct stream_id)::int from public.evento where tenant_id=current_setting('t4.t')::uuid),
  1, '19) (M3a#8) tutti gli Eventi del tenant su un solo stream');
select is(
  (select count(*) from public.audit_verify_chain(current_setting('t4.stream')::uuid)),
  0::bigint, '20) catena hash integra dopo riconciliazione + risoluzioni');

select * from finish();
rollback;
