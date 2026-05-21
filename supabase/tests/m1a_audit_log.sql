-- M1a — gate del log append-only.
-- Eseguire con: `supabase test db` (richiede pgTAP attivo) oppure
--   `psql ... -f supabase/tests/m1a_audit_log.sql`
-- I sei criteri del brief sono testati esplicitamente.

begin;
create extension if not exists pgtap;

select plan(20);
-- ---------------------------------------------------------------------------
-- I 20 assert mappano i 6 criteri del brief (M1a §8):
--  immutabilità (1a-c + 1d-g + 1bis genesi),
--  serializzazione (2 + 2b),
--  catena verificabile (3a + 3b),
--  genesi (1),
--  no PII (5a-c),
--  timestamp server-side (6),
--  privileges (auth/anon SELECT ammesso, INSERT diretto vietato).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Preparazione: creo un tenant + stream isolati per il test.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
begin
  insert into public.tenant (nome) values ('Test M1a') returning id into v_tenant;
  insert into public.stream_audit (tenant_id, scope) values (v_tenant, 'tenant');
  perform set_config('m1a.tenant_id', v_tenant::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1) GENESI: il primo evento ha prev_hash = sentinella deterministica
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('m1a.tenant_id')::uuid;
  v_evento public.evento;
  v_stream_id uuid;
  v_sentinel bytea;
begin
  v_evento := public.audit_append(
    v_tenant,
    'test.genesi',
    jsonb_build_object('persona_id', gen_random_uuid()),
    'tenant',
    v_tenant,
    '{}'::jsonb
  );
  select id into v_stream_id from public.stream_audit where tenant_id = v_tenant;
  v_sentinel := public.audit_genesis_hash(v_stream_id);

  perform set_config('m1a.first_event_id', v_evento.id::text, true);
  perform set_config('m1a.stream_id', v_stream_id::text, true);

  if v_evento.prev_hash is null then
    raise exception 'prev_hash NULL alla genesi (deve essere sentinella deterministica)';
  end if;
  if v_evento.prev_hash <> v_sentinel then
    raise exception 'prev_hash della genesi non corrisponde alla sentinella';
  end if;
  if v_evento.seq <> 1 then
    raise exception 'seq del primo evento deve essere 1';
  end if;
end $$;

select pass('1) Genesi: prev_hash = sentinella deterministica, seq = 1');

-- Stessa sentinella per ricalcolo deterministico
select is(
  public.audit_genesis_hash(current_setting('m1a.stream_id')::uuid),
  public.audit_genesis_hash(current_setting('m1a.stream_id')::uuid),
  '1bis) audit_genesis_hash è deterministica'
);

-- ---------------------------------------------------------------------------
-- 6) TIMESTAMP SERVER-SIDE: occurred_at vicino a now() del server,
--    indipendentemente da cosa il client provi a passare.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('m1a.tenant_id')::uuid;
  v_e public.evento;
begin
  v_e := public.audit_append(
    v_tenant, 'test.timestamp', jsonb_build_object('persona_id', gen_random_uuid()),
    'tenant', v_tenant, '{}'::jsonb
  );
  if v_e.occurred_at < now() - interval '5 seconds' or v_e.occurred_at > now() + interval '5 seconds' then
    raise exception 'occurred_at non è server-side (delta troppo grande)';
  end if;
end $$;
select pass('6) Timestamp assegnato dal server in audit_append');

-- ---------------------------------------------------------------------------
-- 5) NO PII: l'append rifiuta nome/email/CF nell'actor o nel payload.
-- ---------------------------------------------------------------------------
select throws_ok($$
  select public.audit_append(
    current_setting('m1a.tenant_id')::uuid,
    'test.pii',
    jsonb_build_object('persona_id', gen_random_uuid(), 'nome', 'Mario'),
    'tenant', current_setting('m1a.tenant_id')::uuid, '{}'::jsonb
  )
$$,
  'audit_append: actor non può contenere PII (nome/cognome/email/CF)',
  '5a) actor con "nome" rifiutato');

select throws_ok($$
  select public.audit_append(
    current_setting('m1a.tenant_id')::uuid,
    'test.pii',
    jsonb_build_object('persona_id', gen_random_uuid()),
    'tenant', current_setting('m1a.tenant_id')::uuid,
    jsonb_build_object('email', 'x@y.z')
  )
$$,
  'audit_append: payload non può contenere PII (nome/cognome/email/CF)',
  '5b) payload con "email" rifiutato');

select throws_ok($$
  select public.audit_append(
    current_setting('m1a.tenant_id')::uuid,
    'test.pii',
    jsonb_build_object('persona_id', gen_random_uuid()),
    'tenant', current_setting('m1a.tenant_id')::uuid,
    jsonb_build_object('codice_fiscale', 'RSSMRA80A01H501Z')
  )
$$,
  'audit_append: payload non può contenere PII (nome/cognome/email/CF)',
  '5c) payload con codice_fiscale rifiutato');

