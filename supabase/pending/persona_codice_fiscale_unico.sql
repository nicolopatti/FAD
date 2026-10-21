-- Stress test 21/10 — R3: codice fiscale unico per tenant (dove valorizzato).
-- DA APPLICARE SOLO DOPO LA PULIZIA dei dati di prova: oggi 7 persone
-- "Verifica automatica" hanno lo stesso CF (VRFATM80A01A794X) e l'indice non si
-- crea. Il blocco applicativo (409 con la persona già esistente) è già attivo
-- in addIscritto, PATCH persona e incarichi. Dopo l'apply: spostare questo file
-- in supabase/migrations con il timestamp del giorno.
create unique index if not exists persona_tenant_codice_fiscale_uq
  on public.persona (tenant_id, upper(codice_fiscale))
  where codice_fiscale is not null and codice_fiscale <> '';
