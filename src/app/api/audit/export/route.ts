import { requireAuditor } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { applicaFiltri, bytesToHex, parseFiltri } from '@/lib/audit-filtri';
import type { EventoRow } from '@/lib/db-types';

const MAX_RIGHE = 20000;
const LOTTO = 1000;

function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Esporta in CSV il log eventi (stream grezzo, pseudonimo: nessuna PII) con
// gli stessi filtri della pagina. Ordine crescente di seq, a lotti, fino a
// MAX_RIGHE: oltre, l'auditor restringe il periodo.
export async function GET(request: Request) {
  await requireAuditor();
  const url = new URL(request.url);
  const filtri = parseFiltri(url.searchParams);
  const supabase = createSupabaseServerClient();

  const righe: string[] = [
    ['seq', 'occurred_at', 'event_type', 'actor_persona_id', 'actor_type', 'subject_type', 'subject_id', 'payload', 'prev_hash', 'hash'].join(';'),
  ];
  let from = 0;
  let troncato = false;
  for (;;) {
    const q = supabase
      .from('evento')
      .select('id, seq, event_type, occurred_at, actor, subject_type, subject_id, payload, prev_hash, hash');
    applicaFiltri(q, filtri);
    const { data, error } = await q.order('seq', { ascending: true }).range(from, from + LOTTO - 1).returns<EventoRow[]>();
    if (error) return new Response(`Errore: ${error.message}`, { status: 500 });
    for (const e of data ?? []) {
      righe.push(
        [
          e.seq,
          e.occurred_at,
          e.event_type,
          e.actor?.persona_id ?? '',
          e.actor?.type ?? '',
          e.subject_type,
          e.subject_id ?? '',
          e.payload && Object.keys(e.payload).length ? e.payload : '',
          bytesToHex(e.prev_hash),
          bytesToHex(e.hash),
        ].map(csvCell).join(';'),
      );
    }
    if (!data || data.length < LOTTO) break;
    from += LOTTO;
    if (from >= MAX_RIGHE) { troncato = true; break; }
  }
  if (troncato) righe.push(`# export troncato a ${MAX_RIGHE} righe: restringi il periodo`);

  const giorno = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + righe.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="log-eventi-${giorno}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
