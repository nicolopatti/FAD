import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuditor } from '@/lib/auth-context';
import { computeProgressoForIscrizione, computeFrequenzaForIscrizione, regolaLabel } from '@/lib/compliance';
import type { IscrizioneAuditRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function CompletamentoPage() {
  await requireAuditor();
  const supabase = createSupabaseServerClient();

  const { data: iscrizioni } = await supabase
    .from('iscrizione')
    .select(`
      id, persona_id, edizione_id,
      persona:persona_id ( nome, cognome, email ),
      edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
    `)
    .returns<IscrizioneAuditRow[]>();

  const rows = await Promise.all(
    (iscrizioni ?? []).map(async (i) => {
      const [prog, freq] = await Promise.all([
        computeProgressoForIscrizione(supabase, i.id),
        computeFrequenzaForIscrizione(supabase, i.id),
      ]);
      return { i, prog, freq };
    }),
  );

  return (
    <>
      <h1>Completamento attività</h1>
      <p className="muted">
        Stato ricalcolato dagli <em>Eventi</em> a ogni apertura. Le colonne-cache
        sull'Iscrizione non vengono lette qui (D8): la verità è il log.
        L'idoneità richiede il completamento di tutti gli LO <strong>obbligatori</strong>,
        ciascuno secondo la sua <em>regola di completamento</em>; gli LO
        facoltativi contano nell'avanzamento ma non bloccano l'idoneità (D35).
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Discente</th>
              <th>Corso / Edizione</th>
              <th>Avanzamento</th>
              <th>Idoneità</th>
              <th>Frequenza webinar</th>
              <th>Dettaglio LO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, prog, freq }) => (
              <tr key={i.id}>
                <td>
                  {i.persona ? (
                    <>
                      {i.persona.nome} {i.persona.cognome}
                      <div className="muted">{i.persona.email}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {i.edizione?.corso?.titolo ?? <span className="muted">—</span>}
                  <div className="muted">ed. {i.edizione?.codice ?? '—'}</div>
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
                  {freq && freq.soglia != null ? (
                    <>
                      <span className={`badge ${freq.idoneo_frequenza ? 'ok' : 'warn'}`}>
                        {freq.frequenza_percentuale}%
                      </span>
                      <div className="muted" style={{ fontSize: '0.85em' }}>
                        soglia {freq.soglia}% · {freq.ore_frequentate}h / {round1(freq.minuti_pianificati / 60)}h
                      </div>
                      {freq.durate_non_parsate > 0 && (
                        <div className="muted" style={{ fontSize: '0.8em' }}>
                          {freq.durate_non_parsate} durate non interpretate
                        </div>
                      )}
                    </>
                  ) : freq && freq.presenze > 0 ? (
                    <span className="muted">{freq.presenze} presenze</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {prog && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {prog.items.map((it) => (
                        <li key={it.struttura_id} style={{ marginBottom: 4 }}>
                          <span className="mono">{it.ordine}.</span>{' '}
                          {it.lo_titolo}{' '}
                          <span className="badge muted">{it.lo_type}</span>{' '}
                          {it.obbligatorio ? (
                            <span className="badge">obbligatorio</span>
                          ) : (
                            <span className="badge muted">facoltativo</span>
                          )}{' '}
                          <span className="muted" style={{ fontSize: '0.85em' }}>
                            regola: {regolaLabel(it.regola_completamento.tipo)}
                          </span>{' '}
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
                <td colSpan={6} className="muted">
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
