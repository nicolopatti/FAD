-- Fase 5 — Task 3: lettura delle domande del test da parte del discente.
--
-- La tabella quiz_domanda non ha una policy di lettura per il discente (le
-- risposte giuste non devono mai arrivare al browser). Il player legge le
-- domande con questa RPC SECURITY DEFINER che:
--   * toglie il flag `corretta` da ogni risposta (resta solo il testo);
--   * ammette il chiamante solo se è iscritto a un'edizione di un corso la cui
--     struttura contiene il test (o se è admin/auditor del tenant);
--   * con chiamante senza auth.uid() (postgres/service role: server, test)
--     non applica la guardia.
-- Lo sblocco sequenziale (D26) resta nel server applicativo: vedere le domande
-- in anticipo non vale nulla, conta solo la consegna (`quiz.submitted`), che
-- l'API rifiuta se il test non è sbloccato.
-- Niente DROP nel testo (MCP #13).

create or replace function public.quiz_domande_pubbliche(p_learning_object_id uuid)
returns table (id uuid, ordine int, testo text, tipo text, risposte jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lo record;
  v_persona uuid;
  v_tenant uuid;
begin
  select l.id, l.tenant_id, l.type into v_lo
  from public.learning_object l where l.id = p_learning_object_id;
  if not found then raise exception 'quiz_domande_pubbliche: learning object % inesistente', p_learning_object_id; end if;
  if v_lo.type <> 'quiz' then raise exception 'quiz_domande_pubbliche: il learning object % non è un test', p_learning_object_id; end if;

  if auth.uid() is not null then
    v_persona := public.current_persona_id();
    v_tenant := public.current_tenant_id();
    if v_persona is null or v_tenant is null or v_tenant <> v_lo.tenant_id then
      raise exception 'quiz_domande_pubbliche: non autorizzato';
    end if;
    if not (public.is_admin() or public.is_auditor()) and not exists (
      select 1
      from public.iscrizione i
      join public.edizione e on e.id = i.edizione_id
      join public.struttura_corso s on s.corso_id = e.corso_id
      where i.persona_id = v_persona and s.learning_object_id = v_lo.id
    ) then
      raise exception 'quiz_domande_pubbliche: non iscritto a un corso con questo test';
    end if;
  end if;

  return query
    select q.id, q.ordine, q.testo, q.tipo::text,
           (select coalesce(jsonb_agg(jsonb_build_object('testo', r->>'testo') order by o), '[]'::jsonb)
              from jsonb_array_elements(q.risposte) with ordinality as t(r, o)) as risposte
    from public.quiz_domanda q
    where q.learning_object_id = v_lo.id
    order by q.ordine;
end;
$$;

revoke execute on function public.quiz_domande_pubbliche(uuid) from public, anon;
grant execute on function public.quiz_domande_pubbliche(uuid) to authenticated;

comment on function public.quiz_domande_pubbliche(uuid) is
  'Domande del test senza il flag corretta, per il discente iscritto (o staff del tenant). SECURITY DEFINER: quiz_domanda non ha policy di lettura per il discente.';
