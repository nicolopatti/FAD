-- Blocco B #8 — onboarding di un nuovo ente (tenant) senza variabili d'ambiente.
--
-- Il tenant è SEMPRE derivato dalla persona autenticata (current_tenant_id,
-- RLS); nessuna parte dell'applicazione legge più un tenant da env. Questa RPC
-- crea in una sola transazione: tenant, stream del registro (D11/D19: uno per
-- tenant), Persona del primo admin e i due Eventi di nascita (tenant.created,
-- persona.created) via audit_append. L'utente Supabase Auth dell'admin (con
-- app_metadata.role = 'admin') lo crea lo script `scripts/nuovo-ente.ts` con la
-- Admin API, prima di chiamare qui.
--
-- Eseguibile SOLO dalla service role (e dal proprietario): non è un'azione di
-- un utente dell'app. Nessuna PII nei payload (D18).

create or replace function public.tenant_crea(
  p_nome text,
  p_admin_auth_user_id uuid,
  p_admin_nome text,
  p_admin_cognome text,
  p_admin_email text,
  p_ragione_sociale text default null,
  p_citta text default null,
  p_tenant_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant uuid;
  v_stream uuid;
  v_persona uuid;
  v_actor jsonb;
begin
  if auth.uid() is not null then
    raise exception 'tenant_crea: riservata alla service role';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'tenant_crea: nome mancante'; end if;
  if p_admin_auth_user_id is null then raise exception 'tenant_crea: utente Auth dell''admin mancante'; end if;
  if coalesce(trim(p_admin_nome), '') = '' or coalesce(trim(p_admin_cognome), '') = '' or coalesce(trim(p_admin_email), '') = '' then
    raise exception 'tenant_crea: nome, cognome ed email dell''admin sono obbligatori';
  end if;
  if exists (select 1 from public.persona where auth_user_id = p_admin_auth_user_id) then
    raise exception 'tenant_crea: l''utente Auth % è già collegato a una Persona', p_admin_auth_user_id;
  end if;

  insert into public.tenant (id, nome, ragione_sociale, citta)
  values (coalesce(p_tenant_id, gen_random_uuid()), trim(p_nome), nullif(trim(p_ragione_sociale), ''), nullif(trim(p_citta), ''))
  returning id into v_tenant;

  insert into public.stream_audit (tenant_id, scope) values (v_tenant, 'tenant') returning id into v_stream;

  insert into public.persona (tenant_id, auth_user_id, nome, cognome, email)
  values (v_tenant, p_admin_auth_user_id, trim(p_admin_nome), trim(p_admin_cognome), lower(trim(p_admin_email)))
  returning id into v_persona;

  v_actor := jsonb_build_object('persona_id', v_persona, 'type', 'persona');
  perform public.audit_append(v_tenant, 'tenant.created', v_actor, 'tenant', v_tenant, '{}'::jsonb);
  perform public.audit_append(v_tenant, 'persona.created', v_actor, 'persona', v_persona, jsonb_build_object('ruolo', 'admin', 'origine', 'tenant_crea'));

  return jsonb_build_object('tenant_id', v_tenant, 'stream_id', v_stream, 'persona_id', v_persona);
end;
$$;

revoke execute on function public.tenant_crea(text, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.tenant_crea(text, uuid, text, text, text, text, text, uuid) to service_role;

comment on function public.tenant_crea is
  'Crea tenant + stream del registro + Persona del primo admin + Eventi di nascita. Solo service role (scripts/nuovo-ente.ts).';
