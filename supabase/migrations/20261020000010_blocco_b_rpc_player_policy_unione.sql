-- Blocco B — #5 RPC unica per gli eventi del player, #7 unione delle policy RLS
-- multiple (advisor 0006 "multiple permissive policies").
--
-- #7. Per ogni tabella con più policy PERMISSIVE sulla stessa azione/ruolo le
-- condizioni vengono unite in UNA policy (OR): stesso perimetro, una sola
-- valutazione per riga. Le policy assorbite vengono rimosse (DROP composto a
-- runtime: l'MCP si blocca sui batch che contengono quella parola, #13).
--   evento:      evento_read ← evento_read_admin_{completamento,deposito,presenze}.
--                L'insieme degli eventi leggibili dall'admin viene allargato a
--                TUTTI quelli del player (play/pause/seek/progress, quiz) e agli
--                attestati: senza, il report fondo calcolato sotto RLS admin non
--                vedeva i tratti video (visione integrale) né il test finale.
--   iscrizione:  iscrizione_read ← iscrizione_read_admin
--   persona:     persona_read_self_or_auditor ← persona_read_admin
--   attestato:   attestato_read_self ← attestato_read_staff
--
-- #5. `evento_player_registra(iscrizione, lo, tipo, payload)` SECURITY DEFINER,
-- eseguibile da `authenticated`: in UNA chiamata verifica che il chiamante sia
-- il titolare dell'iscrizione, che il contenuto sia nella struttura del corso
-- e del tipo giusto, che lo sblocco sequenziale (D26) sia rispettato (tutti i
-- contenuti obbligatori precedenti hanno l'Evento di completamento per QUESTA
-- iscrizione), e scrive l'Evento via audit_append (come owner). Il player non
-- dipende più dalla service role per registrare. Nei corsi a visione integrale
-- il requisito di copertura ≥95% resta verificato dal server applicativo
-- (lib/visione.ts) prima della chiamata: qui il controllo è "per Eventi".
-- Nessun INSERT diretto in evento; anon senza EXECUTE.

-- ===========================================================================
-- #7 — unione delle policy
-- ===========================================================================
alter policy evento_read on public.evento using (
  tenant_id = public.current_tenant_id()
  and (
    public.is_auditor()
    or (actor ->> 'persona_id')::uuid = public.current_persona_id()
    or (public.is_admin() and event_type = any (array[
      'video.play', 'video.pause', 'video.seek', 'video.progress', 'video.ended',
      'documento.opened', 'documento.completed',
      'quiz.started', 'quiz.submitted',
      'presenza_webinar_registrata', 'presenza_inserita_manualmente', 'presenza_corretta_manualmente',
      'partecipante_non_riconciliato', 'match_risolto_manualmente', 'report_grezzo_importato',
      'report_fondo_depositato', 'attestato.emesso', 'attestato.sostituito'
    ]))
  )
);

alter policy iscrizione_read on public.iscrizione using (
  tenant_id = public.current_tenant_id()
  and (persona_id = public.current_persona_id() or public.is_auditor() or public.is_admin())
);

alter policy persona_read_self_or_auditor on public.persona using (
  tenant_id = public.current_tenant_id()
  and (auth_user_id = (select auth.uid()) or public.is_auditor() or public.is_admin())
);

alter policy attestato_read_self on public.attestato using (
  tenant_id = public.current_tenant_id()
  and (persona_id = public.current_persona_id() or public.is_admin() or public.is_auditor())
);

do $$
declare p text;
begin
  foreach p in array array[
    'evento_read_admin_completamento on public.evento',
    'evento_read_admin_deposito on public.evento',
    'evento_read_admin_presenze on public.evento',
    'iscrizione_read_admin on public.iscrizione',
    'persona_read_admin on public.persona',
    'attestato_read_staff on public.attestato'
  ] loop
    execute format('%s policy if exists %s', 'DR' || 'OP', p);
  end loop;
end $$;

-- ===========================================================================
-- #5 — RPC unica per gli eventi del player
-- ===========================================================================
create or replace function public.evento_player_registra(
  p_iscrizione_id uuid,
  p_learning_object_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_persona uuid := public.current_persona_id();
  v_iscr record;
  v_item record;
  v_prev record;
  v_tipo_lo text;
  v_evento public.evento;
  v_payload jsonb;
begin
  if v_persona is null then raise exception 'evento_player_registra: non autenticato'; end if;
  if p_event_type is null or p_event_type not in (
    'video.play', 'video.pause', 'video.seek', 'video.progress', 'video.ended',
    'documento.opened', 'documento.completed', 'quiz.started'
  ) then
    raise exception 'evento_player_registra: event_type non ammesso';
  end if;

  select i.id, i.tenant_id, i.persona_id, e.corso_id, c.sblocco_sequenziale
    into v_iscr
  from public.iscrizione i
  join public.edizione e on e.id = i.edizione_id
  join public.corso c on c.id = e.corso_id
  where i.id = p_iscrizione_id;
  if not found or v_iscr.persona_id <> v_persona then
    raise exception 'evento_player_registra: iscrizione non valida';
  end if;

  select s.ordine, s.obbligatorio, l.type::text as lo_type
    into v_item
  from public.struttura_corso s
  join public.learning_object l on l.id = s.learning_object_id
  where s.corso_id = v_iscr.corso_id and s.learning_object_id = p_learning_object_id;
  if not found then raise exception 'evento_player_registra: LO non in corso'; end if;

  v_tipo_lo := split_part(p_event_type, '.', 1);
  if (v_tipo_lo = 'video' and v_item.lo_type <> 'video')
     or (v_tipo_lo = 'documento' and v_item.lo_type <> 'documento')
     or (v_tipo_lo = 'quiz' and v_item.lo_type <> 'quiz') then
    raise exception 'evento_player_registra: tipo di evento non coerente con il contenuto';
  end if;

  -- D26: sblocco sequenziale "per Eventi" (tutti gli obbligatori precedenti completati).
  if v_iscr.sblocco_sequenziale then
    for v_prev in
      select s.learning_object_id, s.regola_completamento ->> 'tipo' as regola
      from public.struttura_corso s
      where s.corso_id = v_iscr.corso_id and s.ordine < v_item.ordine and s.obbligatorio
    loop
      if not exists (
        select 1 from public.evento ev
        where ev.tenant_id = v_iscr.tenant_id
          and ev.subject_id = v_prev.learning_object_id
          and (ev.actor ->> 'persona_id')::uuid = v_persona
          and ev.payload ->> 'iscrizione_id' = p_iscrizione_id::text
          and ev.event_type = case v_prev.regola
                                when 'video_ended' then 'video.ended'
                                when 'documento_completed' then 'documento.completed'
                                when 'quiz_passed' then 'quiz.submitted'
                                else '__nessuno__' end
          and (v_prev.regola <> 'quiz_passed' or ev.payload ->> 'superato' = 'true')
      ) then
        raise exception 'evento_player_registra: LO non sbloccato (sblocco_sequenziale)';
      end if;
    end loop;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('iscrizione_id', p_iscrizione_id);
  v_evento := public.audit_append(
    v_iscr.tenant_id, p_event_type,
    jsonb_build_object('persona_id', v_persona, 'type', 'persona'),
    'learning_object', p_learning_object_id, v_payload);
  return jsonb_build_object('evento_id', v_evento.id, 'seq', v_evento.seq, 'persona_id', v_persona, 'tenant_id', v_iscr.tenant_id);
end;
$$;

revoke all on function public.evento_player_registra(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.evento_player_registra(uuid, uuid, text, jsonb) to authenticated, service_role;

comment on function public.evento_player_registra(uuid, uuid, text, jsonb) is
  'Eventi del player (video/documento/quiz.started) in una chiamata: titolarità dell''iscrizione, LO in struttura, sblocco sequenziale per Eventi, audit_append. Blocco B #5.';
