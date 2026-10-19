-- ===========================================================================
-- Hardening Tappa 1 (2026-10-19) — chiusura dei rilievi dell'advisor Supabase
--
-- 1) audit_append: era eseguibile da `anon` e `authenticated` (privilegi di
--    default di Supabase sulle funzioni di `public`, non toccati dal
--    `revoke ... from public` della migration 000002) e non verificava chi la
--    chiamava: chiunque con la anon key poteva appendere eventi arbitrari a
--    nome di qualsiasi persona. Da ora è eseguibile SOLO da service_role (e dal
--    proprietario): l'applicazione la invoca lato server con la service key,
--    dopo aver già verificato la sessione (requireSession/requireAdmin). Le
--    funzioni SECURITY DEFINER di Fase 3/4 continuano a chiamarla internamente
--    (girano come proprietario). In più, guardia difensiva per i chiamanti con
--    JWT: tenant del chiamante = p_tenant_id, e attore = chiamante salvo admin.
-- 2) Revoca di EXECUTE da `anon` (e PUBLIC) sulle altre funzioni SECURITY
--    DEFINER esposte via /rest/v1/rpc e sulle funzioni trigger.
-- 3) Privilegi di default: le funzioni future in `public` non ricevono più
--    EXECUTE per `anon`.
-- 4) search_path fissato sulle 7 funzioni che non lo avevano (advisor 0011).
-- 5) Indici sulle 8 chiavi esterne senza indice (advisor 0001).
-- 6) Policy `persona_read_self_or_auditor`: auth.uid() in sub-select
--    (advisor 0003, valutazione una volta per query invece che per riga).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) audit_append — stessa logica della migration 000002 + guardia chiamante.
--    L'algoritmo di canonicalizzazione/hash NON cambia.
-- ---------------------------------------------------------------------------
create or replace function public.audit_append(
  p_tenant_id uuid,
  p_event_type text,
  p_actor jsonb,
  p_subject_type text,
  p_subject_id uuid,
  p_payload jsonb
)
returns public.evento
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stream public.stream_audit;
  v_prev_hash bytea;
  v_seq bigint;
  v_now timestamptz := clock_timestamp();
  v_canonical text;
  v_hash bytea;
  v_new public.evento;
begin
  if p_tenant_id is null then
    raise exception 'audit_append: tenant_id mancante';
  end if;
  if p_event_type is null or length(p_event_type) = 0 then
    raise exception 'audit_append: event_type mancante';
  end if;
  if p_actor is null or not (p_actor ? 'persona_id') then
    raise exception 'audit_append: actor deve contenere persona_id pseudonimo';
  end if;
  -- D18: l'actor è pseudonimo. Rifiutiamo PII evidenti.
  if p_actor ? 'nome' or p_actor ? 'cognome' or p_actor ? 'email'
     or p_actor ? 'codice_fiscale' or p_actor ? 'cf' then
    raise exception 'audit_append: actor non può contenere PII (nome/cognome/email/CF)';
  end if;
  if p_payload ? 'nome' or p_payload ? 'cognome' or p_payload ? 'email'
     or p_payload ? 'codice_fiscale' or p_payload ? 'cf' then
    raise exception 'audit_append: payload non può contenere PII (nome/cognome/email/CF)';
  end if;

  -- Guardia sul chiamante. Nei percorsi applicativi (service_role) auth.uid()
  -- è NULL e la guardia non si applica: l'autorizzazione è già stata fatta dal
  -- server. Quando la funzione è raggiunta attraverso una funzione SECURITY
  -- DEFINER invocata da un utente autenticato (admin: pipeline, presenze,
  -- deposito), auth.uid() è quell'utente: deve essere del tenant e, se non è
  -- admin, può attribuire eventi solo a sé stesso.
  if auth.uid() is not null then
    if public.current_tenant_id() is distinct from p_tenant_id then
      raise exception 'audit_append: tenant non corrispondente al chiamante';
    end if;
    if not public.is_admin()
       and (p_actor ->> 'persona_id')::uuid is distinct from public.current_persona_id() then
      raise exception 'audit_append: attore non corrispondente al chiamante';
    end if;
  end if;

  select s.* into v_stream
  from public.stream_audit s
  where s.tenant_id = p_tenant_id and s.scope = 'tenant'
  for update;

  if not found then
    raise exception 'audit_append: stream non trovato per tenant %', p_tenant_id;
  end if;

  if v_stream.ultimo_evento_id is null then
    v_prev_hash := public.audit_genesis_hash(v_stream.id);
    v_seq := 1;
  else
    select e.hash, e.seq + 1 into v_prev_hash, v_seq
    from public.evento e
    where e.id = v_stream.ultimo_evento_id;
  end if;

  v_canonical := public.audit_canonical(
    v_stream.id, v_seq, p_event_type, v_now, p_actor,
    p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb), v_prev_hash
  );
  v_hash := digest(v_canonical, 'sha256');

  insert into public.evento (
    tenant_id, stream_id, seq, event_type, occurred_at,
    actor, subject_type, subject_id, payload,
    prev_hash, hash, canonical
  ) values (
    p_tenant_id, v_stream.id, v_seq, p_event_type, v_now,
    p_actor, p_subject_type, p_subject_id, coalesce(p_payload, '{}'::jsonb),
    v_prev_hash, v_hash, v_canonical
  )
  returning * into v_new;

  update public.stream_audit
  set ultimo_evento_id = v_new.id
  where id = v_stream.id;

  return v_new;
