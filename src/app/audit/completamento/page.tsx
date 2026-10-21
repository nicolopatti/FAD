import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { requireAuditor } from '@/lib/auth-context';
import { computeProgressoPerIscrizioni, computeFrequenzaPerIscrizioni, regolaLabel, aLotti, tutteLeRighe } from '@/lib/compliance';
import type { IscrizioneAuditRow } from '@/lib/db-types';
import { deriveIdoneita } from '@/lib/report-fondo';
import { CompletamentoTable, type RigaCompletamento } from './CompletamentoTable';
import { ScopeEdizione, type EdizioneScope } from './ScopeEdizione';

export const dynamic = 'force-dynamic';

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Sopra questa soglia la vista "tutte le edizioni" non è più il default. */
const SOGLIA_TUTTE = 300;

type EdizioneRow = {
  id: string; codice: string; data_inizio: string | null; concluso_at: string | null; annullato_at: string | null;
  corso: { titolo: string } | null;
  iscrizione: { count: number }[] | null;
};

export default async function CompletamentoPage(props: { searchParams?: Promise<{ edizione?: string }> }) {
  const searchParams = await props.searchParams;
  await requireAuditor();
  const supabase = await createSupabaseServerClient();

  // Ambito per edizione (Blocco B #2): il ricalcolo dagli Eventi è proporzionale
  // alle iscrizioni lette, quindi il server legge solo quelle dell'edizione
  // scelta. "Tutte" è il default finché il tenant è piccolo.
  const edizioniRaw = unwrap(await supabase
    .from('edizione')
    .select('id, codice, data_inizio, concluso_at, annullato_at, corso:corso_id ( titolo ), iscrizione ( count )')
    .returns<EdizioneRow[]>(), 'le edizioni');
  const edizioni: EdizioneScope[] = edizioniRaw
    .map((e) => ({
      id: e.id,
      codice: e.codice,
      corso: e.corso?.titolo ?? 'Corso',
      iscritti: e.iscrizione?.[0]?.count ?? 0,
      attiva: !e.concluso_at && !e.annullato_at,
      inizio: e.data_inizio ?? '',
    }))
    .sort((a, b) => Number(b.attiva) - Number(a.attiva) || b.inizio.localeCompare(a.inizio) || a.codice.localeCompare(b.codice, 'it'))
    .map(({ inizio: _inizio, ...e }) => e);
  const totale = edizioni.reduce((s, e) => s + e.iscritti, 0);
  const richiesta = searchParams?.edizione;
  const scelta = richiesta === 'tutte' ? 'tutte'
    : richiesta && edizioni.some((e) => e.id === richiesta) ? richiesta
      : totale <= SOGLIA_TUTTE || edizioni.length === 0 ? 'tutte' : edizioni[0].id;

  let q = supabase
    .from('iscrizione')
    .select(`
      id, persona_id, edizione_id,
      persona:persona_id ( nome, cognome, email ),
      edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
    `);
  if (scelta !== 'tutte') q = q.eq('edizione_id', scelta);
  const iscrizioni = unwrap(await q.returns<IscrizioneAuditRow[]>(), 'le iscrizioni');
  const ids = iscrizioni.map((i) => i.id);

  // Attestati validi (uno per iscrizione): l'auditor li legge via RLS.
  type AttMini = { id: string; iscrizione_id: string; numero: string; emesso_at: string; emesso_da: string | null };
  const attestati: AttMini[] = [];
  for (const lotto of aLotti(ids)) {
    attestati.push(...(await tutteLeRighe<AttMini>((da, a) => supabase
      .from('attestato')
      .select('id, iscrizione_id, numero, emesso_at, emesso_da')
      .in('iscrizione_id', lotto)
      .is('sostituito_da', null)
      .range(da, a)
      .returns<AttMini[]>(), 'degli attestati')));
  }
  const attestatoDi = new Map(attestati.map((a) => [a.iscrizione_id, a]));

  // Ricalcolo dagli Eventi per ogni iscrizione (D8): la verità è il registro,
  // non le colonne-cache. In blocco (Blocco B #2): un numero fisso di query per
  // tutte le iscrizioni dell'ambito invece di ~6 per ciascuna.
  const [progressi, frequenze] = await Promise.all([
    computeProgressoPerIscrizioni(supabase, ids),
    computeFrequenzaPerIscrizioni(supabase, ids),
  ]);
  const righe: RigaCompletamento[] = iscrizioni.map((i) => {
      const prog = progressi.get(i.id) ?? null;
      const freq = frequenze.get(i.id) ?? null;
      return {
        iscrizione_id: i.id,
        persona: i.persona,
        corso: i.edizione?.corso?.titolo ?? null,
        corso_id: i.edizione?.corso?.id ?? null,
        edizione: i.edizione?.codice ?? null,
        totale: prog?.totale ?? 0,
        completati: prog?.completati ?? 0,
        obbligatori_totale: prog?.obbligatori_totale ?? 0,
        obbligatori_completati: prog?.obbligatori_completati ?? 0,
        // Stessa regola di attestati e report fondi: lezioni obbligatorie E presenza minima (se il corso la chiede).
        idonea: deriveIdoneita(prog?.obbligatori_totale ?? 0, Boolean(prog?.idonea), freq?.soglia ?? null, Boolean(freq?.idoneo_frequenza), freq?.sessioni_totali).idoneo,
        frequenza: freq && freq.soglia != null
          ? { percentuale: freq.frequenza_percentuale, soglia: freq.soglia, ore: freq.ore_frequentate, ore_pianificate: round1(freq.minuti_pianificati / 60), idoneo: freq.idoneo_frequenza, non_parsate: freq.durate_non_parsate, in_attesa: freq.in_attesa_sessioni }
          : null,
        presenze: freq?.presenze ?? 0,
        attestato: (() => { const a = attestatoDi.get(i.id); return a ? { id: a.id, numero: a.numero, emesso_at: a.emesso_at, automatico: a.emesso_da == null } : null; })(),
        items: (prog?.items ?? []).map((it) => ({
          struttura_id: it.struttura_id,
          ordine: it.ordine,
          titolo: it.lo_titolo,
          tipo: it.lo_type,
          obbligatorio: it.obbligatorio,
          regola: regolaLabel(it.regola_completamento.tipo),
          integrale: Boolean(prog?.visione_integrale),
          copertura: it.copertura_percentuale ?? null,
          stato: it.completato ? 'ok' : it.sbloccato ? 'da_fare' : 'bloccato',
          completato_il: it.completato_il ?? null,
          quiz: it.quiz ? { tentativi: it.quiz.tentativi, migliore: it.quiz.migliore_percentuale, ultima: it.quiz.ultima_percentuale, superato: it.quiz.superato } : null,
        })),
      };
    });
  righe.sort((a, b) => `${a.persona?.cognome ?? ''} ${a.persona?.nome ?? ''}`.localeCompare(`${b.persona?.cognome ?? ''} ${b.persona?.nome ?? ''}`, 'it') || (a.corso ?? '').localeCompare(b.corso ?? '', 'it'));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Area auditor</span>
          <h1>Completamento</h1>
          <p>
            Per ogni iscrizione, lo stato delle lezioni e l&apos;idoneità sono ricalcolati a ogni apertura dagli eventi del registro.
            L&apos;idoneità richiede tutte le lezioni obbligatorie, ciascuna secondo la sua regola, e la presenza minima alle sessioni se il corso la prevede; le facoltative contano nell&apos;avanzamento ma non la bloccano. È la stessa regola di attestati e report fondi.
          </p>
        </div>
      </div>
      <ScopeEdizione edizioni={edizioni} scelta={scelta} totale={totale} soglia={SOGLIA_TUTTE} />
      <CompletamentoTable righe={righe} />
    </>
  );
}
