-- Fase 2 — Task 2: assemblatore di Corsi.
-- Aggiunge le policy RLS che permettono all'admin di scrivere su `corso` e
-- `struttura_corso` nel proprio tenant, e una funzione `reorder_struttura`
-- per riordinare atomicamente gli LO di un corso (evita i conflitti sulla
-- unique (corso_id, ordine) durante l'aggiornamento).
--
-- Brief Fase 2 §3 / Task 2. Niente nuove tabelle di business (§6).
-- Decisioni: D24 (proprietà intrinseche sull'LO, regole sulla Struttura),
-- D25 (sequenza piatta, niente moduli; unicità corso_id+LO_id).

-- ===========================================================================
-- 1) RLS — corso: admin può INSERT/UPDATE nel suo tenant
-- ===========================================================================
-- Niente DELETE: i corsi seguono lo stesso modello degli LO (D15/D22 — vita
-- lunga, niente delete fisico). Per ora un corso "indesiderato" senza Edizioni
-- resta in lista; quando arriverà un meccanismo di archive lo metteremo qui.

drop policy if exists corso_insert_admin on public.corso;
create policy corso_insert_admin on public.corso
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

drop policy if exists corso_update_admin on public.corso;
create policy corso_update_admin on public.corso
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
-- 2) RLS — struttura_corso: admin può INSERT/UPDATE/DELETE
-- ===========================================================================
-- Qui DELETE è ammesso (rimuovere un LO dalla Struttura non è "perdere
-- contenuto": il LO resta nel catalogo). Il congelamento D22 (Task 3) bloccherà
-- INSERT/UPDATE/DELETE quando il Corso ha almeno un'Edizione — quel pezzo
-- arriva nella migration del Task 3.

drop policy if exists struttura_insert_admin on public.struttura_corso;
create policy struttura_insert_admin on public.struttura_corso
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

drop policy if exists struttura_update_admin on public.struttura_corso;
create policy struttura_update_admin on public.struttura_corso
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

drop policy if exists struttura_delete_admin on public.struttura_corso;
create policy struttura_delete_admin on public.struttura_corso
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
  );

-- ===========================================================================
-- 3) Funzione reorder_struttura — riordina atomicamente gli LO
-- ===========================================================================
-- L'unique (corso_id, ordine) impedisce update riga-per-riga senza conflitti.
-- Strategia: shift temporaneo a valori negativi, poi riassegna 1..N.
-- SECURITY DEFINER perché serve fare due UPDATE consecutivi che la RLS
-- consentirebbe comunque (l'admin scrive nel suo tenant), ma raggrupparli
-- in una stessa transazione semplifica il client. Controlli espliciti:
-- is_admin() + corso appartiene al tenant del caller.

create or replace function public.reorder_struttura(
  p_corso_id uuid,
  p_ordered_struttura_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_count int;
  i int;
begin
  if not public.is_admin() then
    raise exception 'reorder_struttura: solo admin';
  end if;

  select tenant_id into v_tenant from public.corso where id = p_corso_id;
  if v_tenant is null or v_tenant <> public.current_tenant_id() then
    raise exception 'reorder_struttura: corso non accessibile';
  end if;

  -- Verifica che l'array contenga esattamente le righe della Struttura del corso.
  select count(*) into v_count from public.struttura_corso where corso_id = p_corso_id;
  if v_count <> coalesce(array_length(p_ordered_struttura_ids, 1), 0) then
    raise exception 'reorder_struttura: lista incompleta (% righe in DB, % in input)',
      v_count, coalesce(array_length(p_ordered_struttura_ids, 1), 0);
  end if;

  -- Shift temporaneo in range negativo (gli ordini originali sono tutti positivi).
  update public.struttura_corso
     set ordine = -ordine - 1000
   where corso_id = p_corso_id;

  -- Assegna i nuovi ordini 1..N.
  for i in 1..array_length(p_ordered_struttura_ids, 1) loop
    update public.struttura_corso
       set ordine = i
     where id = p_ordered_struttura_ids[i]
       and corso_id = p_corso_id;
  end loop;
end$$;

revoke all on function public.reorder_struttura(uuid, uuid[]) from public;
grant execute on function public.reorder_struttura(uuid, uuid[]) to authenticated;
