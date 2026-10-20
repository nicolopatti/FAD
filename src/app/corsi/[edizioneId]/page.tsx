import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Crumb, Ico } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  video: 'Video',
  documento: 'Documento',
};

export default async function DettaglioCorsoPage({
  params,
}: {
  params: { edizioneId: string };
}) {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, edizione:edizione_id ( codice, corso:corso_id ( descrizione ) )')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle<{
      id: string;
      edizione: { codice: string; corso: { descrizione: string | null } | null } | null;
    }>();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  const codice = iscrizione.edizione?.codice ?? '—';
  const descrizione = iscrizione.edizione?.corso?.descrizione ?? null;
  const pct = prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0;
  // Lo stato "current" = primo oggetto sbloccato e non ancora completato.
  const currentId = prog.items.find((i) => i.sbloccato && !i.completato)?.learning_object_id;
  const next = prog.items.find((i) => i.sbloccato && !i.completato) ?? prog.items.find((i) => i.sbloccato);

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" active="corsi" wide>
      <Crumb
        items={[{ label: 'I miei corsi', href: '/corsi' }, { label: prog.corso_titolo }]}
      />

      {/* Hero del corso: classi CSS (prima era tutto inline e non reggeva su telefono) */}
      <section className="course-hero">
        <div className="course-hero__inner">
          <div className="course-hero__chips">
            <span className="chip chip--onDark">Edizione {codice}</span>
            <span className="chip chip--onDark">{prog.totale} lezion{prog.totale === 1 ? 'e' : 'i'}</span>
            <span className="chip chip--onDark">{prog.idonea ? 'Idoneità ottenuta' : `${prog.completati} completat${prog.completati === 1 ? 'a' : 'e'}`}</span>
          </div>
          <h1 className="course-hero__title">{prog.corso_titolo}</h1>
          {descrizione && <p className="course-hero__desc">{descrizione}</p>}
          {next && (
            <div className="course-hero__actions">
              <Link
                className="btn btn--accent btn--lg"
                href={`/corsi/${params.edizioneId}/lo/${next.learning_object_id}`}
              >
                {prog.completati === 0 ? 'Inizia il corso' : 'Riprendi'}
                <Ico name="play" size={14} />
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="detail-layout">
        {/* Programma */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 24 }}>Programma del corso</h2>
              <p className="meta" style={{ margin: '4px 0 0' }}>
                {prog.sblocco_sequenziale
                  ? "Sblocco sequenziale degli obbligatori — l'ordine è applicato dal server."
                  : 'Contenuti disponibili in qualunque ordine.'}
              </p>
            </div>
            <span className="meta">
              {prog.completati} di {prog.totale} completati
            </span>
          </div>

          <div>
            {prog.items.map((it) => {
              const stato = it.completato
                ? 'ok'
                : it.sbloccato
                  ? 'current'
                  : 'locked';
              const isCurrent = it.learning_object_id === currentId;
              return (
                <div
                  key={it.struttura_id}
                  className={`lo-row ${stato === 'ok' ? 'is-ok' : ''} ${isCurrent ? 'is-current' : ''} ${stato === 'locked' ? 'is-locked' : ''}`}
                >
                  <div className="lo-row__index">
                    {it.completato ? (
                      <Ico name="check" size={16} />
                    ) : !it.sbloccato ? (
                      <Ico name="lock" size={14} />
                    ) : (
                      String(it.ordine).padStart(2, '0')
                    )}
                  </div>
                  <div>
                    <div className="lo-row__title">{it.lo_titolo}</div>
                    <div className="lo-row__meta">
                      <span>{TYPE_LABEL[it.lo_type] ?? it.lo_type}</span>
                      <span>· {it.obbligatorio ? 'Obbligatorio' : 'Facoltativo'}</span>
                      {it.completato && <span style={{ color: 'var(--primary)' }}>· Completato</span>}
                      {isCurrent && <span style={{ color: 'var(--accent)' }}>· Da fare</span>}
                      {!it.completato && it.copertura_percentuale != null && it.copertura_percentuale > 0 && (
                        <span>· Visto {it.copertura_percentuale}%{prog.visione_integrale ? ' (serve il 95%)' : ''}</span>
                      )}
                      {stato === 'locked' && (
                        <span style={{ color: 'var(--muted-2)' }}>· Si sblocca al completamento del precedente</span>
                      )}
                    </div>
                  </div>
                  <div className="lo-row__action">
                    {it.sbloccato ? (
                      <Link
                        className="btn btn--ghost btn--sm"
                        href={`/corsi/${params.edizioneId}/lo/${it.learning_object_id}`}
                      >
                        {it.completato ? 'Rivedi' : 'Apri'}
                        <Ico name="chevR" size={14} />
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--muted-2)' }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sidebar avanzamento */}
        <aside className="player-sidebar">
          <div className="panel">
            <span className="eyebrow">Il tuo avanzamento</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>
                {pct}
                <span style={{ fontSize: 26, color: 'var(--muted-2)' }}>%</span>
              </span>
            </div>
            <div className="progress progress--lg" style={{ marginBottom: 18 }}>
              <div className={`progress__bar ${prog.idonea ? 'is-ok' : 'is-warn'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="stack-sm" style={{ fontSize: 13.5 }}>
              <div className="row row--between">
                <span className="meta">Oggetti completati</span>
                <strong style={{ color: 'var(--ink)' }}>
                  {prog.completati}/{prog.totale}
                </strong>
              </div>
              <div className="row row--between">
                <span className="meta">Obbligatori</span>
                <strong style={{ color: 'var(--ink)' }}>
                  {prog.obbligatori_completati}/{prog.obbligatori_totale}
                </strong>
              </div>
              <div className="row row--between">
                <span className="meta">Idoneità</span>
                <strong style={{ color: prog.idonea ? 'var(--primary)' : 'var(--ink)' }}>
                  {prog.idonea ? 'Ottenuta' : 'Non ancora'}
                </strong>
              </div>
            </div>
          </div>

          <div className="panel">
            <span className="eyebrow">Cosa significa &quot;sblocco sequenziale&quot;</span>
            <p className="meta" style={{ marginTop: 10, marginBottom: 0, fontSize: 13, lineHeight: 1.55 }}>
              Gli oggetti obbligatori si sbloccano nell&apos;ordine. L&apos;apertura diretta
              dell&apos;URL di un oggetto bloccato viene rifiutata dall&apos;API: l&apos;ordine è
              applicato lato server, non solo nascosto nell&apos;interfaccia.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
