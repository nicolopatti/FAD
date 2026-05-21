import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuditor } from '@/lib/auth-context';
import { computeProgressoForIscrizione } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export default async function CompletamentoPage() {
  await requireAuditor();
  const supabase = createSupabaseServerClient();

  const { data: iscrizioni } = await supabase
    .from('iscrizione')
    .select(`
      id, persona_id, edizione_id,
      persona:persona_id ( nome, cognome, email ),
      edizione:edizione_id ( codice, corso:corso_id ( titolo ) )
    `);

  const rows = await Promise.all(
    (iscrizioni ?? []).map(async (i: any) => {
      const prog = await computeProgressoForIscrizione(supabase, i.id);
      return { i, prog };
    }),
  );

  return (
    <>
      <h1>Completamento attività</h1>
      <p className="muted">
        Stato ricalcolato dagli <em>Eventi</em> a ogni apertura. Le colonne-cache
        sull'Iscrizione non vengono lette qui (D8): la verità è il log.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Discente</th>
              <th>Corso / Edizione</th>
              <th>Avanzamento</th>
              <th>Idoneità</th>
              <th>Dettaglio LO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, prog }) => (
              <tr key={i.id}>
                <td>
                  {i.persona.nome} {i.persona.cognome}
                  <div className="muted">{i.persona.email}</div>
                </td>
                <td>
                  {i.edizione.corso.titolo}
                  <div className="muted">ed. {i.edizione.codice}</div>
                </td>
                <td>
                  {prog ? (
                    <>
                      {prog.completati}/{prog.totale} totali
                      <div className="muted">
                        obbligatori {prog.obbligatori_completati}/{prog.obbligatori_totale}
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {prog?.idonea ? (
                    <span className="badge ok">idoneo</span>
                  ) : (
                    <span className="badge warn">in corso</span>
                  )}
                </td>
                <td>
                  {prog && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {prog.items.map((it) => (
                        <li key={it.struttura_id}>
                          <span className="mono">{it.ordine}.</span>{' '}
                          {it.lo_titolo}{' '}
                          {it.completato ? (
                            <span className="badge ok">ok</span>
                          ) : it.sbloccato ? (
                            <span className="badge warn">da fare</span>
                          ) : (
                            <span className="badge muted">bloccato</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Nessuna iscrizione presente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
