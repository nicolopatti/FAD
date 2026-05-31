-- Fix D22 — congela davvero `categoria`
-- =====================================
-- La migration 20260531000001 aveva riscritto `corso_freeze_guard`, ma il
-- trigger reale installato in Fase 2 (20260522000004) è `corso_freeze` →
-- funzione `public.tg_corso_freeze`. Quindi l'aggiunta di `categoria` ai campi
-- congelati era finita in una funzione NON agganciata (dead code) e `categoria`
-- restava di fatto modificabile a corso congelato.
--
-- Qui aggiorniamo la funzione realmente usata dal trigger e rimuoviamo la
-- funzione spuria. Nessun cambiamento di firma/trigger: solo il corpo.

begin;

create or replace function public.tg_corso_freeze()
returns trigger
language plpgsql
as $$
begin
  if public.helper_corso_has_edizioni(NEW.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.descrizione is distinct from OLD.descrizione
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.categoria is distinct from OLD.categoria then
      raise exception 'Corso % è congelato (D22): i campi strutturali (titolo, descrizione, categoria, sblocco) non sono modificabili', NEW.id
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

-- rimuove la funzione spuria introdotta per errore in 20260531000001
drop function if exists public.corso_freeze_guard();

commit;
