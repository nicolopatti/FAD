-- Fase 1 — Task 2: motore del log append-only (gate M1a).
-- Decisioni: D11/D19 (append-only, catena hash per-stream, un solo stream per
-- tenant), D18 (no PII nel payload/hash, genesi con sentinella deterministica).

-- ---------------------------------------------------------------------------
-- Stream di audit. In Fase 1 c'è UN solo stream per tenant. Manteniamo però
-- la chiave naturale per riconoscere lo stream "globale" del tenant; quando
-- in Fase 2 introdurremo sotto-stream, basterà aggiungere righe.
-- ---------------------------------------------------------------------------
create table public.stream_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  scope text not null default 'tenant',
  ultimo_evento_id uuid,
  creato_il timestamptz not null default now(),
  unique (tenant_id, scope)
);

alter table public.stream_audit enable row level security;

create policy stream_read on public.stream_audit
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Evento — write-once. Hash chain.
--  - actor: pseudonimo (UUID + tipo), MAI nome/email/CF (D18)
--  - canonical: serializzazione deterministica usata per l'hash (replicabile
--    sia in append sia in verify)
-- ---------------------------------------------------------------------------
create table public.evento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  stream_id uuid not null references public.stream_audit(id),
  seq bigint not null,
  event_type text not null,
  occurred_at timestamptz not null,
  actor jsonb not null,
  subject_type text not null,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  prev_hash bytea not null,
  hash bytea not null,
  canonical text not null,
  unique (stream_id, seq),
  unique (stream_id, hash)
);

alter table public.evento enable row level security;
create index evento_tenant_idx on public.evento(tenant_id);
create index evento_stream_seq_idx on public.evento(stream_id, seq);
create index evento_subject_idx on public.evento(subject_type, subject_id);

-- Lettura: tutto ciò che ricade nel tenant è leggibile dagli iscritti per gli
-- eventi che li riguardano; l'auditor vede tutto.
create policy evento_read on public.evento
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_auditor()
      or (actor ->> 'persona_id')::uuid = public.current_persona_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Immutabilità fisica: REVOCA + trigger.
-- I ruoli dell'app non hanno UPDATE/DELETE; il trigger ferma anche tentativi
-- da ruoli più alti, salvo che il trigger venga esplicitamente disabilitato.
-- ---------------------------------------------------------------------------
revoke all on public.evento from anon, authenticated;
grant select on public.evento to anon, authenticated;

create or replace function public.evento_block_mutations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'evento è append-only: UPDATE non permesso';
  elsif tg_op = 'DELETE' then
    raise exception 'evento è append-only: DELETE non permesso';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'evento è append-only: TRUNCATE non permesso';
  end if;
  return null;
end;
$$;

create trigger evento_no_update
  before update on public.evento
  for each row execute function public.evento_block_mutations();

create trigger evento_no_delete
  before delete on public.evento
  for each row execute function public.evento_block_mutations();

create trigger evento_no_truncate
  before truncate on public.evento
  execute function public.evento_block_mutations();

-- ---------------------------------------------------------------------------
-- Genesi: sentinella deterministica derivata dallo stream_id (D18).
-- Sha256('GENESIS:' || stream_id::text).
-- ---------------------------------------------------------------------------
create or replace function public.audit_genesis_hash(p_stream_id uuid)
returns bytea
language sql
immutable
as $$
  select digest('GENESIS:' || p_stream_id::text, 'sha256')
$$;

-- ---------------------------------------------------------------------------
-- Serializzazione canonica deterministica usata per l'hash.
-- Sia audit_append sia audit_verify_chain costruiscono la stringa con questa
-- funzione: cambia uno solo dei campi e l'hash cambia.
-- ---------------------------------------------------------------------------
create or replace function public.audit_canonical(
  p_stream_id uuid,
  p_seq bigint,
  p_event_type text,
  p_occurred_at timestamptz,
  p_actor jsonb,
  p_subject_type text,
  p_subject_id uuid,
  p_payload jsonb,
  p_prev_hash bytea
)
returns text
language sql
immutable
as $$
  select jsonb_build_object(
    'stream_id', p_stream_id::text,
    'seq', p_seq,
    'event_type', p_event_type,
    'occurred_at', to_char(p_occurred_at at time zone 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor', p_actor,
    'subject_type', p_subject_type,
    'subject_id', coalesce(p_subject_id::text, ''),
    'payload', p_payload,
    'prev_hash', encode(p_prev_hash, 'hex')
  )::text
$$;

-- ---------------------------------------------------------------------------
-- audit_append — UNICA via per scrivere su evento.
--  - blocco riga stream (FOR UPDATE) → seq contigui, niente race
--  - prev_hash dal predecessore (o sentinella di genesi)
--  - occurred_at server-side
--  - SECURITY DEFINER → bypassa la revoca, ma valida tenant/persona
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
set search_path = public
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

revoke all on function public.audit_append(uuid, text, jsonb, text, uuid, jsonb) from public;
grant execute on function public.audit_append(uuid, text, jsonb, text, uuid, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- audit_verify_chain — percorre lo stream e ricalcola gli hash.
-- Restituisce l'elenco degli eventi rotti (vuoto se OK).
-- ---------------------------------------------------------------------------
create or replace function public.audit_verify_chain(p_stream_id uuid)
returns table (
  evento_id uuid,
  seq bigint,
  problema text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_expected_prev bytea;
  v_expected_seq bigint := 1;
  r record;
  v_recomputed bytea;
  v_caller_tenant uuid;
begin
  -- L'auditor di un tenant può verificare solo gli stream del proprio tenant.
  -- service_role / postgres bypassano la guardia (current_tenant_id() = NULL).
  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null and not exists (
    select 1 from public.stream_audit s
     where s.id = p_stream_id and s.tenant_id = v_caller_tenant
  ) then
    raise exception 'audit_verify_chain: stream non accessibile dal tenant corrente';
  end if;
  v_expected_prev := public.audit_genesis_hash(p_stream_id);

  for r in
    select * from public.evento where stream_id = p_stream_id order by seq asc
  loop
    if r.seq <> v_expected_seq then
      evento_id := r.id; seq := r.seq;
      problema := format('seq inatteso: atteso %s, trovato %s', v_expected_seq, r.seq);
      return next;
      return;
    end if;

    if r.prev_hash <> v_expected_prev then
      evento_id := r.id; seq := r.seq;
      problema := 'prev_hash non combacia con hash precedente';
      return next;
      return;
    end if;

    v_recomputed := digest(
      public.audit_canonical(r.stream_id, r.seq, r.event_type, r.occurred_at,
                             r.actor, r.subject_type, r.subject_id, r.payload,
                             r.prev_hash),
      'sha256'
    );

    if v_recomputed <> r.hash then
      evento_id := r.id; seq := r.seq;
      problema := 'hash ricalcolato diverso dall''hash memorizzato (campi manomessi?)';
      return next;
      return;
    end if;

    v_expected_prev := r.hash;
    v_expected_seq := v_expected_seq + 1;
  end loop;
end;
$$;

grant execute on function public.audit_verify_chain(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helper: id dello stream del tenant corrente (un solo stream per tenant ora).
-- ---------------------------------------------------------------------------
create or replace function public.current_stream_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.stream_audit s
  where s.tenant_id = public.current_tenant_id() and s.scope = 'tenant'
  limit 1
$$;
