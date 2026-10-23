import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabase/service';
import { finestraIscrizione } from './finestra';

/**
 * Fase 6 — vetrina pubblica (catalogo e scheda del corso). L'ente si riconosce
 * dall'indirizzo della richiesta (`tenant_dominio`, RPC `tenant_da_host`); i
 * dati arrivano solo dalle RPC pubbliche `catalogo_pubblico`/`catalogo_offerta`
 * (campi pubblici, nessun dato di persone).
 */
export async function hostRichiesta(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase();
}

export type OffertaCatalogo = {
  slug: string;
  titolo: string;
  descrizione: string;
  categoria: string | null;
  cover_path: string | null;
  /** Prezzo di oggi: quello scontato se c'è uno sconto a tempo attivo. */
  prezzo_centesimi: number;
  /** Prezzo di listino, solo se oggi vale uno sconto a tempo (da mostrare barrato). */
  listino_centesimi: number | null;
  sconto_etichetta: string | null;
  sconto_fino_al: string | null;
  valuta: string;
  ore_totali: number | null;
  tipo: 'online' | 'date';
  accesso_giorni: number | null;
  data_inizio: string | null;
  data_fine: string | null;
  attestato: boolean;
  n_lezioni: number;
  durata_secondi: number;
  in_vendita: boolean;
  motivo: string | null;
};

export type Catalogo = { ente: string | null; offerte: OffertaCatalogo[] };

export type LezioneScheda = { ordine: number; titolo: string; tipo: 'video' | 'documento' | 'quiz'; durata_secondi: number | null; obbligatoria: boolean };
export type SessioneScheda = { titolo: string; data_ora: string | null; durata_minuti: number | null; modalita: string };

export type SchedaOfferta = Omit<OffertaCatalogo, 'n_lezioni' | 'durata_secondi'> & {
  offerta_id: string;
  ente: string | null;
  aliquota_iva: number;
  natura_iva: string | null;
  riferimento_normativo: string | null;
  posti_max: number | null;
  posti_rimasti: number | null;
  codici_sconto: boolean;
  lezioni: LezioneScheda[];
  sessioni: SessioneScheda[];
};

export async function caricaCatalogo(supabase: SupabaseClient, host: string): Promise<Catalogo> {
  const { data, error } = await supabase.rpc('catalogo_pubblico', { p_host: host });
  if (error) throw new Error(`Lettura del catalogo non riuscita: ${error.message}`);
  return (data as Catalogo | null) ?? { ente: null, offerte: [] };
}

export async function caricaScheda(supabase: SupabaseClient, host: string, slug: string): Promise<SchedaOfferta | null> {
  const { data, error } = await supabase.rpc('catalogo_offerta', { p_host: host, p_slug: slug });
  if (error) throw new Error(`Lettura della scheda non riuscita: ${error.message}`);
  return (data as SchedaOfferta | null) ?? null;
}

/** "Accesso per 12 mesi" / "Accesso per 90 giorni". */
export function durataAccesso(giorni: number | null): string | null {
  if (!giorni) return null;
  if (giorni % 365 === 0) { const a = giorni / 365; return `Accesso per ${a === 1 ? '12 mesi' : `${a} anni`}`; }
  if (giorni % 30 === 0 && giorni >= 60) return `Accesso per ${giorni / 30} mesi`;
  return `Accesso per ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`;
}

/** Paragrafi da un testo libero (a capo = paragrafo). */
export function paragrafi(testo: string | null | undefined): string[] {
  return (testo ?? '').split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Edizione dell'offerta se chi è entrato ci è già iscritto con l'accesso aperto
 * (o non ancora aperto): la scheda mostra "vai al corso" e l'acquisto non parte.
 * L'offerta non è leggibile dal discente: l'edizione si legge con la service
 * role (solo l'id), l'iscrizione con il client dell'utente (RLS). Senza chiave
 * di servizio risponde null: decide comunque `ordine_crea` ("già iscritto").
 */
export async function edizioneGiaIscritta(supabase: SupabaseClient, offertaId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let edizioneId: string | null = null;
  try {
    const { data } = await createSupabaseServiceClient().from('offerta').select('edizione_id').eq('id', offertaId).maybeSingle<{ edizione_id: string }>();
    edizioneId = data?.edizione_id ?? null;
  } catch { return null; }
  if (!edizioneId) return null;
  const { data: persona } = await supabase.from('persona').select('id').eq('auth_user_id', user.id).maybeSingle<{ id: string }>();
  if (!persona) return null;
  const { data: iscr } = await supabase
    .from('iscrizione')
    .select('id, accesso_dal, accesso_fino_al, accesso_revocato_at, edizione:edizione_id ( data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at )')
    .eq('persona_id', persona.id).eq('edizione_id', edizioneId)
    .maybeSingle<{ id: string; accesso_dal: string | null; accesso_fino_al: string | null; accesso_revocato_at: string | null; edizione: Parameters<typeof finestraIscrizione>[0] | null }>();
  if (!iscr?.edizione) return null;
  const f = finestraIscrizione(iscr.edizione, iscr);
  return f.aperta || f.stato === 'non_aperta' ? edizioneId : null;
}
