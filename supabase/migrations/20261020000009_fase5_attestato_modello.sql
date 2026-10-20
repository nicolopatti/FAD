-- Fase 5 — modello dell'attestato (editor per ente e per corso).
--
-- `tenant.attestato_modello`: impostazioni predefinite dell'ente (layout, testi,
-- loghi, firmatari, campi da mostrare). `corso.attestato_modello`: le stesse
-- impostazioni, parziali, che sostituiscono quelle dell'ente per quel corso
-- (NULL = usa le predefinite). La forma è validata e risolta dal server
-- (src/lib/attestato-modello.ts); lo snapshot di ogni attestato porta il
-- modello risolto al momento dell'emissione (documento riproducibile).
-- NON è un campo strutturale: resta modificabile a corso congelato (vale per
-- gli attestati emessi da quel momento in poi). Nessuna funzione nuova.

alter table public.tenant add column if not exists attestato_modello jsonb;
alter table public.corso add column if not exists attestato_modello jsonb;

comment on column public.tenant.attestato_modello is 'Modello predefinito dell''attestato (layout, testi, loghi, firmatari, campi). Forma in src/lib/attestato-modello.ts.';
comment on column public.corso.attestato_modello is 'Modello dell''attestato specifico del corso: sostituisce i campi del modello dell''ente. NULL = predefinito. Non congelato (D22).';
