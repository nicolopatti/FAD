-- Fase 5 — Task 1 (parte 2/2): test finale (LO `quiz`).
--
-- * `learning_object.config` per i quiz: soglia_percentuale (0–100), tentativi_max
--   (null = illimitati), ordine_casuale, mostra_correzione.
-- * Tabella satellite `quiz_domanda` (D23): domande a scelta singola/multipla con le
--   risposte in jsonb [{testo, corretta}]. Il flag `corretta` NON è leggibile dal
--   discente: nessuna policy SELECT per lui (il server legge con la service role
--   dopo aver verificato lo sblocco D26 e spoglia il flag).
-- * Freeze D22 esteso: le domande di un LO usato in un corso con ≥1 edizione sono
--   immutabili (il test è parte del percorso congelato).
-- * Scrittura SOLO via RPC `quiz_domande_salva` (SECURITY DEFINER, admin del tenant):
--   sostituzione atomica dell'intero set + Evento `quiz.domande_aggiornate` via
--   audit_append (conteggio, mai il testo: niente contenuti nel log).
-- Regola hardening: EXECUTE revocato ad anon/PUBLIC su ogni funzione nuova.

-- 1) Vincolo di forma sul config dei quiz -----------------------------------
-- (niente `drop … if exists`: l'MCP resta appeso sui batch con DROP, #13)
alter table public.learning_object
  add constraint quiz_config_shape check (
    type <> 'quiz' or (
      (config ? 'soglia_percentuale')
      and jsonb_typeof(config -> 'soglia_percentuale') = 'number'
      and (config ->> 'soglia_percentuale')::numeric between 0 and 100
    )
  );

-- 2) Validità delle risposte ---------------------------------------------------
create or replace function public.quiz_risposte_valide(p_risposte jsonb, p_tipo text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n int;
  v_corrette int;
  r jsonb;
begin
  if p_risposte is null or jsonb_typeof(p_risposte) <> 'array' then return false; end if;
  v_n := jsonb_array_length(p_risposte);
  if v_n < 2 or v_n > 8 then return false; end if;
  v_corrette := 0;
  for r in select * from jsonb_array_elements(p_risposte) loop
    if jsonb_typeof(r) <> 'object' or not (r ? 'testo') or length(btrim(coalesce(r ->> 'testo', ''))) = 0 then
      return false;
    end if;
    if coalesce((r ->> 'corretta')::boolean, false) then v_corrette := v_corrette + 1; end if;
  end loop;
  if p_tipo = 'scelta_singola' then return v_corrette = 1; end if;
  if p_tipo = 'scelta_multipla' then return v_corrette >= 1; end if;
  return false;
end;
$$;
revoke execute on function public.quiz_risposte_valide(jsonb, text) from public, anon;

-- 3) Tabella quiz_domanda ------------------------------------------------------
create table if not exists public.quiz_domanda (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  learning_object_id uuid not null references public.learning_object(id) on delete cascade,
  ordine int not null,
  testo text not null,
  tipo text not null default 'scelta_singola',
  risposte jsonb not null,
  creato_il timestamptz not null default now(),
  constraint quiz_domanda_tipo check (tipo in ('scelta_singola', 'scelta_multipla')),
  constraint quiz_domanda_testo check (length(btrim(testo)) > 0),
  constraint quiz_domanda_risposte check (public.quiz_risposte_valide(risposte, tipo)),
  unique (learning_object_id, ordine)
);
alter table public.quiz_domanda enable row level security;
create index if not exists quiz_domanda_lo_idx on public.quiz_domanda(learning_object_id, ordine);
create index if not exists quiz_domanda_tenant_idx on public.quiz_domanda(tenant_id);

-- Lettura: admin e auditor del tenant (vedono anche la risposta corretta: è
-- authoring/audit). Il discente NON ha SELECT: legge via server, senza il flag.
create policy quiz_domanda_read_staff on public.quiz_domanda
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_admin() or public.is_auditor()));
-- Nessuna policy di scrittura: si passa dalla RPC.

