-- M3a (Task 2) — pipeline unica di ingestione del grezzo: stadi (a) + (b).
-- Blinda le invarianti DB su cui poggiano gli adattatori (CSV Task 3, API Teams
-- Task 6). Copre la porzione di M3a verificabile a livello ingestione:
--   #1 grezzo immutabile (UPDATE/DELETE bloccati);
--   #2 import attestato: 1 solo Evento report_grezzo_importato, payload.hash =
--      hash del contenuto, ricalcolo riproducibile, hash sensibile a 1 modifica;
--   #4 (parziale) payload dell'import senza PII;
--   #8 Evento sullo stream unico del tenant, nessun nuovo stream.
-- Più i rifiuti di validazione (contenuto vuoto, importato_da NULL → Task 6,
-- sessione di altro tenant) e il perimetro authz (anon senza EXECUTE).
--
-- NON copre i criteri di MATCH di M3a (#4 completo, #5 ambiguo, #6 anonimo, #9
-- cache ricalcolata): dipendono dall'algoritmo di riconciliazione del Task 4.
-- La guardia "solo admin" del path authenticated è verificata sul live con le
-- Persone reali (admin vs discente, simulando il JWT) — vedi CLAUDE.md.
--
-- Eseguire con: `psql ... -f supabase/tests/m3a_pipeline_ingest.sql`
-- oppure via MCP execute_sql (gira in transazione con ROLLBACK: non lascia dati).

begin;
create extension if not exists pgtap;

select plan(17);

