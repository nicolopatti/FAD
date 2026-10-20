-- Ondata A (area admin): interfaccia per docenti e tutor (incarichi).
-- Mancava la policy DELETE: l'admin deve poter togliere un incarico assegnato
-- per errore. Un incarico usato da una sessione (sessione.incarico_id) resta
-- protetto dalla FK: prima si cambia il docente della sessione.
create policy incarico_delete_admin on public.incarico
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());
