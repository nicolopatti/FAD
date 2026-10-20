import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Ico } from '@/components/AppShell';
import { fmtDataOra } from '@/components/admin/Atlante';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { video: 'Video', documento: 'Documento' };

function durataLabel(config: Record<string, unknown>): string | null {
  const s = Number(config?.durata_secondi);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.round(s / 60);
  return m < 1 ? '1 min' : `${m} min`;
}

export default async function DettaglioCorsoPage({ params }: { params: { edizioneId: string } }) {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, edizione:edizione_id ( codice, corso:corso_id ( descrizione ) )')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle<{ id: string; edizione: { codice: string; corso: { descrizione: string | null } | null } | null }>();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  const descrizione = iscrizione.edizione?.corso?.descrizione ?? null;
  const pct = prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0;
  const currentId = prog.items.find((i) => i.sbloccato && !i.completato)?.learning_object_id;
  const next = prog.items.find((i) => i.sbloccato && !i.completato) ?? prog.items.find((i) => i.sbloccato);
  const minutiTotali = prog.items.reduce((acc, i) => acc + (Number((i.lo_config as { durata_secondi?: unknown }).durata_secondi) || 0), 0) / 60;
  // Data dell'idoneità = completamento dell'ultima lezione obbligatoria.
  const idoneaIl = prog.idonea
    ? prog.items.filter((i) => i.obbligatorio && i.completato_il).map((i) => i.completato_il!).sort().at(-1) ?? null
    : null;

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
      <Link href="/corsi" className="back-link" style={{ marginBottom: 16 }}>
        <Ico name="chevL" size={16} /> I miei corsi
      </Link>

      {prog.idonea ? (
        /* Momento di chiusura: il corso è completato e l'idoneità è registrata. */
        <section className="seal-panel" aria-labelledby="idoneita">
          <div className="seal-panel__art">
            <svg role="img" aria-label="Idoneità registrata" width="160" height="160" viewBox="0 0 160 160" fill="none">
              <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
              <circle className="ring" cx="80" cy="80" r="68" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 80 80)" />
              <circle cx="80" cy="80" r="54" fill="rgba(124,240,195,.1)" />
              <path className="check" d="M56 82l16 16 33-36" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="seal-panel__body">
            <div className="seal-panel__kicker">Corso completato</div>
            <h1 id="idoneita" className="seal-panel__title">Hai ottenuto l&apos;idoneità per &quot;{prog.corso_titolo}&quot;</h1>
            <p className="seal-panel__text">
              {idoneaIl ? `Registrata il ${fmtDataOra(idoneaIl)}. ` : ''}
              Il tuo percorso è stato registrato in modo che nessuno possa modificarlo, e il tuo ente può verificarlo in qualsiasi momento.
            </p>
            <div className="seal-panel__meta">
              <span>{prog.totale} lezion{prog.totale === 1 ? 'e' : 'i'}{minutiTotali > 0 ? ` · ${Math.round(minutiTotali)} min` : ''}</span>
              {prog.visione_integrale && <span>visione integrale</span>}
            </div>
          </div>
        </section>
      ) : (
        <section className="course-hero">
          <div className="course-hero__inner">
            <div className="course-hero__chips">
              <span className="chip chip--onDark">{prog.totale} lezion{prog.totale === 1 ? 'e' : 'i'}</span>
              {minutiTotali > 0 && <span className="chip chip--onDark">{Math.round(minutiTotali)} min</span>}
              {prog.visione_integrale && <span className="chip chip--onDark">visione integrale</span>}
            </div>
            <h1 className="course-hero__title">{prog.corso_titolo}</h1>
            {descrizione && <p className="course-hero__desc">{descrizione}</p>}
            {next && (
              <div className="course-hero__actions">
                <Link className="btn btn--lg" style={{ background: '#fff', color: 'var(--ink)' }} href={`/corsi/${params.edizioneId}/lo/${next.learning_object_id}`}>
                  {prog.completati === 0 ? 'Inizia il corso' : `Riprendi: lezione ${next.ordine}`}
                  <Ico name="arrowR" size={16} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="detail-layout">
        <section>
          {prog.idonea && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ marginBottom: 12 }}>E adesso?</h2>
              <div className="next-steps">
                <div className="next-step">
                  <div className="next-step__icon"><Ico name="doc2" size={18} /></div>
                  <div><strong>L&apos;attestato arriva dal tuo ente</strong><p>Il referente della formazione riceve l&apos;esito e lo trasmette a chi deve riceverlo. Non devi fare altro.</p></div>
                </div>
                <div className="next-step">
                  <div className="next-step__icon next-step__icon--ok"><Ico name="cap" size={18} /></div>
                  <div><strong>Puoi rivedere le lezioni quando vuoi</strong><p>Il completamento resta valido: rivederle non cambia nulla nel registro.</p></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <Link className="btn" href="/corsi">Vai ai tuoi corsi <Ico name="arrowR" size={14} /></Link>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <h2>{prog.idonea ? 'Il tuo percorso' : 'Le lezioni'}</h2>
            <span className="page-lead">{prog.completati} di {prog.totale} completate</span>
          </div>

          <div>
            {prog.items.map((it) => {
              const isCurrent = it.learning_object_id === currentId;
              const cls = it.completato ? 'is-ok' : isCurrent ? 'is-current' : !it.sbloccato ? 'is-locked' : '';
              const durata = durataLabel(it.lo_config as Record<string, unknown>);
              return (
                <div key={it.struttura_id} className={`lo-row ${cls}`}>
                  <div className="lo-row__index">
                    {it.completato ? <Ico name="check" size={16} /> : !it.sbloccato ? <Ico name="lock" size={14} /> : String(it.ordine)}
                  </div>
                  <div>
                    <div className="lo-row__title">{it.lo_titolo}</div>
                    <div className="lo-row__meta">
                      <span>{TYPE_LABEL[it.lo_type] ?? it.lo_type}{durata ? ` · ${durata}` : ''}</span>
                      {!it.obbligatorio && <span>· facoltativa</span>}
                      {it.completato && <span className="status-ok">· completata{it.completato_il ? ` il ${fmtDataOra(it.completato_il)}` : ''}</span>}
                      {isCurrent && !it.completato && <span className="status-now">· da fare</span>}
                      {!it.completato && it.sbloccato && it.copertura_percentuale != null && it.copertura_percentuale > 0 && (
                        <span>· vista al {it.copertura_percentuale}%</span>
                      )}
                      {!it.sbloccato && <span>· si apre dopo la precedente</span>}
                    </div>
                  </div>
                  <div className="lo-row__action">
                    {it.sbloccato ? (
                      <Link className={`btn btn--sm ${isCurrent ? '' : 'btn--ghost'}`} href={`/corsi/${params.edizioneId}/lo/${it.learning_object_id}`}>
                        {it.completato ? 'Rivedi' : isCurrent ? 'Apri' : 'Apri'}
                        <Ico name="chevR" size={14} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="player-sidebar">
          <div className="panel">
            <div className="page-lead">Il tuo avanzamento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 700, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-.03em' }}>{pct}</span>
              <span style={{ fontSize: 22, color: 'var(--muted-2)', fontWeight: 600 }}>%</span>
            </div>
            <div className="progress progress--lg" style={{ marginBottom: 16 }}>
              <div className={`progress__bar ${prog.idonea ? 'is-ok' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="stack-sm" style={{ fontSize: 14 }}>
              <div className="row row--between"><span className="page-lead">Lezioni completate</span><strong>{prog.completati} di {prog.totale}</strong></div>
              {prog.obbligatori_totale !== prog.totale && (
                <div className="row row--between"><span className="page-lead">Obbligatorie</span><strong>{prog.obbligatori_completati} di {prog.obbligatori_totale}</strong></div>
              )}
              <div className="row row--between"><span className="page-lead">Idoneità</span><strong className={prog.idonea ? 'status-ok' : ''}>{prog.idonea ? 'Ottenuta' : 'Non ancora'}</strong></div>
            </div>
          </div>
          {prog.sblocco_sequenziale && !prog.idonea && (
            <p className="page-lead" style={{ margin: '0 6px', lineHeight: 1.55 }}>
              Le lezioni si aprono una dopo l&apos;altra, nell&apos;ordine del programma.
              {prog.visione_integrale ? ' I video si guardano per intero, a velocità normale.' : ''}
            </p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
