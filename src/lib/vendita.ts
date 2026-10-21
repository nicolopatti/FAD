import { dataDopo, isCodiceFiscale, isEmail, type Errori } from './validazione';

/**
 * Fase 6 — vendita dei corsi: funzioni pure (prezzi, IVA, validazioni).
 * Il prezzo di un'offerta è il prezzo FINALE pagato, IVA inclusa, in centesimi
 * (`offerta.prezzo_centesimi`); l'IVA si scorpora solo per l'export e la ricevuta.
 */

export type StatoOfferta = 'bozza' | 'pubblicata' | 'ritirata';
export type StatoOrdine = 'in_attesa' | 'pagato' | 'rimborsato' | 'annullato';

export const STATO_ORDINE_LABEL: Record<StatoOrdine, string> = {
  in_attesa: 'in attesa di pagamento',
  pagato: 'pagato',
  rimborsato: 'rimborsato',
  annullato: 'annullato',
};

export type OffertaRow = {
  id: string;
  tenant_id: string;
  edizione_id: string;
  slug: string;
  stato: StatoOfferta;
  prezzo_centesimi: number;
  valuta: string;
  aliquota_iva: number;
  natura_iva: string | null;
  posti_max: number | null;
  accesso_giorni: number | null;
  vendita_dal: string | null;
  vendita_al: string | null;
  codici_sconto: boolean;
  titolo_pubblico: string | null;
  descrizione_pubblica: string | null;
  cover_path: string | null;
  creato_il: string;
  pubblicata_il: string | null;
  ritirata_il: string | null;
};

/** Prezzo minimo accettato da Stripe in euro (0,50 €). */
export const PREZZO_MINIMO_CENTESIMI = 50;
export const PREZZO_MASSIMO_CENTESIMI = 10_000_000;

/** "49" | "49,9" | "49,90" | "1.250,00" | "49.90" → centesimi; null se non valido. */
export function parsePrezzo(v: unknown): number | null {
  let s = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!s) return null;
  // "1.250,00" (italiano): il punto separa le migliaia, la virgola i decimali.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const centesimi = Math.round(Number(s) * 100);
  return Number.isFinite(centesimi) ? centesimi : null;
}

/** 4900 → "49,00 €". */
export function fmtPrezzo(centesimi: number, valuta = 'eur'): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta.toUpperCase() }).format(centesimi / 100);
}

/** 4900 → "49,00" (per i campi dei form). */
export function prezzoPerCampo(centesimi: number | null | undefined): string {
  if (centesimi == null) return '';
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/**
 * Scorporo dell'IVA da un prezzo IVA inclusa: imponibile arrotondato al
 * centesimo, IVA = differenza (la somma torna sempre al prezzo). Aliquota 0 o
 * operazione esente → tutto imponibile.
 */
export function scorporoIva(lordoCentesimi: number, aliquota: number): { imponibile: number; iva: number } {
  if (!aliquota || aliquota <= 0) return { imponibile: lordoCentesimi, iva: 0 };
  const imponibile = Math.round(lordoCentesimi / (1 + aliquota / 100));
  return { imponibile, iva: lordoCentesimi - imponibile };
}

/** Titolo → indirizzo leggibile ("Sicurezza sul lavoro – base" → "sicurezza-sul-lavoro-base"). */
export function slugDa(titolo: string): string {
  return titolo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function isSlug(v: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) && v.length <= 80;
}

const intero = (v: unknown): number | null | undefined => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : undefined;
};

export type OffertaInput = {
  slug?: string;
  prezzo?: string;
  aliquota_iva?: string;
  natura_iva?: string;
  posti_max?: string;
  accesso_giorni?: string;
  tipo?: 'online' | 'date';
  vendita_dal?: string;
  vendita_al?: string;
  codici_sconto?: boolean;
  titolo_pubblico?: string;
  descrizione_pubblica?: string;
};

export type OffertaValori = {
  slug: string;
  prezzo_centesimi: number;
  aliquota_iva: number;
  natura_iva: string | null;
  posti_max: number | null;
  accesso_giorni: number | null;
  vendita_dal: string | null;
  vendita_al: string | null;
  codici_sconto: boolean;
  titolo_pubblico: string | null;
  descrizione_pubblica: string | null;
};

