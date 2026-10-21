-- Eliminazione di un piano finanziato non usato (nessuna iscrizione, nessun report
-- depositato: le FK lo impediscono comunque). Serve a togliere i piani creati per
-- errore o di prova; la route scrive l'Evento `piano.removed`.
create policy piano_delete_admin on public.piano_formativo_finanziato
  for delete to authenticated
  using (tenant_id = current_tenant_id() and is_admin());
