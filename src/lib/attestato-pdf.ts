import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { AttestatoContenuto } from './attestati';
import { urlVerifica } from './url';

/**
 * Resa PDF dell'attestato (Fase 5, Task 5): UNA pagina A4 orizzontale generata
 * dallo snapshot `contenuto` memorizzato nella tabella `attestato` (riproducibile:
 * stesso snapshot → stesso documento). Nessun dato è letto altrove: il PDF è
 * una vista del documento congelato. Solo lato server.
 */

const BLU = rgb(0x16 / 255, 0x32 / 255, 0x6c / 255);     // --deep
const ACCENTO = rgb(0x2f / 255, 0x5b / 255, 0xea / 255);
const MENTA = rgb(0x7c / 255, 0xf0 / 255, 0xc3 / 255);
const INCHIOSTRO = rgb(0x12 / 255, 0x1a / 255, 0x2e / 255);
const GRIGIO = rgb(0x5b / 255, 0x64 / 255, 0x78 / 255);
const BIANCO = rgb(1, 1, 1);

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function dataEstesa(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const g = parts.find((p) => p.type === 'day')?.value ?? '';
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
  const a = parts.find((p) => p.type === 'year')?.value ?? '';
  return `${g} ${MESI[m - 1]} ${a}`;
}

export function dataBreve(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function oreLabel(ore: number | null | undefined): string {
  if (ore == null || !Number.isFinite(ore) || ore <= 0) return '';
  const n = Math.round(ore * 100) / 100;
  return `${String(n).replace('.', ',')} or${n === 1 ? 'a' : 'e'}`;
}

/** Frase per "nato/a a … il …" (vuota se mancano i dati). */
export function nascitaLabel(c: AttestatoContenuto): string {
  const luogo = c.discente.luogo_nascita?.trim();
  const data = c.discente.data_nascita ? dataEstesa(c.discente.data_nascita) : '';
  if (!luogo && !data) return '';
  return `nato/a${luogo ? ` a ${luogo}` : ''}${data ? ` il ${data}` : ''}`;
}

export async function qrPng(testo: string, size = 360): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(testo, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: size, color: { dark: '#16326c', light: '#ffffff' } });
  return new Uint8Array(buf);
}

export async function qrDataUrl(testo: string, size = 360): Promise<string> {
  return QRCode.toDataURL(testo, { errorCorrectionLevel: 'M', margin: 1, width: size, color: { dark: '#16326c', light: '#ffffff' } });
}

type Immagini = { logo?: Uint8Array | null; firma?: Uint8Array | null };

async function embedImg(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    // PNG inizia con 0x89 'P' 'N' 'G'; altrimenti si prova JPEG.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): number {
  let s = size;
  while (s > 9 && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const prova = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(prova, size) <= maxWidth) cur = prova;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function centrato(page: PDFPage, font: PDFFont, text: string, size: number, y: number, color = INCHIOSTRO) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

// Le font standard (WinAnsi) non hanno alcuni caratteri: si normalizzano.
function pulisci(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–|—/g, '-').replace(/…/g, '...').replace(/[^\x00-\xff]/g, '?');
}

