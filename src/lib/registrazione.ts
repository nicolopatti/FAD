import type { User } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabase/service';
import { appendEvent } from './audit';
import { hostRichiesta } from './vetrina';

/** Versione dell'informativa accettata alla registrazione (Fase 6). */
export const VERSIONE_INFORMATIVA_REGISTRAZIONE = 2;

export type EsitoPersona =
  | { ok: true; persona_id: string; tenant_id: string; esito: 'esistente' | 'collegata' | 'creata' }
  | { ok: false; errore: string };

/**
 * Fase 6 — registrazione autonoma: dopo la conferma dell'email l'utente Auth
 * non ha ancora una Persona. La si crea (o si collega quella già in anagrafica
 * con la stessa email, es. iscritta dall'admin) nell'ente dell'indirizzo, con la
 * RPC `persona_da_registrazione` (service role: controlla che l'email sia
 * confermata). Alla prima creazione/collegamento registra l'accettazione
 * dell'informativa data nel modulo di registrazione.
 */
export async function assicuraPersona(user: User): Promise<EsitoPersona> {
  if (!user.email_confirmed_at) return { ok: false, errore: 'L’indirizzo email non è ancora confermato: controlla la posta.' };
  let service;
  try { service = createSupabaseServiceClient(); } catch { return { ok: false, errore: 'Servizio non configurato.' }; }
  const host = await hostRichiesta();
  const { data: tenant } = await service.rpc('tenant_da_host', { p_host: host });
  if (!tenant) return { ok: false, errore: 'Questo indirizzo non è collegato a un ente: la registrazione non è disponibile.' };
  const meta = (user.user_metadata ?? {}) as { nome?: string; cognome?: string; informativa_versione?: number };
  const { data, error } = await service.rpc('persona_da_registrazione', {
    p_auth_user_id: user.id, p_tenant_id: tenant as string, p_nome: meta.nome ?? null, p_cognome: meta.cognome ?? null,
  });
  if (error) {
    const msg = error.message.includes('già collegata')
      ? 'Questa email è già collegata a un altro accesso: entra con quello o reimposta la password.'
      : error.message.includes('nome e cognome')
        ? 'Mancano nome e cognome: completa la registrazione.'
        : `Registrazione non completata: ${error.message}`;
    return { ok: false, errore: msg };
  }
  const r = data as { persona_id: string; tenant_id: string; esito: 'esistente' | 'collegata' | 'creata' };
  if (r.esito !== 'esistente' && meta.informativa_versione) {
    await appendEvent({
      tenantId: r.tenant_id,
      eventType: 'informativa.accettata',
      actor: { persona_id: r.persona_id, type: 'persona' },
      subjectType: 'persona',
      subjectId: r.persona_id,
      payload: { versione: Number(meta.informativa_versione), origine: 'registrazione' },
    });
  }
  return { ok: true, ...r };
}

/** Percorso interno sicuro per i ritorni (`?dopo=`): niente host esterni. */
export function percorsoSicuro(v: string | null | undefined, ripiego = '/'): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return ripiego;
  return v;
}
