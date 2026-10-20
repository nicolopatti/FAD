-- Tenant dedicato al TEST DI CARICO (tests/carico/player.js, k6).
--
-- Crea un ente separato ("Tenant carico (test)", stream del registro proprio:
-- gli eventi del carico NON toccano il registro degli altri tenant), un admin,
-- N discenti con password nota, un corso a 1 video (fruizione libera, nessun
-- attestato), un'edizione e le N iscrizioni. Idempotente sull'id del tenant.
-- Gli utenti Auth sono inseriti in SQL (trabocchetto #11: i 4 token a '') con
-- la password cifrata con bcrypt, più la riga in auth.identities come fa GoTrue.
--
-- Lanciare via MCP execute_sql o SQL Editor. Per cambiare il numero di
-- discenti: v_n. Utenti: carico-001@fad.local … carico-NNN@fad.local, password
-- carico-pass-123 (admin: carico-admin@fad.local, stessa password).
-- Eseguito sul live il 2026-10-20 con v_n = 300.

do $$
declare
  v_tenant uuid := 'cccc0000-0000-4000-8000-0000000000c0';
  v_n int := 300;
  v_pw text := extensions.crypt('carico-pass-123', extensions.gen_salt('bf'));
  v_admin_user uuid := 'cccc0000-0000-4000-8000-00000000ad01';
  v_admin uuid; v_actor jsonb;
  v_corso uuid; v_lo uuid; v_ed uuid;
  v_user uuid; v_persona uuid; v_iscr uuid; v_email text; i int;
begin
  if exists (select 1 from public.tenant where id = v_tenant) then
    raise notice 'tenant carico già presente, nessuna modifica';
    return;
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_admin_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carico-admin@fad.local', v_pw, now(),
    '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_admin_user, jsonb_build_object('sub', v_admin_user::text, 'email', 'carico-admin@fad.local', 'email_verified', true, 'phone_verified', false), 'email', v_admin_user::text, now(), now(), now());

  select (public.tenant_crea('Tenant carico (test)', v_admin_user, 'Carico', 'Admin', 'carico-admin@fad.local', null, null, v_tenant)->>'persona_id')::uuid into v_admin;
  v_actor := jsonb_build_object('persona_id', v_admin, 'type', 'persona');

  insert into public.corso (tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, politica_attestato)
  values (v_tenant, 'Corso di carico', 'Corso usato dal test di carico k6 (tests/carico). Fruizione libera, nessun attestato.', false, false, 'nessuna')
  returning id into v_corso;
  perform public.audit_append(v_tenant, 'corso.created', v_actor, 'corso', v_corso, '{}'::jsonb);

  insert into public.learning_object (tenant_id, type, titolo, config)
  values (v_tenant, 'video', 'Video di carico', '{"vimeo_id":"1236864492","durata_secondi":600}')
  returning id into v_lo;
  perform public.audit_append(v_tenant, 'learning_object.created', v_actor, 'learning_object', v_lo, '{"type":"video"}'::jsonb);

  insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
  values (v_tenant, v_corso, v_lo, 1, true, '{"tipo":"video_ended"}');

  insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura)
  values (v_tenant, v_corso, 'ED-CARICO-01', current_date, current_date + 365, current_date, current_date + 365)
  returning id into v_ed;
  perform public.audit_append(v_tenant, 'edizione.created', v_actor, 'edizione', v_ed, jsonb_build_object('corso_id', v_corso));

  for i in 1..v_n loop
    v_user := ('cccc0000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    v_email := format('carico-%s@fad.local', lpad(i::text, 3, '0'));
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, v_pw, now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user, jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false), 'email', v_user::text, now(), now(), now());
    insert into public.persona (tenant_id, auth_user_id, nome, cognome, email)
    values (v_tenant, v_user, 'Utente', format('Carico %s', lpad(i::text, 3, '0')), v_email)
    returning id into v_persona;
    insert into public.iscrizione (tenant_id, persona_id, edizione_id) values (v_tenant, v_persona, v_ed) returning id into v_iscr;
    perform public.audit_append(v_tenant, 'iscrizione.created', v_actor, 'iscrizione', v_iscr, jsonb_build_object('edizione_id', v_ed, 'persona_id', v_persona));
  end loop;
  raise notice 'tenant carico creato: % discenti, corso %, edizione %', v_n, v_corso, v_ed;
end $$;
