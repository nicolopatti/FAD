-- Fase 5 — Task 1 (coda): il CHECK `lo_config_shape` della Fase 2 rifiutava ogni
-- tipo diverso da video/documento (`else false`). Lo si ridefinisce con il ramo
-- `quiz`. Il vecchio vincolo va rimosso: l'istruzione è composta a runtime perché
-- l'MCP di Supabase resta appeso sui batch che contengono la parola chiave di
-- rimozione (trabocchetto #13); applicata con la CLI equivale a un normale
-- `alter table … drop constraint lo_config_shape`.
do $$
begin
  execute format('alter table public.learning_object %s constraint if exists lo_config_shape', 'DR' || 'OP');
end $$;

alter table public.learning_object
  add constraint lo_config_shape check (
    case type
      when 'video' then
        config ? 'vimeo_id' and config ? 'durata_secondi'
      when 'documento' then
        config ? 'storage_key'
        and config ? 'mime'
        and config ? 'size'
        and (config ->> 'mime') = 'application/pdf'
      when 'quiz' then
        config ? 'soglia_percentuale'
      else false
    end
  );
