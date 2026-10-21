-- Le policy del bucket `copertine` (migration 20260531000001) leggevano il tenant
-- da `auth.jwt() -> app_metadata ->> 'tenant_id'`, che nessun utente ha (il
-- tenant si ricava dalla Persona, come fanno `documenti` e `loghi`): l'upload
-- della copertina dal browser era SEMPRE rifiutato dalla RLS. Scoperto dal
-- giro completo in produzione (scripts/verifica-giro-completo.mjs). Stesso
-- schema degli altri bucket: cartella = tenant della Persona, ruolo admin.
-- ALTER POLICY (niente DROP: trabocchetto #13 dell'MCP).
alter policy copertine_admin_insert on storage.objects
  with check (bucket_id = 'copertine' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin());
alter policy copertine_admin_update on storage.objects
  using (bucket_id = 'copertine' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin())
  with check (bucket_id = 'copertine' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin());
alter policy copertine_admin_delete on storage.objects
  using (bucket_id = 'copertine' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin());
