/// <reference types="vitest" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

/**
 * M1a — criterio 2 ("Append serializzato") con concorrenza vera.
 *
 * Apre N connessioni Postgres separate e lancia audit_append in parallelo
 * sullo stesso stream. La pgTAP suite (supabase/tests/m1a_audit_log.sql)
 * verifica gli altri 5 criteri ma gira in singola transazione, quindi NON
 * può testare il lock di riga FOR UPDATE tra connessioni distinte.
 *
 * Si connette via PG_URL (default: il Postgres locale del container di test).
 */

const PG_URL =
  process.env.PG_URL
  ?? process.env.SUPABASE_DB_URL
  ?? 'postgres://postgres@/fad_test?host=/var/run/postgresql';

const PARALLEL = 50;

async function exec(sql: string, params: unknown[] = []) {
  const c = new Client({ connectionString: PG_URL });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

describe('M1a — append serializzato (N connessioni parallele)', () => {
  let tenantId: string;
  let streamId: string;

  beforeAll(async () => {
    const t = await exec(
      `insert into public.tenant (nome) values ($1) returning id`,
      [`Test concorrenza ${Date.now()}`],
    );
    tenantId = t.rows[0].id;
    const s = await exec(
      `insert into public.stream_audit (tenant_id, scope) values ($1, 'tenant') returning id`,
      [tenantId],
    );
    streamId = s.rows[0].id;
  });

  afterAll(async () => {
    // Pulisce il tenant di test (evita di sporcare il DB per run successivi).
    await exec(`delete from public.stream_audit where tenant_id = $1`, [tenantId]).catch(
      () => undefined,
    );
    await exec(`delete from public.tenant where id = $1`, [tenantId]).catch(() => undefined);
  });

  it(`${PARALLEL} append concorrenti producono seq contigui, no duplicati, no buchi`, async () => {
    const personaId = '00000000-0000-0000-0000-0000000000aa';
    const launches = Array.from({ length: PARALLEL }, (_, i) =>
      exec(
        `select * from public.audit_append($1, $2, $3::jsonb, $4, $5, $6::jsonb)`,
        [
          tenantId,
          'test.parallel',
          JSON.stringify({ persona_id: personaId, type: 'persona' }),
          'tenant',
          tenantId,
          JSON.stringify({ i }),
        ],
      ),
    );
    const results = await Promise.all(launches);
    expect(results.length).toBe(PARALLEL);
    for (const r of results) {
      expect(r.rowCount).toBe(1);
    }

    const rows = await exec(
      `select seq, prev_hash, hash
         from public.evento
        where stream_id = $1
        order by seq asc`,
      [streamId],
    );
    expect(rows.rowCount).toBe(PARALLEL);
    const seqs = rows.rows.map((r) => Number(r.seq));
    for (let i = 0; i < seqs.length; i++) {
      expect(seqs[i]).toBe(i + 1);
    }
    // catena hash: prev_hash(i) === hash(i-1)
    for (let i = 1; i < rows.rows.length; i++) {
      const prev = rows.rows[i].prev_hash as Buffer;
      const lastHash = rows.rows[i - 1].hash as Buffer;
      expect(prev.equals(lastHash)).toBe(true);
    }
  });

  it('audit_verify_chain conferma integrità dopo concorrenza', async () => {
    const r = await exec(
      `select * from public.audit_verify_chain($1)`,
      [streamId],
    );
    expect(r.rowCount).toBe(0);
  });
});
