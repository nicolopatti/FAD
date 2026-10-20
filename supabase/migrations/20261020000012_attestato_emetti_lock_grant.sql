-- Revisione del codice (2026-10-20): due difetti su attestato_emetti.
--
-- 1) "Un solo attestato valido per iscrizione" era un controllo leggi-poi-inserisci
--    senza serializzazione: due emissioni concorrenti (es. quiz.submitted e la
--    pagina del corso, o due import presenze) passavano entrambe il controllo e
--    producevano due attestati validi. Ora la RPC prende un advisory lock di
--    transazione per iscrizione prima del controllo: le emissioni della stessa
--    iscrizione si accodano e la seconda vede la prima.
-- 2) La RPC era eseguibile da `authenticated`: un admin con il JWT poteva chiamarla
--    direttamente con uno snapshot inventato (nome diverso, test "superato"…) e la
--    verifica pubblica lo avrebbe detto autentico. L'app la chiama solo con la
--    service role (src/lib/attestati.ts): EXECUTE revocato ad authenticated.

create or replace function public.attestato_emetti(
  p_iscrizione_id uuid,
  p_contenuto jsonb,
  p_attore uuid,
  p_emesso_da uuid default null,
  p_sostituisce uuid default null,
  p_motivazione text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_iscr record;
  v_old public.attestato;
  v_id uuid := gen_random_uuid();
  v_anno int := extract(year from (now() at time zone 'Europe/Rome'))::int;
  v_prog int;
  v_numero text;
  v_codice text;
  v_contenuto jsonb;
  v_hash text;
  v_evento public.evento;
begin
  if p_iscrizione_id is null then raise exception 'attestato_emetti: iscrizione mancante'; end if;
  if p_contenuto is null or jsonb_typeof(p_contenuto) <> 'object'
     or not (p_contenuto ? 'discente') or not (p_contenuto ? 'corso') or not (p_contenuto ? 'ente') then
    raise exception 'attestato_emetti: contenuto deve essere lo snapshot risolto (ente, discente, corso)';
  end if;

  -- Serializza le emissioni della stessa iscrizione (rilasciato a fine transazione).
  perform pg_advisory_xact_lock(hashtext('attestato_emetti:' || p_iscrizione_id::text));

  select i.id, i.tenant_id, i.persona_id, i.edizione_id, e.corso_id, c.politica_attestato
    into v_iscr
  from public.iscrizione i
  join public.edizione e on e.id = i.edizione_id
  join public.corso c on c.id = e.corso_id
  where i.id = p_iscrizione_id;
  if not found then raise exception 'attestato_emetti: iscrizione % inesistente', p_iscrizione_id; end if;
  if v_iscr.politica_attestato = 'nessuna' then
    raise exception 'attestato_emetti: il corso non prevede attestato (politica "nessuna")';
  end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_iscr.tenant_id) then
    raise exception 'attestato_emetti: solo un admin del tenant';
  end if;
  if p_attore is null or not exists (select 1 from public.persona p where p.id = p_attore and p.tenant_id = v_iscr.tenant_id) then
    raise exception 'attestato_emetti: attore % non è una Persona del tenant', p_attore;
  end if;
  if p_emesso_da is not null and not exists (select 1 from public.persona p where p.id = p_emesso_da and p.tenant_id = v_iscr.tenant_id) then
    raise exception 'attestato_emetti: emesso_da % non è una Persona del tenant', p_emesso_da;
  end if;

  -- Un solo attestato valido per iscrizione: per riemettere si indica quale sostituire.
  if p_sostituisce is null then
    if exists (select 1 from public.attestato a where a.iscrizione_id = p_iscrizione_id and a.sostituito_da is null) then
      raise exception 'attestato_emetti: esiste già un attestato valido per questa iscrizione (indicare p_sostituisce per riemettere)';
    end if;
  else
    select * into v_old from public.attestato where id = p_sostituisce for update;
    if not found or v_old.iscrizione_id <> p_iscrizione_id then
      raise exception 'attestato_emetti: p_sostituisce non è un attestato di questa iscrizione';
    end if;
    if v_old.sostituito_da is not null then
      raise exception 'attestato_emetti: l''attestato % è già stato sostituito', p_sostituisce;
    end if;
    if p_motivazione is null or length(btrim(p_motivazione)) = 0 then
      raise exception 'attestato_emetti: la riemissione richiede una motivazione';
    end if;
  end if;

  -- Numero progressivo serializzato per (tenant, anno).
  insert into public.attestato_contatore (tenant_id, anno, ultimo)
  values (v_iscr.tenant_id, v_anno, 0)
  on conflict (tenant_id, anno) do nothing;
  update public.attestato_contatore set ultimo = ultimo + 1
  where tenant_id = v_iscr.tenant_id and anno = v_anno
  returning ultimo into v_prog;
  v_numero := v_anno::text || '/' || lpad(v_prog::text, 6, '0');
  v_codice := encode(gen_random_bytes(12), 'hex');   -- 24 caratteri, 96 bit

  v_contenuto := p_contenuto || jsonb_build_object(
    'attestato_id', v_id,
    'numero', v_numero,
    'codice_verifica', v_codice,
    'emesso_il', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'emesso_da', p_emesso_da,
    'sostituisce', p_sostituisce
  );
  v_hash := public.attestato_content_hash(v_contenuto);

  insert into public.attestato
    (id, tenant_id, iscrizione_id, persona_id, corso_id, edizione_id, anno, progressivo, numero,
     codice_verifica, contenuto, hash, pdf_path, emesso_da, sostituisce)
  values
    (v_id, v_iscr.tenant_id, p_iscrizione_id, v_iscr.persona_id, v_iscr.corso_id, v_iscr.edizione_id,
     v_anno, v_prog, v_numero, v_codice, v_contenuto, v_hash,
     v_iscr.tenant_id::text || '/' || v_id::text || '.pdf', p_emesso_da, p_sostituisce);

  v_evento := public.audit_append(
    v_iscr.tenant_id, 'attestato.emesso',
    jsonb_build_object('persona_id', p_attore, 'type', 'persona'),
    'attestato', v_id,
    jsonb_build_object('iscrizione_id', p_iscrizione_id, 'attestato_id', v_id, 'numero', v_numero,
      'hash', v_hash, 'automatico', p_emesso_da is null, 'sostituisce', p_sostituisce));

  if p_sostituisce is not null then
    update public.attestato set sostituito_da = v_id where id = p_sostituisce;
    perform public.audit_append(
      v_iscr.tenant_id, 'attestato.sostituito',
      jsonb_build_object('persona_id', p_attore, 'type', 'persona'),
      'attestato', p_sostituisce,
      jsonb_build_object('iscrizione_id', p_iscrizione_id, 'attestato_id', p_sostituisce,
        'sostituito_da', v_id, 'numero_nuovo', v_numero, 'motivazione', p_motivazione));
  end if;

  return jsonb_build_object('attestato_id', v_id, 'numero', v_numero, 'codice_verifica', v_codice,
    'hash', v_hash, 'evento_seq', v_evento.seq);
end;
$$;

revoke execute on function public.attestato_emetti(uuid, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.attestato_emetti(uuid, jsonb, uuid, uuid, uuid, text) to service_role;
