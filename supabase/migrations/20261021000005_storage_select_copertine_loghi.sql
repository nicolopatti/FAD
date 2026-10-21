-- I caricamenti dal browser (supabase-js `upload`) e dall'API Storage inseriscono
-- la riga in storage.objects e la rileggono (INSERT … RETURNING, e con upsert
-- ON CONFLICT DO UPDATE): sotto RLS la rilettura richiede una policy SELECT.
-- I bucket `copertine` e `loghi` avevano solo INSERT/UPDATE/DELETE → ogni upload
-- finiva in "new row violates row-level security policy" (copertina del corso,
-- logo e firma dell'ente, immagini del modello dell'attestato). Scoperto dal
-- giro completo in produzione. Le immagini restano pubbliche via URL (bucket
-- pubblici): questa policy riguarda solo le righe di storage.objects, che vede
-- l'admin del proprio tenant, come per le scritture.
create policy copertine_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'copertine' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin());
create policy loghi_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'loghi' and (storage.foldername(name))[1] = current_tenant_id()::text and is_admin());
