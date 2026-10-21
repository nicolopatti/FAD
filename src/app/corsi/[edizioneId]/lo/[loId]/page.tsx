import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Ico } from '@/components/AppShell';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { DocumentoPlayer } from '@/components/DocumentoPlayer';
import { QuizPlayer } from '@/components/QuizPlayer';
import { configQuizDa, mescola } from '@/lib/quiz';
import { messaggioFinestra } from '@/lib/finestra';
import type { DomandaPublica } from '@/lib/quiz-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Domande del test senza il flag `corretta`: la tabella non ha una policy di
// lettura per il discente, le dà la RPC `quiz_domande_pubbliche` (SECURITY
// DEFINER, solo a chi è iscritto a un corso con quel test) e il flag non lascia
// mai il database. La pagina la chiama solo se il test è sbloccato (D26).
// Ordine casuale a ogni apertura, se previsto.
async function domandeDelTest(supabase: SupabaseClient, loId: string, ordineCasuale: boolean): Promise<DomandaPublica[] | null> {
  const { data, error } = await supabase.rpc('quiz_domande_pubbliche', { p_learning_object_id: loId });
  if (error) return null;
  const pubbliche = (Array.isArray(data) ? data : []) as DomandaPublica[];
  return ordineCasuale ? mescola(pubbliche) : pubbliche;
}

