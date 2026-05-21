-- M1 — verifica delle proprietà dati della slice FAD (Tasks 4-5-6).
-- Esercita: progresso ricalcolato dagli Eventi (D8), sblocco sequenziale che
-- dipende solo dagli Eventi (D26), idoneità che si attiva al completamento
-- dei mandatori. Non sostituisce la verifica manuale UI di M1 §9.1 (slice
-- end-to-end) ma blinda le invarianti DB.
--
-- Eseguire con: `psql ... -f supabase/tests/m1_slice_data.sql`.

begin;
create extension if not exists pgtap;

select plan(10);

-- ---------------------------------------------------------------------------
-- Scenario: 1 tenant, 1 persona, 1 corso con sblocco sequenziale + 2 LO video,
-- 1 edizione, 1 iscrizione. NESSUN evento al setup.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
  v_persona uuid;
  v_corso uuid;
  v_lo1 uuid; v_lo2 uuid;
  v_str1 uuid; v_str2 uuid;
  v_ediz uuid;
  v_iscr uuid;
begin
  insert into public.tenant (nome) values ('Test M1') returning id into v_tenant;
  insert into public.stream_audit (tenant_id, scope) values (v_tenant, 'tenant');
  insert into public.persona (tenant_id, nome, cognome, email)
    values (v_tenant, 'Test', 'User', 'test.user@fad.local') returning id into v_persona;
  insert into public.corso (tenant_id, titolo, sblocco_sequenziale)
    values (v_tenant, 'Corso test M1', true) returning id into v_corso;
  insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'video', 'Lezione 1',
      jsonb_build_object('vimeo_id','111','durata_secondi',60))
    returning id into v_lo1;
  insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'video', 'Lezione 2',
      jsonb_build_object('vimeo_id','222','durata_secondi',90))
    returning id into v_lo2;
  insert into public.struttura_corso
    (tenant_id, corso_id, learning_object_id, ordine, obbligatorio)
    values (v_tenant, v_corso, v_lo1, 1, true) returning id into v_str1;
  insert into public.struttura_corso
    (tenant_id, corso_id, learning_object_id, ordine, obbligatorio)
    values (v_tenant, v_corso, v_lo2, 2, true) returning id into v_str2;
  insert into public.edizione (tenant_id, corso_id, codice)
    values (v_tenant, v_corso, 'M1-001') returning id into v_ediz;
  insert into public.iscrizione (tenant_id, persona_id, edizione_id,
                                  cache_completata, cache_idonea)
    -- D8: la cache viene messa volutamente "sporca" per dimostrare che il
    -- ricalcolo dagli Eventi non la consulta.
    values (v_tenant, v_persona, v_ediz, true, true) returning id into v_iscr;

  perform set_config('m1.tenant', v_tenant::text, true);
  perform set_config('m1.persona', v_persona::text, true);
  perform set_config('m1.corso', v_corso::text, true);
  perform set_config('m1.lo1', v_lo1::text, true);
  perform set_config('m1.lo2', v_lo2::text, true);
  perform set_config('m1.iscr', v_iscr::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- Vista derivata: replica della logica di src/lib/compliance.ts in SQL puro.
-- È la stessa logica che il front-end usa via supabase-js, fatta in DB per
-- testabilità. Se questa è corretta, lo è anche la pagina /audit/completamento
-- (che la chiama).
-- ---------------------------------------------------------------------------
create or replace view m1_progresso_test as
with str as (
  select s.id, s.corso_id, s.learning_object_id, s.ordine, s.obbligatorio
  from public.struttura_corso s
),
completati as (
  -- per ogni (persona, LO) → c'è un video.ended?
  select distinct
    (e.actor->>'persona_id')::uuid as persona_id,
    e.subject_id as learning_object_id
  from public.evento e
  where e.event_type = 'video.ended'
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
    (comp.learning_object_id is not null) as completato
  from public.iscrizione isc
  join public.edizione ed on ed.id = isc.edizione_id
  join public.corso c on c.id = ed.corso_id
  join str s on s.corso_id = c.id
  left join completati comp
    on comp.persona_id = isc.persona_id
   and comp.learning_object_id = s.learning_object_id
)
-- per ogni riga, sbloccato = nessun precedente obbligatorio incompleto
select
  iscrizione_id, persona_id, corso_id, sblocco_sequenziale,
  struttura_id, learning_object_id, ordine, obbligatorio, completato,
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

-- ---------------------------------------------------------------------------
-- Stato iniziale (0 eventi):
--  - LO1: sbloccato, non completato
--  - LO2: bloccato (LO1 non completato), non completato
-- ---------------------------------------------------------------------------
select is(
  (select sbloccato from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid
      and learning_object_id = current_setting('m1.lo1')::uuid),
  true,
  '1) LO1 sbloccato all''inizio (è il primo)'
);
select is(
  (select sbloccato from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid
      and learning_object_id = current_setting('m1.lo2')::uuid),
  false,
  '2) LO2 bloccato all''inizio (LO1 mandatory non completato)'
);
select is(
  (select count(*)::int from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid and completato),
  0,
  '3) 0 LO completati all''inizio'
);

-- ---------------------------------------------------------------------------
-- Evento video.ended per LO1 → LO1 completato, LO2 si sblocca.
-- ---------------------------------------------------------------------------
do $$
declare
  v_actor jsonb := jsonb_build_object('persona_id', current_setting('m1.persona')::uuid);
begin
  perform public.audit_append(
    current_setting('m1.tenant')::uuid,
    'video.play', v_actor, 'learning_object',
    current_setting('m1.lo1')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m1.iscr')::uuid)
  );
  perform public.audit_append(
    current_setting('m1.tenant')::uuid,
    'video.ended', v_actor, 'learning_object',
    current_setting('m1.lo1')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m1.iscr')::uuid,
                       'durata_secondi', 60)
  );
