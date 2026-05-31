-- Fase UI Admin (tema "Atlante") — copertine + categoria del Corso
-- =============================================================
-- Supporta il restyling dell'area amministratore:
-- - `corso.categoria`  : campo strutturale (per filtri/segnaposto copertina),
--                        congelato con D22 come gli altri campi di sezione 1.
-- - `corso.cover_path` : path della copertina nel bucket Storage `copertine`.
--                        Resta modificabile anche a corso congelato (la
--                        copertina è editoriale, non altera la fruizione).
-- - bucket pubblico `copertine` con scrittura riservata agli admin del tenant.
--
-- Nessuna nuova policy su persona/iscrizione/azienda: gli admin hanno già
-- `*_admin_all` (vedi 20260529000002). Nessun nuovo tipo di Evento da
-- dichiarare: `evento.event_type` è testo libero e `assert_no_pii` blocca
-- comunque le chiavi PII nel payload (D18).

begin;

-- ── Colonne nuove su corso ────────────────────────────────────────────
alter table public.corso
  add column if not exists categoria  text,
  add column if not exists cover_path text;

-- ── D22: categoria congelata, cover_path no ───────────────────────────
-- Riscrive la guardia di congelamento aggiungendo `categoria` ai campi
-- strutturali immutabili. `cover_path` non è elencato ⇒ resta scrivibile
-- anche quando il Corso ha ≥1 Edizione ("la copertina resta modificabile").
create or replace function public.corso_freeze_guard()
returns trigger
language plpgsql
as $$
begin
  if public.corso_is_frozen(NEW.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.descrizione is distinct from OLD.descrizione
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.categoria is distinct from OLD.categoria then
      raise exception 'Corso % è congelato (D22): i campi strutturali non sono modificabili', NEW.id
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

-- ── Bucket Storage `copertine` (pubblico in lettura) ──────────────────
-- Le copertine sono immagini editoriali, niente PII ⇒ lettura pubblica
-- (così <img src> funziona senza signed-url). La scrittura è ristretta
-- agli admin del tenant, path convenzione {tenant_id}/{corso_id}.<ext>.
insert into storage.buckets (id, name, public)
values ('copertine', 'copertine', true)
on conflict (id) do nothing;

drop policy if exists "copertine_admin_insert" on storage.objects;
create policy "copertine_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'copertine'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "copertine_admin_update" on storage.objects;
create policy "copertine_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'copertine'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "copertine_admin_delete" on storage.objects;
create policy "copertine_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'copertine'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

commit;
