import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { intestatario, scorporoIva } from '@/lib/vendita';
import { ORDINE_ADMIN_SELECT, corsoDi, parseFiltroStato, type OrdineAdmin } from '@/lib/vendite-admin';

const LOTTO = 1000;
const MAX_RIGHE = 20000;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const euro = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/**
 * Fase 6 — export degli ordini per la fatturazione (§10.3: le fatture si
 * emettono dal gestionale dell'ente). CSV con `;` e BOM (si apre in Excel),
 * stessi filtri della lista (`?stato=&offerta=`), importi in euro con la virgola.
 */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const stato = parseFiltroStato(url.searchParams.get('stato') ?? undefined);
  const offerta = url.searchParams.get('offerta');
  const supabase = await createSupabaseServerClient();

  const righe: string[] = [[
    'data_pagamento', 'ordine', 'stato', 'tipo', 'intestatario', 'codice_fiscale', 'partita_iva', 'codice_sdi', 'pec',
    'indirizzo', 'cap', 'citta', 'provincia', 'nazione', 'email_account', 'corso', 'edizione',
    'totale_eur', 'sconto_eur', 'imponibile_eur', 'iva_eur', 'aliquota_iva', 'natura_iva', 'stripe_payment_intent', 'data_rimborso',
  ].join(';')];
  let from = 0;
  let troncato = false;
  for (;;) {
    let q = supabase.from('ordine').select(ORDINE_ADMIN_SELECT).order('creato_il', { ascending: true });
    if (stato !== 'tutti') q = q.eq('stato', stato);
    if (offerta) q = q.eq('offerta_id', offerta);
    const { data, error } = await q.range(from, from + LOTTO - 1).returns<OrdineAdmin[]>();
    if (error) return new Response(`Errore: ${error.message}`, { status: 500 });
    for (const o of data ?? []) {
      const f = o.fatturazione ?? {};
      const iva = scorporoIva(o.importo_centesimi, Number(o.aliquota_iva));
      righe.push([
        o.pagato_il ?? '', o.id, o.stato, f.tipo ?? '', intestatario(f), f.codice_fiscale ?? '', f.partita_iva ?? '', f.codice_sdi ?? '', f.pec ?? '',
        f.indirizzo ?? '', f.cap ?? '', f.citta ?? '', f.provincia ?? '', f.nazione ?? '', o.persona?.email ?? '', corsoDi(o), o.offerta?.edizione?.codice ?? '',
        euro(o.importo_centesimi), euro(o.sconto_centesimi), euro(iva.imponibile), euro(iva.iva), String(o.aliquota_iva).replace('.', ','), o.natura_iva ?? '',
        o.stripe_payment_intent ?? '', o.rimborsato_il ?? '',
      ].map(csvCell).join(';'));
    }
    if (!data || data.length < LOTTO) break;
    from += LOTTO;
    if (from >= MAX_RIGHE) { troncato = true; break; }
  }
  if (troncato) righe.push(`# export troncato a ${MAX_RIGHE} righe: filtra per stato o offerta`);
  const oggi = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + righe.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="vendite-${oggi}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
