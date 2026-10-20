import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import type { AttestatoContenuto } from './attestati';
import { urlVerifica } from './url';
import { compilaTesto, risolviModello, type ModelloAttestato } from './attestato-modello';

/**
 * Resa PDF dell'attestato (Fase 5): UNA pagina A4 orizzontale generata dallo
 * snapshot `contenuto` memorizzato nella tabella `attestato` (riproducibile:
 * stesso snapshot → stesso documento) secondo il modello (layout, testi, loghi,
 * firmatari, campi) che lo snapshot porta con sé. Solo lato server.
 */

const BLU = rgb(0x16 / 255, 0x32 / 255, 0x6c / 255);
const ACCENTO = rgb(0x2f / 255, 0x5b / 255, 0xea / 255);
const MENTA = rgb(0x7c / 255, 0xf0 / 255, 0xc3 / 255);
const INCHIOSTRO = rgb(0x12 / 255, 0x1a / 255, 0x2e / 255);
const GRIGIO = rgb(0x5b / 255, 0x64 / 255, 0x78 / 255);
const GRIGIO_CHIARO = rgb(0.62, 0.65, 0.72);
const BIANCO = rgb(1, 1, 1);
const ORO = rgb(0.62, 0.5, 0.2);

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

/** Immagini del modello: path nel bucket `loghi` → byte (PNG o JPG). */
export type Immagini = Record<string, Uint8Array | null | undefined>;

async function embedImg(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number, min = 9): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const par of text.split(/\n+/)) {
    const words = par.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const prova = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(prova, size) <= maxWidth) cur = prova;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

// Le font standard (WinAnsi) non hanno alcuni caratteri: si normalizzano.
function pulisci(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–|—/g, '-').replace(/…/g, '...').replace(/[^\x00-\xff]/g, '?');
}

/** Modello usato dallo snapshot (gli attestati emessi prima dell'editor non lo hanno). */
export function modelloDi(c: AttestatoContenuto): ModelloAttestato {
  const m = (c as unknown as { modello?: unknown }).modello;
  return risolviModello(
    { ragione_sociale: c.ente.ragione_sociale, citta: c.ente.citta, firmatario_nome: c.ente.firmatario_nome, firmatario_ruolo: c.ente.firmatario_ruolo, logo_path: c.ente.logo_path, firma_path: c.ente.firma_path },
    null,
    m ?? null,
  );
}

/** Tutti i path immagine che la resa può usare. */
export function pathImmagini(c: AttestatoContenuto): string[] {
  const m = modelloDi(c);
  return [m.logo_path, ...m.loghi_secondari, ...m.firmatari.map((f) => f.firma_path)].filter((p): p is string => Boolean(p));
}

type Resa = {
  m: ModelloAttestato;
  nome: string;
  nascita: string;
  intro: string;
  frase: string;
  titoloCorso: string;
  dettagli: string[];
  lezioni: string[];
  aggiuntivo: string;
  luogoData: string;
  numero: string;
  emessoIl: string;
  url: string | null;
};

function prepara(c: AttestatoContenuto): Resa {
  const m = modelloDi(c);
  const ore = oreLabel(c.corso.ore_totali);
  const vars = {
    nome: `${c.discente.nome} ${c.discente.cognome}`.trim(),
    corso: c.corso.titolo,
    ore,
    ente: m.intestazione,
    edizione: c.edizione.codice,
    data: dataEstesa(c.completato_il ?? c.emesso_il),
  };
  const dettagli: string[] = [];
  if (m.mostra.ore && ore) dettagli.push(`Durata: ${ore}`);
  if (m.mostra.riferimento && c.corso.riferimento_normativo) dettagli.push(`Riferimento normativo: ${c.corso.riferimento_normativo}`);
  if (m.mostra.edizione) {
    const periodo = [c.edizione.data_inizio ? dataBreve(c.edizione.data_inizio) : '', c.edizione.data_fine ? dataBreve(c.edizione.data_fine) : ''].filter(Boolean).join(' - ');
    dettagli.push(`Edizione ${c.edizione.codice}${periodo ? ` (${periodo})` : ''}${c.completato_il ? ` - percorso completato il ${dataBreve(c.completato_il)}` : ''}`);
  }
  if (m.mostra.esito_test && c.test) {
    dettagli.push(`Verifica finale: ${c.test.superato ? 'superata' : 'non superata'}${c.test.percentuale != null ? ` con il ${String(c.test.percentuale).replace('.', ',')}% di risposte corrette` : ''}${c.test.soglia != null ? ` (soglia ${c.test.soglia}%)` : ''}`);
  }
  if (c.frequenza) dettagli.push(`Frequenza: ${String(c.frequenza.percentuale).replace('.', ',')}% delle ore previste (soglia ${c.frequenza.soglia}%)`);
  const lezioni = m.mostra.lezioni ? c.percorso.lezioni.filter((l) => l.tipo !== 'quiz').map((l) => `${l.ordine}. ${l.titolo}`) : [];
  return {
    m,
    nome: pulisci(vars.nome),
    nascita: m.mostra.nascita ? pulisci(nascitaLabel(c)) : '',
    intro: pulisci(compilaTesto(m.intro, vars)),
    frase: pulisci(compilaTesto(m.frase, vars)),
    titoloCorso: pulisci(c.corso.titolo),
    dettagli: dettagli.map(pulisci),
    lezioni: lezioni.map(pulisci),
    aggiuntivo: pulisci(compilaTesto(m.testo_aggiuntivo, vars)),
    luogoData: pulisci(`${m.citta ? `${m.citta}, ` : ''}${dataEstesa(c.emesso_il)}`),
    numero: c.numero ?? '',
    emessoIl: dataBreve(c.emesso_il),
    url: m.mostra.qr && c.codice_verifica ? urlVerifica(c.codice_verifica) : null,
  };
}

