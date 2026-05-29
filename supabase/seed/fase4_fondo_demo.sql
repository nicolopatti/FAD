-- Fase 4 — seed dimostrativo del generatore di report fondi.
--
-- (1) Completa la TESTATA del Piano finanziato esistente (Fase 3, fondo
--     'fondimpresa') con CUP / avviso / canale / date: è l'happy path della
--     rendicontazione (M4a #4/#5).
-- (2) Genera PRESENZE REALI per l'edizione finanziata ED-WEB-2026 passando per
--     la pipeline Fase 3 (pipeline_ingest_grezzo → auto-riconciliazione), così
--     il log contiene gli Eventi che il motore di aggregazione (Task 2)
--     ricostruisce. Mario 120'/120 = 100%, Lucia 110'/120 = 91.67% (soglia 80).
--
-- Idempotente: la testata si riscrive senza danni; le presenze si generano solo
-- se non esiste già un grezzo per la sessione webinar (il log è append-only:
-- ri-eseguire non deve duplicare gli Eventi di presenza).
--
-- NB: si esegue come postgres/service_role (current_tenant_id() nullo) → la
-- pipeline bypassa la guardia admin (import automatico/seed), importato_da = la
-- Persona admin reale del tenant. Nessuna PII finisce nel log: il grezzo
-- (con nomi/email) vive nella sua tabella write-once, gli Eventi portano solo id.

do $$
declare
  v_tenant   uuid := '00000000-0000-0000-0000-000000000001';
  v_piano    uuid := '33333333-0000-0000-0000-0000000000b1';
  v_sessione uuid := '33333333-0000-0000-0000-0000000005e1';
  v_admin    uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_res jsonb;
begin
  -- (1) Testata del Piano (CUP obbligatorio D32, avviso parametrizza il tracciato)
  update public.piano_formativo_finanziato
     set cup          = 'B12C34000560006',
         avviso       = 'Avviso 1/2026',
         canale       = 'Conto Formazione',
         data_avvio   = date '2026-06-01',
         data_chiusura= date '2026-06-30'
   where id = v_piano;

  -- (1b) Codici fiscali degli iscritti (anagrafica PII su Persona, mai nel log).
  --      Servono al report fondo; senza CF scatta il warning bloccante (§10).
  update public.persona set codice_fiscale = 'BNCMRA80A01F205X' where id = '33333333-0000-0000-0000-000000001111'; -- Mario Bianchi
  update public.persona set codice_fiscale = 'VRDLCU85B42F205Y' where id = '33333333-0000-0000-0000-000000002222'; -- Lucia Verdi
  update public.persona set codice_fiscale = 'NRECRL90C43F205Z' where id = '33333333-0000-0000-0000-000000003333'; -- Carla Neri

  -- (2) Presenze webinar via pipeline — solo se non già importate (idempotenza)
  if not exists (select 1 from public.report_partecipazione_grezzo where sessione_id = v_sessione) then
    v_res := public.pipeline_ingest_grezzo(
      v_tenant, v_sessione, 'csv'::public.report_fonte,
      jsonb_build_array(
        jsonb_build_object('riga',1,'nome','Mario Bianchi','email','mario.bianchi@cliente.it',
          'join','2026-06-01T09:00:00Z','leave','2026-06-01T11:00:00Z','durata','120'),
        jsonb_build_object('riga',2,'nome','Lucia Verdi','email','lucia.verdi@cliente.it',
          'join','2026-06-01T09:05:00Z','leave','2026-06-01T10:55:00Z','durata','110')
      ),
      v_admin
    );
    raise notice 'fase4 seed — presenze generate: %', v_res;
  else
    raise notice 'fase4 seed — grezzo già presente per la sessione, presenze non rigenerate';
  end if;
end$$;
