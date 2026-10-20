-- Ondata C (scala): archiviazione corsi, categorie, partita IVA unica + unione
-- aziende (RPC), viste di riepilogo. Gira sul live in transazione con ROLLBACK
-- dopo la migration 20261021000002 (già applicata: qui si verificano solo gli
-- effetti). MCP execute_sql: esiti in una temp table con grant ad authenticated
-- perché i test cambiano ruolo. Verificato 10/10 sul live il 2026-10-21.
-- Le due aziende di prova usano una P.IVA diversa da quella della demo.

begin;
create temp table esiti(n int, nome text, ok boolean, dettaglio text);
grant all on esiti to authenticated;
-- 1 viste e stati
insert into esiti select 1, 'corso_riepilogo = n corsi', (select count(*) from public.corso_riepilogo) = (select count(*) from public.corso), (select string_agg(titolo||':'||stato||':'||n_lezioni||'/'||n_edizioni||'/'||n_iscritti||'/'||durata_sec, ' | ') from public.corso_riepilogo);
insert into esiti select 2, 'edizione_riepilogo', (select count(*) from public.edizione_riepilogo) = (select count(*) from public.edizione), (select string_agg(codice||':'||stato||':'||n_iscritti||'/'||n_con_piano||'/'||n_sessioni||'/'||n_da_riconciliare||'/'||n_attestati||'/'||n_incarichi, ' | ') from public.edizione_riepilogo);
insert into esiti select 3, 'persona_riepilogo', (select count(*) from public.persona_riepilogo) = (select count(*) from public.persona), (select string_agg(cognome||':'||n_iscrizioni||'/'||n_attestati||'/'||n_incarichi||'/'||accesso, ' | ') from (select * from public.persona_riepilogo where n_iscrizioni > 0 order by n_iscrizioni desc limit 6) x);
insert into esiti select 4, 'categorie seed', (select count(*) from public.categoria where tenant_id = '00000000-0000-0000-0000-000000000001') = 5, (select string_agg(nome, ',' order by ordine) from public.categoria where tenant_id = '00000000-0000-0000-0000-000000000001');
-- 5 archiviazione non congelata: il corso a 6 video è attivo
update public.corso set archiviato_at = now() where id = '45ce11f0-38c3-40e1-83df-2d8a7c7a6777';
insert into esiti select 5, 'archiviato_at su corso congelato ammesso, stato archiviato', (select stato from public.corso_riepilogo where id = '45ce11f0-38c3-40e1-83df-2d8a7c7a6777') = 'archiviato', null;
update public.corso set archiviato_at = null where id = '45ce11f0-38c3-40e1-83df-2d8a7c7a6777';
-- 6-9 unione aziende sotto JWT admin
insert into public.azienda (id, tenant_id, ragione_sociale, partita_iva) values ('c0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Alfa Srl', '09876543210'), ('c0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'ALFA S.R.L.', null);
insert into esiti select 6, 'partita IVA doppia rifiutata', false, null; 
do $$ begin
  begin
    insert into public.azienda (tenant_id, ragione_sociale, partita_iva) values ('00000000-0000-0000-0000-000000000001', 'Doppia', '09876543210');
    update esiti set ok = false, dettaglio = 'inserita' where n = 6;
  exception when unique_violation then update esiti set ok = true where n = 6; end;
end $$;
update public.iscrizione set azienda_id = 'c0000000-0000-4000-8000-000000000002' where id in (select id from public.iscrizione where tenant_id = '00000000-0000-0000-0000-000000000001' limit 2);
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}';
insert into esiti select 7, 'admin vede corso_riepilogo', (select count(*) from public.corso_riepilogo) > 0, (select count(*)::text from public.corso_riepilogo);
insert into esiti select 8, 'azienda_unisci da admin', (public.azienda_unisci('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', null)->>'n_iscrizioni') = '2', null;
reset role;
insert into esiti select 9, 'azienda doppia sparita, iscrizioni spostate, evento', (select count(*) from public.azienda where id = 'c0000000-0000-4000-8000-000000000002') = 0 and (select count(*) from public.iscrizione where azienda_id = 'c0000000-0000-4000-8000-000000000001') = 2 and (select count(*) from public.evento where event_type = 'azienda.unita' and subject_id = 'c0000000-0000-4000-8000-000000000001') = 1, (select payload::text from public.evento where event_type = 'azienda.unita' limit 1);
-- 10 anon non esegue nulla di nuovo
insert into esiti select 10, 'anon senza EXECUTE/SELECT', not has_function_privilege('anon', 'public.azienda_unisci(uuid,uuid,uuid)', 'execute') and not has_table_privilege('anon', 'public.corso_riepilogo', 'select'), null;
select n, nome, ok, left(dettaglio, 400) from esiti order by n;

rollback;
