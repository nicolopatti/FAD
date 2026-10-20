/**
 * Riferimenti Vimeo. L'admin può incollare l'ID numerico oppure un link in una
 * delle forme che Vimeo produce: la libreria salva SEMPRE l'ID numerico (più
 * l'eventuale hash di privacy dei video "non in elenco"), mai il link.
 *
 * Forme riconosciute (tutte → { vimeo_id, vimeo_hash? }):
 *   1084894652
 *   https://vimeo.com/1084894652
 *   https://vimeo.com/1084894652/9f3a1b2c4d           (non in elenco: hash)
 *   https://vimeo.com/1084894652?h=9f3a1b2c4d
 *   https://player.vimeo.com/video/1084894652?h=9f3a1b2c4d
 *   https://vimeo.com/manage/videos/1084894652
 *   https://vimeo.com/channels/xyz/1084894652 · /groups/xyz/videos/1084894652
 *   https://vimeo.com/reviews/<uuid>/videos/1084894652   (pagina di revisione)
 *
 * Un link di CARTELLA (…/folders/<n>) non identifica un video → null.
 * NB: i link "reviews" sono pagine di revisione, non embed: l'ID estratto è
 * quello del video, ma la riproduzione nel player dipende dalle impostazioni di
 * privacy del video (D5: dominio consentito) e, per i video non in elenco,
 * dall'hash, che la pagina di revisione non espone.
 */
export type VimeoRef = { vimeo_id: string; vimeo_hash?: string };

const ID_RE = /^\d{5,}$/;
const HASH_RE = /^[0-9a-f]{6,}$/i;

export function parseVimeoRef(input: unknown): VimeoRef | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return { vimeo_id: raw };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'vimeo.com' && !host.endsWith('.vimeo.com')) return null;

  const segs = url.pathname.split('/').filter(Boolean);
  // Il primo segmento interamente numerico (≥5 cifre) è l'ID del video; il
  // segmento successivo, se esadecimale, è l'hash di privacy.
  const idx = segs.findIndex((s) => ID_RE.test(s));
  if (idx === -1) return null;
  const prev = segs[idx - 1];
  // "…/folders/<n>" o "…/users/<n>" sono ID di cartella/utente, non di video.
  if (prev === 'folders' || prev === 'users' || prev === 'projects') return null;

  const out: VimeoRef = { vimeo_id: segs[idx] };
  const next = segs[idx + 1];
  if (next && HASH_RE.test(next)) out.vimeo_hash = next.toLowerCase();
  const h = url.searchParams.get('h');
  if (h && HASH_RE.test(h)) out.vimeo_hash = h.toLowerCase();
  return out;
}

/** URL dell'iframe del player (con `h` per i video non in elenco). */
export function vimeoEmbedUrl(
  vimeoId: string,
  vimeoHash?: string | null,
  opts: { bloccaVelocita?: boolean } = {},
): string {
  let url = `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}?dnt=1`;
  if (vimeoHash) url += `&h=${encodeURIComponent(vimeoHash)}`;
  // Visione integrale: nasconde il menu della velocità di riproduzione.
  if (opts.bloccaVelocita) url += '&speed=false';
  return url;
}