type Ctx = { doc: PDFDocument; page: PDFPage; W: number; H: number; reg: PDFFont; bold: PDFFont; obl: PDFFont; img: Immagini };

async function immagine(ctx: Ctx, path: string | null): Promise<PDFImage | null> {
  return path ? embedImg(ctx.doc, ctx.img[path]) : null;
}

function disegnaImg(page: PDFPage, im: PDFImage, x: number, y: number, maxW: number, maxH: number, align: 'left' | 'center' | 'right' = 'left') {
  const scala = Math.min(maxW / im.width, maxH / im.height);
  const w = im.width * scala; const h = im.height * scala;
  const xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  page.drawImage(im, { x: xx, y, width: w, height: h });
}

function centrato(page: PDFPage, font: PDFFont, text: string, size: number, y: number, color: RGB) {
  page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
}

/** Firmatari (fino a 2) allineati a sinistra o centrati; ritorna l'altezza usata. */
async function disegnaFirme(ctx: Ctx, r: Resa, xStart: number, y: number, larghezza: number, colore: RGB) {
  const n = r.m.firmatari.length;
  if (!n) return;
  const colW = Math.min(230, larghezza / n);
  for (let i = 0; i < n; i++) {
    const f = r.m.firmatari[i];
    const x = xStart + i * (colW + 24);
    const firma = await immagine(ctx, f.firma_path);
    if (firma) disegnaImg(ctx.page, firma, x + 8, y + 16, colW - 40, 44);
    ctx.page.drawLine({ start: { x, y: y + 12 }, end: { x: x + colW, y: y + 12 }, thickness: 0.8, color: GRIGIO });
    ctx.page.drawText(pulisci(f.nome), { x, y: y - 4, size: 11, font: ctx.bold, color: colore });
    if (f.ruolo) ctx.page.drawText(pulisci(f.ruolo), { x, y: y - 18, size: 10, font: ctx.reg, color: GRIGIO });
  }
}

