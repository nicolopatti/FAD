import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase/server';

export type SessionContext = {
  userId: string;
  email: string;
  personaId: string;
  tenantId: string;
  nome: string;
  cognome: string;
  isAuditor: boolean;
  isAdmin: boolean;
};

export async function requireSession(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let { data: persona } = await supabase
    .from('persona')
    .select('id, tenant_id, nome, cognome')
    .eq('auth_user_id', user.id)
    .maybeSingle<{ id: string; tenant_id: string; nome: string | null; cognome: string | null }>();
  if (!persona) {
    // Fase 6: utente registrato da solo, Persona non ancora creata (es. ha
    // confermato l'email su un altro dispositivo). Si crea qui, una volta.
    const { assicuraPersona } = await import('./registrazione');
    const esito = await assicuraPersona(user);
    if (esito.ok) {
      ({ data: persona } = await supabase.from('persona').select('id, tenant_id, nome, cognome').eq('auth_user_id', user.id)
        .maybeSingle<{ id: string; tenant_id: string; nome: string | null; cognome: string | null }>());
    }
    if (!persona) throw new Error(esito.ok ? 'Persona collegata all\'utente non trovata' : esito.errore);
  }

  const appMeta = (user.app_metadata ?? {}) as { role?: string };
  return {
    userId: user.id,
    email: user.email ?? '',
    personaId: persona.id,
    tenantId: persona.tenant_id,
    nome: persona.nome ?? '',
    cognome: persona.cognome ?? '',
    isAuditor: appMeta.role === 'auditor',
    isAdmin: appMeta.role === 'admin',
  };
}

export async function requireAuditor(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.isAuditor) redirect('/corsi');
  return ctx;
}

export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.isAdmin) redirect('/');
  return ctx;
}
