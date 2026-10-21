-- ===========================================================================
-- Stress test 21/10 — A1/R2: la finestra di fruizione dell'edizione vale anche
-- nel DB. Fuori finestra la RPC del player rifiuta gli eventi (blocco totale),
-- non solo l'interfaccia o le route applicative.
--
-- Regola (identica a src/lib/finestra.ts):
--   apertura = coalesce(fad_apertura, data_inizio); chiusura = coalesce(fad_chiusura, data_fine);
--   estremo nullo = nessun limite; giorni interi nel fuso Europe/Rome;
--   edizione annullata o conclusa = chiusa.
-- Gli eventi già nel registro non si toccano (append-only).
-- ===========================================================================

create or replace function public.edizione_finestra_stato(p_edizione_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.id is null then null
    when e.annullato_at is not null then 'annullata'
    when e.concluso_at is not null then 'conclusa'
    when coalesce(e.fad_apertura, e.data_inizio) is not null
         and (p_at at time zone 'Europe/Rome')::date < coalesce(e.fad_apertura, e.data_inizio) then 'non_aperta'
    when coalesce(e.fad_chiusura, e.data_fine) is not null
         and (p_at at time zone 'Europe/Rome')::date > coalesce(e.fad_chiusura, e.data_fine) then 'chiusa'
    else 'aperta'
  end
  from (select 1) x
  left join public.edizione e on e.id = p_edizione_id;
$$;

revoke all on function public.edizione_finestra_stato(uuid, timestamptz) from public, anon;
grant execute on function public.edizione_finestra_stato(uuid, timestamptz) to authenticated, service_role;

comment on function public.edizione_finestra_stato(uuid, timestamptz) is
  'Stato della finestra di fruizione di un''edizione: aperta | non_aperta | chiusa | conclusa | annullata. Stessa regola di src/lib/finestra.ts.';

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
  v_finestra text;
begin
  if v_persona is null then raise exception 'evento_player_registra: non autenticato'; end if;
  if p_event_type is null or p_event_type not in (
    'video.play', 'video.pause', 'video.seek', 'video.progress', 'video.ended',
    'documento.opened', 'documento.completed', 'quiz.started'
  ) then
    raise exception 'evento_player_registra: event_type non ammesso';
  end if;

  select i.id, i.tenant_id, i.persona_id, i.edizione_id, e.corso_id, c.sblocco_sequenziale
    into v_iscr
  from public.iscrizione i
  join public.edizione e on e.id = i.edizione_id
  join public.corso c on c.id = e.corso_id
  where i.id = p_iscrizione_id;
  if not found or v_iscr.persona_id <> v_persona then
    raise exception 'evento_player_registra: iscrizione non valida';
  end if;

  -- R2: fuori dalla finestra di fruizione niente eventi.
  v_finestra := public.edizione_finestra_stato(v_iscr.edizione_id);
  if v_finestra is distinct from 'aperta' then
    raise exception 'evento_player_registra: lezioni non disponibili (edizione %)', replace(v_finestra, '_', ' ');
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
