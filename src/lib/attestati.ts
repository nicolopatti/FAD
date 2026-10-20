import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabase/service';
import { computeProgressoForIscrizione, computeFrequenzaForIscrizione } from './compliance';
import { deriveIdoneita } from './report-fondo';
import { bytesToHex } from './audit-filtri';
import type { AttestatoRow, PoliticaAttestato } from './db-types';

/**
 * Attestato (Fase 5). Lo snapshot è costruito qui, lato server, dalle stesse
 * funzioni che usano l'auditor e il report fondo (compliance.ts: ricalcolo dagli
 * Eventi, D8); la RPC `attestato_emetti` aggiunge numero, codice, data e hash e
 * scrive l'Evento. Il PDF e il badge sono RESE di questo snapshot (lib/attestato-pdf).
 *
 * Tutte le funzioni usano la service role: l'autorizzazione è a monte
 * (route con requireSession/requireAdmin). L'emissione automatica non deve mai
 * far fallire l'azione del discente: i chiamanti la avvolgono in try/catch.
 */

export const SNAPSHOT_VERSIONE = 1;

export type AttestatoContenuto = {
  versione: number;
  ente: {
    ragione_sociale: string;
    citta: string | null;
    firmatario_nome: string | null;
    firmatario_ruolo: string | null;
    logo_path: string | null;
    firma_path: string | null;
    linkedin_organization_id: string | null;
  };
  discente: { nome: string; cognome: string; data_nascita: string | null; luogo_nascita: string | null };
  corso: { id: string; titolo: string; ore_totali: number | null; riferimento_normativo: string | null; categoria: string | null };
  edizione: { id: string; codice: string; data_inizio: string | null; data_fine: string | null };
  iscrizione_id: string;
  percorso: {
    totale: number;
    completate: number;
    lezioni: { ordine: number; titolo: string; tipo: string; obbligatoria: boolean; completata: boolean; completata_il: string | null }[];
  };
  test: { superato: boolean; percentuale: number | null; soglia: number | null; tentativi: number; superato_il: string | null } | null;
  frequenza: { ore_frequentate: number; percentuale: number; soglia: number } | null;
  criterio_idoneita: 'frequenza' | 'completamento' | 'misto' | 'nessuno';
  completato_il: string | null;
  registro: { seq: number | null; hash: string | null };
  // aggiunti dalla RPC:
  attestato_id?: string;
  numero?: string;
  codice_verifica?: string;
  emesso_il?: string;
  emesso_da?: string | null;
  sostituisce?: string | null;
};

type IscrizioneCompleta = {
  id: string;
  tenant_id: string;
  persona_id: string;
  edizione_id: string;
  persona: { nome: string; cognome: string; data_nascita: string | null; luogo_nascita: string | null } | null;
  edizione: {
    id: string; codice: string; data_inizio: string | null; data_fine: string | null;
    corso: { id: string; titolo: string; categoria: string | null; ore_totali: number | string | null; riferimento_normativo: string | null; politica_attestato: PoliticaAttestato; soglia_frequenza_percentuale: number | string | null } | null;
  } | null;
};

async function caricaIscrizione(service: SupabaseClient, iscrizioneId: string): Promise<IscrizioneCompleta | null> {
  const { data } = await service
    .from('iscrizione')
    .select(`
      id, tenant_id, persona_id, edizione_id,
      persona:persona_id ( nome, cognome, data_nascita, luogo_nascita ),
      edizione:edizione_id ( id, codice, data_inizio, data_fine,
        corso:corso_id ( id, titolo, categoria, ore_totali, riferimento_normativo, politica_attestato, soglia_frequenza_percentuale ) )
    `)
    .eq('id', iscrizioneId)
    .returns<IscrizioneCompleta[]>()
    .maybeSingle();
  return data ?? null;
}

/**
 * Snapshot risolto + esito dell'idoneità (ricalcolata adesso dagli Eventi).
 * Ritorna null se l'iscrizione non esiste.
 */
