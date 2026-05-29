import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SessioneConEdizione } from '@/lib/db-types';
import { CsvImportForm } from './CsvImportForm';
import { CodaResolver, type CodaItem, type IscrittoOption } from './CodaResolver';
import { PresenzeManager, type PresenzaItem } from './PresenzeManager';

export const dynamic = 'force-dynamic';

type GrezzoConContenuto = {
  id: string;
  fonte: string;
  importato_da: string | null;
  creato_il: string;
  contenuto: unknown;
};
type CodaRowDb = { id: string; riga: number; tipo: 'ambiguo' | 'assente'; candidati: string[]; grezzo_id: string };
type IscrittoDb = { id: string; persona: { nome: string; cognome: string; email: string } | null };

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function SessioneDetailPage({ params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: sessione } = await supabase
    .from('sessione')
    .select(`
      id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id,
      annullato_at, creato_il,
      edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
    `)
    .eq('id', params.id)
    .maybeSingle<SessioneConEdizione>();

  if (!sessione) notFound();
  const edizioneId = sessione.edizione?.id ?? null;

  const { data: grezziRaw } = await supabase
    .from('report_partecipazione_grezzo')
    .select('id, fonte, importato_da, creato_il, contenuto')
    .eq('sessione_id', params.id)
    .order('creato_il', { ascending: false })
    .returns<GrezzoConContenuto[]>();

  const grezzi = (grezziRaw ?? []).map((g) => ({
    id: g.id,
    fonte: g.fonte,
    importato_da: g.importato_da,
    creato_il: g.creato_il,
    righe: Array.isArray(g.contenuto) ? g.contenuto.length : null,
  }));

  // Lookup (grezzo_id:riga) → riga normalizzata, per mostrare nome/email nella coda.
  const rowByKey = new Map<string, { nome: string | null; email: string | null }>();
  for (const g of grezziRaw ?? []) {
    if (!Array.isArray(g.contenuto)) continue;
    for (const r of g.contenuto as { riga?: number; nome?: string; email?: string | null }[]) {
      if (r?.riga == null) continue;
      rowByKey.set(`${g.id}:${r.riga}`, { nome: r.nome ?? null, email: r.email ?? null });
    }
  }

  // Iscritti dell'Edizione (admin può leggerli, policy Fase 3): per dropdown + label candidati.
  const { data: iscrittiDb } = edizioneId
    ? await supabase
        .from('iscrizione')
        .select('id, persona:persona_id ( nome, cognome, email )')
        .eq('edizione_id', edizioneId)
        .returns<IscrittoDb[]>()
    : { data: [] as IscrittoDb[] };
  const labelOf = (i: IscrittoDb): string =>
    i.persona ? `${i.persona.nome} ${i.persona.cognome} (${i.persona.email})` : i.id;
  const iscrittiById = new Map<string, IscrittoOption>();
  const tuttiIscritti: IscrittoOption[] = (iscrittiDb ?? []).map((i) => {
    const opt = { id: i.id, label: labelOf(i) };
    iscrittiById.set(i.id, opt);
    return opt;
  });

  // Coda pending della sessione → arricchita per la UI.
  const { data: codaDb } = await supabase
    .from('coda_riconciliazione')
    .select('id, riga, tipo, candidati, grezzo_id')
    .eq('sessione_id', params.id)
    .is('risolto_at', null)
    .order('riga', { ascending: true })
    .returns<CodaRowDb[]>();

  const codaItems: CodaItem[] = (codaDb ?? []).map((c) => {
    const row = rowByKey.get(`${c.grezzo_id}:${c.riga}`);
    return {
      id: c.id,
      riga: c.riga,
      tipo: c.tipo,
      rowNome: row?.nome ?? null,
      rowEmail: row?.email ?? null,
      candidati: (Array.isArray(c.candidati) ? c.candidati : [])
        .map((id) => iscrittiById.get(id))
        .filter((x): x is IscrittoOption => Boolean(x)),
    };
  });

  // Presenze registrate (Eventi, admin-readable via policy Fase 3). Una
  // correzione "supera" l'Evento referenziato (mostrato barrato).
  type PresEvtDb = {
    id: string;
    event_type: string;
    payload: { iscrizione_id?: string; durata?: string | null; corregge_evento_id?: string | null } | null;
  };
  const { data: presEvt } = await supabase
    .from('evento')
    .select('id, event_type, payload')
    .eq('subject_id', params.id)
    .in('event_type', ['presenza_webinar_registrata', 'presenza_inserita_manualmente', 'presenza_corretta_manualmente'])
    .order('seq', { ascending: true })
    .returns<PresEvtDb[]>();
  const supersededIds = new Set<string>();
  for (const e of presEvt ?? []) {
    const ref = e.payload?.corregge_evento_id;
    if (ref) supersededIds.add(ref);
  }
  const presenze: PresenzaItem[] = (presEvt ?? []).map((e) => ({
    id: e.id,
    iscrizioneLabel: (e.payload?.iscrizione_id && iscrittiById.get(e.payload.iscrizione_id)?.label) || '(iscritto?)',
    durata: e.payload?.durata ?? null,
    origine:
      e.event_type === 'presenza_inserita_manualmente'
        ? 'manuale'
        : e.event_type === 'presenza_corretta_manualmente'
          ? 'corretta'
          : 'automatica',
    superseded: supersededIds.has(e.id),
  }));

  return (
    <>
      <div className="muted" style={{ marginBottom: 8 }}>
        <Link href="/admin/sessioni">← Sessioni</Link>
      </div>
      <h1 style={{ marginBottom: 4 }}>
        {sessione.titolo}
        {sessione.annullato_at && <span className="badge bad" style={{ marginLeft: 8 }}>annullata</span>}
      </h1>
      <div className="muted" style={{ marginBottom: 16 }}>
        {sessione.edizione?.corso?.titolo ?? '—'}
        {sessione.edizione?.codice && <span className="mono"> · {sessione.edizione.codice}</span>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Dettagli</h3>
        <table>
          <tbody>
            <tr><th style={{ width: 200 }}>Modalità</th><td>{sessione.modalita === 'vcs' ? `VCS · ${sessione.vcs_piattaforma ?? '?'}` : 'aula'}</td></tr>
            <tr><th>Quando</th><td>{fmtData(sessione.data_ora)}{sessione.durata_minuti != null && ` · ${sessione.durata_minuti} min`}</td></tr>
            {sessione.modalita === 'vcs' && (
              <tr><th>ID riunione VCS</th><td className="mono">{sessione.vcs_meeting_id ?? '—'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Report di partecipazione importati ({grezzi.length})</h3>
        <div className="muted" style={{ marginBottom: 8, fontSize: '0.9em' }}>
          Ogni import è <strong>write-once</strong> (D20): prova immutabile. L&apos;hash del
          contenuto è attestato nel <em>log eventi</em> (vista auditor). La riconciliazione
          gira in automatico all&apos;import; le righe non risolte finiscono in coda qui sotto.
        </div>
        {grezzi.length === 0 ? (
          <div className="muted">Nessun report importato per questa sessione.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Importato il</th><th>Fonte</th><th>Righe</th><th>Importato da</th></tr>
            </thead>
            <tbody>
              {grezzi.map((g) => (
                <tr key={g.id}>
                  <td className="muted">{fmtData(g.creato_il)}</td>
                  <td><span className="badge muted">{g.fonte}</span></td>
                  <td>{g.righe ?? '—'}</td>
                  <td className="mono">{g.importato_da === session.personaId ? 'tu' : (g.importato_da ?? 'automatico')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CodaResolver items={codaItems} tuttiIscritti={tuttiIscritti} />

      <PresenzeManager sessioneId={sessione.id} presenze={presenze} tuttiIscritti={tuttiIscritti} />

      <CsvImportForm sessioneId={sessione.id} />
    </>
  );
}
