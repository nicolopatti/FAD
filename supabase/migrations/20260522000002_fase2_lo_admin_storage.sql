-- Fase 2 — Task 1 (parte 2/2): authoring LO (admin + soft-archive + Storage).
--
-- Presuppone che `…000001_fase2_lo_type_documento.sql` sia già applicata
-- (il valore enum `documento` deve esistere prima del CHECK qui sotto).
--
-- Decisioni: D6 (assemblatore, non costruttore), D15/D22 (soft-archive,
-- nessun delete fisico), D18 (no PII), D23/D24 (LO polimorfico, regole su
-- Struttura), §9 brief Fase 2 (Supabase Storage come hosting documenti).

-- ===========================================================================
-- 1) learning_object: archiviato_at + check su config esteso
-- ===========================================================================

alter table public.learning_object
  add column if not exists archiviato_at timestamptz;

-- Il CHECK originale (`video_config_shape`) copriva solo `video`. Ora
-- l'enum ha anche `documento`, quindi va rilassato e ricreato per coprire
-- entrambi i type. Per `documento` il config deve contenere la chiave di
-- Storage, il mime type (sempre `application/pdf` per la Fase 2) e la size
-- in byte (utile per UI). Niente PII (D18).

alter table public.learning_object
  drop constraint if exists video_config_shape;

alter table public.learning_object
  drop constraint if exists lo_config_shape;

alter table public.learning_object
  add constraint lo_config_shape check (
    case type
      when 'video' then
        config ? 'vimeo_id' and config ? 'durata_secondi'
      when 'documento' then
        config ? 'storage_key'
        and config ? 'mime'
        and config ? 'size'
        and (config ->> 'mime') = 'application/pdf'
      else false
    end
  );

create index if not exists lo_archiviato_idx
  on public.learning_object(tenant_id)
  where archiviato_at is null;

-- ===========================================================================
-- 2) HELPER is_admin()
-- ===========================================================================
-- Coerente con is_auditor(): legge il ruolo da app_metadata del JWT.
-- D12: la Persona non ha campo "ruolo", l'autorizzazione vive nel JWT.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
$$;

-- ===========================================================================
-- 3) RLS — learning_object: admin può INSERT/UPDATE nel suo tenant
-- ===========================================================================
-- La policy `lo_read` resta com'è (tutti gli authenticated dello stesso
-- tenant leggono tutti gli LO, anche archiviati: il filtro va in UI). Niente
-- DELETE: D15/D22 — solo soft-archive.

drop policy if exists lo_insert_admin on public.learning_object;
create policy lo_insert_admin on public.learning_object
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

drop policy if exists lo_update_admin on public.learning_object;
create policy lo_update_admin on public.learning_object
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

-- ===========================================================================
-- 4) STORAGE — bucket `documenti` (privato) + policy per-tenant
-- ===========================================================================
-- Lo schema `storage` esiste solo su Supabase reale, non sul Postgres
-- locale del container Claude Code (dove giriamo i test pgTAP). Gating con
-- `if exists` per non rompere la migration in locale.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then

    -- Bucket privato. Idempotente.
    insert into storage.buckets (id, name, public)
    values ('documenti', 'documenti', false)
    on conflict (id) do nothing;

    -- Lettura: chiunque sia authenticated dello stesso tenant può leggere
    -- i file il cui primo segmento di path è il proprio tenant_id.
    -- Niente filtro is_admin() qui: anche il discente che fruisce il LO
    -- documento deve poter leggere il file (Task 4).
    execute $p$ drop policy if exists documenti_read_same_tenant on storage.objects $p$;
    execute $p$
      create policy documenti_read_same_tenant on storage.objects
        for select to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
        )
    $p$;

    -- Scrittura: solo admin del tenant. Stessa restrizione sul prefisso.
    execute $p$ drop policy if exists documenti_insert_admin on storage.objects $p$;
    execute $p$
      create policy documenti_insert_admin on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
          and public.is_admin()
        )
    $p$;

    execute $p$ drop policy if exists documenti_update_admin on storage.objects $p$;
    execute $p$
      create policy documenti_update_admin on storage.objects
        for update to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
          and public.is_admin()
        )
        with check (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
          and public.is_admin()
        )
    $p$;

    -- Delete dei file: ammesso per admin (non viola D15/D22, perché su
    -- learning_object il delete della riga resta off; questo permette di
    -- ripulire file caricati per errore o di sostituirli).
    execute $p$ drop policy if exists documenti_delete_admin on storage.objects $p$;
    execute $p$
      create policy documenti_delete_admin on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1] = public.current_tenant_id()::text
          and public.is_admin()
        )
    $p$;

  end if;
end$$;
