-- Visione integrale per corso (2026-10-20) — decisione ratificata con l'utente.
-- Due casistiche: corsi FINANZIATI → un video conta come completato solo se il
-- discente lo ha riprodotto davvero (copertura dei tratti visti ≥ soglia, oltre
-- a `video.ended`, e il player non permette di saltare avanti); corsi a MERCATO
-- → libertà di fruizione, basta `video.ended` (comportamento di sempre, D26).
-- L'impostazione è una spunta per corso, spenta di default. È un campo
-- STRUTTURALE: congelato con D22 insieme a titolo/descrizione/sblocco/categoria.
-- La copertura si ricalcola dagli Eventi (`payload.segmenti_visti` inviati dal
-- player in pause/seek/ended), mai da colonne-cache (D8).

alter table public.corso
  add column if not exists visione_integrale boolean not null default false;

comment on column public.corso.visione_integrale is
  'Se true, un LO video è completato solo con copertura dei tratti riprodotti ≥ soglia (95%) oltre a video.ended; il player impedisce di saltare avanti. Campo strutturale (D22).';

-- Il corso di prova a 6 video (creato il 2026-10-20) serve a verificare proprio
-- questo vincolo: lo attiviamo PRIMA di estendere il trigger di congelamento,
-- che altrimenti lo rifiuterebbe (il corso ha già un'edizione).
update public.corso set visione_integrale = true
 where id = '45ce11f0-38c3-40e1-83df-2d8a7c7a6777';

create or replace function public.tg_corso_freeze()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.helper_corso_has_edizioni(NEW.id) then
    if NEW.titolo is distinct from OLD.titolo
       or NEW.descrizione is distinct from OLD.descrizione
       or NEW.sblocco_sequenziale is distinct from OLD.sblocco_sequenziale
       or NEW.categoria is distinct from OLD.categoria
       or NEW.visione_integrale is distinct from OLD.visione_integrale then
      raise exception 'Corso % è congelato (D22): i campi strutturali (titolo, descrizione, categoria, sblocco, visione integrale) non sono modificabili', NEW.id
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;
revoke execute on function public.tg_corso_freeze() from public, anon, authenticated;
