import type { EdizioneRow } from './db-types';

/**
 * Finestra di fruizione di un'edizione (R2, stress test 21/10): fuori dalla
 * finestra le lezioni NON si fruiscono (blocco totale, anche via API e RPC).
 *
 * Regola (la stessa di `public.edizione_finestra_stato` nel DB):
 *  - apertura = fad_apertura, se vuota data_inizio; chiusura = fad_chiusura,
 *    se vuota data_fine; un estremo vuoto = nessun limite da quel lato;
 *  - i giorni sono interi nel fuso di Roma: aperta dalle 00:00 del giorno di
 *    apertura alle 23:59 del giorno di chiusura;
 *  - un'edizione annullata o conclusa è chiusa, qualunque siano le date.
 */
export type EdizioneFinestra = Pick<EdizioneRow, 'data_inizio' | 'data_fine' | 'fad_apertura' | 'fad_chiusura' | 'concluso_at' | 'annullato_at'>;

export type StatoFinestra = {
  /** `scaduta`/`revocata` riguardano l'accesso del singolo iscritto (Fase 6, vendita). */
  stato: 'aperta' | 'non_aperta' | 'chiusa' | 'conclusa' | 'annullata' | 'scaduta' | 'revocata';
  aperta: boolean;
  /** Primo giorno di fruizione (YYYY-MM-DD), se c'è un limite. */
  apre_il: string | null;
  /** Ultimo giorno di fruizione (YYYY-MM-DD), se c'è un limite. */
  chiude_il: string | null;
};

/** Il giorno di calendario (YYYY-MM-DD) nel fuso di Roma. */
export function giornoRoma(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const giorno = (s: string | null | undefined) => (s ? String(s).slice(0, 10) : null);

export function finestraEdizione(e: EdizioneFinestra, oggi: string = giornoRoma()): StatoFinestra {
  const apre = giorno(e.fad_apertura) ?? giorno(e.data_inizio);
  const chiude = giorno(e.fad_chiusura) ?? giorno(e.data_fine);
  const base = { apre_il: apre, chiude_il: chiude };
  if (e.annullato_at) return { stato: 'annullata', aperta: false, ...base };
  if (e.concluso_at) return { stato: 'conclusa', aperta: false, ...base };
  if (apre && oggi < apre) return { stato: 'non_aperta', aperta: false, ...base };
  if (chiude && oggi > chiude) return { stato: 'chiusa', aperta: false, ...base };
  return { stato: 'aperta', aperta: true, ...base };
}

/** Accesso del singolo iscritto (acquisto con scadenza, rimborso). */
export type AccessoIscrizione = {
  accesso_dal?: string | null;
  accesso_fino_al?: string | null;
  accesso_revocato_at?: string | null;
};

/**
 * Finestra effettiva di un iscritto (Fase 6): prima la revoca, poi la finestra
 * dell'edizione, poi `accesso_dal`/`accesso_fino_al`. Stessa regola di
 * `public.iscrizione_finestra_stato` nel DB. Senza campi di accesso coincide con
 * `finestraEdizione`.
 */
export function finestraIscrizione(e: EdizioneFinestra, a: AccessoIscrizione = {}, oggi: string = giornoRoma()): StatoFinestra {
  const ed = finestraEdizione(e, oggi);
  const dal = giorno(a.accesso_dal);
  const fino = giorno(a.accesso_fino_al);
  const apre = [ed.apre_il, dal].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const chiude = [ed.chiude_il, fino].filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  const base = { apre_il: apre, chiude_il: chiude };
  if (a.accesso_revocato_at) return { stato: 'revocata', aperta: false, ...base };
  if (!ed.aperta) return { ...ed, ...base };
  if (dal && oggi < dal) return { stato: 'non_aperta', aperta: false, ...base };
  if (fino && oggi > fino) return { stato: 'scaduta', aperta: false, ...base, chiude_il: fino };
  return { stato: 'aperta', aperta: true, ...base };
}

function dataIt(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

/** Frase per il discente (e messaggio dell'errore 403 delle API). */
export function messaggioFinestra(f: StatoFinestra): string {
  switch (f.stato) {
    case 'non_aperta':
      return f.apre_il ? `Le lezioni si aprono il ${dataIt(f.apre_il)}.` : 'Le lezioni non sono ancora aperte.';
    case 'chiusa':
      return f.chiude_il ? `Le lezioni erano disponibili fino al ${dataIt(f.chiude_il)}: ora sono chiuse.` : 'Le lezioni sono chiuse.';
    case 'conclusa':
      return 'L’edizione è conclusa: le lezioni sono chiuse.';
    case 'annullata':
      return 'L’edizione è stata annullata: le lezioni non sono disponibili.';
    case 'scaduta':
      return f.chiude_il ? `Il tuo accesso era valido fino al ${dataIt(f.chiude_il)}: ora è scaduto.` : 'Il tuo accesso è scaduto.';
    case 'revocata':
      return 'Il tuo accesso a questo corso non è più attivo.';
    default:
      return f.chiude_il ? `Le lezioni sono aperte fino al ${dataIt(f.chiude_il)}.` : 'Le lezioni sono aperte.';
  }
}

/** Etichetta breve per l'elenco dei corsi (null se aperta). */
export function etichettaFinestra(f: StatoFinestra): string | null {
  if (f.stato === 'non_aperta') return 'Non ancora aperto';
  if (f.stato === 'aperta') return null;
  if (f.stato === 'scaduta') return 'Accesso scaduto';
  return 'Chiuso';
}
