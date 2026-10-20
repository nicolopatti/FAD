// Validazioni condivise delle anagrafiche dell'area admin (ondata C):
// categorie dei corsi e aziende. Nessun accesso al DB: solo pulizia dei campi.
import { normalizzaPartitaIva } from '@/lib/iscritti';

export function pulisciNomeCategoria(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s.length >= 1 && s.length <= 60 ? s : null;
}

export type AziendaBody = {
  ragione_sociale?: unknown; partita_iva?: unknown; codice_fiscale?: unknown; codice_ateco?: unknown;
  sede_indirizzo?: unknown; sede_cap?: unknown; sede_comune?: unknown; sede_provincia?: unknown;
};

/** Campi dell'azienda dal body, validati; `parziale` ammette l'assenza della ragione sociale. */
export function campiAzienda(body: AziendaBody, parziale: boolean): { ok: true; updates: Record<string, string | null> } | { ok: false; error: string } {
  const updates: Record<string, string | null> = {};
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
  if (body.ragione_sociale !== undefined || !parziale) {
    const v = txt(body.ragione_sociale, 200);
    if (!v) return { ok: false, error: 'ragione sociale obbligatoria' };
    updates.ragione_sociale = v;
  }
  if (body.partita_iva !== undefined) {
    const v = normalizzaPartitaIva(typeof body.partita_iva === 'string' ? body.partita_iva : null);
    if (v && !/^[0-9]{11}$/.test(v)) return { ok: false, error: 'partita IVA non valida: 11 cifre' };
    updates.partita_iva = v;
  }
  if (body.codice_fiscale !== undefined) updates.codice_fiscale = txt(body.codice_fiscale, 16).toUpperCase() || null;
  if (body.codice_ateco !== undefined) updates.codice_ateco = txt(body.codice_ateco, 10) || null;
  if (body.sede_indirizzo !== undefined) updates.sede_indirizzo = txt(body.sede_indirizzo, 200) || null;
  if (body.sede_cap !== undefined) updates.sede_cap = txt(body.sede_cap, 10) || null;
  if (body.sede_comune !== undefined) updates.sede_comune = txt(body.sede_comune, 120) || null;
  if (body.sede_provincia !== undefined) updates.sede_provincia = txt(body.sede_provincia, 2).toUpperCase() || null;
  return { ok: true, updates };
}

export function erroreAzienda(error: { code?: string; message: string }): string {
  return error.code === '23505' ? 'Esiste già un’azienda con questa partita IVA.' : error.message;
}

export const AZIENDA_SELECT = 'id, tenant_id, ragione_sociale, partita_iva, codice_fiscale, codice_ateco, sede_indirizzo, sede_cap, sede_comune, sede_provincia, creato_il';