async function disegnaQr(ctx: Ctx, r: Resa, xRight: number, yBottom: number, lato: number, colore: RGB) {
  if (!r.url) return;
  const qr = await ctx.doc.embedPng(await qrPng(r.url, 300));
  ctx.page.drawImage(qr, { x: xRight - lato, y: yBottom, width: lato, height: lato });
  const t1 = pulisci("Verifica l'autenticità inquadrando il codice");
  const t2 = r.url.replace(/^https?:\/\//, '');
  ctx.page.drawText(t1, { x: xRight - lato - 8 - ctx.reg.widthOfTextAtSize(t1, 9), y: yBottom + lato - 20, size: 9, font: ctx.reg, color: GRIGIO });
  ctx.page.drawText(t2, { x: xRight - lato - 8 - ctx.reg.widthOfTextAtSize(t2, 8.5), y: yBottom + lato - 34, size: 8.5, font: ctx.reg, color: colore });
}

async function loghiSecondari(ctx: Ctx, r: Resa, xRight: number, y: number, h: number) {
  let x = xRight;
  for (const p of [...r.m.loghi_secondari].reverse()) {
    const im = await immagine(ctx, p);
    if (!im) continue;
    const w = Math.min((im.width / im.height) * h, 110);
    disegnaImg(ctx.page, im, x, y, w, h, 'right');
    x -= w + 14;
  }
}

/**
 * Blocco centrale comune: dettagli, lezioni, testo aggiuntivo. Si ferma a yMin
 * (sopra firme e QR): ciò che non entra viene omesso con "..." piuttosto che
 * sovrapporsi. Ritorna la y finale.
 */
function corpoDettagli(ctx: Ctx, r: Resa, y: number, maxW: number, colore: RGB, centra: boolean, x0: number, yMin: number): number {
  let troncato = false;
  const riga = (t: string, size: number, font: PDFFont, col: RGB) => {
    for (const l of wrap(font, t, size, maxW)) {
      if (y - size < yMin) { troncato = true; return; }
      if (centra) centrato(ctx.page, font, l, size, y, col); else ctx.page.drawText(l, { x: x0, y, size, font, color: col });
      y -= size + 4;
    }
  };
  for (const d of r.dettagli) riga(d, 11, ctx.reg, GRIGIO);
  if (r.lezioni.length) {
    y -= 4;
    const perRiga = Math.min(r.lezioni.length, 8);
    for (const l of r.lezioni.slice(0, perRiga)) riga(l, 9.5, ctx.reg, GRIGIO);
    if (r.lezioni.length > perRiga) riga(`... e altre ${r.lezioni.length - perRiga} lezioni`, 9.5, ctx.obl, GRIGIO);
  }
  if (r.aggiuntivo) { y -= 6; riga(r.aggiuntivo, 10.5, ctx.reg, colore); }
  if (troncato && y - 10 >= yMin - 2) {
    const t = '...';
    if (centra) centrato(ctx.page, ctx.obl, t, 10, y, GRIGIO); else ctx.page.drawText(t, { x: x0, y, size: 10, font: ctx.obl, color: GRIGIO });
  }
  return y;
}

// ───────────────────────── layout: classico ─────────────────────────
async function classico(ctx: Ctx, r: Resa) {
  const { page, W, H, reg, bold, obl } = ctx;
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BLU });
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 4, color: MENTA });
  const logo = await immagine(ctx, r.m.logo_path);
  let xTesto = 48;
  if (logo) { disegnaImg(page, logo, 48, H - 76, 160, 58); xTesto = 48 + Math.min(160, (logo.width / logo.height) * 58) + 18; }
  const intest = pulisci(r.m.intestazione);
  page.drawText(intest, { x: xTesto, y: H - 48, size: fitText(bold, intest, 20, W - xTesto - 260), font: bold, color: BIANCO });
  if (r.m.citta) page.drawText(pulisci(r.m.citta), { x: xTesto, y: H - 68, size: 11, font: reg, color: rgb(0.8, 0.86, 1) });
  const num = `Attestato n. ${r.numero}`;
  page.drawText(num, { x: W - 48 - bold.widthOfTextAtSize(num, 12), y: H - 48, size: 12, font: bold, color: MENTA });
  const em = `emesso il ${r.emessoIl}`;
  page.drawText(em, { x: W - 48 - reg.widthOfTextAtSize(em, 10), y: H - 66, size: 10, font: reg, color: rgb(0.8, 0.86, 1) });

  let y = H - 148;
  const titolo = pulisci(r.m.titolo);
  centrato(page, bold, titolo, fitText(bold, titolo, 26, W - 120), y, BLU);
  y -= 36;
  if (r.intro) { centrato(page, reg, r.intro, 13, y, GRIGIO); y -= 38; } else y -= 10;
  centrato(page, bold, r.nome, fitText(bold, r.nome, 32, W - 160), y, INCHIOSTRO);
  y -= 24;
  if (r.nascita) { centrato(page, reg, r.nascita, 12, y, GRIGIO); y -= 22; } else y -= 6;
  for (const l of wrap(reg, r.frase, 13, W - 200)) { centrato(page, reg, l, 13, y, GRIGIO); y -= 18; }
  y -= 14;
  const ts = fitText(bold, r.titoloCorso, 22, W - 140);
  for (const l of wrap(bold, r.titoloCorso, ts, W - 140).slice(0, 2)) { centrato(page, bold, l, ts, y, BLU); y -= ts + 6; }
  y -= 4;
  corpoDettagli(ctx, r, y, W - 200, INCHIOSTRO, true, 0, 170);

  await disegnaFirme(ctx, r, 56, 96, 420, INCHIOSTRO);
  page.drawText(r.luogoData, { x: 56, y: 40, size: 10, font: obl, color: GRIGIO });
  await disegnaQr(ctx, r, W - 56, 44, 96, ACCENTO);
  await loghiSecondari(ctx, r, r.url ? W - 56 - 96 - 24 : W - 56, 44, 36);
}

