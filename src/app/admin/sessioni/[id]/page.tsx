import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SessioneConEdizione } from '@/lib/db-types';
import { CsvImportForm } from './CsvImportForm';

export const dynamic = 'force-dynamic';

type GrezzoConContenuto = {
  id: string;
  fonte: string;
  importato_da: string | null;
  creato_il: string;
  contenuto: unknown;
};

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

  const { data: grezziRaw } = await supabase
    .from('report_partecipazione_grezzo')
    .select('id, fonte, importato_da, creato_il, contenuto')
    .eq('sessione_id', params.id)
    .order('creato_il', { ascending: false })
    .returns<GrezzoConContenuto[]>();

  // Conta le righe server-side senza esporre il contenuto (PII di staging) al client.
  const grezzi = (grezziRaw ?? []).map((g) => ({
    id: g.id,
    fonte: g.fonte,
    importato_da: g.importato_da,
    creato_il: g.creato_il,
    righe: Array.isArray(g.contenuto) ? g.contenuto.length : null,
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
          Ogni import è <strong>write-once</strong> (D20): è una prova immutabile. Più
          report per sessione sono ammessi (es. CSV + API). L&apos;hash del contenuto è
          attestato nel <em>log eventi</em> (vista auditor).
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
                  <td className="mono">
                    {g.importato_da === session.personaId ? 'tu' : (g.importato_da ?? 'automatico')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CsvImportForm sessioneId={sessione.id} />
    </>
  );
}
