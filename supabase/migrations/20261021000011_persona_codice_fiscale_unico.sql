-- Stress test 21/10 — R3: codice fiscale unico per tenant (dove valorizzato).
-- Applicata il 2026-10-21 dopo la pulizia dei dati di prova (le 7 persone
-- "Verifica automatica" con CF VRFATM80A01A794X ora non hanno CF, Eventi
-- persona.updated con origine pulizia_verifica). Il blocco applicativo (409 con
-- la persona già esistente) resta in addIscritto, PATCH persona e incarichi:
-- l'indice è la rete di sicurezza contro le scritture concorrenti.
create unique index if not exists persona_tenant_codice_fiscale_uq
  on public.persona (tenant_id, upper(codice_fiscale))
  where codice_fiscale is not null and codice_fiscale <> '';
