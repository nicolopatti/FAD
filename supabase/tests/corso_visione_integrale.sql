-- Visione integrale per corso (2026-10-20): colonna `corso.visione_integrale`,
-- default false, campo strutturale congelato con D22 (tg_corso_freeze).
-- Gira come postgres; usa il corso demo congelato c0c01111 (1 edizione).
-- Eseguire via psql o MCP execute_sql in transazione (ROLLBACK finale).

begin;
create extension if not exists pgtap;

select plan(5);

select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'corso' and column_name = 'visione_integrale'),
  'false', '1 default false');

-- 2) corso in bozza: modificabile
do $$ declare v uuid; begin
  insert into public.corso (tenant_id, titolo) values ('00000000-0000-0000-0000-000000000001', 'pgTAP bozza VI') returning id into v;
  perform set_config('vi.bozza', v::text, true);
end $$;
select lives_ok(
  format($$ update public.corso set visione_integrale = true where id = %L $$, current_setting('vi.bozza')),
  '2 corso in bozza: visione_integrale modificabile');
select is((select visione_integrale from public.corso where id = current_setting('vi.bozza')::uuid), true, '3 valore salvato');

-- 4) corso congelato: rifiutato
select throws_like(
  $$ update public.corso set visione_integrale = true where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '%congelato%', '4 corso congelato (D22): visione_integrale non modificabile');

-- 5) la funzione trigger ha search_path fissato (hardening 0011)
select ok(
  (select proconfig is not null from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'tg_corso_freeze'),
  '5 tg_corso_freeze mantiene search_path dopo la ridefinizione');

select * from finish();
rollback;
