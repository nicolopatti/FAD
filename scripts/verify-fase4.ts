/**
 * Verifica Fase 4 — esegue il motore di aggregazione del report fondo contro il
 * Supabase LIVE, autenticato come admin reale (RLS attiva). Non è un test CI:
 * è uno strumento di verifica manuale (M4a) da lanciare con le env del progetto.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   ADMIN_EMAIL=admin@fad.local ADMIN_PASSWORD=admin-pass-123 \
 *   npx tsx scripts/verify-fase4.ts
 *
 * Edizione/Piano finanziati del seed Fase 3/4 (override via env EDIZIONE_ID/PIANO_ID).
 */
import { createClient } from '@supabase/supabase-js';
import { computeReportFondoDataset } from '../src/lib/report-fondo';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@fad.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin-pass-123';
const EDIZIONE_ID = process.env.EDIZIONE_ID ?? '33333333-0000-0000-0000-0000000000e1';
const PIANO_ID = process.env.PIANO_ID ?? '33333333-0000-0000-0000-0000000000b1';

async function main() {
  if (!URL || !ANON) throw new Error('Mancano NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in env');
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });

  const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) throw new Error(`login fallito (${EMAIL}): ${authErr.message}`);

  const dataset = await computeReportFondoDataset(supabase, EDIZIONE_ID, PIANO_ID);
  if (!dataset) {
    console.log('DATASET = null (edizione/piano non leggibili — RLS o inesistenti)');
    return;
  }

  console.log('=== TESTATA ===');
  console.log(JSON.stringify(dataset.testata, null, 2));
  console.log('\n=== ISCRITTI ===');
  for (const it of dataset.iscritti) {
    console.log(
      `- ${it.cognome} ${it.nome} | CF=${it.codice_fiscale ?? 'MANCANTE'} | ` +
        `azienda=${it.azienda_ragione_sociale ?? 'NESSUNA'} | ` +
        `freq=${it.frequenza_percentuale}% (${it.ore_frequentate}h) | ` +
        `FAD ${it.obbligatori_completati}/${it.obbligatori_totale} | ` +
        `criterio=${it.criterio_idoneita} | idoneo=${it.idoneo}`,
    );
  }
  console.log('\n=== SESSIONI ===');
  for (const s of dataset.sessioni) {
    console.log(
      `- ${s.titolo} | ${s.data_ora ?? '—'} | ${s.durata_minuti ?? '—'}min | ${s.modalita} | ` +
        `docente=${s.docente ?? '—'}${s.annullata ? ' | ANNULLATA' : ''}`,
    );
  }
  console.log('\nOK — dataset calcolato dal log.');
}

main().catch((e) => {
  console.error('ERRORE:', e.message ?? e);
  process.exit(1);
});
