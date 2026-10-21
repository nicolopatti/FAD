-- Stress test 21/10 — B6: la lista Persone mostrava "discente" anche per
-- auditor e admin. Il ruolo di accesso vive in auth.users (app_metadata.role),
-- che il client non legge: questa RPC lo restituisce per le Persone date, solo
-- del tenant del chiamante e solo a staff (admin o auditor). Nessuna PII nuova
-- (il ruolo), anon e PUBLIC senza EXECUTE.
create or replace function public.persone_ruoli(p_persona_ids uuid[])
returns table (persona_id uuid, ruolo text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(u.raw_app_meta_data ->> 'role', 'discente')
  from public.persona p
  join auth.users u on u.id = p.auth_user_id
  where p.id = any (p_persona_ids)
    and p.tenant_id = public.current_tenant_id()
    and (public.is_admin() or public.is_auditor());
$$;

revoke all on function public.persone_ruoli(uuid[]) from public, anon;
grant execute on function public.persone_ruoli(uuid[]) to authenticated, service_role;

comment on function public.persone_ruoli(uuid[]) is
  'Ruolo di accesso (app_metadata.role) delle Persone date, solo tenant del chiamante e solo staff. B6 stress test 21/10.';
