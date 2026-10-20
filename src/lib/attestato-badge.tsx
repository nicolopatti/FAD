import { ImageResponse } from 'next/og';
import { qrDataUrl, dataBreve, oreLabel } from './attestato-pdf';
import { urlVerifica } from './url';
import type { AttestatoContenuto } from './attestati';
import type { AttestatoRow } from './db-types';

/**
 * Badge PNG dell'attestato (1200×1200, o 1200×630 per i post) generato dallo
 * snapshot con ImageResponse. Non è un Open Badge: è un'immagine da pubblicare
 * su LinkedIn, la cui autenticità si verifica col QR/codice. Solo lato server.
 */
export async function badgeResponse(att: AttestatoRow, formato: 'quadrato' | 'post'): Promise<Response> {
  const c = att.contenuto as unknown as AttestatoContenuto;
  const qr = await qrDataUrl(urlVerifica(att.codice_verifica), 400);
  const W = 1200;
  const post = formato === 'post';
  const H = post ? 630 : 1200;
  const nome = `${c.discente.nome} ${c.discente.cognome}`.trim();
  const ore = oreLabel(c.corso.ore_totali);
  const nomeFile = `badge-${att.numero.replace('/', '-')}${post ? '-post' : ''}.png`;
  const frase = c.criterio_idoneita === 'frequenza'
    ? 'ha frequentato con esito positivo'
    : c.test?.superato ? 'ha completato e superato la verifica finale di' : 'ha completato';

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#16326c', color: '#fff', fontFamily: 'sans-serif', padding: post ? 44 : 72, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: 10, background: '#7cf0c3', display: 'flex' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: post ? 22 : 28, color: '#b9c7f5' }}>Attestato di formazione</div>
            <div style={{ fontSize: post ? 30 : 40, fontWeight: 700 }}>{c.ente.ragione_sociale}</div>
          </div>
          <div style={{ fontSize: post ? 20 : 26, color: '#7cf0c3', fontWeight: 700 }}>{`n. ${att.numero}`}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, marginTop: post ? 16 : 40 }}>
          <div style={{ fontSize: post ? 36 : 48, fontWeight: 700 }}>{nome}</div>
          <div style={{ fontSize: post ? 22 : 28, color: '#b9c7f5', marginTop: 10 }}>{frase}</div>
          <div style={{ fontSize: post ? 44 : 60, fontWeight: 700, lineHeight: 1.1, marginTop: 8, maxWidth: W - (post ? 400 : 480) }}>{c.corso.titolo}</div>
          <div style={{ fontSize: post ? 20 : 26, color: '#d7e0fb', marginTop: 16 }}>{[ore, c.corso.riferimento_normativo, dataBreve(att.emesso_at)].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ position: 'absolute', right: post ? 44 : 72, bottom: post ? 44 : 72, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={post ? 180 : 300} height={post ? 180 : 300} style={{ borderRadius: 18 }} alt="" />
          <div style={{ fontSize: post ? 14 : 18, color: '#b9c7f5', marginTop: 10 }}>verifica l&apos;autenticità</div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { 'content-disposition': `inline; filename="${nomeFile}"`, 'cache-control': 'private, max-age=0' } },
  );
}
