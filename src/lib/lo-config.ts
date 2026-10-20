import type { DocumentoConfig, VideoConfig } from '@/lib/db-types';
import { parseVimeoRef } from '@/lib/vimeo';

/**
 * Validazione della configurazione di un contenuto (video, documento):
 * condivisa dalla creazione e dalla sostituzione di video o file.
 */
export function validateVideoConfig(c: Record<string, unknown>): VideoConfig | string {
  const durata = c.durata_secondi;
  // Si accetta l'ID numerico o un link Vimeo; si salva sempre l'ID (+ hash).
  const ref = parseVimeoRef(c.vimeo_id);
  if (!ref) {
    return 'config.vimeo_id non valido: serve l\'ID numerico o il link del video Vimeo (non di una cartella)';
  }
  if (typeof durata !== 'number' || !Number.isFinite(durata) || durata <= 0) {
    return 'config.durata_secondi non valido';
  }
  const out: VideoConfig = { vimeo_id: ref.vimeo_id, durata_secondi: Math.round(durata) };
  const hash = ref.vimeo_hash ?? (typeof c.vimeo_hash === 'string' ? c.vimeo_hash.trim() : '');
  if (hash) out.vimeo_hash = hash;
  return out;
}

export function validateDocumentoConfig(c: Record<string, unknown>, tenantId: string): DocumentoConfig | string {
  const storageKey = c.storage_key;
  const mime = c.mime;
  const size = c.size;
  const filename = c.filename;
  if (typeof storageKey !== 'string' || !storageKey.startsWith(`${tenantId}/`)) {
    return 'config.storage_key deve iniziare con tenant_id/';
  }
  if (mime !== 'application/pdf') {
    return 'config.mime deve essere application/pdf';
  }
  if (typeof size !== 'number' || size <= 0) {
    return 'config.size non valido';
  }
  const out: DocumentoConfig = { storage_key: storageKey, mime, size };
  if (typeof filename === 'string' && filename.trim() !== '') {
    out.filename = filename.trim();
  }
  return out;
}
