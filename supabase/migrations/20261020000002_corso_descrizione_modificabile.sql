-- Fase UX — la descrizione del corso non è più un campo strutturale (D22).
--
-- Decisione dell'utente (2026-10-20): il testo di presentazione che il discente
-- vede nella pagina del corso deve restare modificabile anche dopo la creazione
-- della prima Edizione, come già la copertina. Restano congelati i campi che
-- incidono su struttura e regole di fruizione: titolo, categoria, sblocco
-- sequenziale, visione integrale (il trigger `corso_freeze` è invariato nel
-- resto). Nessun cambiamento su `struttura_freeze`.
--
-- Nota: l'Evento `corso.updated` continua a portare solo titolo/sblocco/visione
-- integrale nel payload (niente testo libero nel log).

create or replace function public.tg_corso_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.helper_corso_has_edizioni(NEW.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.categoria is distinct from OLD.categoria
       or NEW.visione_integrale is distinct from OLD.visione_integrale then
      raise exception 'Corso % è congelato (D22): i campi strutturali (titolo, categoria, sblocco, visione integrale) non sono modificabili', NEW.id using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end; $$;

-- Regola di hardening (Tappa 1): nessuna funzione di `public` eseguibile da
-- anon/PUBLIC; le funzioni trigger nemmeno da authenticated (scattano comunque).
revoke execute on function public.tg_corso_freeze() from public, anon, authenticated;
