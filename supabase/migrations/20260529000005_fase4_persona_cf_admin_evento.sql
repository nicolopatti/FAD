-- Fase 4 — Task 2 (prep schema): codice_fiscale su Persona + lettura admin degli
-- Eventi di completamento FAD.
--
-- (1) Il report fondo (brief §3) richiede il CF dell'iscritto risolto al momento
--     dello snapshot, e il warning "CF mancante" è bloccante (decisione §10). Lo
--     schema di Fase 1 non aveva il CF su Persona (non serviva): si allinea qui,
--     come la Fase 3 aggiunse i campi mancanti su iscrizione. Il CF è anagrafica
--     (PII): vive su Persona, MAI nel log — l'Evento di deposito porta solo
--     l'hash (D18).
--
-- (2) Il motore di aggregazione gira sotto la sessione dell'admin che genera il
--     report (M4 #1) e sotto RLS (M4a #6, isolamento tenant). L'`evento_read` di
--     Fase 1 dà all'admin (non-auditor) i soli Eventi di cui è attore; la Fase 3
--     Task 5 aggiunse la lettura admin degli Eventi di presenza. Per i corsi FAD
--     finanziati serve anche la lettura dei completamenti: policy ADDITIVA,
--     ristretta ai tipi di Evento di completamento (nessuna PII nel payload).
--     L'auditor (D35) li legge già tutti via `evento_read`.

alter table public.persona
  add column if not exists codice_fiscale text;

comment on column public.persona.codice_fiscale is
  'Codice fiscale (PII anagrafica): usato nei report fondo, MAI nel log eventi (D18).';

create policy evento_read_admin_completamento on public.evento
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and event_type in ('video.ended', 'documento.completed')
  );
