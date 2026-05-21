import Link from 'next/link';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { TopBar } from '@/components/TopBar';
import type { IscrizioneListaRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function MieiCorsiPage() {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizioni } = await supabase
    .from('iscrizione')
    .select('id, edizione_id, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )')
    .eq('persona_id', session.personaId)
    .returns<IscrizioneListaRow[]>();

  const rows = await Promise.all(
    (iscrizioni ?? []).map(async (i) => {
      const prog = await computeProgressoForIscrizione(supabase, i.id);
      return { iscrizione: i, prog };
    }),
  );

  return (
    <>
      <TopBar email={session.email} isAuditor={session.isAuditor} />
      <main className="shell">
        <h1>I miei corsi</h1>
        {rows.length === 0 && (
          <div className="card muted">Nessun corso ancora assegnato.</div>
        )}
        {rows.map(({ iscrizione, prog }) => {
          const corsoTitolo = iscrizione.edizione?.corso?.titolo ?? '— corso non disponibile —';
          const codice = iscrizione.edizione?.codice ?? '—';
          return (
            <Link
              key={iscrizione.id}
              href={`/corsi/${iscrizione.edizione_id}`}
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card">
                <h2>{corsoTitolo}</h2>
                <div className="muted">Edizione {codice}</div>
                {prog && (
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${prog.idonea ? 'ok' : 'warn'}`}>
                      {prog.idonea ? 'Idoneo' : 'In corso'}
                    </span>{' '}
                    <span className="muted">
                      {prog.completati} / {prog.totale} oggetti didattici completati
                    </span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </main>
    </>
  );
}