-- ---------------------------------------------------------------------------
-- 1) IMMUTABILITÀ FISICA: UPDATE / DELETE / TRUNCATE bloccati dai trigger.
-- ---------------------------------------------------------------------------
select throws_ok($$
  update public.evento set event_type = 'hacked'
   where id = current_setting('m1a.first_event_id')::uuid
$$,
  'evento è append-only: UPDATE non permesso',
  '1a) UPDATE su evento → eccezione');

select throws_ok($$
  delete from public.evento
   where id = current_setting('m1a.first_event_id')::uuid
$$,
  'evento è append-only: DELETE non permesso',
  '1b) DELETE su evento → eccezione');

select throws_ok(
  $$ truncate table public.evento $$,
  'evento è append-only: TRUNCATE non permesso',
  '1c) TRUNCATE su evento → eccezione');

-- Permessi REVOCATI ai ruoli dell'app: anon/authenticated NON hanno
-- update/delete diretti.
select ok(
  not has_table_privilege('anon', 'public.evento', 'update'),
  '1d) anon NON ha UPDATE diretto su evento'
);
select ok(
  not has_table_privilege('authenticated', 'public.evento', 'update'),
  '1e) authenticated NON ha UPDATE diretto su evento'
);
select ok(
  not has_table_privilege('anon', 'public.evento', 'delete'),
  '1f) anon NON ha DELETE diretto su evento'
);
select ok(
  not has_table_privilege('authenticated', 'public.evento', 'delete'),
  '1g) authenticated NON ha DELETE diretto su evento'
);
select ok(
  not has_table_privilege('authenticated', 'public.evento', 'insert'),
  '1h) authenticated NON ha INSERT diretto su evento (solo via audit_append)'
);
select ok(
  has_table_privilege('authenticated', 'public.evento', 'select'),
  '1i) authenticated PUÒ leggere evento (RLS poi filtra le righe)'
);
select ok(
  has_function_privilege('authenticated',
    'public.audit_append(uuid, text, jsonb, text, uuid, jsonb)',
    'execute'),
  '1j) authenticated PUÒ eseguire audit_append (unica via di scrittura)'
);

-- ---------------------------------------------------------------------------
-- 2) APPEND SERIALIZZATO: aggiunge 30 eventi in sequenza, seq contigui,
--    catena hash consistente. (Per la concorrenza reale serve un test
--    multi-connessione: vedi tests/m1a/serialized.test.ts.)
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('m1a.tenant_id')::uuid;
  v_last_seq bigint;
  i int;
begin
  for i in 1..30 loop
    perform public.audit_append(
      v_tenant, 'test.bulk',
      jsonb_build_object('persona_id', gen_random_uuid()),
      'tenant', v_tenant,
      jsonb_build_object('i', i)
    );
  end loop;
  select max(seq) into v_last_seq
  from public.evento e
   join public.stream_audit s on s.id = e.stream_id
  where s.tenant_id = v_tenant;
  if v_last_seq <> 32 then  -- 2 (genesi + timestamp) + 30 bulk = 32
    raise exception 'seq finale atteso 32, trovato %', v_last_seq;
  end if;
end $$;
select pass('2) Append in serie produce seq monotoni contigui');

-- Verifica: nessun buco nei seq
select is(
  (select count(*) from public.evento e
    join public.stream_audit s on s.id = e.stream_id
   where s.tenant_id = current_setting('m1a.tenant_id')::uuid),
  32::bigint,
  '2b) Numero eventi = max(seq), nessun buco'
);

-- ---------------------------------------------------------------------------
-- 3) CATENA VERIFICABILE: audit_verify_chain dà OK su catena integra.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.audit_verify_chain(current_setting('m1a.stream_id')::uuid)),
  0::bigint,
  '3a) audit_verify_chain → 0 problemi su catena integra'
);

-- ---------------------------------------------------------------------------
-- 3b) MANOMISSIONE: forzo un cambio bypassando i trigger (solo nel test),
--     poi verifico che audit_verify_chain lo rilevi.
-- ---------------------------------------------------------------------------
alter table public.evento disable trigger evento_no_update;
update public.evento set payload = jsonb_build_object('manomesso', true)
  where id = current_setting('m1a.first_event_id')::uuid;
alter table public.evento enable trigger evento_no_update;

select isnt(
  (select count(*) from public.audit_verify_chain(current_setting('m1a.stream_id')::uuid)),
  0::bigint,
  '3b) audit_verify_chain rileva manomissione del payload'
);

select * from finish();
rollback;
