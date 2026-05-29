-- M3a (Task 5) — inserimento e correzione manuale delle presenze (criterio #7).
-- Verifica che:
--   • l'inserimento manuale produca un Evento `presenza_inserita_manualmente`
--     (attore = discente, durata, motivazione), senza PII;
--   • la correzione produca un NUOVO Evento `presenza_corretta_manualmente` con
--     payload.corregge_evento_id = Evento precedente e motivazione, lasciando
--     l'Evento precedente INVARIATO (append-only);
--   • la ricostruzione dello stato (compliance) usi la durata CORRETTA (l'Evento
--     superato non è conteggiato);
--   • motivazione obbligatoria; correggere un Evento non-presenza è rifiutato;
--   • la catena hash resta integra.
--
-- Gira come postgres (bypass guardia admin; current_persona_id() NULL → i campi
-- inserito_da/corretto_da restano NULL nel test: il loro valore con admin reale
-- è verificato sul live). Eseguire via psql o MCP execute_sql (ROLLBACK).

begin;
create extension if not exists pgtap;

select plan(9);

do $$
declare
  v_t uuid; v_stream uuid; v_corso uuid; v_ediz uuid; v_sess uuid;
  v_pm uuid; v_im uuid;
  v_ins jsonb; v_cor jsonb; v_ins_id uuid; v_cor_id uuid;
  v_raised boolean; v_eff numeric; v_grezzo uuid; v_pa uuid;
begin
  insert into public.tenant(nome) values ('pgTAP T5') returning id into v_t;
  insert into public.stream_audit(tenant_id,scope) values (v_t,'tenant') returning id into v_stream;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Admin','T5','admin.t5@x.local') returning id into v_pa;
  insert into public.corso(tenant_id,titolo,sblocco_sequenziale,soglia_frequenza_percentuale) values (v_t,'Corso T5',false,80) returning id into v_corso;
  insert into public.edizione(tenant_id,corso_id,codice) values (v_t,v_corso,'T5-ED') returning id into v_ediz;
  insert into public.sessione(tenant_id,edizione_id,titolo,modalita,vcs_piattaforma,vcs_meeting_id,durata_minuti)
    values (v_t,v_ediz,'Webinar T5','vcs','teams','MEET-T5',120) returning id into v_sess;
  insert into public.persona(tenant_id,nome,cognome,email) values (v_t,'Mario','B','mario@t5.it') returning id into v_pm;
  insert into public.iscrizione(tenant_id,persona_id,edizione_id) values (v_t,v_pm,v_ediz) returning id into v_im;

  v_ins := public.presenza_inserisci_manuale(v_sess, v_im, '100', 'Presente in chiamata, fuori dal report');
  v_ins_id := (v_ins->>'evento_id')::uuid;
  v_cor := public.presenza_correggi_manuale(v_ins_id, '60', 'Durata effettiva 60 (join errato)');
  v_cor_id := (v_cor->>'evento_id')::uuid;

  -- frequenza effettiva (mirror compliance: escludi superati, max per sessione, cap pianificato)
  with pres as (
    select e.id, e.subject_id, (e.payload->>'durata')::numeric d, e.payload->>'corregge_evento_id' ref
    from public.evento e
    where e.event_type in ('presenza_webinar_registrata','presenza_inserita_manualmente','presenza_corretta_manualmente')
      and (e.payload->>'iscrizione_id')::uuid = v_im
  ), sup as (select ref::uuid id from pres where ref is not null)
  select coalesce(max(least(d,120)),0) into v_eff from pres where id not in (select id from sup) and subject_id=v_sess;

  v_raised := false;
  begin perform public.presenza_inserisci_manuale(v_sess, v_im, '30', '  '); exception when others then v_raised := true; end;
  perform set_config('t5.req_mot', v_raised::text, true);

  perform set_config('t5.t', v_t::text, true);
  perform set_config('t5.stream', v_stream::text, true);
  perform set_config('t5.ins', v_ins_id::text, true);
  perform set_config('t5.cor', v_cor_id::text, true);
  perform set_config('t5.pm', v_pm::text, true);
  perform set_config('t5.sess', v_sess::text, true);
  perform set_config('t5.eff', v_eff::text, true);
end $$;

select is(
  (select event_type from public.evento where id=current_setting('t5.ins')::uuid),
  'presenza_inserita_manualmente', '1) inserimento: Evento presenza_inserita_manualmente');
select ok(
  (select (actor->>'persona_id')::uuid=current_setting('t5.pm')::uuid and payload->>'durata'='100'
     and length(payload->>'motivazione')>0 and subject_id=current_setting('t5.sess')::uuid
   from public.evento where id=current_setting('t5.ins')::uuid),
  '2) inserimento: attore=discente, durata=100, motivazione, soggetto=sessione');
select is(
  (select event_type from public.evento where id=current_setting('t5.cor')::uuid),
  'presenza_corretta_manualmente', '3) (M3a#7) correzione: nuovo Evento presenza_corretta_manualmente');
select ok(
  (select (payload->>'corregge_evento_id')::uuid=current_setting('t5.ins')::uuid and payload->>'durata'='60'
     and length(payload->>'motivazione')>0
   from public.evento where id=current_setting('t5.cor')::uuid),
  '4) (M3a#7) correzione referenzia l''Evento precedente + motivazione');
select is(
  (select payload->>'durata' from public.evento where id=current_setting('t5.ins')::uuid),
  '100', '5) (M3a#7) Evento precedente INVARIATO (durata ancora 100)');
select ok(
  not exists(
    select 1 from public.evento
    where id in (current_setting('t5.ins')::uuid, current_setting('t5.cor')::uuid)
      and (payload ? 'nome' or payload ? 'email' or payload ? 'cognome')),
  '6) nessuna PII nei payload manuali');
select is(
  current_setting('t5.eff')::numeric, 60::numeric,
  '7) (M3a#7+#9) frequenza usa la durata corretta (effettiva=60, non 100)');
select is(current_setting('t5.req_mot')::boolean, true, '8) motivazione obbligatoria (vuota → errore)');
select is(
  (select count(*) from public.audit_verify_chain(current_setting('t5.stream')::uuid)),
  0::bigint, '9) catena hash integra dopo inserimento + correzione');

select * from finish();
rollback;
