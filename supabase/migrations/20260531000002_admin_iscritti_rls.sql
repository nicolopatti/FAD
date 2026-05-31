-- Fase UI Admin — RLS write per la Sezione Iscritti del course builder
-- =====================================================================
-- L'admin del tenant può ora gestire l'anagrafica iscritti dall'area corsi:
-- creare Persone (dedup per email), completarne il codice fiscale, iscriverle
-- a un'Edizione e rimuovere un'iscrizione. Finora c'erano solo le SELECT admin
-- (persona_read_admin / iscrizione_read_admin) e azienda_insert/update_admin.
--
-- Tutte le policy sono scopate al tenant corrente + is_admin(). Nessun impatto
-- sulle policy esistenti (sono additive). Niente PII nel log: gli Eventi
-- iscrizione.*/persona.created portano solo UUID/flag (vedi src/lib/iscritti.ts).

begin;

-- Persona — INSERT/UPDATE solo admin del proprio tenant.
drop policy if exists persona_insert_admin on public.persona;
create policy persona_insert_admin on public.persona
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists persona_update_admin on public.persona;
create policy persona_update_admin on public.persona
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- Iscrizione — INSERT/DELETE solo admin del proprio tenant.
drop policy if exists iscrizione_insert_admin on public.iscrizione;
create policy iscrizione_insert_admin on public.iscrizione
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists iscrizione_delete_admin on public.iscrizione;
create policy iscrizione_delete_admin on public.iscrizione
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

commit;
