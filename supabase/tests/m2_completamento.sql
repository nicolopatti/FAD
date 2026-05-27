-- M2 — verifica del report di completamento su corso multi-LO (Task 5, gate M2 #5).
-- Esercita: ricalcolo dagli Eventi (D8), regola_completamento per riga di
-- Struttura rispettata (un video.ended NON completa un LO documento e
-- viceversa), distinzione obbligatori/facoltativi, idoneità che dipende solo
-- dagli obbligatori (i facoltativi non bloccano). Blinda le invarianti DB su
-- cui poggia /audit/completamento. Non sostituisce la verifica manuale UI.
--
-- Eseguire con: `psql ... -f supabase/tests/m2_completamento.sql`
-- oppure incollandolo nel SQL Editor / via MCP execute_sql (gira in
-- transazione con ROLLBACK: non lascia dati sul progetto).

begin;
create extension if not exists pgtap;

select plan(21);

-- ---------------------------------------------------------------------------
-- Scenario: 1 tenant, 1 persona, 1 corso con sblocco sequenziale + 3 LO misti
-- (video obbligatorio, documento obbligatorio, video facoltativo), 1 edizione,
-- 1 iscrizione. NESSUN evento al setup. La cache dell'Iscrizione è messa
-- volutamente "sporca" (true,true) per dimostrare D8.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
  v_persona uuid;
  v_corso uuid;
  v_lo1 uuid; v_lo2 uuid; v_lo3 uuid;
  v_ediz uuid;
  v_iscr uuid;
begin
  insert into public.tenant (nome) values ('Test M2') returning id into v_tenant;
  insert into public.stream_audit (tenant_id, scope) values (v_tenant, 'tenant');
  insert into public.persona (tenant_id, nome, cognome, email)
    values (v_tenant, 'Test', 'M2', 'test.m2@fad.local') returning id into v_persona;
  insert into public.corso (tenant_id, titolo, sblocco_sequenziale)
    values (v_tenant, 'Corso test M2 multi-LO', true) returning id into v_corso;

  insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'video', 'Video introduttivo',
      jsonb_build_object('vimeo_id', '111', 'durata_secondi', 60))
    returning id into v_lo1;
  insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'documento', 'Dispensa PDF',
      jsonb_build_object('storage_key', 'x/y.pdf', 'mime', 'application/pdf', 'size', 1))
    returning id into v_lo2;
  insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'video', 'Approfondimento facoltativo',
      jsonb_build_object('vimeo_id', '333', 'durata_secondi', 90))
    returning id into v_lo3;

  -- Struttura (D24/D25): sequenza piatta, regola per riga.
  --  1) video    obbligatorio  -> video_ended
  --  2) documento obbligatorio -> documento_completed
  --  3) video    facoltativo   -> video_ended
  insert into public.struttura_corso
    (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values (v_tenant, v_corso, v_lo1, 1, true,  '{"tipo": "video_ended"}'::jsonb);
  insert into public.struttura_corso
    (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values (v_tenant, v_corso, v_lo2, 2, true,  '{"tipo": "documento_completed"}'::jsonb);
  insert into public.struttura_corso
    (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values (v_tenant, v_corso, v_lo3, 3, false, '{"tipo": "video_ended"}'::jsonb);

  insert into public.edizione (tenant_id, corso_id, codice)
    values (v_tenant, v_corso, 'M2-001') returning id into v_ediz;
  insert into public.iscrizione (tenant_id, persona_id, edizione_id,
                                  cache_completata, cache_idonea)
    values (v_tenant, v_persona, v_ediz, true, true) returning id into v_iscr;

  perform set_config('m2.tenant', v_tenant::text, true);
  perform set_config('m2.persona', v_persona::text, true);
  perform set_config('m2.corso', v_corso::text, true);
  perform set_config('m2.lo1', v_lo1::text, true);
  perform set_config('m2.lo2', v_lo2::text, true);
  perform set_config('m2.lo3', v_lo3::text, true);
  perform set_config('m2.iscr', v_iscr::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- Vista derivata: replica della logica di src/lib/compliance.ts in SQL puro,
-- ma rule-aware. A differenza di m1, il match di completamento dipende dalla
-- regola_completamento della RIGA di Struttura: un evento video.ended completa
-- solo gli LO la cui regola è video_ended; documento.completed solo quelli con
-- documento_completed. È la mappa COMPLETION_EVENT_FOR_RULE di compliance.ts.
-- ---------------------------------------------------------------------------
create or replace view m2_progresso_test as
with str as (
  select
    s.id, s.corso_id, s.learning_object_id, s.ordine, s.obbligatorio,
    s.regola_completamento->>'tipo' as regola_tipo,
    case s.regola_completamento->>'tipo'
      when 'video_ended' then 'video.ended'
      when 'documento_completed' then 'documento.completed'
      else null
    end as completion_event
  from public.struttura_corso s
),
completati as (
  -- (persona, LO, tipo evento) per gli eventi di completamento ammessi
  select distinct
    (e.actor->>'persona_id')::uuid as persona_id,
    e.subject_id as learning_object_id,
    e.event_type
  from public.evento e
  where e.event_type in ('video.ended', 'documento.completed')
    and e.subject_type = 'learning_object'
),
prog as (
  select
    isc.id as iscrizione_id,
    isc.persona_id,
    c.id as corso_id,
    c.sblocco_sequenziale,
    s.id as struttura_id,
    s.learning_object_id,
    s.ordine,
    s.obbligatorio,
    s.regola_tipo,
    -- completato solo se l'evento combacia con la regola della riga
    (comp.learning_object_id is not null) as completato
  from public.iscrizione isc
  join public.edizione ed on ed.id = isc.edizione_id
  join public.corso c on c.id = ed.corso_id
  join str s on s.corso_id = c.id
  left join completati comp
    on comp.persona_id = isc.persona_id
   and comp.learning_object_id = s.learning_object_id
   and comp.event_type = s.completion_event
)
select
  iscrizione_id, persona_id, corso_id, sblocco_sequenziale,
  struttura_id, learning_object_id, ordine, obbligatorio, regola_tipo, completato,
  case
    when not sblocco_sequenziale then true
    else not exists (
      select 1
      from prog p2
      where p2.iscrizione_id = prog.iscrizione_id
        and p2.ordine < prog.ordine
        and p2.obbligatorio
        and not p2.completato
    )
  end as sbloccato
from prog;

-- ===========================================================================
-- A) Stato iniziale (0 eventi)
-- ===========================================================================
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo1')::uuid),
  true, '1) LO1 (video) sbloccato all''inizio (è il primo)'
);
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo2')::uuid),
  false, '2) LO2 (documento) bloccato all''inizio (LO1 obbligatorio non completato)'
);
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo3')::uuid),
  false, '3) LO3 (facoltativo) bloccato all''inizio'
);
select is(
  (select count(*)::int from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid and completato),
  0, '4) 0 LO completati all''inizio'
);
select is(
  (select count(*)::int from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid),
  3, '5) La struttura ha esattamente 3 LO (totale)'
);
select is(
  (select count(*)::int from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid and obbligatorio),
  2, '6) 2 LO obbligatori'
);
select is(
  (select count(*)::int from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid and not obbligatorio),
  1, '7) 1 LO facoltativo (distinzione obbligatori/facoltativi)'
);
select is(
  (select count(*) = 0 from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and obbligatorio and not completato),
  false, '8) Idoneità falsa all''inizio (obbligatori non completati)'
);

