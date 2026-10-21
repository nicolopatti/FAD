import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { computeProgressoPerIscrizioni, computeFrequenzaPerIscrizioni, regolaLabel } from '@/lib/compliance';
import type { EdizioneRow, IscrizioneAuditRow } from '@/lib/db-types';
import { deriveIdoneita } from '@/lib/report-fondo';
import { CompletamentoTable, type RigaCompletamento } from '@/app/audit/completamento/CompletamentoTable';
import { EdizioneAzioni } from '../../_components/EdizioneAzioni';
import { EdizioneModifica } from '../../../../_components/EdizioniPanel';

export const dynamic = 'force-dynamic';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scheda "Stato" dell'edizione: completamento e frequenza ricalcolati dal
 * registro (la stessa vista dell'auditor, qui per l'amministratore), attestati,
 * codice e date, chiusura.
 */
export default async function EdizioneStatoPage(props: { params: Promise<{ id: string; edizioneId: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: ed } = await supabase
    .from('edizione')
    .select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il')
    .eq('id', params.edizioneId).eq('corso_id', params.id)
    .maybeSingle<EdizioneRow>();
  if (!ed) notFound();

  const [altre, iscrizioni, attestati] = await Promise.all([
    supabase.from('edizione').select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il').eq('corso_id', params.id).neq('id', ed.id).returns<EdizioneRow[]>().then((r) => unwrap(r, 'le edizioni')),
    supabase.from('iscrizione').select('id, persona_id, edizione_id, persona:persona_id ( nome, cognome, email ), edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )').eq('edizione_id', ed.id).returns<IscrizioneAuditRow[]>().then((r) => unwrap(r, 'le iscrizioni')),
    supabase.from('attestato').select('id, iscrizione_id, numero, emesso_at, emesso_da').eq('edizione_id', ed.id).is('sostituito_da', null).returns<{ id: string; iscrizione_id: string; numero: string; emesso_at: string; emesso_da: string | null }[]>().then((r) => unwrap(r, 'gli attestati')),
  ]);
  const ids = iscrizioni.map((i) => i.id);
  const attestatoDi = new Map(attestati.map((a) => [a.iscrizione_id, a]));
  const [progressi, frequenze] = await Promise.all([computeProgressoPerIscrizioni(supabase, ids), computeFrequenzaPerIscrizioni(supabase, ids)]);

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
  righe.sort((a, b) => `${a.persona?.cognome ?? ''} ${a.persona?.nome ?? ''}`.localeCompare(`${b.persona?.cognome ?? ''} ${b.persona?.nome ?? ''}`, 'it'));

  return (
    <>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13.5 }}>Avanzamento degli iscritti, ricalcolato adesso dal registro degli eventi come nella vista dell&apos;auditor: lezioni completate, frequenza alle sessioni, idoneità, attestato.</p>
      {Array.from(frequenze.values()).some((f) => f.in_attesa_sessioni) && (
        <div className="banner banner--ocra" style={{ marginBottom: 14 }}>
          <Icon name="alert" className="banner__icon" />
          <div className="banner__body">
            <strong>Presenza minima impostata ma nessuna sessione pianificata.</strong> Finché l&apos;edizione non ha sessioni la presenza non conta: l&apos;idoneità dipende dalle sole lezioni e gli attestati non partono in automatico. <Link href={`/admin/corsi/${params.id}/edizioni/${ed.id}/sessioni`}>Pianifica le sessioni</Link> oppure, se il corso non ne prevede, togli la presenza minima prima della prima edizione.
          </div>
        </div>
      )}
      <CompletamentoTable righe={righe} />
      <EdizioneModifica edizione={ed} altre={altre} />
      <EdizioneAzioni edizione={ed} />
    </>
  );
}
