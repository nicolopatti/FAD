-- Stress test 21/10 — R1 (D10): il rilascio dell'attestato richiede di default
-- l'approvazione umana. I corsi nuovi nascono con politica 'manuale';
-- 'automatica' resta disponibile ma va scelta esplicitamente. I corsi esistenti
-- non cambiano (per quelli con edizioni la politica è congelata, D22).
alter table public.corso alter column politica_attestato set default 'manuale';
