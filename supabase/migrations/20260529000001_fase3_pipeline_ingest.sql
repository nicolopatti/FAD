-- Fase 3 — Task 2: pipeline unica di ingestione presenze (stadi a-b-c).
--
-- Una SOLA funzione SECURITY DEFINER fa, nella stessa transazione:
--   (a) persiste il Report di partecipazione grezzo (unico path di scrittura
--       sulla tabella write-once: REVOKE + trigger del Task 1 bloccano tutto
--       il resto, D20);
--   (b) attesta l'import scrivendo un Evento `report_grezzo_importato` via
--       audit_append (mai INSERT diretto su `evento`), con
--       payload.hash = grezzo_content_hash(contenuto) (D18/D20).
-- La (c) Riconciliazione (algoritmo di match → Eventi di presenza /
-- non-riconciliazione, sempre via audit_append) arriva nel Task 4: l'algoritmo
-- vero è suo. Qui NON si emette alcun Evento di presenza speculativo — il log è
-- append-only e una presenza sbagliata non si potrebbe ritirare.
--
-- La pipeline è agnostica rispetto all'adattatore: CSV (Task 3) e API Teams
-- (Task 6) chiamano lo stesso punto, passando solo `fonte` e `contenuto`
-- normalizzato (un array JSON di righe, stessa shape per entrambi).
--
-- Decisioni: D7 (pipeline unica + adattatori), D11/D18/D19 (append serializzato
-- sullo stream unico, niente PII nel payload, hash canonico), D20 (grezzo
-- write-once, l'Evento attesta l'integrità; nessuna colonna hash sulla tabella).

