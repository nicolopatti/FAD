import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Crumb, Ico } from '@/components/AppShell';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { DocumentoPlayer } from '@/components/DocumentoPlayer';
import { formatEventDetail, fmtTime, type StreamEvent } from '@/lib/event-stream';

export const dynamic = 'force-dynamic';

export default async function LearningObjectPage({
  params,
}: {
  params: { edizioneId: string; loId: string };
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

  const item = prog.items.find((i) => i.learning_object_id === params.loId);
  if (!item) notFound();

  const indice = prog.items.findIndex((i) => i.learning_object_id === params.loId) + 1;

  // Stream eventi "dal log": eventi di questo LO per la persona corrente.
  // La RLS (evento_read) restringe già alle righe con actor.persona_id = sé,
  // quindi non servono filtri aggiuntivi sull'attore.
  const { data: logEvents } = await supabase
    .from('evento')
    .select('event_type, occurred_at, payload')
    .eq('subject_type', 'learning_object')
    .eq('subject_id', params.loId)
    .order('seq', { ascending: true })
    .returns<{ event_type: string; occurred_at: string; payload: Record<string, unknown> | null }[]>();
  const initialEvents: StreamEvent[] = (logEvents ?? []).map((ev) => ({
    t: fmtTime(ev.occurred_at),
    e: ev.event_type,
    d: formatEventDetail(ev.event_type, ev.payload),
  }));

  // D26: enforcement server-side. Se non sbloccato, l'accesso è negato.
  if (!item.sbloccato) {
    return (
      <AppShell user={{ name: session.nome, email: session.email }} role="discente" active="corsi" wide>
        <Crumb
          items={[
            { label: 'I miei corsi', href: '/corsi' },
            { label: prog.corso_titolo, href: `/corsi/${params.edizioneId}` },
            { label: item.lo_titolo },
          ]}
        />
        <div className="alert">
          <strong>Contenuto bloccato.</strong> Completa prima gli oggetti didattici
          precedenti obbligatori.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" active="corsi" wide>
      <Crumb
        items={[
          { label: 'I miei corsi', href: '/corsi' },
          { label: prog.corso_titolo, href: `/corsi/${params.edizioneId}` },
          { label: `LO ${String(indice).padStart(2, '0')} · ${item.lo_titolo}` },
        ]}
      />

      <div className="player-layout">
        {/* Player + descrizione */}
        <div className="stack-lg">
          <div className="player-stage">
            <div className="player-body">
              <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                {item.completato ? (
                  <span className="chip chip--ok">
                    <span className="dot" />
                    Completato
                  </span>
                ) : (
                  <span className="chip chip--accent">
                    <span className="dot" />
                    In corso
                  </span>
                )}
                <span className="chip">{item.obbligatorio ? 'Obbligatorio' : 'Facoltativo'}</span>
                <span className="chip chip--ghost">{item.lo_type === 'video' ? 'Video' : 'Documento'}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>
                  Oggetto {indice} di {prog.totale}
                </span>
              </div>
              <h2 style={{ fontSize: 28, marginBottom: 16 }}>{item.lo_titolo}</h2>

              {item.lo_type === 'video' ? (
                <VimeoPlayer
                  vimeoId={String((item.lo_config as { vimeo_id?: string }).vimeo_id ?? '')}
                  iscrizioneId={iscrizione.id}
                  learningObjectId={item.learning_object_id}
                  initialEvents={initialEvents}
                />
              ) : item.lo_type === 'documento' ? (
                <DocumentoPlayer
                  iscrizioneId={iscrizione.id}
                  learningObjectId={item.learning_object_id}
                  filename={(item.lo_config as { filename?: string }).filename}
                  alreadyCompleted={item.completato}
                  initialEvents={initialEvents}
                />
              ) : (
                <div className="alert">Tipo di Learning Object non supportato.</div>
              )}

              <div className="alert alert--audit" style={{ marginTop: 22 }}>
                <span className="seal" style={{ background: 'var(--primary)' }}>i</span>
                <div>
                  {item.lo_type === 'video' ? (
                    <>
                      <strong>Riproduzione tracciata.</strong> Gli eventi del player (play /
                      pause / seek / ended) sono firmati e accodati al log immutabile del
                      tenant. L&apos;oggetto si considera completato solo all&apos;invio
                      dell&apos;evento <code>video.ended</code>: non esistono scorciatoie.
                    </>
                  ) : (
                    <>
                      <strong>Lettura tracciata.</strong> Apertura e completamento del
                      documento sono accodati al log immutabile del tenant. L&apos;oggetto
                      risulta completato dopo l&apos;evento <code>documento.completed</code>.
                    </>
                  )}
                </div>
              </div>

              {item.completato && item.lo_type === 'video' && (
                <div className="alert ok" style={{ marginTop: 14 }}>
                  Hai già completato questo oggetto. Puoi rivederlo, il completamento resta valido.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Outline corso */}
        <aside className="player-sidebar">
          <div className="panel" style={{ padding: '20px 18px' }}>
            <div className="row row--between" style={{ marginBottom: 14, padding: '0 6px' }}>
              <span className="eyebrow">Programma del corso</span>
              <span className="meta" style={{ fontSize: 12 }}>
                {prog.completati} di {prog.totale}
              </span>
            </div>
            <div className="progress" style={{ marginBottom: 18 }}>
              <div
                className={`progress__bar ${prog.idonea ? 'is-ok' : 'is-warn'}`}
                style={{ width: `${prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0}%` }}
              />
            </div>

            <ol className="outline-list">
              {prog.items.map((lo, i) => {
                const active = lo.learning_object_id === params.loId;
                const cls = lo.completato
                  ? 'is-ok'
                  : active
                    ? 'is-current'
                    : !lo.sbloccato
                      ? 'is-locked'
                      : '';
                const inner = (
                  <>
                    <span className="outline-row__icon">
                      {lo.completato ? (
                        <Ico name="check" size={16} />
                      ) : !lo.sbloccato ? (
                        <Ico name="lock" size={14} />
                      ) : (
                        <Ico name="play" size={14} />
                      )}
                    </span>
                    <span>
                      <div className="outline-row__title">{lo.lo_titolo}</div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: active ? 'var(--primary)' : 'var(--muted-2)',
                          marginTop: 2,
                        }}
                      >
                        LO {String(i + 1).padStart(2, '0')} · {lo.lo_type === 'video' ? 'Video' : 'Documento'}
                      </div>
                    </span>
                    <span className="outline-row__num">{!lo.sbloccato ? '—' : ''}</span>
                  </>
                );
                return (
                  <li key={lo.struttura_id} className={`outline-row ${cls}`}>
                    {lo.sbloccato && !active ? (
                      <Link
                        href={`/corsi/${params.edizioneId}/lo/${lo.learning_object_id}`}
                        style={{ display: 'contents', color: 'inherit' }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ol>

            <div style={{ paddingTop: 16, marginTop: 10, borderTop: '1px solid var(--border)' }}>
              <Link className="btn btn--block" href={`/corsi/${params.edizioneId}`}>
                Torna al corso
                <Ico name="chevR" size={14} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