-- ---------------------------------------------------------------------------
-- Setup: 2 tenant sintetici (A usato per l'import, B per il cross-tenant), una
-- Sessione VCS ciascuno, una Persona admin nel tenant A. Si importa UN grezzo
-- in A e si catturano gli esiti dei casi-rifiuto in GUC booleani.
-- Gira come postgres (current_tenant_id() = NULL) → bypass della guardia admin,
-- esattamente come un import server-side via service_role.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tA uuid; v_pA uuid; v_cA uuid; v_eA uuid; v_sA uuid; v_streamA uuid;
  v_tB uuid; v_cB uuid; v_eB uuid; v_sB uuid;
  v_contenuto jsonb; v_res jsonb; v_grezzo uuid;
  v_raised boolean;
begin
  insert into public.tenant(nome) values ('pgTAP T2 A') returning id into v_tA;
  insert into public.stream_audit(tenant_id, scope) values (v_tA, 'tenant') returning id into v_streamA;
  insert into public.persona(tenant_id, nome, cognome, email)
    values (v_tA, 'Admin', 'A', 'admin.a@t2.local') returning id into v_pA;
  insert into public.corso(tenant_id, titolo, sblocco_sequenziale)
    values (v_tA, 'Corso A', false) returning id into v_cA;
  insert into public.edizione(tenant_id, corso_id, codice)
    values (v_tA, v_cA, 'A-ED') returning id into v_eA;
  insert into public.sessione(tenant_id, edizione_id, titolo, modalita, vcs_piattaforma, vcs_meeting_id)
    values (v_tA, v_eA, 'Webinar A', 'vcs', 'teams', 'MEET-A') returning id into v_sA;

  insert into public.tenant(nome) values ('pgTAP T2 B') returning id into v_tB;
  insert into public.stream_audit(tenant_id, scope) values (v_tB, 'tenant');
  insert into public.corso(tenant_id, titolo, sblocco_sequenziale)
    values (v_tB, 'Corso B', false) returning id into v_cB;
  insert into public.edizione(tenant_id, corso_id, codice)
    values (v_tB, v_cB, 'B-ED') returning id into v_eB;
  insert into public.sessione(tenant_id, edizione_id, titolo, modalita, vcs_piattaforma, vcs_meeting_id)
    values (v_tB, v_eB, 'Webinar B', 'vcs', 'teams', 'MEET-B') returning id into v_sB;

  -- Contenuto normalizzato: array di righe (con PII: il grezzo è prova-staging, D20).
  v_contenuto := jsonb_build_array(
    jsonb_build_object('nome','Mario Bianchi','email','mario@x.it',
      'join','2026-06-01T09:00:00Z','leave','2026-06-01T11:00:00Z','durata_minuti',120),
    jsonb_build_object('nome','Lucia Verdi','email','lucia@x.it',
      'join','2026-06-01T09:05:00Z','leave','2026-06-01T10:55:00Z','durata_minuti',110)
  );

  v_res := public.pipeline_ingest_grezzo(v_tA, v_sA, 'csv'::public.report_fonte, v_contenuto, v_pA);
  v_grezzo := (v_res->>'grezzo_id')::uuid;

  -- Casi-rifiuto (devono sollevare e NON lasciare grezzo orfano).
  v_raised := false;
  begin perform public.pipeline_ingest_grezzo(v_tA, v_sA, 'csv'::public.report_fonte, '[]'::jsonb, v_pA);
  exception when others then v_raised := true; end;
  perform set_config('t2.reject_empty', v_raised::text, true);

  v_raised := false;
  begin perform public.pipeline_ingest_grezzo(v_tA, v_sA, 'csv'::public.report_fonte, v_contenuto, null);
  exception when others then v_raised := true; end;
  perform set_config('t2.reject_null_imp', v_raised::text, true);

  v_raised := false;
  begin perform public.pipeline_ingest_grezzo(v_tA, v_sB, 'csv'::public.report_fonte, v_contenuto, v_pA);
  exception when others then v_raised := true; end;
  perform set_config('t2.reject_xtenant', v_raised::text, true);

  -- Immutabilità del grezzo (write-once, D20).
  v_raised := false;
  begin update public.report_partecipazione_grezzo set fonte = 'api_teams' where id = v_grezzo;
  exception when others then v_raised := true; end;
  perform set_config('t2.block_update', v_raised::text, true);

  v_raised := false;
  begin delete from public.report_partecipazione_grezzo where id = v_grezzo;
  exception when others then v_raised := true; end;
  perform set_config('t2.block_delete', v_raised::text, true);

  perform set_config('t2.tA', v_tA::text, true);
  perform set_config('t2.streamA', v_streamA::text, true);
  perform set_config('t2.grezzo', v_grezzo::text, true);
  perform set_config('t2.fn_hash', v_res->>'hash', true);
end $$;

-- ===========================================================================
-- (a) Persistenza del grezzo
-- ===========================================================================
select is(
  (select count(*)::int from public.report_partecipazione_grezzo
    where tenant_id = current_setting('t2.tA')::uuid),
  1, '1) (a) esattamente 1 grezzo persistito (i rifiuti non lasciano orfani)'
);

-- ===========================================================================
-- (b) Evento di import attestato
-- ===========================================================================
select is(
  (select count(*)::int from public.evento
    where subject_id = current_setting('t2.grezzo')::uuid
      and event_type = 'report_grezzo_importato'),
  1, '2) (b) esattamente 1 Evento report_grezzo_importato per il grezzo'
);
select is(
  (select subject_type from public.evento
    where subject_id = current_setting('t2.grezzo')::uuid
      and event_type = 'report_grezzo_importato'),
  'report_partecipazione_grezzo', '3) (b) subject_type dell''Evento corretto'
);
select is(
  (select payload->>'hash' from public.evento
    where subject_id = current_setting('t2.grezzo')::uuid
      and event_type = 'report_grezzo_importato'),
  current_setting('t2.fn_hash'),
  '4) (b) payload.hash == hash ritornato dalla pipeline'
);
select is(
  (select encode(public.grezzo_content_hash(contenuto), 'hex')
     from public.report_partecipazione_grezzo where id = current_setting('t2.grezzo')::uuid),
  current_setting('t2.fn_hash'),
  '5) (M3a#2) hash ricalcolato dal contenuto MEMORIZZATO combacia (riproducibile)'
);
select ok(
  (select encode(public.grezzo_content_hash(contenuto || jsonb_build_array(jsonb_build_object('x',1))), 'hex')
     from public.report_partecipazione_grezzo where id = current_setting('t2.grezzo')::uuid)
  <> current_setting('t2.fn_hash'),
  '6) (M3a#2) hash sensibile: 1 riga in più → hash diverso'
);
select ok(
  (select not (payload ? 'nome' or payload ? 'cognome' or payload ? 'email'
               or payload ? 'codice_fiscale' or payload ? 'cf')
     from public.evento where subject_id = current_setting('t2.grezzo')::uuid
       and event_type = 'report_grezzo_importato'),
  '7) (M3a#4) payload dell''import senza PII (no nome/cognome/email/CF)'
);
select is(
  (select (payload->>'righe')::int from public.evento
    where subject_id = current_setting('t2.grezzo')::uuid
      and event_type = 'report_grezzo_importato'),
  2, '8) (b) payload.righe == numero righe del contenuto'
);

-- ===========================================================================
-- (M3a#8) Stream unico
-- ===========================================================================
select is(
  (select stream_id from public.evento
    where subject_id = current_setting('t2.grezzo')::uuid
      and event_type = 'report_grezzo_importato'),
  current_setting('t2.streamA')::uuid,
  '9) (M3a#8) Evento sullo stream unico del tenant'
);
select is(
  (select count(*)::int from public.stream_audit
    where tenant_id = current_setting('t2.tA')::uuid),
  1, '10) (M3a#8) nessun nuovo stream creato dalla pipeline (resta 1 per tenant)'
);

-- ===========================================================================
-- Catena hash integra dopo l'Evento di import (M2#7 / M3#5)
-- ===========================================================================
select is(
  (select count(*) from public.audit_verify_chain(current_setting('t2.streamA')::uuid)),
  0::bigint, '11) catena hash integra dopo report_grezzo_importato'
);

-- ===========================================================================
-- Validazioni di ingestione (errore esplicito, niente grezzo orfano)
-- ===========================================================================
select is(current_setting('t2.reject_empty')::boolean, true,
  '12) contenuto vuoto ([]) rifiutato');
select is(current_setting('t2.reject_null_imp')::boolean, true,
  '13) import automatico (importato_da NULL) rifiutato — rinviato al Task 6');
select is(current_setting('t2.reject_xtenant')::boolean, true,
  '14) sessione di un altro tenant rifiutata');

-- ===========================================================================
-- (M3a#1) Grezzo write-once
-- ===========================================================================
select is(current_setting('t2.block_update')::boolean, true,
  '15) (M3a#1) UPDATE sul grezzo bloccato a livello DB');
select is(current_setting('t2.block_delete')::boolean, true,
  '16) (M3a#1) DELETE sul grezzo bloccato a livello DB');

-- ===========================================================================
-- Perimetro authz: anon NON può eseguire la pipeline di scrittura.
-- (il path authenticated è admin-gated; verificato sul live con Persone reali)
-- ===========================================================================
select ok(
  not has_function_privilege('anon',
    'public.pipeline_ingest_grezzo(uuid, uuid, public.report_fonte, jsonb, uuid)', 'EXECUTE'),
  '17) anon non ha EXECUTE sulla pipeline (perimetro chiuso)'
);

select * from finish();
rollback;
