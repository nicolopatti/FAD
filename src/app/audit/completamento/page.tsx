import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { requireAuditor } from '@/lib/auth-context';
import { computeProgressoForIscrizione, computeFrequenzaForIscrizione, regolaLabel } from '@/lib/compliance';
import type { IscrizioneAuditRow } from '@/lib/db-types';
import { CompletamentoTable, type RigaCompletamento } from './CompletamentoTable';

export const dynamic = 'force-dynamic';

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function CompletamentoPage() {
  await requireAuditor();
  const supabase = createSupabaseServerClient();

  const iscrizioni = unwrap(await supabase
    .from('iscrizione')
    .select(`
      id, persona_id, edizione_id,
      persona:persona_id ( nome, cognome, email ),
      edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
    `)
    .returns<IscrizioneAuditRow[]>(), 'le iscrizioni');

  // Attestati validi (uno per iscrizione): l'auditor li legge via RLS.
  const { data: attestati } = await supabase
    .from('attestato')
    .select('id, iscrizione_id, numero, emesso_at, emesso_da')
    .is('sostituito_da', null)
    .returns<{ id: string; iscrizione_id: string; numero: string; emesso_at: string; emesso_da: string | null }[]>();
  const attestatoDi = new Map((attestati ?? []).map((a) => [a.iscrizione_id, a]));

  // Ricalcolo dagli Eventi per ogni iscrizione (D8): la verità è il registro,
  // non le colonne-cache. (Blocco B #2: da portare in una funzione SQL.)
  const righe: RigaCompletamento[] = await Promise.all(
    iscrizioni.map(async (i) => {
      const [prog, freq] = await Promise.all([
        computeProgressoForIscrizione(supabase, i.id),
        computeFrequenzaForIscrizione(supabase, i.id),
      ]);
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
        idonea: Boolean(prog?.idonea),
        frequenza: freq && freq.soglia != null
          ? { percentuale: freq.frequenza_percentuale, soglia: freq.soglia, ore: freq.ore_frequentate, ore_pianificate: round1(freq.minuti_pianificati / 60), idoneo: freq.idoneo_frequenza, non_parsate: freq.durate_non_parsate }
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
    }),
  );
  righe.sort((a, b) => `${a.persona?.cognome ?? ''} ${a.persona?.nome ?? ''}`.localeCompare(`${b.persona?.cognome ?? ''} ${b.persona?.nome ?? ''}`, 'it') || (a.corso ?? '').localeCompare(b.corso ?? '', 'it'));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Area auditor</span>
          <h1>Completamento</h1>
          <p>
            Per ogni iscrizione, lo stato delle lezioni e l&apos;idoneità sono ricalcolati a ogni apertura dagli eventi del registro.
            L&apos;idoneità richiede tutte le lezioni obbligatorie, ciascuna secondo la sua regola; le facoltative contano nell&apos;avanzamento ma non la bloccano.
          </p>
        </div>
      </div>
      <CompletamentoTable righe={righe} />
    </>
  );
}