-- ===========================================================================
-- pipeline_ingest_grezzo — stadi (a) + (b), atomici.
-- ===========================================================================
-- Ritorna un jsonb { grezzo_id, evento_id, evento_seq, hash, righe } utile ad
-- adattatori e test.
--
-- Authz (stesso schema di audit_verify_chain): un chiamante applicativo
-- (`authenticated`, current_tenant_id() NON nullo) deve essere admin del tenant
-- di destinazione; `service_role`/`postgres` (current_tenant_id() nullo: import
-- automatici del Task 6, bootstrap, test) bypassano la guardia. `anon` non ha
-- proprio l'EXECUTE (vedi GRANT in fondo), quindi non raggiunge il corpo.
create or replace function public.pipeline_ingest_grezzo(
  p_tenant_id uuid,
  p_sessione_id uuid,
  p_fonte public.report_fonte,
  p_contenuto jsonb,
  p_importato_da uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_tenant uuid;
  v_sessione public.sessione;
  v_grezzo_id uuid;
  v_hash_hex text;
  v_righe int;
  v_evento public.evento;
begin
  -- --- Validazioni di forma ------------------------------------------------
  if p_tenant_id is null then
    raise exception 'pipeline_ingest_grezzo: tenant_id mancante';
  end if;
  if p_sessione_id is null then
    raise exception 'pipeline_ingest_grezzo: sessione_id mancante';
  end if;
  if p_fonte is null then
    raise exception 'pipeline_ingest_grezzo: fonte mancante';
  end if;
  -- Il contenuto normalizzato è SEMPRE un array JSON di righe (stessa shape per
  -- CSV e API Teams). Un array vuoto è quasi sempre un errore di parsing a
  -- monte: meglio fallire esplicitamente che salvare un grezzo inutile (il
  -- grezzo è write-once, non si corregge).
  if p_contenuto is null or jsonb_typeof(p_contenuto) <> 'array' then
    raise exception 'pipeline_ingest_grezzo: contenuto deve essere un array JSON di righe';
  end if;
  v_righe := jsonb_array_length(p_contenuto);
  if v_righe = 0 then
    raise exception 'pipeline_ingest_grezzo: contenuto vuoto (0 righe): probabile errore di parsing a monte';
  end if;

  -- --- Autorizzazione ------------------------------------------------------
  v_caller_tenant := public.current_tenant_id();
  if v_caller_tenant is not null then
    -- chiamante applicativo: solo admin del tenant di destinazione.
    if not (public.is_admin() and v_caller_tenant = p_tenant_id) then
      raise exception 'pipeline_ingest_grezzo: solo un admin del tenant può importare un grezzo';
    end if;
  end if;
  -- v_caller_tenant nullo ⇒ service_role/postgres: consentito (import
  -- automatici del Task 6, bootstrap, test). Coerente con audit_verify_chain.

  -- --- La sessione deve esistere e appartenere allo stesso tenant ----------
  select s.* into v_sessione from public.sessione s where s.id = p_sessione_id;
  if not found then
    raise exception 'pipeline_ingest_grezzo: sessione % inesistente', p_sessione_id;
  end if;
  if v_sessione.tenant_id <> p_tenant_id then
    raise exception 'pipeline_ingest_grezzo: la sessione % non appartiene al tenant %',
      p_sessione_id, p_tenant_id;
  end if;

  -- --- importato_da --------------------------------------------------------
  -- Import manuale (CSV, Task 3): importato_da = Persona admin che carica.
  -- Import automatico (API Teams, Task 6): importato_da = NULL, ma richiede un
  -- attore "sistema" per l'Evento → rinviato al Task 6 (audit_append esige un
  -- actor con persona_id). Per ora NULL non è ammesso.
  if p_importato_da is null then
    raise exception 'pipeline_ingest_grezzo: import automatico (importato_da NULL) non ancora supportato — vedi Task 6 (adattatore API Teams)';
  end if;
  if not exists (
    select 1 from public.persona pe
    where pe.id = p_importato_da and pe.tenant_id = p_tenant_id
  ) then
    raise exception 'pipeline_ingest_grezzo: importato_da % non è una Persona del tenant %',
      p_importato_da, p_tenant_id;
  end if;

  -- --- (a) Persistenza del grezzo (unico path di scrittura) ----------------
  insert into public.report_partecipazione_grezzo
    (tenant_id, sessione_id, fonte, contenuto, importato_da)
  values
    (p_tenant_id, p_sessione_id, p_fonte, p_contenuto, p_importato_da)
  returning id into v_grezzo_id;

  -- --- (b) Evento di import via audit_append (mai INSERT diretto) ----------
  -- payload.hash = hash canonico del contenuto (D20). `fonte`/`hash`/`righe`
  -- non sono PII; l'actor è lo pseudonimo dell'importatore.
  v_hash_hex := encode(public.grezzo_content_hash(p_contenuto), 'hex');
  v_evento := public.audit_append(
    p_tenant_id,
    'report_grezzo_importato',
    jsonb_build_object('persona_id', p_importato_da, 'type', 'persona'),
    'report_partecipazione_grezzo',
    v_grezzo_id,
    jsonb_build_object('fonte', p_fonte::text, 'hash', v_hash_hex, 'righe', v_righe)
  );

  -- --- (c) Riconciliazione: Task 4 ----------------------------------------
  -- Qui si innesterà pipeline_riconcilia_grezzo(v_grezzo_id) (auto-riconcilia
  -- all'import, decisione §10): leggerà il contenuto e scriverà gli Eventi di
  -- presenza / non-riconciliazione SEMPRE via audit_append. Nessun Evento
  -- speculativo finché l'algoritmo non esiste.

  return jsonb_build_object(
    'grezzo_id', v_grezzo_id,
    'evento_id', v_evento.id,
    'evento_seq', v_evento.seq,
    'hash', v_hash_hex,
    'righe', v_righe
  );
end;
$$;

-- Grant: niente public; authenticated (admin, via la guardia interna) e
-- service_role (import automatici/bootstrap).
revoke all on function public.pipeline_ingest_grezzo(uuid, uuid, public.report_fonte, jsonb, uuid) from public;
-- Supabase concede EXECUTE di default ad anon/authenticated/service_role sulle
-- nuove funzioni in `public` (ALTER DEFAULT PRIVILEGES), e quel grant ad `anon`
-- NON è coperto dal REVOKE da public qui sopra. Per una funzione di SCRITTURA
-- con bypass della guardia quando current_tenant_id() è nullo (service_role),
-- `anon` va revocato ESPLICITAMENTE: un chiamante anonimo non ha tenant →
-- altrimenti salterebbe il controllo is_admin() e potrebbe iniettare grezzo+evento.
revoke all on function public.pipeline_ingest_grezzo(uuid, uuid, public.report_fonte, jsonb, uuid) from anon;
grant execute on function public.pipeline_ingest_grezzo(uuid, uuid, public.report_fonte, jsonb, uuid)
  to authenticated, service_role;