-- ===========================================================================
-- B) Evento video.ended su LO1 → LO1 completato, LO2 si sblocca, LO3 no.
-- ===========================================================================
do $$
declare
  v_actor jsonb := jsonb_build_object('persona_id', current_setting('m2.persona')::uuid);
begin
  perform public.audit_append(
    current_setting('m2.tenant')::uuid, 'video.play', v_actor,
    'learning_object', current_setting('m2.lo1')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m2.iscr')::uuid));
  perform public.audit_append(
    current_setting('m2.tenant')::uuid, 'video.ended', v_actor,
    'learning_object', current_setting('m2.lo1')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m2.iscr')::uuid,
                       'durata_secondi', 60));
end $$;

select is(
  (select completato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo1')::uuid),
  true, '9) LO1 completato dopo video.ended (deriva dall''Evento)'
);
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo2')::uuid),
  true, '10) LO2 sbloccato dopo che LO1 obbligatorio è completato (D26)'
);
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo3')::uuid),
  false, '11) LO3 ancora bloccato (LO2 obbligatorio non completato)'
);
select is(
  (select count(*) = 0 from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and obbligatorio and not completato),
  false, '12) Idoneità ancora falsa (manca LO2 obbligatorio)'
);

-- ===========================================================================
-- C) Regola rispettata: un video.ended sul LO documento NON lo completa,
--    perché la sua regola è documento_completed (M2 #5).
-- ===========================================================================
do $$
declare
  v_actor jsonb := jsonb_build_object('persona_id', current_setting('m2.persona')::uuid);
begin
  perform public.audit_append(
    current_setting('m2.tenant')::uuid, 'video.ended', v_actor,
    'learning_object', current_setting('m2.lo2')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m2.iscr')::uuid,
                       'durata_secondi', 1));
