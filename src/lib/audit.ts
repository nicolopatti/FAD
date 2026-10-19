import { createSupabaseServiceClient } from './supabase/service';

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

/**
 * Unica via applicativa per scrivere sul log. Usa il client con service role
 * perché `audit_append` non è più eseguibile dai ruoli `anon`/`authenticated`
 * (migration 20261019000001): chi chiama DEVE aver già verificato la sessione
 * e i permessi (requireSession/requireAdmin) e passare come `actor` la persona
 * autenticata (o, per le azioni admin, la persona a cui l'evento si riferisce).
 */
export async function appendEvent(input: AuditAppendInput) {
  assertNoPii(input.actor as unknown as Record<string, unknown>, 'actor');
  assertNoPii(input.payload, 'payload');

  const supabase = createSupabaseServiceClient();
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