export async function costruisciSnapshot(
  service: SupabaseClient,
  iscrizioneId: string,
): Promise<{ idoneo: boolean; contenuto: AttestatoContenuto } | null> {
  const iscr = await caricaIscrizione(service, iscrizioneId);
  if (!iscr?.edizione?.corso || !iscr.persona) return null;
  const corso = iscr.edizione.corso;

  const [prog, freq, enteRes, testaRes] = await Promise.all([
    computeProgressoForIscrizione(service, iscrizioneId),
    computeFrequenzaForIscrizione(service, iscrizioneId),
    service.from('tenant').select('nome, ragione_sociale, citta, firmatario_nome, firmatario_ruolo, logo_path, firma_path, linkedin_organization_id').eq('id', iscr.tenant_id).maybeSingle(),
    service.from('evento').select('seq, hash').eq('tenant_id', iscr.tenant_id).order('seq', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ente = (enteRes.data ?? null) as { nome: string; ragione_sociale: string | null; citta: string | null; firmatario_nome: string | null; firmatario_ruolo: string | null; logo_path: string | null; firma_path: string | null; linkedin_organization_id: string | null } | null;
  const testa = (testaRes.data ?? null) as { seq: number; hash: unknown } | null;

  const obbligatoriTot = prog?.obbligatori_totale ?? 0;
  const soglia = corso.soglia_frequenza_percentuale != null ? Number(corso.soglia_frequenza_percentuale) : null;
  const { criterio, idoneo } = deriveIdoneita(obbligatoriTot, prog?.idonea ?? false, soglia, freq?.idoneo_frequenza ?? false);

  const quizItem = prog?.items.find((i) => i.lo_type === 'quiz' && i.obbligatorio) ?? prog?.items.find((i) => i.lo_type === 'quiz');
  const soglie = quizItem ? Number((quizItem.lo_config as { soglia_percentuale?: unknown }).soglia_percentuale) : NaN;
  const completatoIl = prog?.items.filter((i) => i.obbligatorio && i.completato_il).map((i) => i.completato_il!).sort().at(-1) ?? null;

  const contenuto: AttestatoContenuto = {
    versione: SNAPSHOT_VERSIONE,
    ente: {
      ragione_sociale: ente?.ragione_sociale?.trim() || ente?.nome || 'Ente di formazione',
      citta: ente?.citta ?? null,
      firmatario_nome: ente?.firmatario_nome ?? null,
      firmatario_ruolo: ente?.firmatario_ruolo ?? null,
      logo_path: ente?.logo_path ?? null,
      firma_path: ente?.firma_path ?? null,
      linkedin_organization_id: ente?.linkedin_organization_id ?? null,
    },
    discente: {
      nome: iscr.persona.nome,
      cognome: iscr.persona.cognome,
      data_nascita: iscr.persona.data_nascita ?? null,
      luogo_nascita: iscr.persona.luogo_nascita ?? null,
    },
    corso: {
      id: corso.id,
      titolo: corso.titolo,
      ore_totali: corso.ore_totali != null ? Number(corso.ore_totali) : null,
      riferimento_normativo: corso.riferimento_normativo ?? null,
      categoria: corso.categoria ?? null,
    },
    edizione: { id: iscr.edizione.id, codice: iscr.edizione.codice, data_inizio: iscr.edizione.data_inizio ?? null, data_fine: iscr.edizione.data_fine ?? null },
    iscrizione_id: iscr.id,
    percorso: {
      totale: prog?.totale ?? 0,
      completate: prog?.completati ?? 0,
      lezioni: (prog?.items ?? []).map((i) => ({
        ordine: i.ordine, titolo: i.lo_titolo, tipo: i.lo_type, obbligatoria: i.obbligatorio,
        completata: i.completato, completata_il: i.completato_il ?? null,
      })),
    },
    test: quizItem
      ? {
        superato: Boolean(quizItem.quiz?.superato),
        percentuale: quizItem.quiz?.migliore_percentuale ?? null,
        soglia: Number.isFinite(soglie) ? soglie : null,
        tentativi: quizItem.quiz?.tentativi ?? 0,
        superato_il: quizItem.quiz?.superato_il ?? null,
      }
      : null,
    frequenza: freq && freq.soglia != null
      ? { ore_frequentate: freq.ore_frequentate, percentuale: freq.frequenza_percentuale, soglia: freq.soglia }
      : null,
    criterio_idoneita: criterio,
    completato_il: completatoIl,
    registro: { seq: testa?.seq ?? null, hash: testa?.hash != null ? bytesToHex(testa.hash as string) : null },
  };
  return { idoneo, contenuto };
}

export type EsitoEmissione = { attestato_id: string; numero: string; codice_verifica: string; hash: string };

async function attestatoValido(service: SupabaseClient, iscrizioneId: string): Promise<AttestatoRow | null> {
  const { data } = await service
    .from('attestato')
    .select('*')
    .eq('iscrizione_id', iscrizioneId)
    .is('sostituito_da', null)
    .order('emesso_at', { ascending: false })
    .limit(1)
    .returns<AttestatoRow[]>()
    .maybeSingle();
  return data ?? null;
}

/**
 * Emissione automatica (politica `automatica`): se l'iscrizione è idonea e non
 * ha un attestato valido, lo emette. Ritorna l'esito o null se non c'era nulla
 * da fare. L'attore dell'Evento è la persona la cui azione ha chiuso il percorso
 * (il discente) o l'admin che ha registrato le presenze.
 */
export async function emettiAttestatoSeIdonea(iscrizioneId: string, attorePersonaId: string): Promise<EsitoEmissione | null> {
  const service = createSupabaseServiceClient();
  const iscr = await caricaIscrizione(service, iscrizioneId);
  if (!iscr?.edizione?.corso) return null;
  if (iscr.edizione.corso.politica_attestato !== 'automatica') return null;
  if (await attestatoValido(service, iscrizioneId)) return null;
  const snap = await costruisciSnapshot(service, iscrizioneId);
  if (!snap || !snap.idoneo) return null;
  const { data, error } = await service.rpc('attestato_emetti', {
    p_iscrizione_id: iscrizioneId,
    p_contenuto: snap.contenuto,
    p_attore: attorePersonaId,
    p_emesso_da: null,
    p_sostituisce: null,
    p_motivazione: null,
  });
  if (error) throw error;
  return data as EsitoEmissione;
}

/** Emissione (o riemissione) manuale dall'admin. Richiede comunque l'idoneità. */
export async function emettiAttestatoManuale(
  iscrizioneId: string,
  adminPersonaId: string,
  opts: { sostituisce?: string | null; motivazione?: string | null } = {},
): Promise<EsitoEmissione> {
  const service = createSupabaseServiceClient();
  const snap = await costruisciSnapshot(service, iscrizioneId);
  if (!snap) throw new Error('Iscrizione non trovata.');
  if (!snap.idoneo) throw new Error('Il percorso non è completato: l’attestato si emette solo a idoneità raggiunta.');
  const { data, error } = await service.rpc('attestato_emetti', {
    p_iscrizione_id: iscrizioneId,
    p_contenuto: snap.contenuto,
    p_attore: adminPersonaId,
    p_emesso_da: adminPersonaId,
    p_sostituisce: opts.sostituisce ?? null,
    p_motivazione: opts.motivazione ?? null,
  });
  if (error) throw new Error(error.message.replace(/^attestato_emetti: /, ''));
  return data as EsitoEmissione;
}

/** Dopo un cambio di presenze: prova l'emissione automatica per tutti gli iscritti dell'edizione. */
export async function emettiPerEdizioneSeIdonee(edizioneId: string, attorePersonaId: string): Promise<EsitoEmissione[]> {
  const service = createSupabaseServiceClient();
  const { data: iscrizioni } = await service.from('iscrizione').select('id').eq('edizione_id', edizioneId).returns<{ id: string }[]>();
  const esiti: EsitoEmissione[] = [];
  for (const i of iscrizioni ?? []) {
    try {
      const e = await emettiAttestatoSeIdonea(i.id, attorePersonaId);
      if (e) esiti.push(e);
    } catch (err) {
      console.error('[attestato] emissione automatica fallita per iscrizione', i.id, err);
    }
  }
  return esiti;
}

export async function emettiPerSessioneSeIdonee(sessioneId: string, attorePersonaId: string): Promise<EsitoEmissione[]> {
  const service = createSupabaseServiceClient();
  const { data: s } = await service.from('sessione').select('edizione_id').eq('id', sessioneId).maybeSingle<{ edizione_id: string }>();
  if (!s) return [];
  return emettiPerEdizioneSeIdonee(s.edizione_id, attorePersonaId);
}

/** Variante "silenziosa" per le route del discente: mai un errore verso il client. */
export async function provaEmissioneAutomatica(iscrizioneId: string, attorePersonaId: string): Promise<EsitoEmissione | null> {
  try {
    return await emettiAttestatoSeIdonea(iscrizioneId, attorePersonaId);
  } catch (err) {
    console.error('[attestato] emissione automatica fallita', iscrizioneId, err);
    return null;
  }
}

/** Link "Aggiungi al profilo" di LinkedIn, precompilato dallo snapshot. */
export function linkedInAddToProfileUrl(a: Pick<AttestatoRow, 'numero' | 'codice_verifica' | 'emesso_at' | 'contenuto'>, baseUrl: string): string {
  const c = a.contenuto as unknown as AttestatoContenuto;
  const d = new Date(a.emesso_at);
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.corso?.titolo ?? 'Attestato',
    organizationName: c.ente?.ragione_sociale ?? '',
    issueYear: String(d.getFullYear()),
    issueMonth: String(d.getMonth() + 1),
    certUrl: `${baseUrl}/verifica/${a.codice_verifica}`,
    certId: a.numero,
  });
  if (c.ente?.linkedin_organization_id) params.set('organizationId', c.ente.linkedin_organization_id);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
