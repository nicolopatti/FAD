import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from './supabase/service';
import { appendEvent } from './audit';
import { appBaseUrl } from './url';
import type { SessionContext } from './auth-context';

/**
 * Invito di una Persona alla piattaforma (Blocco C/D): crea l'utente Supabase
 * Auth e manda l'email con il link per scegliere la password (atterra su
 * /auth/reimposta, dove al primo accesso si accetta anche l'informativa).
 * Le Persone importate dagli iscritti nascono senza utente Auth: finché non
 * sono invitate non possono entrare. Evento `persona.invitata` senza PII.
 *
 * Email: senza SMTP proprio Supabase usa il suo mailer con limiti stretti
 * (poche email l'ora) — per l'uso reale configurare l'SMTP in Auth → SMTP.
 */
export type PersonaDaInvitare = { id: string; email: string; nome: string; auth_user_id: string | null };

export async function invitaPersona(
  userClient: SupabaseClient,
  session: SessionContext,
  persona: PersonaDaInvitare,
): Promise<{ persona_id: string; auth_user_id: string; gia_registrato: boolean }> {
  if (persona.auth_user_id) throw new Error('La persona ha già un accesso.');
  const email = persona.email.trim().toLowerCase();
  if (!email) throw new Error('La persona non ha un indirizzo email.');
  const service = createSupabaseServiceClient();

  let authUserId: string | null = null;
  let giaRegistrato = false;
  const inv = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appBaseUrl()}/auth/reimposta`,
    data: { nome: persona.nome },
  });
  if (inv.error) {
    const m = inv.error.message.toLowerCase();
    if (m.includes('already been registered') || m.includes('already registered') || m.includes('already exists')) {
      // Utente Auth già esistente (es. invitato in passato e poi scollegato): lo si ricollega.
      const lista = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = lista.data?.users.find((x) => x.email?.toLowerCase() === email);
      if (!u) throw new Error(inv.error.message);
      authUserId = u.id;
      giaRegistrato = true;
    } else {
      throw new Error(m.includes('rate limit') || m.includes('too many') ? 'Limite di invio email raggiunto: riprova più tardi o configura un SMTP proprio in Supabase.' : inv.error.message);
    }
  } else {
    authUserId = inv.data.user.id;
  }

  const { error } = await userClient.from('persona').update({ auth_user_id: authUserId }).eq('id', persona.id);
  if (error) throw new Error(`Invito inviato ma collegamento non riuscito: ${error.message}`);

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'persona.invitata',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'persona',
    subjectId: persona.id,
    payload: { gia_registrato: giaRegistrato },
  });
  return { persona_id: persona.id, auth_user_id: authUserId!, gia_registrato: giaRegistrato };
}