function durataLabel(config: Record<string, unknown>): string | null {
  const s = Number(config?.durata_secondi);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m} min${sec ? ` ${sec} s` : ''}`;
}

export default async function LearningObjectPage(props: { params: Promise<{ edizioneId: string; loId: string }> }) {
  const params = await props.params;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  const idx = prog.items.findIndex((i) => i.learning_object_id === params.loId);
  if (idx < 0) notFound();
  const item = prog.items[idx];
  const indice = idx + 1;
  const prev = idx > 0 ? prog.items[idx - 1] : null;
  const nextItem = idx < prog.items.length - 1 ? prog.items[idx + 1] : null;
  const corsoHref = `/corsi/${params.edizioneId}` as Route;
  const hrefDi = (loId: string) => `/corsi/${params.edizioneId}/lo/${loId}` as Route;
  const durata = durataLabel(item.lo_config as Record<string, unknown>);
  // Nomi dei passi nei pulsanti: il test si chiama test, non "Lezione N".
  const isQuiz = (i: { lo_type: string }) => i.lo_type === 'quiz';
  const pulsante = (i: { lo_type: string; ordine: number }) => (isQuiz(i) ? 'Vai al test finale' : `Lezione ${i.ordine}`);
  const nome = (i: { lo_type: string; ordine: number }) => (isQuiz(i) ? 'Il test finale' : `La lezione ${i.ordine}`);

  // R2: fuori dalla finestra dell'edizione la lezione non si apre (le API rifiutano comunque gli eventi).
  if (!prog.finestra.aperta) {
    return (
      <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
        <Link href={corsoHref} className="back-link" style={{ marginBottom: 16 }}><Ico name="chevL" size={16} /> {prog.corso_titolo}</Link>
        <div className="panel" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{prog.finestra.stato === 'non_aperta' ? 'Le lezioni non sono ancora aperte' : 'Le lezioni sono chiuse'}</h1>
          <p className="page-lead" style={{ margin: 0, fontSize: 15 }}>{messaggioFinestra(prog.finestra)}</p>
          <div><Link className="btn btn--secondary" href={corsoHref}>Torna al corso</Link></div>
        </div>
      </AppShell>
    );
  }

  // D26: enforcement server-side. Se non sbloccato, l'accesso è negato.
  if (!item.sbloccato) {
    const daFare = prog.items.find((i) => i.sbloccato && !i.completato);
    return (
      <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
        <Link href={corsoHref} className="back-link" style={{ marginBottom: 16 }}><Ico name="chevL" size={16} /> {prog.corso_titolo}</Link>
        <div className="panel" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{isQuiz(item) ? 'Il test non è ancora aperto' : 'Questa lezione non è ancora aperta'}</h1>
          <p className="page-lead" style={{ margin: 0, fontSize: 15 }}>
            {isQuiz(item) ? 'Il test finale si apre quando hai completato tutte le lezioni.' : 'Le lezioni si aprono una dopo l’altra: completa prima quelle precedenti.'}
          </p>
          {daFare && (
            <div><Link className="btn" href={hrefDi(daFare.learning_object_id)}>{isQuiz(daFare) ? 'Vai al test finale' : `Vai alla lezione ${daFare.ordine}`} <Ico name="arrowR" size={14} /></Link></div>
          )}
        </div>
      </AppShell>
    );
  }

  const nextHref = nextItem ? hrefDi(nextItem.learning_object_id) : undefined;
  const nextLabel = nextItem ? pulsante(nextItem) : undefined;
  const quizCfg = item.lo_type === 'quiz' ? configQuizDa(item.lo_config) : null;
  const domande = quizCfg && item.sbloccato ? await domandeDelTest(supabase, item.learning_object_id, quizCfg.ordine_casuale) : null;
  const metaQuiz = quizCfg && domande ? `${domande.length} domand${domande.length === 1 ? 'a' : 'e'} · soglia ${quizCfg.soglia_percentuale}%` : null;

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
      <div className="player-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Link href={corsoHref} className="back-link"><Ico name="chevL" size={16} /> {prog.corso_titolo}</Link>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lesson-meta">
              {item.lo_type === 'quiz' ? 'Test finale' : `Lezione ${indice} di ${prog.totale}`}{durata ? ` · ${durata}` : ''}{metaQuiz ? ` · ${metaQuiz}` : ''}{!item.obbligatorio ? ' · facoltativa' : ''}
              {item.completato && <span className="status-ok"> · {item.lo_type === 'quiz' ? 'superato' : 'completata'}</span>}
            </div>
            <h1 className="lesson-title">{item.lo_titolo}</h1>
          </div>

          {item.lo_type === 'video' ? (
            <VimeoPlayer
              vimeoId={String((item.lo_config as { vimeo_id?: string }).vimeo_id ?? '')}
              vimeoHash={(item.lo_config as { vimeo_hash?: string }).vimeo_hash}
              visioneIntegrale={prog.visione_integrale}
              trattiIniziali={item.segmenti_visti}
              coperturaIniziale={item.copertura_percentuale}
              corsoHref={corsoHref}
              nextHref={nextHref}
              nextLabel={nextLabel}
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
            />
          ) : item.lo_type === 'documento' ? (
            <DocumentoPlayer
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
              filename={(item.lo_config as { filename?: string }).filename}
              alreadyCompleted={item.completato}
              nextHref={nextHref}
              nextLabel={nextLabel}
            />
          ) : item.lo_type === 'quiz' && quizCfg ? (
            domande ? (
              <QuizPlayer
                iscrizioneId={iscrizione.id}
                learningObjectId={item.learning_object_id}
                domande={domande}
                soglia={quizCfg.soglia_percentuale}
                tentativiMax={quizCfg.tentativi_max}
                esito={item.quiz ?? { tentativi: 0, superato: false, ultima_percentuale: null, migliore_percentuale: null, superato_il: null }}
                corsoHref={corsoHref}
                nextHref={nextHref}
                nextLabel={nextLabel}
              />
            ) : (
              <div className="alert warn">Il test non è disponibile in questo momento. Riprova tra poco.</div>
            )
          ) : (
            <div className="alert">Questo tipo di contenuto non è supportato.</div>
          )}

          <div className="lesson-nav">
            {prev ? (
              <Link className="btn btn--secondary btn--sm" href={hrefDi(prev.learning_object_id)}><Ico name="chevL" size={14} /> {isQuiz(prev) ? 'Test finale' : `Lezione ${prev.ordine}`}</Link>
            ) : <span />}
            {nextItem && (nextItem.sbloccato || item.completato) ? (
              <Link className="btn btn--sm" href={hrefDi(nextItem.learning_object_id)}>{pulsante(nextItem)} <Ico name="chevR" size={14} /></Link>
            ) : nextItem ? (
              <span className="page-lead" style={{ alignSelf: 'center' }}>{nome(nextItem)} si apre al completamento di questa</span>
            ) : null}
          </div>

          <p className="page-lead" style={{ margin: 0, lineHeight: 1.55, maxWidth: '62ch' }}>
            {item.lo_type === 'video'
              ? prog.visione_integrale
                ? 'Questo corso richiede la visione integrale: il video si guarda per intero a velocità normale, senza salti in avanti. Conta il tempo reale di riproduzione.'
                : 'La lezione risulta completata quando il video arriva alla fine.'
              : item.lo_type === 'quiz'
                ? 'Le risposte vengono corrette dal sistema alla consegna e il risultato di ogni tentativo resta registrato.'
                : 'Quando hai finito di leggere, conferma con il pulsante: la lezione viene registrata come completata.'}
          </p>
        </div>

        <aside className="player-sidebar">
          <div className="panel panel--program">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 18 }}>Programma</h2>
              <span className="page-lead">{prog.completati} di {prog.totale}</span>
            </div>
            <div className="progress" style={{ marginBottom: 14 }}>
              <div className={`progress__bar ${prog.idonea ? 'is-ok' : ''}`} style={{ width: `${prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0}%` }} />
            </div>
            <ol className="outline-list">
              {prog.items.map((lo, i) => {
                const active = lo.learning_object_id === params.loId;
                const cls = lo.completato ? 'is-ok' : active ? 'is-current' : !lo.sbloccato ? 'is-locked' : '';
                const inner = (
                  <>
                    <span className="outline-row__icon">
                      {lo.completato ? <Ico name="check" size={16} /> : !lo.sbloccato ? <Ico name="lock" size={14} /> : isQuiz(lo) ? <Ico name="quiz" size={15} /> : <span style={{ fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}
                    </span>
                    <span className="outline-row__title">{lo.lo_titolo}</span>
                    <span className="outline-row__num">{active ? 'ora' : ''}</span>
                  </>
                );
                return (
                  <li key={lo.struttura_id} className={`outline-row ${cls}`}>
                    {lo.sbloccato && !active ? (
                      <Link href={hrefDi(lo.learning_object_id)} style={{ display: 'contents', color: 'inherit' }}>{inner}</Link>
                    ) : inner}
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
