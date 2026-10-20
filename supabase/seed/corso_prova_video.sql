-- Corso di prova a 6 video (2026-10-20) — eseguito sul live il 2026-10-20. Crea nella libreria del tenant demo i
-- learning object video, il corso, la struttura ordinata (sblocco sequenziale),
-- una edizione e l'iscrizione del discente demo, registrando gli Eventi come
-- farebbe l'area admin (learning_object.created, corso.created, struttura.added,
-- edizione.created, iscrizione.created) via audit_append — mai INSERT su evento.
--
-- Gira come postgres via MCP execute_sql (o psql). Idempotente sul codice
-- edizione: se esiste già un'edizione con quel codice, non fa nulla.
-- Prima di lanciarlo, compilare la lista `v_video` (titolo, ID numerico Vimeo,
-- hash di privacy se il video è "non in elenco", durata in secondi).
-- NB: la creazione dell'edizione congela corso e struttura (D22): per cambiare
-- i video dopo, si crea un corso nuovo oppure si modifica il `config` del LO
-- (non è un campo strutturale del corso).

do $$
declare
  v_tenant   uuid := '00000000-0000-0000-0000-000000000001';
  v_admin    uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';   -- persona admin demo
  v_discente uuid := 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';   -- persona discente demo
  v_titolo   text := 'I finanziamenti pubblici e privati (corso di prova)';
  v_descr    text := 'Sei lezioni video in sequenza: perché esistono i finanziamenti, il sistema pubblico e quello privato, il confronto, il welfare e come orientarsi tra le opportunità. Durata complessiva 55 minuti e 45 secondi.';
  v_codice   text := 'ED-FIN-PROVA-01';
  -- titolo, vimeo_id (solo cifre), vimeo_hash (o NULL), durata_secondi
  v_video jsonb := '[
    {"titolo": "Lezione 01 - Perché esistono i finanziamenti", "vimeo_id": "1236864492", "vimeo_hash": null, "durata_secondi": 519},
    {"titolo": "Lezione 02 - Il sistema dei finanziamenti pubblici", "vimeo_id": "1236864490", "vimeo_hash": null, "durata_secondi": 555},
    {"titolo": "Lezione 03 - Il sistema dei finanziamenti privati", "vimeo_id": "1236864489", "vimeo_hash": null, "durata_secondi": 519},
    {"titolo": "Lezione 04 - Finanziamenti pubblici e privati a confronto", "vimeo_id": "1236864491", "vimeo_hash": null, "durata_secondi": 526},
    {"titolo": "Lezione 05 - Cosa viene finanziato nel welfare", "vimeo_id": "1236864528", "vimeo_hash": null, "durata_secondi": 590},
    {"titolo": "Lezione 06 - Come orientarsi tra le opportunità di finanziamento", "vimeo_id": "1236864539", "vimeo_hash": null, "durata_secondi": 636}
  ]'::jsonb;
  v_corso uuid; v_ediz uuid; v_iscr uuid; v_lo uuid; v_str uuid;
  v_row jsonb; v_cfg jsonb; v_ord int := 0;
  v_actor jsonb;
begin
  v_actor := jsonb_build_object('persona_id', v_admin, 'type', 'persona');
  if exists (select 1 from public.edizione where tenant_id = v_tenant and codice = v_codice) then
    raise notice 'Edizione % già presente: nessuna modifica.', v_codice;
    return;
  end if;

  insert into public.corso (tenant_id, titolo, descrizione, sblocco_sequenziale)
  values (v_tenant, v_titolo, v_descr, true) returning id into v_corso;
  perform public.audit_append(v_tenant, 'corso.created', v_actor, 'corso', v_corso,
    jsonb_build_object('titolo', v_titolo, 'origine', 'seed corso_prova_video'));

  for v_row in select * from jsonb_array_elements(v_video) loop
    v_ord := v_ord + 1;
    if (v_row->>'vimeo_id') !~ '^\d{5,}$' then
      raise exception 'vimeo_id non valido per "%": % (serve l''ID numerico)', v_row->>'titolo', v_row->>'vimeo_id';
    end if;
    v_cfg := jsonb_build_object('vimeo_id', v_row->>'vimeo_id', 'durata_secondi', (v_row->>'durata_secondi')::int);
    if coalesce(v_row->>'vimeo_hash', '') <> '' then
      v_cfg := v_cfg || jsonb_build_object('vimeo_hash', lower(v_row->>'vimeo_hash'));
    end if;
    insert into public.learning_object (tenant_id, type, titolo, config)
    values (v_tenant, 'video', v_row->>'titolo', v_cfg) returning id into v_lo;
    perform public.audit_append(v_tenant, 'learning_object.created', v_actor, 'learning_object', v_lo,
      jsonb_build_object('type', 'video', 'titolo', v_row->>'titolo'));

    insert into public.struttura_corso (tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento)
    values (v_tenant, v_corso, v_lo, v_ord, true, '{"tipo":"video_ended"}'::jsonb) returning id into v_str;
    perform public.audit_append(v_tenant, 'struttura.added', v_actor, 'struttura_corso', v_str,
      jsonb_build_object('corso_id', v_corso, 'learning_object_id', v_lo, 'ordine', v_ord));
  end loop;

  insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine)
  values (v_tenant, v_corso, v_codice, current_date, current_date + 90) returning id into v_ediz;
  perform public.audit_append(v_tenant, 'edizione.created', v_actor, 'edizione', v_ediz,
    jsonb_build_object('corso_id', v_corso, 'codice', v_codice));

  insert into public.iscrizione (tenant_id, persona_id, edizione_id)
  values (v_tenant, v_discente, v_ediz) returning id into v_iscr;
  perform public.audit_append(v_tenant, 'iscrizione.created', v_actor, 'iscrizione', v_iscr,
    jsonb_build_object('edizione_id', v_ediz, 'persona_id', v_discente));

  raise notice 'Creato corso % (%), edizione % (%), % video, iscrizione discente %', v_titolo, v_corso, v_codice, v_ediz, v_ord, v_iscr;
end $$;
