import { createSupabaseServiceClient } from './supabase/service';
import { generaAttestatoPdf, pathImmagini, type Immagini } from './attestato-pdf';
import type { AttestatoContenuto } from './attestati';
import type { AttestatoRow } from './db-types';
import { urlLogo } from './url';

type Service = ReturnType<typeof createSupabaseServiceClient>;

function servizio(): Service | null {
  try { return createSupabaseServiceClient(); } catch { return null; }
}

/** Un'immagine dal bucket pubblico `loghi` (URL pubblico: nessuna chiave richiesta). */
export async function immagineLoghi(path: string): Promise<Uint8Array | null> {
  const url = urlLogo(path);
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** Tutte le immagini che il modello dello snapshot richiede (logo, loghi secondari, firme). */
export async function immaginiPer(c: AttestatoContenuto): Promise<Immagini> {
  const out: Immagini = {};
  await Promise.all(Array.from(new Set(pathImmagini(c))).map(async (p) => { out[p] = await immagineLoghi(p); }));
  return out;
}

/**
 * Risposta HTTP con il PDF dell'attestato. Il file è una resa dello snapshot:
 * la prima volta si genera e si salva nel bucket privato `attestati` (service
 * role) al path deterministico `pdf_path`; poi si serve da lì. Se lo Storage
 * non risponde si genera comunque al volo. L'autorizzazione è del chiamante.
 */
export async function rispostaPdf(att: AttestatoRow): Promise<Response> {
  const nomeFile = `attestato-${att.numero.replace('/', '-')}.pdf`;
  const headers = { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${nomeFile}"`, 'cache-control': 'private, max-age=0' };
  const service = servizio();
  if (service) {
    const { data } = await service.storage.from('attestati').download(att.pdf_path);
    if (data) return new Response(Buffer.from(await data.arrayBuffer()), { headers });
  }
  const c = att.contenuto as unknown as AttestatoContenuto;
  const bytes = await generaAttestatoPdf(c, await immaginiPer(c));
  if (service) {
    await service.storage.from('attestati').upload(att.pdf_path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: true }).catch(() => null);
  }
  return new Response(Buffer.from(bytes), { headers });
}