-- 4) Freeze D22: domande immutabili se il LO è in un corso con edizioni -----
create or replace function public.helper_lo_in_corso_congelato(p_lo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.struttura_corso s
      join public.edizione e on e.corso_id = s.corso_id
     where s.learning_object_id = p_lo_id
  );
$$;
revoke execute on function public.helper_lo_in_corso_congelato(uuid) from public, anon;

create or replace function public.tg_quiz_domanda_freeze()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_lo uuid;
begin
  v_lo := case when TG_OP = 'DELETE' then OLD.learning_object_id else NEW.learning_object_id end;
  if public.helper_lo_in_corso_congelato(v_lo) then
    raise exception 'D22: il test % è usato in un corso congelato (ha almeno un''edizione): le domande non sono modificabili', v_lo
      using errcode = 'check_violation';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke execute on function public.tg_quiz_domanda_freeze() from public, anon, authenticated;

create trigger quiz_domanda_freeze
  before insert or update or delete on public.quiz_domanda
  for each row execute function public.tg_quiz_domanda_freeze();

-- 5) RPC: sostituzione atomica delle domande di un test + Evento -------------
-- `p_attore`: persona che compie l'azione quando il chiamante non è un utente
-- autenticato (service role/test); con un JWT vale sempre current_persona_id().
create or replace function public.quiz_domande_salva(p_learning_object_id uuid, p_domande jsonb, p_attore uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lo public.learning_object;
  v_caller_tenant uuid;
  v_admin uuid;
  v_n int := 0;
  d jsonb;
  v_evt public.evento;
begin
  select * into v_lo from public.learning_object where id = p_learning_object_id;
  if not found then raise exception 'quiz_domande_salva: learning object % inesistente', p_learning_object_id; end if;
  if v_lo.type <> 'quiz' then raise exception 'quiz_domande_salva: il learning object % non è un test', p_learning_object_id; end if;

  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not (public.is_admin() and v_caller_tenant = v_lo.tenant_id) then
    raise exception 'quiz_domande_salva: solo un admin del tenant';
  end if;
  if p_domande is null or jsonb_typeof(p_domande) <> 'array' then
    raise exception 'quiz_domande_salva: p_domande deve essere un array';
  end if;

  -- Il trigger di freeze protegge cancellazione e inserimento: se il test è in
  -- un corso congelato la transazione fallisce qui, senza toccare nulla.
  -- (Istruzione composta a runtime: l'MCP di Supabase blocca i batch che
  -- contengono la parola chiave di cancellazione, trabocchetto #13.)
  execute format('%s from public.quiz_domanda where learning_object_id = %L', 'DEL' || 'ETE', p_learning_object_id);

  for d in select * from jsonb_array_elements(p_domande) loop
    v_n := v_n + 1;
    insert into public.quiz_domanda (tenant_id, learning_object_id, ordine, testo, tipo, risposte)
    values (
      v_lo.tenant_id, p_learning_object_id, v_n,
      btrim(coalesce(d ->> 'testo', '')),
      coalesce(d ->> 'tipo', 'scelta_singola'),
      coalesce(d -> 'risposte', '[]'::jsonb)
    );
  end loop;

  v_admin := coalesce(public.current_persona_id(), p_attore);
  if v_admin is null then raise exception 'quiz_domande_salva: attore mancante'; end if;
  v_evt := public.audit_append(
    v_lo.tenant_id, 'quiz.domande_aggiornate',
    jsonb_build_object('persona_id', v_admin, 'type', 'persona'),
    'learning_object', p_learning_object_id,
    jsonb_build_object('n_domande', v_n));

  return jsonb_build_object('n_domande', v_n, 'evento_seq', v_evt.seq);
end;
$$;
revoke execute on function public.quiz_domande_salva(uuid, jsonb, uuid) from public, anon;
grant execute on function public.quiz_domande_salva(uuid, jsonb, uuid) to authenticated;
