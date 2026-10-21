import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione, computeFrequenzaForIscrizione } from '@/lib/compliance';
import { deriveIdoneita } from '@/lib/report-fondo';
import { AppShell, Ico } from '@/components/AppShell';
import { fmtDataOra, fmtData } from '@/components/admin/Atlante';
import { linkedInAddToProfileUrl, provaEmissioneAutomatica } from '@/lib/attestati';
import { appBaseUrl, urlVerifica } from '@/lib/url';
import { messaggioFinestra } from '@/lib/finestra';
import type { AttestatoRow, PoliticaAttestato } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { video: 'Video', documento: 'Documento', quiz: 'Test finale' };

function durataLabel(config: Record<string, unknown>): string | null {
  const s = Number(config?.durata_secondi);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.round(s / 60);
  return m < 1 ? '1 min' : `${m} min`;
}

export default async function DettaglioCorsoPage(props: { params: Promise<{ edizioneId: string }> }) {
  const params = await props.params;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, edizione:edizione_id ( codice, corso:corso_id ( descrizione, politica_attestato ) )')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle<{ id: string; edizione: { codice: string; corso: { descrizione: string | null; politica_attestato: PoliticaAttestato | null } | null } | null }>();
  if (!iscrizione) notFound();

  const [prog, freq] = await Promise.all([
    computeProgressoForIscrizione(supabase, iscrizione.id),
    computeFrequenzaForIscrizione(supabase, iscrizione.id),
  ]);
  if (!prog) notFound();
  // "Completato" con la stessa regola di attestati e report: lezioni obbligatorie
  // E presenza minima alle sessioni, se il corso la chiede (prima: solo lezioni).
  const soglia = freq?.soglia ?? null;
  const completato = deriveIdoneita(prog.obbligatori_totale, prog.idonea, soglia, Boolean(freq?.idoneo_frequenza), freq?.sessioni_totali).idoneo;
  const presenzaInAttesa = Boolean(freq?.in_attesa_sessioni);

  const finestra = prog.finestra;
  const aperta = finestra.aperta;
  const descrizione = iscrizione.edizione?.corso?.descrizione ?? null;
  const politica: PoliticaAttestato = iscrizione.edizione?.corso?.politica_attestato ?? 'manuale';

  // Attestato valido di questa iscrizione (RLS: solo il titolare). Se il corso
  // è completato, la politica è automatica e non c'è ancora (percorsi chiusi
  // prima della Fase 5), si emette adesso.
  const caricaAttestato = () => supabase
    .from('attestato')
    .select('*')
    .eq('iscrizione_id', iscrizione.id)
    .is('sostituito_da', null)
    .maybeSingle<AttestatoRow>();
  let { data: attestato } = await caricaAttestato();
  // Solo per i corsi con un percorso FAD (obbligatori > 0): per i corsi di sole
  // sessioni l'idoneità dipende dalla frequenza e l'emissione parte dalle presenze.
  if (!attestato && completato && prog.obbligatori_totale > 0 && politica === 'automatica') {
    const emesso = await provaEmissioneAutomatica(iscrizione.id, session.personaId);
    if (emesso) attestato = (await caricaAttestato()).data;
  }
  const pct = prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0;
  const currentId = prog.items.find((i) => i.sbloccato && !i.completato)?.learning_object_id;
  const next = prog.items.find((i) => i.sbloccato && !i.completato) ?? prog.items.find((i) => i.sbloccato);
  const nVideo = prog.items.filter((i) => i.lo_type === 'video').length;
  const minutiTotali = prog.items.reduce((acc, i) => acc + (Number((i.lo_config as { durata_secondi?: unknown }).durata_secondi) || 0), 0) / 60;
  // Data dell'idoneità = completamento dell'ultima lezione obbligatoria.
  const idoneaIl = completato
    ? prog.items.filter((i) => i.obbligatorio && i.completato_il).map((i) => i.completato_il!).sort().at(-1) ?? null
    : null;

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
      <Link href="/corsi" className="back-link" style={{ marginBottom: 16 }}>
        <Ico name="chevL" size={16} /> I miei corsi
      </Link>

      {completato ? (
        /* Momento di chiusura: il corso è completato e il risultato è registrato. */
        <section className="seal-panel" aria-labelledby="completato">
          <div className="seal-panel__art">
            <svg role="img" aria-label="Corso completato" width="160" height="160" viewBox="0 0 160 160" fill="none">
              <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
              <circle className="ring" cx="80" cy="80" r="68" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 80 80)" />
              <circle cx="80" cy="80" r="54" fill="rgba(124,240,195,.1)" />
              <path className="check" d="M56 82l16 16 33-36" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="seal-panel__body">
            <div className="seal-panel__kicker">Corso completato</div>
            <h1 id="completato" className="seal-panel__title">Hai completato &quot;{prog.corso_titolo}&quot;</h1>
            <p className="seal-panel__text">
              {idoneaIl ? `Completato il ${fmtDataOra(idoneaIl)}. ` : ''}
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
            <h1 className="course-hero__title">{prog.corso_titolo}</h1>
            {descrizione && <p className="course-hero__desc">{descrizione}</p>}
            {prog.idonea && soglia != null && freq && !freq.idoneo_frequenza && !presenzaInAttesa ? (
              <p className="course-hero__desc" style={{ fontWeight: 600 }}>
                {prog.obbligatori_totale > 0 ? 'Hai finito le lezioni online. ' : ''}
                Per completare il corso serve la presenza ad almeno il {soglia}% delle sessioni: finora risulti presente al {freq.frequenza_percentuale}%. La presenza si aggiorna dopo ogni sessione.
              </p>
            ) : !aperta ? (
              <p className="course-hero__desc" style={{ fontWeight: 600 }}>{messaggioFinestra(finestra)}</p>
            ) : next && (
              <div className="course-hero__actions">
                <Link className="btn btn--lg" style={{ background: '#fff', color: 'var(--ink)' }} href={`/corsi/${params.edizioneId}/lo/${next.learning_object_id}`}>
                  {next.lo_type === 'quiz' ? 'Vai al test finale' : prog.completati === 0 ? 'Inizia il corso' : `Riprendi: lezione ${next.ordine}`}
                  <Ico name="arrowR" size={16} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="detail-layout">
        <section>
          {completato && attestato && (
            <section className="attestato-card" aria-labelledby="attestato">
              <div className="attestato-card__head">
                <div className="attestato-card__icon"><Ico name="cap" size={22} /></div>
                <div>
                  <h2 id="attestato" style={{ margin: 0 }}>Il tuo attestato</h2>
                  <div className="page-lead">n. {attestato.numero} · emesso il {fmtData(attestato.emesso_at)}</div>
                </div>
              </div>
              <p className="page-lead" style={{ margin: 0, lineHeight: 1.55 }}>
                È un documento registrato e verificabile da chiunque abbia il codice stampato sopra: puoi scaricarlo, aggiungerlo al tuo profilo LinkedIn o condividere il badge.
              </p>
              <div className="attestato-card__actions">
                <a className="btn" href={`/api/attestati/${attestato.id}/pdf`} target="_blank" rel="noreferrer"><Ico name="doc2" size={16} /> Scarica il PDF</a>
                <a className="btn btn--secondary" href={linkedInAddToProfileUrl(attestato, appBaseUrl())} target="_blank" rel="noreferrer">Aggiungi a LinkedIn</a>
                <a className="btn btn--ghost" href={`/api/attestati/${attestato.id}/badge`} target="_blank" rel="noreferrer">Badge da condividere</a>
                <a className="btn btn--ghost" href={`/api/attestati/${attestato.id}/badge?formato=post`} target="_blank" rel="noreferrer">Badge per un post</a>
              </div>
              <div className="attestato-card__verify">
                Pagina di verifica: <a href={urlVerifica(attestato.codice_verifica)} target="_blank" rel="noreferrer">{urlVerifica(attestato.codice_verifica).replace(/^https?:\/\//, '')}</a>
              </div>
            </section>
          )}

          {completato && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ marginBottom: 12 }}>E adesso?</h2>
              <div className="next-steps">
                {!attestato && politica !== 'nessuna' && (
                  <div className="next-step">
                    <div className="next-step__icon"><Ico name="doc2" size={18} /></div>
                    <div><strong>{politica === 'manuale' ? 'L’attestato lo rilascia il tuo ente' : 'L’attestato è in preparazione'}</strong><p>{politica === 'manuale' ? 'Il referente della formazione lo emette dopo i controlli del caso: lo troverai qui e nel tuo profilo.' : 'Appena il tuo ente lo rilascia compare qui e nel tuo profilo, con il PDF e il badge.'}</p></div>
                  </div>
                )}
                {attestato && !(attestato.contenuto as { discente?: { data_nascita?: string | null } }).discente?.data_nascita && (
                  <div className="next-step">
                    <div className="next-step__icon"><Ico name="user" size={18} /></div>
                    <div><strong>Manca la tua data di nascita sull&apos;attestato</strong><p>Completa data e luogo di nascita nel <Link href="/profilo">profilo</Link> e chiedi al tuo ente di riemettere l&apos;attestato, se ti serve con quei dati.</p></div>
                  </div>
                )}
                <div className="next-step">
                  <div className="next-step__icon next-step__icon--ok"><Ico name="check" size={18} /></div>
                  {aperta
                    ? <div><strong>Puoi rivedere le lezioni{finestra.chiude_il ? ` fino al ${fmtData(finestra.chiude_il)}` : ' quando vuoi'}</strong><p>Il completamento resta valido: rivederle non cambia nulla nel registro.</p></div>
                    : <div><strong>Il completamento resta valido</strong><p>{messaggioFinestra(finestra)}</p></div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <Link className="btn btn--ghost" href="/corsi">Vai ai tuoi corsi <Ico name="arrowR" size={14} /></Link>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <h2>{completato ? 'Il tuo percorso' : 'Le lezioni'}</h2>
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
                    {it.completato ? <Ico name="check" size={16} /> : !it.sbloccato ? <Ico name="lock" size={14} /> : it.lo_type === 'quiz' ? <Ico name="quiz" size={16} /> : String(it.ordine)}
                  </div>
                  <div>
                    <div className="lo-row__title">{it.lo_titolo}</div>
                    <div className="lo-row__meta">
                      <span>{TYPE_LABEL[it.lo_type] ?? it.lo_type}{durata ? ` · ${durata}` : ''}</span>
                      {!it.obbligatorio && <span>· facoltativa</span>}
                      {it.completato && <span className="status-ok">· {it.lo_type === 'quiz' ? 'superato' : 'completata'}{it.completato_il ? ` il ${fmtDataOra(it.completato_il)}` : ''}{it.lo_type === 'quiz' && it.quiz?.migliore_percentuale != null ? ` (${it.quiz.migliore_percentuale}%)` : ''}</span>}
                      {it.lo_type === 'quiz' && !it.completato && it.quiz && it.quiz.tentativi > 0 && (
                        <span>· {it.quiz.tentativi} tentativ{it.quiz.tentativi === 1 ? 'o' : 'i'}{it.quiz.ultima_percentuale != null ? `, ultimo ${it.quiz.ultima_percentuale}%` : ''}</span>
                      )}
                      {isCurrent && !it.completato && <span className="status-now">· da fare</span>}
                      {!it.completato && it.sbloccato && it.copertura_percentuale != null && it.copertura_percentuale > 0 && (
                        <span>· vista al {it.copertura_percentuale}%</span>
                      )}
                      {!it.sbloccato && <span>· si apre dopo la precedente</span>}
                    </div>
                  </div>
                  <div className="lo-row__action">
                    {it.sbloccato && aperta ? (
                      <Link className={`btn btn--sm ${isCurrent ? '' : 'btn--ghost'}`} href={`/corsi/${params.edizioneId}/lo/${it.learning_object_id}`}>
                        {it.lo_type === 'quiz' ? (it.completato ? 'Esito' : 'Fai il test') : it.completato ? 'Rivedi' : 'Apri'}
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
              <div className={`progress__bar ${completato ? 'is-ok' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="stack-sm" style={{ fontSize: 14 }}>
              <div className="row row--between"><span className="page-lead">Lezioni</span><strong>{prog.totale}{nVideo > 0 && nVideo === prog.totale ? ' video' : ''}</strong></div>
              {minutiTotali > 0 && <div className="row row--between"><span className="page-lead">Durata</span><strong>{Math.round(minutiTotali)} min</strong></div>}
              {prog.visione_integrale && <div className="row row--between"><span className="page-lead">Modalità</span><strong>visione integrale</strong></div>}
              {aperta && finestra.chiude_il && <div className="row row--between"><span className="page-lead">Aperto fino al</span><strong>{fmtData(finestra.chiude_il)}</strong></div>}
              {!aperta && <div className="row row--between"><span className="page-lead">Lezioni</span><strong>{finestra.stato === 'non_aperta' ? `dal ${fmtData(finestra.apre_il!)}` : 'chiuse'}</strong></div>}
              <div className="row row--between"><span className="page-lead">Completate</span><strong>{prog.completati} di {prog.totale}</strong></div>
              {prog.obbligatori_totale !== prog.totale && (
                <div className="row row--between"><span className="page-lead">Obbligatorie</span><strong>{prog.obbligatori_completati} di {prog.obbligatori_totale}</strong></div>
              )}
              {soglia != null && freq && presenzaInAttesa && (
                <div className="row row--between"><span className="page-lead">Presenza alle sessioni</span><strong>in attesa delle sessioni</strong></div>
              )}
              {soglia != null && freq && !presenzaInAttesa && (
                <div className="row row--between"><span className="page-lead">Presenza alle sessioni</span><strong className={freq.idoneo_frequenza ? 'status-ok' : ''}>{freq.frequenza_percentuale}% <span className="page-lead" style={{ fontWeight: 400 }}>(minimo {soglia}%)</span></strong></div>
              )}
              <div className="row row--between"><span className="page-lead">Stato</span><strong className={completato ? 'status-ok' : ''}>{completato ? 'Completato' : prog.completati === 0 && !freq?.presenze ? 'Da iniziare' : 'In corso'}</strong></div>
            </div>
          </div>
          {prog.sblocco_sequenziale && !completato && (
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
