import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEvent } from '@/lib/audit';
import { isEmail } from '@/lib/validazione';

export type IscrittoInput = {
  cognome?: string;
  nome?: string;
  email?: string;
  codice_fiscale?: string | null;
  azienda?: string | null;
  partita_iva?: string | null;  // se presente, l'azienda si riconosce per P.IVA prima che per nome
  piano_id?: string | null;
  data_nascita?: string | null;   // YYYY-MM-DD (per l'attestato)
  luogo_nascita?: string | null;
};

function dataIso(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); // formato italiano gg/mm/aaaa
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Partita IVA normalizzata (solo cifre/lettere maiuscole, senza spazi o prefisso IT); null se vuota. */
export function normalizzaPartitaIva(v: string | null | undefined): string | null {
  const s = (v ?? '').replace(/\s/g, '').toUpperCase().replace(/^IT/, '');
  return s ? s.slice(0, 16) : null;
}

export type AddIscrittoResult =
  | { status: 'created'; iscrizione_id: string; persona_creata: boolean }
  | { status: 'duplicate' }
  | { status: 'error'; error: string };

type Ctx = { tenantId: string; personaId: string };

/**
 * Un'edizione accetta iscritti solo se esiste ed è attiva (né conclusa né
 * annullata). Ritorna il motivo del rifiuto, oppure null se si può iscrivere.
 */
export async function motivoEdizioneChiusa(supabase: SupabaseClient, edizioneId: string): Promise<{ status: number; error: string } | null> {
  const { data, error } = await supabase.from('edizione').select('id, concluso_at, annullato_at').eq('id', edizioneId).maybeSingle();
  if (error) return { status: 400, error: error.message };
  if (!data) return { status: 404, error: 'Edizione non trovata.' };
  if (data.annullato_at) return { status: 409, error: 'Edizione annullata: non si aggiungono iscritti.' };
  if (data.concluso_at) return { status: 409, error: 'Edizione conclusa: non si aggiungono iscritti.' };
  return null;
}

/**
 * Risolve/crea Azienda (per ragione sociale), Persona (dedup per email nel tenant)
 * e Iscrizione (dedup per persona+edizione). Registra `persona.created` (se nuova)
 * e `iscrizione.created` — senza PII nel payload (D18). Usa il client RLS-bound
 * dell'admin (policy `persona_admin_all`/`iscrizione_admin_all`/`azienda_*_admin`).
 */
