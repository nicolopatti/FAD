import type { Fatturazione, StatoOrdine } from './vendita';
import { giornoRoma } from './finestra';
import { offsetRoma } from './audit-filtri';

/** Riga degli ordini per l'area Vendite (lista, dettaglio, export). */
export type OrdineAdmin = {
  id: string;
  stato: StatoOrdine;
  importo_centesimi: number;
  /** Sconto dei codici promozionali di Stripe. */
  sconto_centesimi: number;
  /** Listino al momento dell'ordine (null negli ordini precedenti agli sconti a tempo). */
  listino_centesimi: number | null;
  sconto_tempo_centesimi: number;
  sconto_tempo_etichetta: string | null;
  valuta: string;
  aliquota_iva: number;
  natura_iva: string | null;
  fatturazione: Partial<Fatturazione> | null;
  consensi: Record<string, string> | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  iscrizione_id: string | null;
  scade_il: string;
  creato_il: string;
  pagato_il: string | null;
  rimborsato_il: string | null;
  annullato_il: string | null;
  persona: { id: string; nome: string; cognome: string; email: string } | null;
  offerta: { id: string; slug: string; titolo_pubblico: string | null; edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null } | null;
};

export const ORDINE_ADMIN_SELECT =
  'id, stato, importo_centesimi, sconto_centesimi, listino_centesimi, sconto_tempo_centesimi, sconto_tempo_etichetta, valuta, aliquota_iva, natura_iva, fatturazione, consensi, stripe_session_id, stripe_payment_intent, iscrizione_id, scade_il, creato_il, pagato_il, rimborsato_il, annullato_il, ' +
  'persona:persona_id ( id, nome, cognome, email ), offerta:offerta_id ( id, slug, titolo_pubblico, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) ) )';

export type FiltroStato = 'tutti' | 'pagato' | 'in_attesa' | 'rimborsato' | 'annullato';

export function parseFiltroStato(v: string | undefined): FiltroStato {
  return v === 'pagato' || v === 'in_attesa' || v === 'rimborsato' || v === 'annullato' ? v : 'tutti';
}

/** Un ordine in attesa oltre la scadenza della sessione di pagamento è, di fatto, non completato. */
export function statoVisibile(o: Pick<OrdineAdmin, 'stato' | 'scade_il'>, ora = Date.now()): { label: string; cls: string } {
  if (o.stato === 'pagato') return { label: 'pagato', cls: 'chip--ok' };
  if (o.stato === 'rimborsato') return { label: 'rimborsato', cls: 'chip--err' };
  if (o.stato === 'annullato') return { label: 'non completato', cls: 'chip--muted' };
  return new Date(o.scade_il).getTime() > ora ? { label: 'in attesa di pagamento', cls: 'chip--ocra' } : { label: 'non completato', cls: 'chip--muted' };
}

/** Primo giorno del mese corrente (Roma) come inizio dell'intervallo, ISO. */
export function inizioMeseRoma(oggi = giornoRoma()): string {
  const primo = `${oggi.slice(0, 7)}-01`;
  return `${primo}T00:00:00${offsetRoma(primo)}`;
}

export function corsoDi(o: Pick<OrdineAdmin, 'offerta'>): string {
  return o.offerta?.titolo_pubblico || o.offerta?.edizione?.corso?.titolo || '—';
}

/** Riepilogo degli ordini di un'offerta (scheda Vendita dell'edizione). */
export function riepilogoOrdini(ordini: { stato: string; importo_centesimi: number; scade_il: string }[], ora = Date.now()) {
  const r = { pagati: 0, in_attesa: 0, rimborsati: 0, incasso_centesimi: 0 };
  for (const o of ordini) {
    if (o.stato === 'pagato') { r.pagati++; r.incasso_centesimi += o.importo_centesimi; }
    else if (o.stato === 'rimborsato') r.rimborsati++;
    else if (o.stato === 'in_attesa' && new Date(o.scade_il).getTime() > ora) r.in_attesa++;
  }
  return r;
}