end $$;

select is(
  (select completato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo2')::uuid),
  false, '13) LO2 (documento) NON completato da un video.ended: regola rispettata'
);
select is(
  (select count(*) = 0 from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and obbligatorio and not completato),
  false, '14) Idoneità ancora falsa (evento con regola sbagliata ignorato)'
);

-- ===========================================================================
-- D) Evento documento.completed su LO2 → LO2 completato; tutti gli obbligatori
--    completi ⇒ idonea = true anche se il facoltativo LO3 resta da fare.
-- ===========================================================================
do $$
declare
  v_actor jsonb := jsonb_build_object('persona_id', current_setting('m2.persona')::uuid);
begin
  perform public.audit_append(
    current_setting('m2.tenant')::uuid, 'documento.opened', v_actor,
    'learning_object', current_setting('m2.lo2')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m2.iscr')::uuid));
  perform public.audit_append(
    current_setting('m2.tenant')::uuid, 'documento.completed', v_actor,
    'learning_object', current_setting('m2.lo2')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m2.iscr')::uuid));
end $$;

select is(
  (select completato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo2')::uuid),
  true, '15) LO2 completato da documento.completed (regola documento_completed)'
);
select is(
  (select count(*) = 0 from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and obbligatorio and not completato),
  true, '16) Idonea = true: tutti gli obbligatori completi (facoltativo non blocca)'
);
select is(
  (select completato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo3')::uuid),
  false, '17) LO3 facoltativo resta non completato'
);
select is(
  (select sbloccato from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and learning_object_id = current_setting('m2.lo3')::uuid),
  true, '18) LO3 ora sbloccato (i precedenti obbligatori sono completi)'
);

-- ===========================================================================
-- E) D8 esplicito: il ricalcolo non consulta cache_completata / cache_idonea.
-- ===========================================================================
update public.iscrizione
   set cache_completata = false, cache_idonea = false
 where id = current_setting('m2.iscr')::uuid;

select is(
  (select count(*) = 0 from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid
      and obbligatorio and not completato),
  true, '19) Dopo aver azzerato la cache, l''idoneità ricalcolata resta true (D8)'
);
select is(
  (select count(*)::int from m2_progresso_test
    where iscrizione_id = current_setting('m2.iscr')::uuid and completato),
  2, '20) 2 LO completati (LO1 + LO2); il facoltativo non incide sul conteggio obbligatori'
);

-- ===========================================================================
-- F) Catena hash integra dopo i nuovi tipi di evento (M2 #7).
-- ===========================================================================
select is(
  (select count(*) from public.audit_verify_chain(
    (select id from public.stream_audit
      where tenant_id = current_setting('m2.tenant')::uuid))),
  0::bigint, '21) Catena hash integra dopo video.* e documento.* (M2 #7)'
);

select * from finish();
rollback;
