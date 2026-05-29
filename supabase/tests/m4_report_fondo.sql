-- M4 — Generatore di report fondi: deposito write-once + Evento/hash + integrità.
-- Verifica a livello DB (il motore di aggregazione TS è coperto da typecheck +
-- verifiche live MCP; qui si blindano le invarianti del deposito, gate M4):
--   • report_fondo_deposita crea lo snapshot e ritorna snapshot_id + hash;
--   • l'Evento report_fondo_depositato porta payload.hash = hash del contenuto,
--     senza PII (solo hash/metadati);
--   • report_fondo_verifica conferma l'integrità (hash ricalcolato = Evento);
--   • lo snapshot è write-once (UPDATE/DELETE bloccati);
--   • rigenerare è additivo (2° snapshot; il 1° resta integro);
--   • la catena hash resta integra dopo gli Eventi di deposito;
--   • contenuto non-oggetto è rifiutato.
--
-- Gira come postgres (bypass guardia admin; l'authz admin/discente è verificata
-- sul live con JWT simulato). Eseguire via psql o MCP execute_sql (ROLLBACK).

begin;
create extension if not exists pgtap;

select plan(10);

do $$
declare
  v_t uuid; v_stream uuid; v_admin uuid; v_corso uuid; v_ediz uuid; v_piano uuid;
  v_pm uuid; v_im uuid;
  v_contenuto jsonb;
  v_dep1 jsonb; v_dep2 jsonb; v_snap1 uuid; v_hash1 text; v_ver jsonb;
  v_upd boolean := false; v_del boolean := false; v_inv boolean := false;
  v_evt_payload jsonb;
begin
  insert into public.tenant(nome) values ('pgTAP M4') returning id into v_t;
  insert into public.stream_audit(tenant_id,scope) values (v_t,'tenant') returning id into v_stream;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Admin','M4','admin.m4@x.local') returning id into v_admin;
  insert into public.corso(tenant_id,titolo,sblocco_sequenziale,soglia_frequenza_percentuale) values (v_t,'Corso M4',false,80) returning id into v_corso;
  insert into public.edizione(tenant_id,corso_id,codice) values (v_t,v_corso,'M4-ED') returning id into v_ediz;
  insert into public.piano_formativo_finanziato(tenant_id,titolo,codice,fondo,cup,avviso)
    values (v_t,'Piano M4','PM4','fondimpresa','CUPM4XXXXXXXXXX','Avviso M4') returning id into v_piano;
  insert into public.persona(tenant_id,nome,cognome,email,codice_fiscale) values (v_t,'Mario','Bianchi','mario@m4.it','BNCMRA80A01F205X') returning id into v_pm;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id,piano_id) values (v_t,v_pm,v_ediz,v_piano) returning id into v_im;

  -- dataset risolto (oggetto) — qui un sottoinsieme rappresentativo
  v_contenuto := jsonb_build_object(
    'testata', jsonb_build_object('cup','CUPM4XXXXXXXXXX','edizione_codice','M4-ED'),
    'iscritti', jsonb_build_array(jsonb_build_object('cognome','Bianchi','nome','Mario','codice_fiscale','BNCMRA80A01F205X','frequenza_percentuale',100,'idoneo',true)),
    'generato_at','2026-05-29T10:00:00Z');

  v_dep1 := public.report_fondo_deposita(v_ediz, v_piano, 'fondimpresa', v_contenuto, v_admin);
  v_snap1 := (v_dep1->>'snapshot_id')::uuid;
  v_hash1 := v_dep1->>'hash';
  v_ver := public.report_fondo_verifica(v_snap1);

  select payload into v_evt_payload from public.evento where subject_id=v_snap1 and event_type='report_fondo_depositato';

  begin update public.report_fondo_depositato set formato='x' where id=v_snap1; exception when others then v_upd := true; end;
  begin delete from public.report_fondo_depositato where id=v_snap1; exception when others then v_del := true; end;

  -- rigenerazione additiva (contenuto diverso → hash diverso)
  v_dep2 := public.report_fondo_deposita(v_ediz, v_piano, 'foncoop',
    v_contenuto || jsonb_build_object('generato_at','2026-05-29T11:00:00Z'), v_admin);

  -- contenuto non-oggetto rifiutato
  begin perform public.report_fondo_deposita(v_ediz, v_piano, 'fondimpresa', '[]'::jsonb, v_admin); exception when others then v_inv := true; end;

  perform set_config('m4.snap1_ok', (v_snap1 is not null)::text, true);
  perform set_config('m4.snap_row', exists(select 1 from public.report_fondo_depositato where id=v_snap1 and fondo='fondimpresa' and formato='fondimpresa')::text, true);
  perform set_config('m4.hash_match', ((v_evt_payload->>'hash') = v_hash1)::text, true);
  perform set_config('m4.no_pii', (not (v_evt_payload ?| array['nome','cognome','email','codice_fiscale','cf']))::text, true);
  perform set_config('m4.verifica', (v_ver->>'integra'), true);
  perform set_config('m4.upd', v_upd::text, true);
  perform set_config('m4.del', v_del::text, true);
  perform set_config('m4.additive', (select count(*) from public.report_fondo_depositato where edizione_id=v_ediz and piano_id=v_piano)::text, true);
  perform set_config('m4.chain', (select count(*) from public.audit_verify_chain(v_stream))::text, true);
  perform set_config('m4.invalid', v_inv::text, true);
end$$;

select ok(current_setting('m4.snap1_ok')::boolean, 'deposito ritorna uno snapshot_id');
select ok(current_setting('m4.snap_row')::boolean, 'snapshot persistito con fondo/formato attesi');
select ok(current_setting('m4.hash_match')::boolean, 'Evento report_fondo_depositato porta payload.hash = hash del contenuto');
select ok(current_setting('m4.no_pii')::boolean, 'payload dell''Evento privo di PII (solo hash/metadati)');
select is(current_setting('m4.verifica'), 'true', 'report_fondo_verifica: snapshot integro');
select ok(current_setting('m4.upd')::boolean, 'snapshot write-once: UPDATE bloccato');
select ok(current_setting('m4.del')::boolean, 'snapshot write-once: DELETE bloccato');
select is(current_setting('m4.additive'), '2', 'rigenerazione additiva: due snapshot per (edizione, piano)');
select is(current_setting('m4.chain'), '0', 'catena hash integra dopo gli Eventi di deposito');
select ok(current_setting('m4.invalid')::boolean, 'contenuto non-oggetto rifiutato');

select * from finish();
rollback;
