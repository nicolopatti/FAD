-- Ondata UX 3 (2026-10-20): l'admin assegna il Piano finanziato (e l'azienda)
-- a un'iscrizione dal Course Builder. Mancava la policy UPDATE per l'admin su
-- `iscrizione` (c'erano solo SELECT/INSERT/DELETE): l'update sotto RLS non
-- toccava righe. Policy additiva, stesso predicato delle altre.
-- (Niente `drop policy`: l'MCP resta appeso sui batch con DROP, trabocchetto #13.)
create policy iscrizione_update_admin on public.iscrizione
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
