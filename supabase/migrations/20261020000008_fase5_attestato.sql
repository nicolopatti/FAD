-- Fase 5 — Task 4: attestato (documento congelato write-once) + dati anagrafici.
--
-- * corso: ore_totali, riferimento_normativo, politica_attestato (automatica |
--   manuale | nessuna). Congelati con D22 con UNA eccezione pratica: un valore
--   ancora NULL può essere compilato anche a corso congelato (completamento
--   dell'anagrafica dei corsi già in esercizio); un valore già impostato non si
--   cambia più. politica_attestato è congelata come gli altri.
-- * persona: data_nascita, luogo_nascita (PII in anagrafica, mai nel log).
-- * tenant: ragione_sociale, logo_path, firmatario_nome, firmatario_ruolo,
--   firma_path, citta, linkedin_organization_id (ente emittente).
-- * attestato: snapshot risolto (CON PII: è il documento), numero progressivo per
--   tenant e anno, codice di verifica non indovinabile, hash sha256 del canonico,
--   path PDF deterministico, write-once (D20) salvo la sola marcatura
--   `sostituito_da` (NULL → id del nuovo attestato, una volta sola).
-- * attestato_contatore: progressivo serializzato con lock di riga.
-- * RPC attestato_emetti (SECURITY DEFINER: snapshot + numero + Evento
--   `attestato.emesso` {iscrizione_id, attestato_id, numero, hash}; con
--   p_sostituisce anche `attestato.sostituito`), attestato_verifica(codice)
--   (eseguibile da anon, SOLO campi pubblici), persona_aggiorna_nascita (il
--   discente completa la propria anagrafica).
-- * bucket Storage `loghi` (pubblico, scrittura admin) e `attestati` (privato,
--   nessuna policy: scrive e firma solo il server con la service role).
-- Niente DROP/DELETE nel testo (MCP #13). Nessun INSERT diretto in evento.

-- ===========================================================================
-- 1) Colonne nuove
-- ===========================================================================
alter table public.corso
  add column if not exists ore_totali numeric(6,2),
  add column if not exists riferimento_normativo text,
  add column if not exists politica_attestato text not null default 'automatica';
alter table public.corso
  add constraint corso_politica_attestato_check
  check (politica_attestato in ('automatica', 'manuale', 'nessuna'));

alter table public.persona
  add column if not exists data_nascita date,
  add column if not exists luogo_nascita text;

alter table public.tenant
  add column if not exists ragione_sociale text,
  add column if not exists logo_path text,
  add column if not exists firmatario_nome text,
  add column if not exists firmatario_ruolo text,
  add column if not exists firma_path text,
  add column if not exists citta text,
  add column if not exists linkedin_organization_id text;

-- L'admin del tenant aggiorna i dati dell'ente (prima c'era solo la lettura).
create policy tenant_update_admin on public.tenant
  for update to authenticated
  using (id = public.current_tenant_id() and public.is_admin())
  with check (id = public.current_tenant_id() and public.is_admin());

-- ===========================================================================
-- 2) D22: freeze esteso (NULL → valore ammesso; valore → altro valore no)
-- ===========================================================================
create or replace function public.tg_corso_freeze()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.helper_corso_has_edizioni(NEW.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.categoria is distinct from OLD.categoria
       or NEW.visione_integrale is distinct from OLD.visione_integrale
       or (OLD.ore_totali is not null and NEW.ore_totali is distinct from OLD.ore_totali)
       or (OLD.riferimento_normativo is not null and NEW.riferimento_normativo is distinct from OLD.riferimento_normativo)
       or NEW.politica_attestato is distinct from OLD.politica_attestato then
      raise exception 'Corso % è congelato (D22): i campi strutturali (titolo, categoria, sblocco, visione integrale, ore, riferimento normativo, politica attestato) non sono modificabili', NEW.id using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end; $$;

-- ===========================================================================
-- 3) Tabelle attestato + contatore
-- ===========================================================================
create table public.attestato (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  iscrizione_id uuid not null references public.iscrizione(id),
  persona_id uuid not null references public.persona(id),
  corso_id uuid not null references public.corso(id),
  edizione_id uuid not null references public.edizione(id),
  anno int not null,
  progressivo int not null,
  numero text not null,                       -- es. 2026/000017
  codice_verifica text not null,              -- URL-safe, non enumerabile
  contenuto jsonb not null,                   -- snapshot risolto (con PII: è il documento)
  hash text not null,                         -- sha256 hex del canonico di contenuto
  pdf_path text not null,                     -- {tenant}/{attestato_id}.pdf (bucket attestati)
  emesso_at timestamptz not null default now(),
  emesso_da uuid references public.persona(id),  -- admin; NULL = emissione automatica
  sostituisce uuid references public.attestato(id),
  sostituito_da uuid references public.attestato(id),
  unique (tenant_id, numero),
  unique (codice_verifica)
);
alter table public.attestato enable row level security;
create index attestato_iscrizione_idx on public.attestato(iscrizione_id);
create index attestato_persona_idx on public.attestato(persona_id);
create index attestato_tenant_emesso_idx on public.attestato(tenant_id, emesso_at desc);
create index attestato_corso_idx on public.attestato(corso_id);
create index attestato_edizione_idx on public.attestato(edizione_id);
create index attestato_emesso_da_idx on public.attestato(emesso_da);
create index attestato_sostituisce_idx on public.attestato(sostituisce);
create index attestato_sostituito_da_idx on public.attestato(sostituito_da);

revoke all on public.attestato from anon, authenticated;
grant select on public.attestato to authenticated;

create table public.attestato_contatore (
  tenant_id uuid not null references public.tenant(id),
  anno int not null,
  ultimo int not null default 0,
  primary key (tenant_id, anno)
);
alter table public.attestato_contatore enable row level security;
revoke all on public.attestato_contatore from anon, authenticated;

-- Write-once (D20) con l'unica eccezione della marcatura di sostituzione.
create or replace function public.attestato_block_mutations()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if OLD.sostituito_da is null and NEW.sostituito_da is not null
       and (to_jsonb(NEW) - 'sostituito_da') = (to_jsonb(OLD) - 'sostituito_da') then
      return NEW;
    end if;
    raise exception 'attestato è write-once: UPDATE non permesso (D20); si emette un nuovo attestato che sostituisce il precedente';
  elsif tg_op = 'DELETE' then
    raise exception 'attestato è write-once: DELETE non permesso (D20)';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'attestato è write-once: TRUNCATE non permesso (D20)';
  end if;
  return null;
end;
$$;
create trigger attestato_no_update before update on public.attestato
  for each row execute function public.attestato_block_mutations();
create trigger attestato_no_delete before delete on public.attestato
  for each row execute function public.attestato_block_mutations();
create trigger attestato_no_truncate before truncate on public.attestato
  execute function public.attestato_block_mutations();

-- Hash canonico (gemello di report_fondo_content_hash): jsonb::text è
-- deterministico (chiavi ordinate), quindi l'hash è riproducibile dal DB.
create or replace function public.attestato_content_hash(p_contenuto jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select encode(digest(p_contenuto::text, 'sha256'), 'hex') $$;

-- RLS lettura: il titolare vede i propri; admin e auditor tutti quelli del tenant.
create policy attestato_read_self on public.attestato
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and persona_id = public.current_persona_id());
create policy attestato_read_staff on public.attestato
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_admin() or public.is_auditor()));

