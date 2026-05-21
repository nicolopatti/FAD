import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditActor = {
  persona_id: string;
  type?: 'persona';
};

export type AuditAppendInput = {
  tenantId: string;
  eventType: string;
  actor: AuditActor;
  subjectType: string;
  subjectId: string | null;
  payload?: Record<string, unknown>;
};

const PII_KEYS = ['nome', 'cognome', 'email', 'codice_fiscale', 'cf'];

function assertNoPii(obj: Record<string, unknown> | undefined, where: string) {
  if (!obj) return;
  for (const k of PII_KEYS) {
    if (k in obj) {
      throw new Error(`audit append: ${where} non può contenere PII (chiave "${k}")`);
    }
  }
}

export async function appendEvent(
  supabase: SupabaseClient,
  input: AuditAppendInput,
) {
  assertNoPii(input.actor as unknown as Record<string, unknown>, 'actor');
  assertNoPii(input.payload, 'payload');

  const { data, error } = await supabase.rpc('audit_append', {
    p_tenant_id: input.tenantId,
    p_event_type: input.eventType,
    p_actor: input.actor,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_payload: input.payload ?? {},
  });
  if (error) throw error;
  return data;
}
