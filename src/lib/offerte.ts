import { NextResponse } from 'next/server';
import { primoErrore } from './validazione';
import { validaOfferta, type OffertaInput, type OffertaValori } from './vendita';

/**
 * Fase 6 — offerte (cosa si vende). Condiviso da POST (creazione sull'edizione)
 * e PATCH (modifica): validazione per campo e risposta d'errore nel formato
 * delle route admin (`error` + `campo` + `errori`).
 */
export const OFFERTA_SELECT =
  'id, tenant_id, edizione_id, slug, stato, prezzo_centesimi, valuta, aliquota_iva, natura_iva, posti_max, accesso_giorni, vendita_dal, vendita_al, codici_sconto, titolo_pubblico, descrizione_pubblica, cover_path, chiusa_visibile, sconti, creato_il, pubblicata_il, ritirata_il';

export function offertaDaBody(body: OffertaInput | null): { valori: OffertaValori } | { risposta: NextResponse } {
  if (!body) return { risposta: NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 }) };
  const { valori, errori } = validaOfferta(body);
  if (!valori) {
    const campo = Object.keys(errori)[0];
    return { risposta: NextResponse.json({ ok: false, error: primoErrore(errori) ?? 'Dati non validi.', campo, errori }, { status: 400 }) };
  }
  return { valori };
}

/** Errore del DB → risposta leggibile (slug doppio per ente = 409 sul campo). */
export function rispostaErroreOfferta(error: { code?: string; message: string }): NextResponse {
  if (error.code === '23505') {
    return NextResponse.json({ ok: false, error: 'Questo indirizzo è già usato da un’altra offerta: scegline un altro.', campo: 'slug' }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
}
