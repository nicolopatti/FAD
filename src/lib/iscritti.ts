import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEvent } from '@/lib/audit';

export type IscrittoInput = {
  cognome?: string;
  nome?: string;
  email?: string;
  codice_fiscale?: string | null;
  azienda?: string | null;
};

export type AddIscrittoResult =
  | { status: 'created'; iscrizione_id: string; persona_creata: boolean }
  | { status: 'duplicate' }
  | { status: 'error'; error: string };

type Ctx = { tenantId: string; personaId: string };

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

  if (!cognome || !nome || !email) {
    return { status: 'error', error: 'cognome, nome ed email sono obbligatori' };
  }

  // 1) Azienda (opzionale) — find-or-create per ragione sociale nel tenant.
  let aziendaId: string | null = null;
  if (azienda) {
    const { data: existing } = await supabase
      .from('azienda')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .ilike('ragione_sociale', azienda)
      .limit(1)
      .maybeSingle();
    if (existing) {
      aziendaId = existing.id as string;
    } else {
      const { data: created, error } = await supabase
        .from('azienda')
        .insert({ tenant_id: ctx.tenantId, ragione_sociale: azienda })
        .select('id')
        .single();
      if (error) return { status: 'error', error: `azienda: ${error.message}` };
      aziendaId = created.id as string;
    }
  }

  // 2) Persona — dedup per email nel tenant (unique tenant_id,email).
  let personaId: string;
  let personaCreata = false;
  const { data: persona } = await supabase
    .from('persona')
    .select('id, codice_fiscale')
    .eq('tenant_id', ctx.tenantId)
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  if (persona) {
    personaId = persona.id as string;
    // completa il CF se mancante (utile per la rendicontazione fondo)
    if (cf && !persona.codice_fiscale) {
      await supabase.from('persona').update({ codice_fiscale: cf }).eq('id', personaId);
    }
  } else {
    const { data: created, error } = await supabase
      .from('persona')
      .insert({ tenant_id: ctx.tenantId, nome, cognome, email, codice_fiscale: cf })
      .select('id')
      .single();
    if (error) return { status: 'error', error: `persona: ${error.message}` };
    personaId = created.id as string;
    personaCreata = true;
    await appendEvent(supabase, {
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

  const { data: isc, error: iscErr } = await supabase
    .from('iscrizione')
    .insert({ tenant_id: ctx.tenantId, persona_id: personaId, edizione_id: edizioneId, azienda_id: aziendaId })
    .select('id')
    .single();
  if (iscErr) return { status: 'error', error: `iscrizione: ${iscErr.message}` };

  await appendEvent(supabase, {
    tenantId: ctx.tenantId,
    eventType: 'iscrizione.created',
    actor: { persona_id: ctx.personaId, type: 'persona' },
    subjectType: 'iscrizione',
    subjectId: isc.id as string,
    payload: { edizione_id: edizioneId, persona_id: personaId, azienda_id: aziendaId },
  });

  return { status: 'created', iscrizione_id: isc.id as string, persona_creata: personaCreata };
}
