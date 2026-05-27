-- Fase 3 — seed dimostrativo della fetta webinar (Task 1).
-- Idempotente (on conflict do nothing) e con UUID fissi (prefisso 33333333…)
-- così è referenziabile da test e UI. Vive nel tenant demo di Fase 1/2.
--
-- Crea: 1 Azienda finanziata, 1 Piano, 1 Corso "blended" con soglia di
-- frequenza, 1 Edizione, 1 Sessione VCS Teams con docente, 3 iscritti con
-- diverse configurazioni di email_riconciliazione (per esercitare match diretto,
-- fallback su persona.email, e priorità della email_riconciliazione).
--
-- NB: niente Report di partecipazione grezzo qui — i grezzi nascono dagli
-- import della pipeline (Task 2+), non dal seed.

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
begin

  insert into public.azienda (id, tenant_id, ragione_sociale, partita_iva, codice_ateco, sede_comune, sede_provincia)
  values ('33333333-0000-0000-0000-0000000000a1', v_tenant, 'Cliente Demo S.r.l.', '01234567890', '62.01', 'Milano', 'MI')
  on conflict do nothing;

  insert into public.piano_formativo_finanziato (id, tenant_id, titolo, codice, fondo)
  values ('33333333-0000-0000-0000-0000000000b1', v_tenant, 'Piano formativo 2026', 'BANDO-2026-01', 'fondimpresa')
  on conflict do nothing;

  -- Corso blended con soglia di frequenza 80% (idoneità auto alla soglia).
  insert into public.corso (id, tenant_id, titolo, descrizione, sblocco_sequenziale, soglia_frequenza_percentuale)
  values ('33333333-0000-0000-0000-000000000c01', v_tenant,
          'Sicurezza — webinar (demo Fase 3)',
          'Corso con sessione sincrona VCS; idoneità per frequenza ≥ 80%.',
          false, 80)
  on conflict do nothing;

  insert into public.edizione (id, tenant_id, corso_id, codice, data_inizio, data_fine)
  values ('33333333-0000-0000-0000-0000000000e1', v_tenant, '33333333-0000-0000-0000-000000000c01',
          'ED-WEB-2026', '2026-06-01', '2026-06-30')
  on conflict do nothing;

  -- Persone: 1 docente + 3 discenti (senza auth_user_id: sono anagrafiche).
  insert into public.persona (id, tenant_id, nome, cognome, email) values
    ('33333333-0000-0000-0000-0000000d0c01', v_tenant, 'Paolo', 'Docente',  'paolo.docente@ente.local'),
    ('33333333-0000-0000-0000-000000001111', v_tenant, 'Mario', 'Bianchi',  'mario.bianchi@cliente.it'),
    ('33333333-0000-0000-0000-000000002222', v_tenant, 'Lucia', 'Verdi',    'lucia.verdi@cliente.it'),
    ('33333333-0000-0000-0000-000000003333', v_tenant, 'Carla', 'Neri',     'carla.neri@cliente.it')
  on conflict do nothing;

  insert into public.incarico (id, tenant_id, edizione_id, persona_id, ruolo)
  values ('33333333-0000-0000-0000-00000001c001', v_tenant, '33333333-0000-0000-0000-0000000000e1',
          '33333333-0000-0000-0000-0000000d0c01', 'docente')
  on conflict do nothing;

  insert into public.sessione (id, tenant_id, edizione_id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id)
  values ('33333333-0000-0000-0000-0000000005e1', v_tenant, '33333333-0000-0000-0000-0000000000e1',
          'Webinar Modulo 1', '2026-06-01 09:00:00+00', 120, 'vcs', 'teams', 'DEMO-MEETING-001',
          '33333333-0000-0000-0000-00000001c001')
  on conflict do nothing;

  -- Iscritti:
  --  - Mario: email_riconciliazione = email reale (match diretto)
  --  - Lucia: email_riconciliazione NULL (match per fallback su persona.email)
  --  - Carla: email_riconciliazione diversa dalla persona.email (priorità reconc.)
  --  Mario e Lucia finanziati (azienda+piano); Carla individuale (NULL/NULL, D9).
  insert into public.iscrizione (id, tenant_id, persona_id, edizione_id, azienda_id, piano_id, email_riconciliazione) values
    ('33333333-0000-0000-0000-000000015001', v_tenant, '33333333-0000-0000-0000-000000001111',
      '33333333-0000-0000-0000-0000000000e1', '33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000b1', 'mario.bianchi@cliente.it'),
    ('33333333-0000-0000-0000-000000015002', v_tenant, '33333333-0000-0000-0000-000000002222',
      '33333333-0000-0000-0000-0000000000e1', '33333333-0000-0000-0000-0000000000a1', '33333333-0000-0000-0000-0000000000b1', null),
    ('33333333-0000-0000-0000-000000015003', v_tenant, '33333333-0000-0000-0000-000000003333',
      '33333333-0000-0000-0000-0000000000e1', null, null, 'carla.neri-ext@altrodominio.it')
  on conflict do nothing;

end$$;
