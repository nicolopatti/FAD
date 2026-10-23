-- Fase 6 — sconti a tempo e offerte chiuse nel catalogo. Gira come postgres dentro
-- un DO block che finisce con RAISE EXCEPTION 'ROLLBACK_RESULTS: …': tutto viene
-- annullato (senza istruzioni distruttive, trabocchetto #13). Usa il corso demo di
-- ED-001 e un'edizione di prova già chiusa creata qui. Esito atteso: tutte "ok".
do $$
declare
  r text := '';
  t constant uuid := '00000000-0000-0000-0000-000000000001';
  ed constant uuid := 'ed011111-ed01-ed01-ed01-ed01ed01ed01';
  corso constant uuid := 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0';
  oggi date := (now() at time zone 'Europe/Rome')::date;
  v_off uuid;
  v_off_chiusa uuid;
  v_ed_chiusa uuid;
  v_persona uuid;
  v_res jsonb;
  v_cat jsonb;
  v_riga jsonb;
  v_ord public.ordine;
  v_n int;
begin
  insert into public.tenant_dominio (host, tenant_id) values ('negozio-sconti.example', t);
  insert into public.offerta (tenant_id, edizione_id, slug, stato, prezzo_centesimi, accesso_giorni, pubblicata_il)
  values (t, ed, 'prova-sconti-f6', 'pubblicata', 4900, 30, now()) returning id into v_off;

  -- 1-4) Validazione degli sconti nel trigger.
  begin
    update public.offerta set sconti = jsonb_build_array(jsonb_build_object('dal', oggi, 'al', oggi + 5, 'prezzo_centesimi', 4900)) where id = v_off;
    r := r || '1 FAIL prezzo uguale al listino accettato; ';
  exception when others then r := r || case when sqlerrm like '%minore del prezzo di listino%' then '1 ok prezzo scontato ≥ listino rifiutato; ' else '1 FAIL ' || sqlerrm || '; ' end;
  end;
  begin
    update public.offerta set sconti = jsonb_build_array(jsonb_build_object('dal', oggi + 5, 'al', oggi, 'prezzo_centesimi', 3900)) where id = v_off;
    r := r || '2 FAIL fine prima dell''inizio accettata; ';
  exception when others then r := r || case when sqlerrm like '%fine prima%' then '2 ok fine prima dell''inizio rifiutata; ' else '2 FAIL ' || sqlerrm || '; ' end;
  end;
  begin
    update public.offerta set sconti = jsonb_build_array(
      jsonb_build_object('dal', oggi, 'al', oggi + 10, 'prezzo_centesimi', 3900),
      jsonb_build_object('dal', oggi + 10, 'al', oggi + 20, 'prezzo_centesimi', 4500)) where id = v_off;
    r := r || '3 FAIL sovrapposizione accettata; ';
  exception when others then r := r || case when sqlerrm like '%sovrappongono%' then '3 ok periodi sovrapposti rifiutati; ' else '3 FAIL ' || sqlerrm || '; ' end;
  end;
  begin
    update public.offerta set sconti = jsonb_build_array(jsonb_build_object('dal', '22/10/2026', 'al', oggi, 'prezzo_centesimi', 3900)) where id = v_off;
    r := r || '4 FAIL data non ISO accettata; ';
  exception when others then r := r || case when sqlerrm like '%sconto non valido%' then '4 ok data non ISO rifiutata; ' else '4 FAIL ' || sqlerrm || '; ' end;
  end;

  -- 5) Sconto futuro: oggi vale il listino.
  update public.offerta set sconti = jsonb_build_array(
    jsonb_build_object('dal', oggi + 3, 'al', oggi + 9, 'prezzo_centesimi', 3500, 'etichetta', 'Ultimi giorni')) where id = v_off;
  v_riga := (select x from jsonb_array_elements(public.catalogo_pubblico('negozio-sconti.example') -> 'offerte') x where x ->> 'slug' = 'prova-sconti-f6');
  r := r || case when (v_riga ->> 'prezzo_centesimi')::int = 4900 and v_riga -> 'listino_centesimi' = 'null'::jsonb
                  then '5 ok sconto futuro: oggi listino; ' else '5 FAIL ' || coalesce(v_riga::text, 'null') || '; ' end;

  -- 6-7) Sconto attivo oggi + uno futuro: prezzo del giorno, listino barrato, etichetta, fine.
  update public.offerta set sconti = jsonb_build_array(
    jsonb_build_object('dal', oggi - 1, 'al', oggi + 2, 'prezzo_centesimi', 3900, 'etichetta', 'Lancio'),
    jsonb_build_object('dal', oggi + 3, 'al', oggi + 9, 'prezzo_centesimi', 4400)) where id = v_off;
  v_riga := (select x from jsonb_array_elements(public.catalogo_pubblico('negozio-sconti.example') -> 'offerte') x where x ->> 'slug' = 'prova-sconti-f6');
  r := r || case when (v_riga ->> 'prezzo_centesimi')::int = 3900 and (v_riga ->> 'listino_centesimi')::int = 4900
                  and v_riga ->> 'sconto_etichetta' = 'Lancio' and v_riga ->> 'sconto_fino_al' = (oggi + 2)::text
                  then '6 ok catalogo: prezzo scontato, listino, etichetta e scadenza; ' else '6 FAIL ' || coalesce(v_riga::text, 'null') || '; ' end;
  v_cat := public.catalogo_offerta('negozio-sconti.example', 'prova-sconti-f6');
  r := r || case when (v_cat ->> 'prezzo_centesimi')::int = 3900 and (v_cat ->> 'listino_centesimi')::int = 4900
                  then '7 ok scheda: prezzo scontato e listino; ' else '7 FAIL; ' end;

  -- 8-9) L'ordine prende il prezzo del giorno e conserva listino e sconto.
  insert into public.persona (tenant_id, nome, cognome, email) values (t, 'Sara', 'Sconto', 'sconto-test-f6@fad.local') returning id into v_persona;
  v_res := public.ordine_crea(v_persona, v_off, '{"tipo":"privato","codice_fiscale":"SCNSRA80A41F205X"}'::jsonb, '{"termini":"v","recesso":"v"}'::jsonb);
  select * into v_ord from public.ordine where id = (v_res ->> 'ordine_id')::uuid;
  r := r || case when v_ord.importo_centesimi = 3900 and v_ord.listino_centesimi = 4900 and v_ord.sconto_tempo_centesimi = 1000
                  and v_ord.sconto_tempo_etichetta = 'Lancio' and (v_res ->> 'importo_centesimi')::int = 3900
                  then '8 ok ordine al prezzo scontato con listino e sconto; ' else '8 FAIL ' || v_res::text || '; ' end;
  select count(*) into v_n from public.evento
  where subject_id = v_ord.id and event_type = 'ordine.created'
    and (payload ->> 'sconto_a_tempo')::boolean and (payload ->> 'listino_centesimi')::int = 4900
    and payload::text not ilike '%sconto-test-f6%' and payload::text not ilike '%SCNSRA%';
  r := r || case when v_n = 1 then '9 ok Evento ordine.created con sconto, senza dati personali; ' else '9 FAIL; ' end;

  -- 10-13) Edizione chiusa: fuori dall'elenco, salvo scelta; la scheda resta raggiungibile.
  insert into public.edizione (tenant_id, corso_id, codice, data_inizio, data_fine)
  values (t, corso, 'TEST-F6-CHIUSA', date '2026-01-10', date '2026-02-10') returning id into v_ed_chiusa;
  insert into public.offerta (tenant_id, edizione_id, slug, stato, prezzo_centesimi, accesso_giorni, pubblicata_il)
  values (t, v_ed_chiusa, 'prova-chiusa-f6', 'pubblicata', 2900, 30, now()) returning id into v_off_chiusa;
  v_cat := public.catalogo_pubblico('negozio-sconti.example');
  r := r || case when not exists (select 1 from jsonb_array_elements(v_cat -> 'offerte') x where x ->> 'slug' = 'prova-chiusa-f6')
                  then '10 ok edizione chiusa: fuori dall''elenco (predefinito); ' else '10 FAIL; ' end;
  update public.offerta set chiusa_visibile = true where id = v_off_chiusa;
  v_riga := (select x from jsonb_array_elements(public.catalogo_pubblico('negozio-sconti.example') -> 'offerte') x where x ->> 'slug' = 'prova-chiusa-f6');
  r := r || case when v_riga is not null and not (v_riga ->> 'in_vendita')::boolean and v_riga ->> 'motivo' = 'edizione chiusa'
                  then '11 ok scelta "lascia nel catalogo": visibile con iscrizioni chiuse; ' else '11 FAIL ' || coalesce(v_riga::text, 'null') || '; ' end;
  update public.offerta set chiusa_visibile = false where id = v_off_chiusa;
  v_cat := public.catalogo_offerta('negozio-sconti.example', 'prova-chiusa-f6');
  r := r || case when v_cat is not null and v_cat ->> 'motivo' = 'edizione chiusa' and not (v_cat ->> 'in_vendita')::boolean
                  then '12 ok scheda raggiungibile dal link con iscrizioni chiuse; ' else '12 FAIL; ' end;
  -- "non ancora aperta" resta nell'elenco anche senza la scelta (è un annuncio).
  update public.offerta set vendita_dal = oggi + 30 where id = v_off;
  v_riga := (select x from jsonb_array_elements(public.catalogo_pubblico('negozio-sconti.example') -> 'offerte') x where x ->> 'slug' = 'prova-sconti-f6');
  r := r || case when v_riga is not null and v_riga ->> 'motivo' = 'vendita non ancora aperta'
                  then '13 ok vendita non ancora aperta: resta in elenco; ' else '13 FAIL; ' end;

  -- 14) Nessuna funzione nuova eseguibile da anon.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('offerta_sconto_attivo', 'offerta_chiusa_definitiva')
    and has_function_privilege('anon', p.oid, 'execute');
  r := r || case when v_n = 0 then '14 ok funzioni nuove non eseguibili da anon; ' else '14 FAIL; ' end;

  raise exception 'ROLLBACK_RESULTS: %', r;
end $$;
