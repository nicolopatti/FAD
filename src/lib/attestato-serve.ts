import { createSupabaseServiceClient } from './supabase/service';
import { generaAttestatoPdf } from './attestato-pdf';
import type { AttestatoContenuto } from './attestati';
import type { AttestatoRow } from './db-types';

type Service = ReturnType<typeof createSupabaseServiceClient>;

function servizio(): Service | null {
  try { return createSupabaseServiceClient(); } catch { return null; }
}

/** Logo e firma dell'ente dal bucket pubblico `loghi` (se impostati). */
export async function immaginiEnte(service: Service | null, c: AttestatoContenuto) {
  const out: { logo?: Uint8Array | null; firma?: Uint8Array | null } = {};
  if (!service) return out;
  const prendi = async (path: string | null) => {
    if (!path) return null;
    const { data } = await service.storage.from('loghi').download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };
  out.logo = await prendi(c.ente.logo_path).catch(() => null);
  out.firma = await prendi(c.ente.firma_path).catch(() => null);
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
  const bytes = await generaAttestatoPdf(c, await immaginiEnte(service, c));
  if (service) {
    await service.storage.from('attestati').upload(att.pdf_path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: true }).catch(() => null);
  }
  return new Response(Buffer.from(bytes), { headers });
}