/** Validazione dell'offerta per campo (form admin e route). */
export function validaOfferta(input: OffertaInput): { valori?: OffertaValori; errori: Errori } {
  const e: Errori = {};
  const slug = (input.slug ?? '').trim().toLowerCase();
  if (!slug) e.slug = 'Scrivi l’indirizzo della scheda (es. sicurezza-base).';
  else if (!isSlug(slug)) e.slug = 'Solo lettere minuscole, numeri e trattini (es. sicurezza-base).';

  const prezzo = parsePrezzo(input.prezzo);
  if (prezzo == null) e.prezzo = 'Scrivi il prezzo in euro (es. 49 o 49,90).';
  else if (prezzo < PREZZO_MINIMO_CENTESIMI) e.prezzo = 'Il prezzo minimo è 0,50 €.';
  else if (prezzo > PREZZO_MASSIMO_CENTESIMI) e.prezzo = 'Prezzo troppo alto.';

  const aliquotaRaw = String(input.aliquota_iva ?? '22').trim().replace(',', '.');
  const aliquota = Number(aliquotaRaw === '' ? '22' : aliquotaRaw);
  if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100) e.aliquota_iva = 'Aliquota IVA tra 0 e 100.';
  const natura = (input.natura_iva ?? '').trim() || null;
  if (aliquota === 0 && !natura) e.natura_iva = 'Con IVA a zero indica il motivo (es. Esente art. 10 c.1 n.20 DPR 633/72).';
  if (natura && natura.length > 120) e.natura_iva = 'Massimo 120 caratteri.';

  const posti = intero(input.posti_max);
  if (posti === undefined || (posti !== null && posti < 1)) e.posti_max = 'Numero di posti intero maggiore di zero, o vuoto per illimitati.';

  let accesso: number | null = null;
  if ((input.tipo ?? 'online') === 'online') {
    const g = intero(input.accesso_giorni);
    if (g == null || g === undefined || g < 1 || g > 3650) e.accesso_giorni = 'Giorni di accesso dall’acquisto (da 1 a 3650).';
    else accesso = g;
  }

  const dal = (input.vendita_dal ?? '').trim() || null;
  const al = (input.vendita_al ?? '').trim() || null;
  if (dal && al && dataDopo(dal, al)) e.vendita_al = 'La fine della vendita non può precedere l’inizio.';

  const titolo = (input.titolo_pubblico ?? '').trim() || null;
  if (titolo && titolo.length > 200) e.titolo_pubblico = 'Massimo 200 caratteri.';
  const descr = (input.descrizione_pubblica ?? '').trim() || null;
  if (descr && descr.length > 20000) e.descrizione_pubblica = 'Testo troppo lungo.';

  if (Object.keys(e).length) return { errori: e };
  return {
    errori: e,
    valori: {
      slug, prezzo_centesimi: prezzo!, aliquota_iva: aliquota, natura_iva: natura,
      posti_max: posti ?? null, accesso_giorni: accesso,
      vendita_dal: dal, vendita_al: al, codici_sconto: Boolean(input.codici_sconto),
      titolo_pubblico: titolo, descrizione_pubblica: descr,
    },
  };
}

// --------------------------------------------------------------------------
// Dati di fatturazione (privato o azienda)
// --------------------------------------------------------------------------

export type Fatturazione = {
  tipo: 'privato' | 'azienda';
  nome?: string;
  cognome?: string;
  ragione_sociale?: string;
  codice_fiscale?: string;
  partita_iva?: string;
  codice_sdi?: string;
  pec?: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  nazione?: string;
};

const testo = (v: unknown) => String(v ?? '').trim();

/** Partita IVA italiana: 11 cifre (controllo strutturale). */
export function isPartitaIva(v: string): boolean {
  return /^\d{11}$/.test(v.replace(/\s/g, '').replace(/^IT/i, ''));
}

