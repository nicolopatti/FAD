import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase/server';

export type SessionContext = {
  userId: string;
  email: string;
  personaId: string;
  tenantId: string;
  isAuditor: boolean;
  isAdmin: boolean;
};

export async function requireSession(): Promise<SessionContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: persona, error } = await supabase
    .from('persona')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !persona) {
    throw new Error('Persona collegata all\'utente non trovata');
  }

  const appMeta = (user.app_metadata ?? {}) as { role?: string };
  return {
    userId: user.id,
    email: user.email ?? '',
    personaId: persona.id,
    tenantId: persona.tenant_id,
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
