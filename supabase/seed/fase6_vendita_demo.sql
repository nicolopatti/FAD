-- Fase 6 — seed dimostrativo della vendita (solo dati del tenant demo).
--
-- (1) Indirizzi → ente demo (tenant_dominio): produzione, anteprime Vercel del
--     progetto (jolly) e il dev server del container. Senza queste righe il
--     catalogo pubblico e la registrazione rispondono "nessun ente".
-- (2) Un'offerta di prova sull'edizione ED-001 ("Sicurezza sul lavoro —
--     modulo introduttivo"), corso online con 365 giorni di accesso, 49 € IVA
--     inclusa, pubblicata. L'Evento offerta.created / offerta.published passa da
--     audit_append con la Persona admin reale come attore (nessuna PII).
--
-- Idempotente: gli indirizzi si inseriscono con on conflict; l'offerta si crea
-- solo se l'edizione non ne ha già una (il log è append-only: rieseguire non
-- deve duplicare gli Eventi). Nessun pagamento: senza STRIPE_SECRET_KEY il
-- pulsante "Acquista" risponde 503 "pagamenti non configurati".

insert into public.tenant_dominio (host, tenant_id) values
  ('fad-wine.vercel.app',                  '00000000-0000-0000-0000-000000000001'),
  ('fad-*-nicolopattis-projects.vercel.app', '00000000-0000-0000-0000-000000000001'),
  ('localhost:3100',                       '00000000-0000-0000-0000-000000000001')
on conflict (host) do nothing;

do $$
declare
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_edizione uuid := 'ed011111-ed01-ed01-ed01-ed01ed01ed01';
  v_actor   jsonb := jsonb_build_object('persona_id', 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'type', 'persona');
  v_offerta uuid;
begin
  if exists (select 1 from public.offerta where edizione_id = v_edizione) then
    return;
  end if;

  insert into public.offerta (
    tenant_id, edizione_id, slug, stato, prezzo_centesimi, aliquota_iva,
    accesso_giorni, titolo_pubblico, descrizione_pubblica, pubblicata_il
  ) values (
    v_tenant, v_edizione, 'sicurezza-sul-lavoro-introduttivo', 'pubblicata', 4900, 22,
    365,
    'Sicurezza sul lavoro — modulo introduttivo',
    'Un corso online breve per conoscere i principi della sicurezza sul lavoro.' || chr(10) || chr(10) ||
    'Due lezioni video da seguire quando vuoi, nell''ordine. L''accesso dura un anno dall''acquisto. ' ||
    'Offerta dimostrativa: i pagamenti non sono attivi.',
    now()
  ) returning id into v_offerta;

  perform public.audit_append(v_tenant, 'offerta.created', v_actor, 'offerta', v_offerta,
    jsonb_build_object('edizione_id', v_edizione, 'slug', 'sicurezza-sul-lavoro-introduttivo',
                       'prezzo_centesimi', 4900, 'accesso_giorni', 365, 'origine', 'seed'));
  perform public.audit_append(v_tenant, 'offerta.published', v_actor, 'offerta', v_offerta,
    jsonb_build_object('edizione_id', v_edizione, 'slug', 'sicurezza-sul-lavoro-introduttivo', 'origine', 'seed'));
end $$;

-- (3) 2026-10-22: sconto a tempo dimostrativo sull'offerta demo ("Offerta lancio",
--     39 € invece di 49 € fino al 30/11/2026). Solo se l'offerta non ha sconti.
do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_actor  jsonb := jsonb_build_object('persona_id', 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'type', 'persona');
  v_off    record;
begin
  select id, slug into v_off from public.offerta
  where tenant_id = v_tenant and slug = 'sicurezza-sul-lavoro-introduttivo' and sconti = '[]'::jsonb;
  if not found then return; end if;
  update public.offerta
     set sconti = jsonb_build_array(jsonb_build_object('dal', '2026-10-22', 'al', '2026-11-30', 'prezzo_centesimi', 3900, 'etichetta', 'Offerta lancio'))
   where id = v_off.id;
  perform public.audit_append(v_tenant, 'offerta.updated', v_actor, 'offerta', v_off.id,
    jsonb_build_object('slug', v_off.slug, 'campi', jsonb_build_array('sconti'), 'origine', 'seed'));
end $$;
