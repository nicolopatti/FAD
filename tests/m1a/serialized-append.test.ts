/// <reference types="vitest" />
import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasEnv = Boolean(SUPABASE_URL && SERVICE_KEY);

const PARALLEL = 50;

(hasEnv ? describe : describe.skip)('M1a — append serializzato (concorrenza reale)', () => {
  let admin: SupabaseClient;
  let tenantId: string;
  let baselineSeq: number;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { persistSession: false },
    });

    // Crea un tenant + stream isolato per il test
    const { data: tenant, error: errT } = await admin
      .from('tenant')
      .insert({ nome: `Test concorrenza ${Date.now()}` })
      .select('id')
      .single();
    if (errT || !tenant) throw errT ?? new Error('tenant non creato');
    tenantId = tenant.id;

    const { error: errS } = await admin
      .from('stream_audit')
      .insert({ tenant_id: tenantId, scope: 'tenant' });
    if (errS) throw errS;

    baselineSeq = 0;
  });

  it(`${PARALLEL} append paralleli producono seq contigui, senza duplicati né buchi`, async () => {
    const fakePersona = '00000000-0000-0000-0000-0000000000aa';
    const calls = Array.from({ length: PARALLEL }, (_, i) =>
      admin.rpc('audit_append', {
        p_tenant_id: tenantId,
        p_event_type: 'test.parallel',
        p_actor: { persona_id: fakePersona, type: 'persona' },
        p_subject_type: 'tenant',
        p_subject_id: tenantId,
        p_payload: { i },
      }),
    );
    const results = await Promise.all(calls);
    for (const r of results) {
      expect(r.error).toBeNull();
    }

    const { data: rows, error } = await admin
      .from('evento')
      .select('seq, prev_hash, hash')
      .eq('tenant_id', tenantId)
      .order('seq', { ascending: true });
    expect(error).toBeNull();
    expect(rows).toBeTruthy();
    const seqs = (rows ?? []).map((r) => Number(r.seq));
    expect(seqs.length).toBe(baselineSeq + PARALLEL);
    // monotoni contigui
    for (let i = 0; i < seqs.length; i++) {
      expect(seqs[i]).toBe(i + 1);
    }
    // catena hash: prev_hash(i) === hash(i-1)
    for (let i = 1; i < (rows ?? []).length; i++) {
      expect((rows ?? [])[i].prev_hash).toBe((rows ?? [])[i - 1].hash);
    }
  });

  it('audit_verify_chain conferma integrità dopo gli append paralleli', async () => {
    const { data: stream } = await admin
      .from('stream_audit')
      .select('id')
      .eq('tenant_id', tenantId)
      .single();
    expect(stream).toBeTruthy();
    const { data, error } = await admin.rpc('audit_verify_chain', {
      p_stream_id: stream!.id,
    });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(0);
  });
});