end;
$$;

revoke execute on function public.audit_append(uuid, text, jsonb, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.audit_append(uuid, text, jsonb, text, uuid, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Altre funzioni esposte: via `anon` e PUBLIC. `authenticated` resta dove
--    serve (policy RLS, route applicative con guardia interna).
-- ---------------------------------------------------------------------------
revoke execute on function public.audit_verify_chain(uuid) from public, anon;
revoke execute on function public.current_persona_id() from public, anon;
revoke execute on function public.current_stream_id() from public, anon;
revoke execute on function public.current_tenant_id() from public, anon;
revoke execute on function public.helper_corso_has_edizioni(uuid) from public, anon;
revoke execute on function public.reorder_struttura(uuid, uuid[]) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_auditor() from public, anon;
-- Funzioni trigger: non devono essere chiamabili via RPC da nessun ruolo API.
-- I trigger continuano a scattare: Postgres non verifica EXECUTE al momento
-- dell'esecuzione del trigger (verificato nel test in rollback prima dell'apply).
revoke execute on function public.tg_sessione_incarico_check() from public, anon, authenticated;
revoke execute on function public.evento_block_mutations() from public, anon, authenticated;
revoke execute on function public.grezzo_block_mutations() from public, anon, authenticated;
revoke execute on function public.report_fondo_block_mutations() from public, anon, authenticated;
revoke execute on function public.tg_corso_freeze() from public, anon, authenticated;
revoke execute on function public.tg_struttura_freeze() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Privilegi di default: niente EXECUTE per `anon` sulle funzioni future.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- 4) search_path fissato (advisor 0011).
-- ---------------------------------------------------------------------------
alter function public.is_admin() set search_path = public;
alter function public.is_auditor() set search_path = public;
alter function public.evento_block_mutations() set search_path = public;
alter function public.grezzo_block_mutations() set search_path = public;
alter function public.report_fondo_block_mutations() set search_path = public;
alter function public.tg_corso_freeze() set search_path = public;
alter function public.tg_struttura_freeze() set search_path = public;

-- ---------------------------------------------------------------------------
-- 5) Indici sulle chiavi esterne (advisor 0001).
-- ---------------------------------------------------------------------------
create index if not exists incarico_persona_idx on public.incarico(persona_id);
create index if not exists iscrizione_azienda_idx on public.iscrizione(azienda_id);
create index if not exists iscrizione_piano_idx on public.iscrizione(piano_id);
create index if not exists report_fondo_generato_da_idx on public.report_fondo_depositato(generato_da);
create index if not exists report_fondo_piano_idx on public.report_fondo_depositato(piano_id);
create index if not exists grezzo_importato_da_idx on public.report_partecipazione_grezzo(importato_da);
create index if not exists sessione_incarico_idx on public.sessione(incarico_id);
create index if not exists struttura_lo_idx on public.struttura_corso(learning_object_id);

-- ---------------------------------------------------------------------------
-- 6) Policy persona: auth.uid() valutato una volta per query (advisor 0003).
-- ---------------------------------------------------------------------------
-- ALTER (non DROP+CREATE): nessuna finestra senza policy e nessuna istruzione
-- DROP, che il tool MCP execute_sql tratta come distruttiva (resta appeso in
-- attesa di conferma).
alter policy persona_read_self_or_auditor on public.persona
  using (
    tenant_id = public.current_tenant_id()
    and (auth_user_id = (select auth.uid()) or public.is_auditor())
  );
