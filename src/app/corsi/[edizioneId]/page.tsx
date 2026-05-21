import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { TopBar } from '@/components/TopBar';

export const dynamic = 'force-dynamic';

export default async function DettaglioCorsoPage({
  params,
}: {
  params: { edizioneId: string };
}) {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  return (
    <>
      <TopBar email={session.email} isAuditor={session.isAuditor} />
      <main className="shell">
        <p>
          <Link href="/corsi">← I miei corsi</Link>
        </p>
        <h1>{prog.corso_titolo}</h1>
        <div className="muted" style={{ marginBottom: 16 }}>
          {prog.sblocco_sequenziale
            ? 'Sblocco sequenziale: i contenuti diventano disponibili al completamento del precedente.'
            : 'Contenuti disponibili in qualunque ordine.'}
        </div>
        <div className="card">
          <h2>Oggetti didattici</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Titolo</th>
                <th>Stato</th>
                <th>Azione</th>
              </tr>
            </thead>
            <tbody>
              {prog.items.map((it) => (
                <tr key={it.struttura_id}>
                  <td>{it.ordine}</td>
                  <td>
                    {it.lo_titolo}
                    {it.obbligatorio && (
                      <span className="badge muted" style={{ marginLeft: 8 }}>
                        obbligatorio
                      </span>
                    )}
                  </td>
                  <td>
                    {it.completato ? (
                      <span className="badge ok">completato</span>
                    ) : it.sbloccato ? (
                      <span className="badge warn">da fare</span>
                    ) : (
                      <span className="badge muted">bloccato</span>
                    )}
                  </td>
                  <td>
                    {it.sbloccato ? (
                      <Link
                        className="btn"
                        href={`/corsi/${params.edizioneId}/lo/${it.learning_object_id}`}
                      >
                        Apri
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
