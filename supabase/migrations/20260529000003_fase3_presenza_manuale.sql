-- Fase 3 — Task 5: inserimento e correzione manuale delle presenze (M3a #7).
--
-- Ogni atto è un EVENTO (mai UPDATE su Eventi esistenti):
--   • presenza_inserisci_manuale → `presenza_inserita_manualmente`
--   • presenza_correggi_manuale  → `presenza_corretta_manualmente`, con
--     payload.corregge_evento_id = Evento precedente (che resta INVARIATO).
-- Motivazione obbligatoria. L'attore della presenza è il discente (pseudonimo);
-- l'admin che agisce è in payload (inserito_da / corretto_da). La ricostruzione
-- dello stato (compliance.ts) gestisce la sostituzione: un Evento di correzione
-- "supera" semanticamente quello referenziato.
--
-- authz come le altre funzioni di Fase 3 (authenticated=admin del tenant;
-- service_role/postgres bypass; anon EXECUTE revocato).

-- ===========================================================================
-- 1) Lettura admin degli Eventi di presenza/riconciliazione del proprio tenant
--    (per la UI: elenco presenze da correggere, esiti riconciliazione). Policy
--    ADDITIVA, ristretta ai tipi di Evento della fetta webinar.
-- ===========================================================================
create policy evento_read_admin_presenze on public.evento
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and event_type in (
      'presenza_webinar_registrata', 'presenza_inserita_manualmente',
      'presenza_corretta_manualmente', 'partecipante_non_riconciliato',
      'match_risolto_manualmente', 'report_grezzo_importato'
    )
  );

-- ===========================================================================
-- 2) Inserimento manuale di una presenza mancante.
-- ===========================================================================
create or replace function public.presenza_inserisci_manuale(
  p_sessione_id uuid,
  p_iscrizione_id uuid,
  p_durata text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_sessione public.sessione;
  v_iscr public.iscrizione;
  v_admin uuid;
  v_evt public.evento;
begin
  if p_motivazione is null or length(btrim(p_motivazione)) = 0 then
    raise exception 'presenza_inserisci_manuale: motivazione obbligatoria';
  end if;
  select * into v_sessione from public.sessione where id = p_sessione_id;
  if not found then raise exception 'presenza_inserisci_manuale: sessione % inesistente', p_sessione_id; end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_sessione.tenant_id) then
    raise exception 'presenza_inserisci_manuale: solo un admin del tenant';
  end if;

  select * into v_iscr from public.iscrizione where id = p_iscrizione_id;
  if not found or v_iscr.edizione_id <> v_sessione.edizione_id or v_iscr.tenant_id <> v_sessione.tenant_id then
    raise exception 'presenza_inserisci_manuale: iscrizione % non valida per la sessione', p_iscrizione_id;
  end if;

  v_admin := public.current_persona_id();

  v_evt := public.audit_append(
    v_sessione.tenant_id, 'presenza_inserita_manualmente',
    jsonb_build_object('persona_id', v_iscr.persona_id, 'type', 'persona'),
    'sessione', p_sessione_id,
    jsonb_build_object('iscrizione_id', p_iscrizione_id, 'durata', p_durata,
      'motivazione', p_motivazione, 'inserito_da', v_admin, 'manuale', true));

  return jsonb_build_object('evento_id', v_evt.id, 'evento_seq', v_evt.seq);
end;
$$;

-- ===========================================================================
-- 3) Correzione manuale di una presenza esistente → nuovo Evento (mai UPDATE).
-- ===========================================================================
create or replace function public.presenza_correggi_manuale(
  p_evento_precedente_id uuid,
  p_durata text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_prev public.evento;
  v_admin uuid;
  v_evt public.evento;
begin
  if p_motivazione is null or length(btrim(p_motivazione)) = 0 then
    raise exception 'presenza_correggi_manuale: motivazione obbligatoria';
  end if;
  select * into v_prev from public.evento where id = p_evento_precedente_id;
  if not found then raise exception 'presenza_correggi_manuale: evento % inesistente', p_evento_precedente_id; end if;
  if v_prev.event_type not in ('presenza_webinar_registrata', 'presenza_inserita_manualmente', 'presenza_corretta_manualmente') then
    raise exception 'presenza_correggi_manuale: l''evento % non è una presenza', p_evento_precedente_id;
  end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_prev.tenant_id) then
    raise exception 'presenza_correggi_manuale: solo un admin del tenant';
  end if;

  v_admin := public.current_persona_id();

  -- Nuovo Evento di correzione: stesso attore (discente) e soggetto (sessione)
  -- dell'Evento precedente, durata corretta, riferimento all'Evento superato.
  -- L'Evento precedente NON viene toccato (append-only).
  v_evt := public.audit_append(
    v_prev.tenant_id, 'presenza_corretta_manualmente',
    jsonb_build_object('persona_id', (v_prev.actor->>'persona_id')::uuid, 'type', 'persona'),
    'sessione', v_prev.subject_id,
    jsonb_build_object(
      'iscrizione_id', v_prev.payload->>'iscrizione_id', 'durata', p_durata,
      'motivazione', p_motivazione, 'corretto_da', v_admin,
      'corregge_evento_id', p_evento_precedente_id, 'manuale', true));

  return jsonb_build_object('evento_id', v_evt.id, 'evento_seq', v_evt.seq,
    'corregge_evento_id', p_evento_precedente_id);
end;
$$;

-- ===========================================================================
-- 4) Grant
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.presenza_inserisci_manuale(uuid, uuid, text, text)',
    'public.presenza_correggi_manuale(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end$$;
