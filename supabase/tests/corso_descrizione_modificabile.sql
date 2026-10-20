-- Descrizione modificabile a corso congelato (2026-10-20): `corso.descrizione`
-- non è più nel freeze D22 (tg_corso_freeze); titolo/categoria/sblocco/visione
-- integrale restano congelati. Gira come postgres; usa il corso demo congelato
-- c0c01111 (1 edizione). Eseguire in transazione (ROLLBACK finale).

begin;
create extension if not exists pgtap;

select plan(6);

-- 1) corso congelato: descrizione modificabile
select lives_ok(
  $$ update public.corso set descrizione = 'pgTAP descrizione nuova' where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '1 corso congelato: descrizione modificabile');
select is(
  (select descrizione from public.corso where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0'),
  'pgTAP descrizione nuova', '2 valore salvato');

-- 3-5) gli altri campi strutturali restano congelati
select throws_like(
  $$ update public.corso set titolo = 'pgTAP titolo' where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '%congelato%', '3 titolo ancora congelato');
select throws_like(
  $$ update public.corso set categoria = 'pgTAP cat' where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '%congelato%', '4 categoria ancora congelata');
select throws_like(
  $$ update public.corso set sblocco_sequenziale = not sblocco_sequenziale where id = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0' $$,
  '%congelato%', '5 sblocco sequenziale ancora congelato');

-- 6) la funzione trigger non è eseguibile da anon (hardening)
select ok(
  not has_function_privilege('anon', 'public.tg_corso_freeze()', 'execute'),
  '6 tg_corso_freeze non eseguibile da anon');

select * from finish();
rollback;
