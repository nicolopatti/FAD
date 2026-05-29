-- Fase 4 — Task 6: deposito write-once dello snapshot del report fondo (→ M4).
--
-- `report_fondo_deposita` fa, nella stessa transazione (SECURITY DEFINER come
-- pipeline_ingest_grezzo):
--   (a) INSERT dello snapshot in `report_fondo_depositato` (unico path di
--       scrittura: REVOKE + trigger del Task 1 bloccano tutto il resto, D20);
--   (b) Evento `report_fondo_depositato` via audit_append (mai INSERT diretto su
--       `evento`), con payload.hash = report_fondo_content_hash(contenuto) e
--       solo metadati NON-PII (fondo/formato/edizione/piano/avviso). Le PII
--       (nomi/CF) restano nello snapshot, MAI nel log (D18).
-- Rigenerare = nuovo snapshot; i precedenti restano invariati (più snapshot per
-- (edizione, piano) ammessi, D20).
--
-- `report_fondo_verifica` ricalcola l'hash del contenuto memorizzato e lo
-- confronta con quello attestato nell'Evento (integrità dello snapshot, M4 #1/#7).
--
-- Authz: chiamante applicativo (current_tenant_id non nullo) ⇒ admin del tenant;
-- service_role/postgres (tenant nullo) bypassa (test/automazioni). anon: EXECUTE
-- revocato esplicitamente (Supabase lo concede di default).

-- ===========================================================================
-- 1) report_fondo_deposita — snapshot write-once + Evento di deposito
-- ===========================================================================
create or replace function public.report_fondo_deposita(
  p_edizione_id uuid,
  p_piano_id uuid,
  p_formato text,
  p_contenuto jsonb,
  p_generato_da uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_ed_tenant uuid;
  v_piano public.piano_formativo_finanziato;
  v_snapshot_id uuid;
  v_hash_hex text;
  v_evento public.evento;
begin
  if p_edizione_id is null or p_piano_id is null then
    raise exception 'report_fondo_deposita: edizione_id/piano_id mancanti';
  end if;
  if p_formato is null or length(btrim(p_formato)) = 0 then
    raise exception 'report_fondo_deposita: formato mancante';
  end if;
  -- Il contenuto è il DATASET risolto (oggetto JSON). Un array o uno scalare è
  -- un errore del chiamante: lo snapshot è prova write-once, meglio fallire.
  if p_contenuto is null or jsonb_typeof(p_contenuto) <> 'object' then
    raise exception 'report_fondo_deposita: contenuto deve essere un oggetto JSON (il dataset risolto)';
  end if;

  select tenant_id into v_ed_tenant from public.edizione where id = p_edizione_id;
  if v_ed_tenant is null then
    raise exception 'report_fondo_deposita: edizione % inesistente', p_edizione_id;
  end if;
  select * into v_piano from public.piano_formativo_finanziato where id = p_piano_id;
  if not found then
    raise exception 'report_fondo_deposita: piano % inesistente', p_piano_id;
  end if;
  if v_piano.tenant_id <> v_ed_tenant then
    raise exception 'report_fondo_deposita: edizione e piano appartengono a tenant diversi';
  end if;

  -- Autorizzazione (stesso schema delle RPC di Fase 3).
  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null then
    if not (public.is_admin() and v_caller_tenant = v_ed_tenant) then
      raise exception 'report_fondo_deposita: solo un admin del tenant può depositare';
    end if;
  end if;

  -- generato_da = attore pseudonimo dell'Evento: deve essere Persona del tenant.
  if p_generato_da is null or not exists (
    select 1 from public.persona pe where pe.id = p_generato_da and pe.tenant_id = v_ed_tenant
  ) then
    raise exception 'report_fondo_deposita: generato_da % non è una Persona del tenant', p_generato_da;
  end if;

  -- (a) snapshot write-once (fondo/avviso presi dal Piano: fonte unica)
  insert into public.report_fondo_depositato
    (tenant_id, edizione_id, piano_id, fondo, formato, avviso, contenuto, generato_da)
  values
    (v_ed_tenant, p_edizione_id, p_piano_id, v_piano.fondo, p_formato, v_piano.avviso, p_contenuto, p_generato_da)
  returning id into v_snapshot_id;

  -- (b) Evento di deposito via audit_append (payload PII-free: solo hash+metadati)
  v_hash_hex := encode(public.report_fondo_content_hash(p_contenuto), 'hex');
  v_evento := public.audit_append(
    v_ed_tenant,
    'report_fondo_depositato',
    jsonb_build_object('persona_id', p_generato_da, 'type', 'persona'),
    'report_fondo_depositato',
    v_snapshot_id,
    jsonb_build_object('hash', v_hash_hex, 'fondo', v_piano.fondo, 'formato', p_formato,
      'edizione_id', p_edizione_id, 'piano_id', p_piano_id, 'avviso', v_piano.avviso)
  );

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'evento_id', v_evento.id,
    'evento_seq', v_evento.seq, 'hash', v_hash_hex);
end;
$$;

-- ===========================================================================
-- 2) report_fondo_verifica — integrità dello snapshot depositato
-- ===========================================================================
create or replace function public.report_fondo_verifica(p_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_snap public.report_fondo_depositato;
  v_hash_calc text;
  v_hash_evt text;
begin
  select * into v_snap from public.report_fondo_depositato where id = p_snapshot_id;
  if not found then
    raise exception 'report_fondo_verifica: snapshot % inesistente', p_snapshot_id;
  end if;
  -- l'auditor/admin del tenant può verificare; altri tenant no. service_role bypassa.
  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and v_caller_tenant <> v_snap.tenant_id then
    raise exception 'report_fondo_verifica: snapshot non accessibile dal tenant corrente';
  end if;

  v_hash_calc := encode(public.report_fondo_content_hash(v_snap.contenuto), 'hex');
  select e.payload->>'hash' into v_hash_evt
  from public.evento e
  where e.subject_id = p_snapshot_id and e.event_type = 'report_fondo_depositato'
  order by e.seq
  limit 1;

  return jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'hash_ricalcolato', v_hash_calc,
    'hash_evento', v_hash_evt,
    'integra', (v_hash_evt is not null and v_hash_calc = v_hash_evt)
  );
end;
$$;

-- ===========================================================================
-- 3) Grant: niente public/anon; authenticated (admin via guardia) + service_role
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_fondo_deposita(uuid, uuid, text, jsonb, uuid)',
    'public.report_fondo_verifica(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end$$;