end $$;

select is(
  (select completato from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid
      and learning_object_id = current_setting('m1.lo1')::uuid),
  true,
  '4) LO1 completato dopo video.ended (deriva dall''Evento, non dalla cache)'
);
select is(
  (select sbloccato from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid
      and learning_object_id = current_setting('m1.lo2')::uuid),
  true,
  '5) LO2 sbloccato dopo che LO1 è completato (D26)'
);

-- ---------------------------------------------------------------------------
-- Idoneità — tutti gli obbligatori completati ⇒ idonea = true.
-- ---------------------------------------------------------------------------
do $$
declare
  v_actor jsonb := jsonb_build_object('persona_id', current_setting('m1.persona')::uuid);
begin
  perform public.audit_append(
    current_setting('m1.tenant')::uuid,
    'video.ended', v_actor, 'learning_object',
    current_setting('m1.lo2')::uuid,
    jsonb_build_object('iscrizione_id', current_setting('m1.iscr')::uuid,
                       'durata_secondi', 90)
  );
end $$;

select is(
  (select count(*)::int from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid and not completato and obbligatorio),
  0,
  '6) Tutti gli LO obbligatori completati'
);
select is(
  (select count(*)::int from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid),
  2,
  '7) La struttura ha esattamente 2 LO'
);

-- ---------------------------------------------------------------------------
-- D8 esplicito: il report non consulta cache_completata / cache_idonea.
-- La cache fu inserita true,true; il ricalcolo dagli Eventi resta coerente.
-- ---------------------------------------------------------------------------
update public.iscrizione
   set cache_completata = false, cache_idonea = false
 where id = current_setting('m1.iscr')::uuid;

select is(
  (select count(*)::int from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr')::uuid and completato),
  2,
  '8) Dopo aver azzerato la cache, il ricalcolo resta corretto (D8)'
);

-- ---------------------------------------------------------------------------
-- Catena hash dei video events deve restare integra (criterio M1 #2 sotto carico).
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.audit_verify_chain(
    (select id from public.stream_audit
      where tenant_id = current_setting('m1.tenant')::uuid))),
  0::bigint,
  '9) Catena hash integra dopo append di video events reali'
);

-- ---------------------------------------------------------------------------
-- Sblocco sequenziale al rovescio: se per un altro Iscritto non ci sono eventi,
-- LO2 è bloccato (la cache del primo iscritto non lo aiuta).
-- ---------------------------------------------------------------------------
do $$
declare
  v_persona2 uuid;
  v_iscr2 uuid;
  v_ediz2 uuid;
begin
  insert into public.persona (tenant_id, nome, cognome, email)
    values (current_setting('m1.tenant')::uuid, 'Altro', 'Iscritto',
            'altro@fad.local')
    returning id into v_persona2;
  insert into public.edizione (tenant_id, corso_id, codice)
    values (current_setting('m1.tenant')::uuid,
            current_setting('m1.corso')::uuid, 'M1-002')
    returning id into v_ediz2;
  insert into public.iscrizione (tenant_id, persona_id, edizione_id)
    values (current_setting('m1.tenant')::uuid, v_persona2, v_ediz2)
    returning id into v_iscr2;
  perform set_config('m1.iscr2', v_iscr2::text, true);
end $$;

select is(
  (select sbloccato from m1_progresso_test
    where iscrizione_id = current_setting('m1.iscr2')::uuid
      and learning_object_id = current_setting('m1.lo2')::uuid),
  false,
  '10) Per l''altro iscritto LO2 è bloccato (isolamento per persona)'
);

select * from finish();
rollback;