export async function addIscritto(
  supabase: SupabaseClient,
  ctx: Ctx,
  edizioneId: string,
  input: IscrittoInput,
): Promise<AddIscrittoResult> {
  const cognome = (input.cognome ?? '').trim();
  const nome = (input.nome ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  const cf = (input.codice_fiscale ?? '')?.trim() || null;
  const azienda = (input.azienda ?? '')?.trim() || null;
  const partitaIva = normalizzaPartitaIva(input.partita_iva);
  const pianoId = (input.piano_id ?? '')?.trim() || null;
  const dataNascita = dataIso(input.data_nascita);
  const luogoNascita = (input.luogo_nascita ?? '')?.trim().slice(0, 120) || null;

  if (!cognome || !nome || !email) {
    return { status: 'error', error: 'cognome, nome ed email sono obbligatori' };
  }
  if (!isEmail(email)) {
    return { status: 'error', error: `email non valida: ${email}` };
  }
  if ((input.data_nascita ?? '').trim() && !dataNascita) {
    return { status: 'error', error: 'data di nascita non valida (usa gg/mm/aaaa)' };
  }

  // 1) Azienda (opzionale) — find-or-create: prima per partita IVA (unica nel
  //    tenant), poi per ragione sociale. Una P.IVA nuova su un nome già noto
  //    completa l'azienda esistente.
  let aziendaId: string | null = null;
  if (azienda || partitaIva) {
    type AzMini = { id: string; partita_iva: string | null };
    let trovata: AzMini | null = null;
    if (partitaIva) {
      const { data } = await supabase.from('azienda').select('id, partita_iva').eq('tenant_id', ctx.tenantId).eq('partita_iva', partitaIva).limit(1).maybeSingle<AzMini>();
      trovata = data ?? null;
    }
    if (!trovata && azienda) {
      const { data } = await supabase.from('azienda').select('id, partita_iva').eq('tenant_id', ctx.tenantId).ilike('ragione_sociale', azienda).limit(1).maybeSingle<AzMini>();
      trovata = data ?? null;
    }
    if (trovata) {
      aziendaId = trovata.id;
      if (partitaIva && !trovata.partita_iva) {
        await supabase.from('azienda').update({ partita_iva: partitaIva }).eq('id', trovata.id);
      }
    } else {
      const { data: created, error } = await supabase
        .from('azienda')
        .insert({ tenant_id: ctx.tenantId, ragione_sociale: azienda ?? `P.IVA ${partitaIva}`, partita_iva: partitaIva })
        .select('id')
        .single();
      if (error) return { status: 'error', error: `azienda: ${error.message}` };
      aziendaId = created.id as string;
      await appendEvent({
        tenantId: ctx.tenantId,
        eventType: 'azienda.created',
        actor: { persona_id: ctx.personaId, type: 'persona' },
        subjectType: 'azienda',
        subjectId: aziendaId,
        payload: { origine: 'iscrizione', ha_partita_iva: partitaIva !== null },
      });
    }
  }

  // 2) Persona — dedup per email nel tenant (unique tenant_id,email).
  let personaId: string;
  let personaCreata = false;
  const { data: persona } = await supabase
    .from('persona')
    .select('id, codice_fiscale, data_nascita, luogo_nascita')
    .eq('tenant_id', ctx.tenantId)
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  if (persona) {
    personaId = persona.id as string;
    // completa CF e dati di nascita se mancanti (rendicontazione e attestato)
    const completa: Record<string, string> = {};
    if (cf && !persona.codice_fiscale) completa.codice_fiscale = cf;
    if (dataNascita && !persona.data_nascita) completa.data_nascita = dataNascita;
    if (luogoNascita && !persona.luogo_nascita) completa.luogo_nascita = luogoNascita;
    if (Object.keys(completa).length) {
      await supabase.from('persona').update(completa).eq('id', personaId);
    }
  } else {
    const { data: created, error } = await supabase
      .from('persona')
      .insert({ tenant_id: ctx.tenantId, nome, cognome, email, codice_fiscale: cf, data_nascita: dataNascita, luogo_nascita: luogoNascita })
      .select('id')
      .single();
    if (error) return { status: 'error', error: `persona: ${error.message}` };
    personaId = created.id as string;
    personaCreata = true;
    await appendEvent({
      tenantId: ctx.tenantId,
      eventType: 'persona.created',
      actor: { persona_id: ctx.personaId, type: 'persona' },
      subjectType: 'persona',
      subjectId: personaId,
      payload: { ha_codice_fiscale: cf !== null },
    });
  }

  // 3) Iscrizione — dedup per (persona, edizione).
  const { data: gia } = await supabase
    .from('iscrizione')
    .select('id')
    .eq('persona_id', personaId)
    .eq('edizione_id', edizioneId)
    .limit(1)
    .maybeSingle();
  if (gia) return { status: 'duplicate' };

  // Piano finanziato (opzionale): deve esistere nel tenant (RLS `piano_read`).
  if (pianoId) {
    const { data: piano } = await supabase.from('piano_formativo_finanziato').select('id').eq('id', pianoId).maybeSingle();
    if (!piano) return { status: 'error', error: 'piano finanziato non trovato' };
  }

  const { data: isc, error: iscErr } = await supabase
    .from('iscrizione')
    .insert({ tenant_id: ctx.tenantId, persona_id: personaId, edizione_id: edizioneId, azienda_id: aziendaId, piano_id: pianoId })
    .select('id')
    .single();
  if (iscErr) return { status: 'error', error: `iscrizione: ${iscErr.message}` };

  await appendEvent({
    tenantId: ctx.tenantId,
    eventType: 'iscrizione.created',
    actor: { persona_id: ctx.personaId, type: 'persona' },
    subjectType: 'iscrizione',
    subjectId: isc.id as string,
    payload: { edizione_id: edizioneId, persona_id: personaId, azienda_id: aziendaId, piano_id: pianoId },
  });

  return { status: 'created', iscrizione_id: isc.id as string, persona_creata: personaCreata };
}