/** Normalizza e valida i dati di fatturazione; restituisce gli errori per campo. */
export function validaFatturazione(input: Partial<Fatturazione>): { valori?: Fatturazione; errori: Errori } {
  const e: Errori = {};
  const tipo = input.tipo === 'azienda' ? 'azienda' : 'privato';
  const v: Fatturazione = {
    tipo,
    indirizzo: testo(input.indirizzo),
    cap: testo(input.cap),
    citta: testo(input.citta),
    provincia: testo(input.provincia).toUpperCase(),
    nazione: (testo(input.nazione) || 'IT').toUpperCase(),
  };
  if (tipo === 'privato') {
    v.nome = testo(input.nome);
    v.cognome = testo(input.cognome);
    v.codice_fiscale = testo(input.codice_fiscale).toUpperCase();
    if (!v.nome) e.nome = 'Scrivi il nome.';
    if (!v.cognome) e.cognome = 'Scrivi il cognome.';
    if (!v.codice_fiscale) e.codice_fiscale = 'Il codice fiscale serve per la fattura e per l’attestato.';
    else if (!isCodiceFiscale(v.codice_fiscale)) e.codice_fiscale = 'Il codice fiscale non sembra valido (16 caratteri).';
  } else {
    v.ragione_sociale = testo(input.ragione_sociale);
    v.partita_iva = testo(input.partita_iva).replace(/\s/g, '').replace(/^IT/i, '');
    v.codice_fiscale = testo(input.codice_fiscale).toUpperCase() || v.partita_iva;
    v.codice_sdi = testo(input.codice_sdi).toUpperCase();
    v.pec = testo(input.pec).toLowerCase();
    if (!v.ragione_sociale) e.ragione_sociale = 'Scrivi la ragione sociale.';
    if (!v.partita_iva) e.partita_iva = 'Scrivi la partita IVA.';
    else if (!isPartitaIva(v.partita_iva)) e.partita_iva = 'La partita IVA ha 11 cifre.';
    if (v.codice_sdi && !/^[A-Z0-9]{7}$/.test(v.codice_sdi)) e.codice_sdi = 'Il codice destinatario ha 7 caratteri.';
    if (v.pec && !isEmail(v.pec)) e.pec = 'La PEC non sembra valida.';
    if (!v.codice_sdi && !v.pec) e.codice_sdi = 'Indica il codice destinatario (SDI) o la PEC.';
  }
  if (!v.indirizzo) e.indirizzo = 'Scrivi l’indirizzo.';
  if (v.nazione === 'IT') {
    if (!/^\d{5}$/.test(v.cap ?? '')) e.cap = 'Il CAP ha 5 cifre.';
    if (!/^[A-Z]{2}$/.test(v.provincia ?? '')) e.provincia = 'Sigla della provincia (es. MI).';
  }
  if (!v.citta) e.citta = 'Scrivi la città.';
  if (Object.keys(e).length) return { errori: e };
  return { valori: v, errori: e };
}

/** Nome da mostrare per l'intestatario dell'ordine. */
export function intestatario(f: Partial<Fatturazione> | null | undefined): string {
  if (!f) return '—';
  if (f.tipo === 'azienda') return f.ragione_sociale || '—';
  return [f.nome, f.cognome].filter(Boolean).join(' ') || '—';
}

// --------------------------------------------------------------------------
// Consensi all'acquisto (versioni dei testi; §10.5: avvio immediato)
// --------------------------------------------------------------------------

/** Versioni correnti dei testi accettati all'acquisto. Cambiarle quando cambiano i testi. */
export const VERSIONE_TERMINI = 'termini-vendita-2026-10';
export const VERSIONE_RECESSO = 'avvio-immediato-2026-10';

export const TESTO_RECESSO =
  'Chiedo di poter iniziare subito il corso e prendo atto che, con l’inizio della fruizione, perdo il diritto di recesso (art. 59, lett. o, Codice del consumo).';

/** Motivi di "non in vendita" del DB → frase per il visitatore. */
export function motivoNonVendibile(m: string | null | undefined): string | null {
  if (!m) return null;
  const mappa: Record<string, string> = {
    'non in vendita': 'Questo corso non è in vendita.',
    'vendita non ancora aperta': 'Le iscrizioni non sono ancora aperte.',
    'vendita chiusa': 'Le iscrizioni sono chiuse.',
    'edizione chiusa': 'Le iscrizioni sono chiuse.',
    'edizione conclusa': 'Le iscrizioni sono chiuse.',
    'edizione annullata': 'Questa edizione è stata annullata.',
    'edizione già iniziata': 'L’edizione è già iniziata: le iscrizioni sono chiuse.',
    'posti esauriti': 'Posti esauriti.',
    'già iscritto': 'Sei già iscritto a questo corso.',
  };
  return mappa[m] ?? 'Al momento non è possibile acquistare questo corso.';
}
