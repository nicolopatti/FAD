-- Blocco B (solidità sotto carico) — 2026-10-19
-- Indici di espressione su `evento` per i ricalcoli di compliance (D8).
-- Prima: `computeProgressoForIscrizione` leggeva gli eventi di completamento di
-- TUTTI i discenti sugli LO del corso e filtrava l'attore in JavaScript (costo
-- O(iscritti) per ogni richiesta del player); `computeFrequenzaForIscrizione`
-- filtrava `payload->>iscrizione_id` senza indice (scansione completa).
-- Nessuna colonna nuova sulla tabella append-only: hash e canonical restano
-- invariati. Gli indici coprono esattamente i filtri PostgREST usati da
-- compliance.ts (`actor->>persona_id = …`, `payload->>iscrizione_id = …`).
create index if not exists evento_actor_persona_idx
  on public.evento ((actor->>'persona_id'), event_type, subject_id);
create index if not exists evento_payload_iscrizione_idx
  on public.evento ((payload->>'iscrizione_id'), event_type);
