-- Fase 4 — Task 6 (RLS): lettura admin degli Eventi di deposito report fondo.
--
-- L'Evento `report_fondo_depositato` è già visibile all'auditor (evento_read,
-- D35 → M4 #1) e all'admin che lo ha depositato (è l'attore). Questa policy
-- ADDITIVA lo rende leggibile a QUALSIASI admin del tenant, così la UI del
-- report fondo può mostrare l'hash attestato accanto a ogni snapshot anche per
-- depositi fatti da un altro admin. Nessuna PII nel payload (solo hash/metadati).
create policy evento_read_admin_deposito on public.evento
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and event_type = 'report_fondo_depositato'
  );
