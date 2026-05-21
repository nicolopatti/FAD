-- Seed di sviluppo per la Fase 1.
-- Crea: 2 utenti Supabase Auth (discente, auditor), 1 Corso, 1 LO video,
-- 1 Struttura corso, 1 Edizione, 2 Persone, 1 Iscrizione.
-- NIENTE assemblatore: tutto via SQL (Task 4 del brief).

-- ---------------------------------------------------------------------------
-- Utenti di test in auth.users (password hashata con bcrypt locale).
-- Email confermate per saltare il flusso di conferma in locale.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    'discente@fad.local',
    crypt('discente-pass-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"discente"}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'auditor@fad.local',
    crypt('auditor-pass-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"auditor"}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

-- Identity (Supabase Auth >= 2024 richiede una riga in auth.identities per il login email).
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object('sub','11111111-1111-1111-1111-111111111111','email','discente@fad.local'),
    'email',
    'discente@fad.local',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    jsonb_build_object('sub','22222222-2222-2222-2222-222222222222','email','auditor@fad.local'),
    'email',
    'auditor@fad.local',
    now(), now(), now()
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Anagrafica Persone.
-- ---------------------------------------------------------------------------
insert into public.persona (id, tenant_id, auth_user_id, nome, cognome, email)
values
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Mario', 'Rossi', 'discente@fad.local'),
  ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'Anna', 'Bianchi', 'auditor@fad.local')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catalogo: Corso + LO video + Struttura corso.
-- Il video è il classico "Big Buck Bunny" su Vimeo (ID pubblico) come placeholder.
-- ---------------------------------------------------------------------------
insert into public.corso (id, tenant_id, titolo, descrizione, sblocco_sequenziale)
values
  ('c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   '00000000-0000-0000-0000-000000000001',
   'Sicurezza sul lavoro — modulo introduttivo',
   'Corso FAD di prova per la fetta verticale di Fase 1.',
   true)
on conflict (id) do nothing;

insert into public.learning_object (id, tenant_id, type, titolo, config)
values
  ('10101111-1010-1010-1010-101010101010',
   '00000000-0000-0000-0000-000000000001',
   'video',
   'Introduzione',
   '{"vimeo_id":"76979871","durata_secondi":160}'::jsonb)
on conflict (id) do nothing;

insert into public.struttura_corso
  (id, tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
values
  ('5550c011-5555-5555-5555-555555555555',
   '00000000-0000-0000-0000-000000000001',
   'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   '10101111-1010-1010-1010-101010101010',
   1, true,
   '{"tipo":"video_ended"}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Erogazione: Edizione + Iscrizione individuale del discente (D9).
-- ---------------------------------------------------------------------------
insert into public.edizione (id, tenant_id, corso_id, codice, inizio, fine)
values
  ('ed011111-ed01-ed01-ed01-ed01ed01ed01',
   '00000000-0000-0000-0000-000000000001',
   'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
   'ED-001',
   current_date,
   current_date + 60)
on conflict (id) do nothing;

insert into public.iscrizione (id, tenant_id, persona_id, edizione_id)
values
  ('15c11111-15c1-15c1-15c1-15c115c115c1',
   '00000000-0000-0000-0000-000000000001',
   'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'ed011111-ed01-ed01-ed01-ed01ed01ed01')
on conflict (id) do nothing;