/** Genera il PDF (A4 orizzontale) dallo snapshot. */
export async function generaAttestatoPdf(c: AttestatoContenuto, immagini: Immagini = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Attestato ${c.numero ?? ''} - ${c.discente.cognome} ${c.discente.nome}`);
  doc.setAuthor(c.ente.ragione_sociale);
  doc.setSubject(c.corso.titolo);
  doc.setCreator('FAD');
  const page = doc.addPage([841.89, 595.28]);
  const W = page.getWidth();
  const H = page.getHeight();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const obl = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Banda blu in alto con ente + eventuale logo; cornice sottile.
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BLU });
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 4, color: MENTA });
  const logo = await embedImg(doc, immagini.logo);
  let xTesto = 48;
  if (logo) {
    const h = 56; const w = (logo.width / logo.height) * h;
    const wMax = Math.min(w, 160);
    page.drawImage(logo, { x: 48, y: H - 74, width: wMax, height: h * (wMax / w) });
    xTesto = 48 + wMax + 18;
  }
  page.drawText(pulisci(c.ente.ragione_sociale), { x: xTesto, y: H - 48, size: fitText(bold, pulisci(c.ente.ragione_sociale), 20, W - xTesto - 260), font: bold, color: BIANCO });
  if (c.ente.citta) page.drawText(pulisci(c.ente.citta), { x: xTesto, y: H - 68, size: 11, font: reg, color: rgb(0.8, 0.86, 1) });
  const numero = `Attestato n. ${c.numero ?? ''}`;
  page.drawText(numero, { x: W - 48 - bold.widthOfTextAtSize(numero, 12), y: H - 48, size: 12, font: bold, color: MENTA });
  const emessoIl = `emesso il ${dataBreve(c.emesso_il)}`;
  page.drawText(emessoIl, { x: W - 48 - reg.widthOfTextAtSize(emessoIl, 10), y: H - 66, size: 10, font: reg, color: rgb(0.8, 0.86, 1) });

  // Corpo.
  let y = H - 150;
  centrato(page, bold, 'Attestato di frequenza e superamento', 26, y, BLU);
  y -= 38;
  centrato(page, reg, 'Si attesta che', 13, y, GRIGIO);
  y -= 40;
  const nomeCompleto = pulisci(`${c.discente.nome} ${c.discente.cognome}`.trim());
  centrato(page, bold, nomeCompleto, fitText(bold, nomeCompleto, 32, W - 160), y, INCHIOSTRO);
  y -= 24;
  const nascita = pulisci(nascitaLabel(c));
  if (nascita) { centrato(page, reg, nascita, 12, y, GRIGIO); y -= 22; }
  else y -= 6;
  const ore = oreLabel(c.corso.ore_totali);
  const frase = c.criterio_idoneita === 'frequenza'
    ? `ha frequentato con esito positivo${ore ? ` (${ore})` : ''} il corso`
    : `ha completato${ore ? ` (${ore})` : ''}${c.test?.superato ? ' e superato la verifica finale del' : ' il'} corso`;
  centrato(page, reg, pulisci(frase), 13, y, GRIGIO);
  y -= 34;
  const titoloSize = fitText(bold, pulisci(c.corso.titolo), 22, W - 140);
  const righeTitolo = wrap(bold, pulisci(c.corso.titolo), titoloSize, W - 140).slice(0, 2);
  for (const r of righeTitolo) { centrato(page, bold, r, titoloSize, y, BLU); y -= titoloSize + 6; }
  y -= 6;
  const dettagli: string[] = [];
  if (c.corso.riferimento_normativo) dettagli.push(`Riferimento normativo: ${c.corso.riferimento_normativo}`);
  const periodo = [c.edizione.data_inizio ? dataBreve(c.edizione.data_inizio) : '', c.edizione.data_fine ? dataBreve(c.edizione.data_fine) : ''].filter(Boolean).join(' - ');
  dettagli.push(`Edizione ${c.edizione.codice}${periodo ? ` (${periodo})` : ''}${c.completato_il ? ` - percorso completato il ${dataBreve(c.completato_il)}` : ''}`);
  if (c.test) dettagli.push(`Verifica finale: ${c.test.superato ? 'superata' : 'non superata'}${c.test.percentuale != null ? ` con il ${String(c.test.percentuale).replace('.', ',')}% di risposte corrette` : ''}${c.test.soglia != null ? ` (soglia ${c.test.soglia}%)` : ''}`);
  if (c.frequenza) dettagli.push(`Frequenza: ${String(c.frequenza.percentuale).replace('.', ',')}% delle ore previste (soglia ${c.frequenza.soglia}%)`);
  for (const d of dettagli) {
    for (const r of wrap(reg, pulisci(d), 11, W - 200)) { centrato(page, reg, r, 11, y, GRIGIO); y -= 15; }
  }

  // Piè di pagina: firma a sinistra, QR + verifica a destra, hash al centro.
  const firma = await embedImg(doc, immagini.firma);
  const yFirma = 96;
  if (c.ente.firmatario_nome) {
    if (firma) {
      const h = 44; const w = Math.min((firma.width / firma.height) * h, 150);
      page.drawImage(firma, { x: 64, y: yFirma + 16, width: w, height: h * (w / ((firma.width / firma.height) * h)) });
    }
    page.drawLine({ start: { x: 56, y: yFirma + 12 }, end: { x: 276, y: yFirma + 12 }, thickness: 0.8, color: GRIGIO });
    page.drawText(pulisci(c.ente.firmatario_nome), { x: 56, y: yFirma - 4, size: 11, font: bold, color: INCHIOSTRO });
    if (c.ente.firmatario_ruolo) page.drawText(pulisci(c.ente.firmatario_ruolo), { x: 56, y: yFirma - 18, size: 10, font: reg, color: GRIGIO });
  }
  const luogoData = pulisci(`${c.ente.citta ? `${c.ente.citta}, ` : ''}${dataEstesa(c.emesso_il)}`);
  page.drawText(luogoData, { x: 56, y: 40, size: 10, font: obl, color: GRIGIO });

  if (c.codice_verifica) {
    const url = urlVerifica(c.codice_verifica);
    const qr = await doc.embedPng(await qrPng(url, 300));
    const lato = 96;
    page.drawImage(qr, { x: W - 56 - lato, y: 44, width: lato, height: lato });
    const t1 = pulisci('Verifica l\'autenticità inquadrando il codice');
    const t2 = url.replace(/^https?:\/\//, '');
    page.drawText(t1, { x: W - 56 - lato - 8 - reg.widthOfTextAtSize(t1, 9), y: 120, size: 9, font: reg, color: GRIGIO });
    page.drawText(t2, { x: W - 56 - lato - 8 - reg.widthOfTextAtSize(t2, 8.5), y: 106, size: 8.5, font: reg, color: ACCENTO });
  }
  if (c.attestato_id) {
    const impronta = `Documento congelato ${c.attestato_id.slice(0, 8)} - registro integro al n. ${c.registro.seq ?? '-'}`;
    page.drawText(impronta, { x: 56, y: 24, size: 7.5, font: reg, color: rgb(0.62, 0.65, 0.72) });
  }

  return doc.save();
}
