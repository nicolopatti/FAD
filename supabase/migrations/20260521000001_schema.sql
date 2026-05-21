-- Fase 1 — Substrato dati (Task 1).
-- Ogni tabella di business nasce con tenant_id NOT NULL e con RLS attiva.
-- Decisioni: D2 (tenant-ready dal giorno 1), D12 (Persona senza campo "ruolo"),
-- D13 (mapping auth_user_id ↔ Persona), D23/D24 (LO polimorfico, regole su Struttura),
-- D26 (sblocco sequenziale come flag del Corso), D27 (Iscrizione punta a Edizione).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------
create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  creato_il timestamptz not null default now()
);

alter table public.tenant enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: tenant id corrente, derivato dalla Persona collegata ad auth.uid().
-- SECURITY DEFINER perché deve poter leggere persona ignorando RLS.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.persona where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_persona_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.persona where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.is_auditor()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'auditor',
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- Persona — D12: NESSUN campo "ruolo". D13: auth_user_id mappa Supabase Auth.
-- ---------------------------------------------------------------------------
create table public.persona (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  cognome text not null,
  email text not null,
  creato_il timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table public.persona enable row level security;

create index persona_tenant_idx on public.persona(tenant_id);
create index persona_auth_user_idx on public.persona(auth_user_id);

-- ---------------------------------------------------------------------------
-- Corso — D26: sblocco_sequenziale è una policy del corso.
-- ---------------------------------------------------------------------------
create table public.corso (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  titolo text not null,
  descrizione text,
  sblocco_sequenziale boolean not null default true,
  creato_il timestamptz not null default now()
);

alter table public.corso enable row level security;
create index corso_tenant_idx on public.corso(tenant_id);

-- ---------------------------------------------------------------------------
-- Learning Object — D23: polimorfico (type + config jsonb leggero).
-- Per la Fase 1: solo type = 'video'. Quiz/documento arrivano dopo.
-- ---------------------------------------------------------------------------
create type public.lo_type as enum ('video');

create table public.learning_object (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  type public.lo_type not null,
  titolo text not null,
  config jsonb not null default '{}'::jsonb,
  creato_il timestamptz not null default now(),
  constraint video_config_shape check (
    type <> 'video' or (
      config ? 'vimeo_id' and config ? 'durata_secondi'
    )
  )
);

alter table public.learning_object enable row level security;
create index lo_tenant_idx on public.learning_object(tenant_id);

-- ---------------------------------------------------------------------------
-- Struttura del corso — D24/D25: ordine, obbligatorio e regola_completamento
-- vivono qui, NON sull'LO. Niente moduli/sezioni in Fase 1.
-- ---------------------------------------------------------------------------
create table public.struttura_corso (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  corso_id uuid not null references public.corso(id) on delete cascade,
  learning_object_id uuid not null references public.learning_object(id),
  ordine int not null,
  obbligatorio boolean not null default true,
  regola_completamento jsonb not null default '{"tipo": "video_ended"}'::jsonb,
  unique (corso_id, ordine),
  unique (corso_id, learning_object_id)
);

alter table public.struttura_corso enable row level security;
create index struttura_tenant_idx on public.struttura_corso(tenant_id);
create index struttura_corso_idx on public.struttura_corso(corso_id);

-- ---------------------------------------------------------------------------
-- Edizione — D27: l'Iscrizione punta a Edizione, NON a Corso. Niente piano_id.
-- ---------------------------------------------------------------------------
create table public.edizione (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  corso_id uuid not null references public.corso(id),
  codice text not null,
  inizio date,
  fine date,
  creato_il timestamptz not null default now(),
  unique (tenant_id, codice)
);

alter table public.edizione enable row level security;
create index edizione_tenant_idx on public.edizione(tenant_id);
create index edizione_corso_idx on public.edizione(corso_id);

-- ---------------------------------------------------------------------------
-- Iscrizione — D9 (iscritto individuale ⇒ azienda_id/piano_id NULL ammessi),
-- D8 (colonne-cache della compliance derivate dagli Eventi).
-- ---------------------------------------------------------------------------
create table public.iscrizione (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  persona_id uuid not null references public.persona(id),
  edizione_id uuid not null references public.edizione(id),
  azienda_id uuid,
  piano_id uuid,
  -- D8: colonne-cache della compliance. Verità = ricalcolo dagli Eventi.
  cache_completata boolean not null default false,
  cache_idonea boolean not null default false,
  cache_aggiornata_il timestamptz,
  creato_il timestamptz not null default now(),
  unique (persona_id, edizione_id)
);

alter table public.iscrizione enable row level security;
create index iscrizione_tenant_idx on public.iscrizione(tenant_id);
create index iscrizione_persona_idx on public.iscrizione(persona_id);
create index iscrizione_edizione_idx on public.iscrizione(edizione_id);

-- ---------------------------------------------------------------------------
-- Policy RLS — un tenant non vede mai righe di un altro tenant.
-- L'auditor (app_metadata.role = 'auditor') vede tutto il suo tenant.
-- ---------------------------------------------------------------------------
create policy tenant_read on public.tenant
  for select to authenticated
  using (id = public.current_tenant_id());

create policy persona_read_self_or_auditor on public.persona
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (auth_user_id = auth.uid() or public.is_auditor())
  );

create policy corso_read on public.corso
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy lo_read on public.learning_object
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy struttura_read on public.struttura_corso
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy edizione_read on public.edizione
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy iscrizione_read on public.iscrizione
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (persona_id = public.current_persona_id() or public.is_auditor())
  );
