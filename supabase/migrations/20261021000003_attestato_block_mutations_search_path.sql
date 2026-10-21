-- Advisor Supabase 0011 (function_search_path_mutable): la funzione trigger
-- `attestato_block_mutations` (write-once della tabella attestato, migration
-- 20261020000008) era l'unica senza search_path fisso. Nessun cambio di logica.
alter function public.attestato_block_mutations() set search_path = public;