// ───────────────────────── layout: essenziale ─────────────────────────
async function essenziale(ctx: Ctx, r: Resa) {
  const { page, W, H, reg, bold, obl } = ctx;
  const x0 = 64; const maxW = W - 128;
  const logo = await immagine(ctx, r.m.logo_path);
  let yTop = H - 60;
  if (logo) { disegnaImg(page, logo, x0, H - 100, 170, 60); }
  const intest = pulisci(r.m.intestazione);
  const xi = logo ? x0 + Math.min(170, (logo.width / logo.height) * 60) + 20 : x0;
  page.drawText(intest, { x: xi, y: H - 62, size: fitText(bold, intest, 16, W - xi - 240), font: bold, color: INCHIOSTRO });
  if (r.m.citta) page.drawText(pulisci(r.m.citta), { x: xi, y: H - 80, size: 10.5, font: reg, color: GRIGIO });
  const num = `n. ${r.numero}  -  ${r.emessoIl}`;
  page.drawText(num, { x: W - x0 - reg.widthOfTextAtSize(num, 10.5), y: H - 62, size: 10.5, font: reg, color: GRIGIO });
  page.drawLine({ start: { x: x0, y: H - 110 }, end: { x: W - x0, y: H - 110 }, thickness: 1, color: INCHIOSTRO });
  yTop = H - 150;

  let y = yTop;
  const titolo = pulisci(r.m.titolo);
  page.drawText(titolo, { x: x0, y, size: fitText(bold, titolo, 24, maxW), font: bold, color: INCHIOSTRO });
  y -= 36;
  if (r.intro) { page.drawText(r.intro, { x: x0, y, size: 12, font: reg, color: GRIGIO }); y -= 30; }
  page.drawText(r.nome, { x: x0, y, size: fitText(bold, r.nome, 30, maxW), font: bold, color: INCHIOSTRO });
  y -= 22;
  if (r.nascita) { page.drawText(r.nascita, { x: x0, y, size: 11.5, font: reg, color: GRIGIO }); y -= 20; } else y -= 4;
  for (const l of wrap(reg, r.frase, 12.5, maxW)) { page.drawText(l, { x: x0, y, size: 12.5, font: reg, color: GRIGIO }); y -= 17; }
  y -= 10;
  const ts = fitText(bold, r.titoloCorso, 20, maxW);
  for (const l of wrap(bold, r.titoloCorso, ts, maxW).slice(0, 2)) { page.drawText(l, { x: x0, y, size: ts, font: bold, color: INCHIOSTRO }); y -= ts + 5; }
  y -= 6;
  corpoDettagli(ctx, r, y, maxW - 160, INCHIOSTRO, false, x0, 150);

  page.drawLine({ start: { x: x0, y: 132 }, end: { x: W - x0, y: 132 }, thickness: 0.6, color: GRIGIO_CHIARO });
  await disegnaFirme(ctx, r, x0, 84, 420, INCHIOSTRO);
  page.drawText(r.luogoData, { x: x0, y: 40, size: 10, font: obl, color: GRIGIO });
  await disegnaQr(ctx, r, W - x0, 40, 86, INCHIOSTRO);
  await loghiSecondari(ctx, r, r.url ? W - x0 - 86 - 24 : W - x0, 40, 34);
}

// ───────────────────────── layout: elegante ─────────────────────────
async function elegante(ctx: Ctx, r: Resa) {
  const { page, W, H, reg, bold, obl } = ctx;
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: ORO, borderWidth: 2.2 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: ORO, borderWidth: 0.7 });
  const logo = await immagine(ctx, r.m.logo_path);
  let y = H - 70;
  if (logo) { disegnaImg(page, logo, W / 2, H - 112, 180, 56, 'center'); y = H - 134; }
  const intest = pulisci(r.m.intestazione);
  centrato(page, bold, intest, fitText(bold, intest, 15, W - 200), y, INCHIOSTRO);
  y -= 16;
  if (r.m.citta) { centrato(page, reg, pulisci(r.m.citta), 10.5, y, GRIGIO); y -= 14; }
  // filetto decorativo
  page.drawLine({ start: { x: W / 2 - 90, y: y - 2 }, end: { x: W / 2 + 90, y: y - 2 }, thickness: 0.8, color: ORO });
  y -= 36;
  const titolo = pulisci(r.m.titolo);
  centrato(page, bold, titolo, fitText(bold, titolo, 28, W - 160), y, INCHIOSTRO);
  y -= 32;
  if (r.intro) { centrato(page, obl, r.intro, 13, y, GRIGIO); y -= 34; } else y -= 8;
  centrato(page, bold, r.nome, fitText(bold, r.nome, 34, W - 180), y, INCHIOSTRO);
  y -= 24;
  if (r.nascita) { centrato(page, obl, r.nascita, 12, y, GRIGIO); y -= 22; } else y -= 6;
  for (const l of wrap(obl, r.frase, 13, W - 220)) { centrato(page, obl, l, 13, y, GRIGIO); y -= 18; }
  y -= 12;
  const ts = fitText(bold, r.titoloCorso, 22, W - 160);
  for (const l of wrap(bold, r.titoloCorso, ts, W - 160).slice(0, 2)) { centrato(page, bold, l, ts, y, INCHIOSTRO); y -= ts + 6; }
  y -= 2;
  corpoDettagli(ctx, r, y, W - 240, INCHIOSTRO, true, 0, 172);

  await disegnaFirme(ctx, r, 70, 98, 420, INCHIOSTRO);
  const ld = `${r.luogoData}   -   Attestato n. ${r.numero}`;
  page.drawText(ld, { x: 70, y: 46, size: 10, font: obl, color: GRIGIO });
  await disegnaQr(ctx, r, W - 64, 50, 86, ORO);
  await loghiSecondari(ctx, r, r.url ? W - 64 - 86 - 24 : W - 64, 50, 34);
}