-- ===========================================================================
-- 4) RPC attestato_emetti
-- ===========================================================================
-- p_contenuto: snapshot risolto dal server (ente, discente, corso, edizione,
-- percorso, test, frequenza, testa del registro). La RPC aggiunge numero,
-- codice, data e id, calcola l'hash e scrive l'Evento. p_attore = persona
-- dell'Evento (il discente per l'emissione automatica, l'admin per quella
-- manuale); p_emesso_da = admin o NULL (automatica). p_sostituisce = attestato
-- valido della stessa iscrizione da marcare come sostituito (riemissione).
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

-- ===========================================================================
-- 5) RPC attestato_verifica — pagina pubblica (anon), SOLO campi pubblici
-- ===========================================================================
-- Nome e cognome, corso, ente, ore, numero, data, stato. Mai codice fiscale né
-- data/luogo di nascita (decisione §10.4 ratificata).
create or replace function public.attestato_verifica(p_codice text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_a public.attestato;
  v_nuovo public.attestato;
  v_c jsonb;
begin
  if p_codice is null or p_codice !~ '^[0-9a-f]{24}$' then
    return jsonb_build_object('trovato', false);
  end if;
  select * into v_a from public.attestato where codice_verifica = p_codice;
  if not found then return jsonb_build_object('trovato', false); end if;
  v_c := v_a.contenuto;
  if v_a.sostituito_da is not null then
    select * into v_nuovo from public.attestato where id = v_a.sostituito_da;
  end if;
  return jsonb_build_object(
    'trovato', true,
    'stato', case when v_a.sostituito_da is null then 'valido' else 'sostituito' end,
    'numero', v_a.numero,
    'emesso_il', v_a.emesso_at,
    'sostituito_il', v_nuovo.emesso_at,
    'hash', v_a.hash,
    'hash_ricalcolato_ok', public.attestato_content_hash(v_c) = v_a.hash,
    'discente', jsonb_build_object('nome', v_c #>> '{discente,nome}', 'cognome', v_c #>> '{discente,cognome}'),
    'corso', jsonb_build_object('titolo', v_c #>> '{corso,titolo}', 'ore_totali', v_c #> '{corso,ore_totali}',
      'riferimento_normativo', v_c #>> '{corso,riferimento_normativo}'),
    'edizione', jsonb_build_object('codice', v_c #>> '{edizione,codice}', 'data_inizio', v_c #>> '{edizione,data_inizio}',
      'data_fine', v_c #>> '{edizione,data_fine}'),
    'ente', jsonb_build_object('ragione_sociale', v_c #>> '{ente,ragione_sociale}', 'citta', v_c #>> '{ente,citta}',
      'logo_path', v_c #>> '{ente,logo_path}'),
    'test', v_c -> 'test',
    'completato_il', v_c ->> 'completato_il'
  );
end;
$$;

-- ===========================================================================
-- 6) RPC persona_aggiorna_nascita — il discente completa la propria anagrafica
-- ===========================================================================
create or replace function public.persona_aggiorna_nascita(p_data_nascita date, p_luogo_nascita text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_persona uuid := public.current_persona_id();
begin
  if v_persona is null then raise exception 'persona_aggiorna_nascita: non autenticato'; end if;
  if p_luogo_nascita is not null and length(btrim(p_luogo_nascita)) > 120 then
    raise exception 'persona_aggiorna_nascita: luogo di nascita troppo lungo';
  end if;
  if p_data_nascita is not null and (p_data_nascita > current_date - interval '14 years' or p_data_nascita < date '1900-01-01') then
    raise exception 'persona_aggiorna_nascita: data di nascita non plausibile';
  end if;
  update public.persona set data_nascita = p_data_nascita, luogo_nascita = nullif(btrim(p_luogo_nascita), '')
  where id = v_persona;
end;
$$;

-- ===========================================================================
-- 7) Grant (regola hardening): niente anon salvo attestato_verifica
-- ===========================================================================
revoke all on function public.attestato_emetti(uuid, jsonb, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.attestato_emetti(uuid, jsonb, uuid, uuid, uuid, text) to authenticated, service_role;
revoke all on function public.attestato_content_hash(jsonb) from public, anon;
grant execute on function public.attestato_content_hash(jsonb) to authenticated, service_role;
revoke all on function public.attestato_block_mutations() from public, anon, authenticated;
revoke all on function public.persona_aggiorna_nascita(date, text) from public, anon;
grant execute on function public.persona_aggiorna_nascita(date, text) to authenticated;
revoke all on function public.attestato_verifica(text) from public;
grant execute on function public.attestato_verifica(text) to anon, authenticated, service_role;

-- ===========================================================================
-- 8) Storage: bucket `loghi` (pubblico) e `attestati` (privato, solo server)
-- ===========================================================================
insert into storage.buckets (id, name, public) values ('loghi', 'loghi', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('attestati', 'attestati', false) on conflict (id) do nothing;

create policy loghi_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'loghi' and (storage.foldername(name))[1] = public.current_tenant_id()::text and public.is_admin());
create policy loghi_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'loghi' and (storage.foldername(name))[1] = public.current_tenant_id()::text and public.is_admin())
  with check (bucket_id = 'loghi' and (storage.foldername(name))[1] = public.current_tenant_id()::text and public.is_admin());
create policy loghi_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'loghi' and (storage.foldername(name))[1] = public.current_tenant_id()::text and public.is_admin());

comment on table public.attestato is 'Attestato emesso: snapshot write-once (D20) con PII; integrità attestata da hash + Evento attestato.emesso. Un solo attestato valido per iscrizione; la riemissione marca sostituito_da.';
comment on function public.attestato_verifica(text) is 'Verifica pubblica per codice: eseguibile da anon, restituisce solo i campi pubblici (nome e cognome, corso, ente, ore, numero, date, stato).';
