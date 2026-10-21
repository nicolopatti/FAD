-- Stress test 21/10 — B1: date dell'edizione coerenti anche nel DB, con le
-- stesse regole di erroriDateEdizione (src/lib/validazione.ts):
--   fine ≥ inizio; chiusura FAD ≥ apertura FAD; apertura FAD ≤ fine;
--   chiusura FAD ≤ fine; chiusura FAD ≥ inizio. Un estremo vuoto non vincola.
-- Applicata dopo la pulizia (TEST-STRESS-01 era l'unica riga che la violava).
alter table public.edizione
  add constraint edizione_date_coerenti check (
    (data_inizio is null or data_fine is null or data_fine >= data_inizio)
    and (fad_apertura is null or fad_chiusura is null or fad_chiusura >= fad_apertura)
    and (fad_apertura is null or data_fine is null or fad_apertura <= data_fine)
    and (fad_chiusura is null or data_fine is null or fad_chiusura <= data_fine)
    and (fad_chiusura is null or data_inizio is null or fad_chiusura >= data_inizio)
  ) not valid;
alter table public.edizione validate constraint edizione_date_coerenti;