/** Genera il PDF (A4 orizzontale) dallo snapshot, secondo il modello che porta. */
export async function generaAttestatoPdf(c: AttestatoContenuto, immagini: Immagini = {}): Promise<Uint8Array> {
  const r = prepara(c);
  const doc = await PDFDocument.create();
  doc.setTitle(`Attestato ${r.numero} - ${c.discente.cognome} ${c.discente.nome}`);
  doc.setAuthor(r.m.intestazione);
  doc.setSubject(c.corso.titolo);
  doc.setCreator('FAD');
  const page = doc.addPage([841.89, 595.28]);
  const serif = r.m.layout === 'elegante';
  const ctx: Ctx = {
    doc, page, W: page.getWidth(), H: page.getHeight(),
    reg: await doc.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await doc.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
    obl: await doc.embedFont(serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique),
    img: immagini,
  };
  if (r.m.layout === 'essenziale') await essenziale(ctx, r);
  else if (r.m.layout === 'elegante') await elegante(ctx, r);
  else await classico(ctx, r);
  if (c.attestato_id) {
    const impronta = `Documento congelato ${c.attestato_id.slice(0, 8)} - registro integro al n. ${c.registro?.seq ?? '-'}`;
    page.drawText(impronta, { x: r.m.layout === 'elegante' ? 70 : 56, y: r.m.layout === 'elegante' ? 34 : 24, size: 7.5, font: ctx.reg, color: GRIGIO_CHIARO });
  }
  return doc.save();
}

/** Snapshot d'esempio per l'anteprima dell'editor (nessun dato reale del discente). */
export function contenutoEsempio(base: Partial<AttestatoContenuto> & { ente: AttestatoContenuto['ente'] }, modello: ModelloAttestato): AttestatoContenuto {
  const oggi = new Date().toISOString();
  return {
    versione: 1,
    ente: base.ente,
    discente: { nome: 'Maria', cognome: 'Esempio', data_nascita: '1985-04-12', luogo_nascita: 'Bergamo' },
    corso: base.corso ?? { id: 'esempio', titolo: 'Titolo del corso', ore_totali: 8, riferimento_normativo: 'Riferimento normativo del corso', categoria: null },
    edizione: base.edizione ?? { id: 'esempio', codice: 'ED-2026-01', data_inizio: oggi.slice(0, 10), data_fine: oggi.slice(0, 10) },
    iscrizione_id: 'esempio',
    percorso: base.percorso ?? { totale: 3, completate: 3, lezioni: [{ ordine: 1, titolo: 'Prima lezione', tipo: 'video', obbligatoria: true, completata: true, completata_il: oggi }, { ordine: 2, titolo: 'Seconda lezione', tipo: 'documento', obbligatoria: true, completata: true, completata_il: oggi }, { ordine: 3, titolo: 'Test finale', tipo: 'quiz', obbligatoria: true, completata: true, completata_il: oggi }] },
    test: base.test === undefined ? { superato: true, percentuale: 90, soglia: 70, tentativi: 1, superato_il: oggi } : base.test,
    frequenza: null,
    criterio_idoneita: 'completamento',
    completato_il: oggi,
    registro: { seq: null, hash: null },
    attestato_id: undefined,
    numero: '2026/000000',
    codice_verifica: 'anteprima0000000000000000',
    emesso_il: oggi,
    emesso_da: null,
    sostituisce: null,
    ...({ modello } as object),
  } as AttestatoContenuto;
}
