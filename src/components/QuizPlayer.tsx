'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { DomandaPublica } from '@/lib/quiz-types';
import type { EsitoQuiz } from '@/lib/compliance';
import { fmtDataOra } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';

type Correzione = { domanda_id: string; corretta: boolean; giuste?: number[] };
type Risultato = { tentativo: number; punteggio: number; totale: number; percentuale: number; soglia: number; superato: boolean; correzione: Correzione[]; tentativi_max: number | null; attestato?: { numero: string } | null };

type Props = {
  iscrizioneId: string;
  learningObjectId: string;
  domande: DomandaPublica[];
  soglia: number;
  tentativiMax: number | null;
  esito: EsitoQuiz;
  corsoHref: string;
  nextHref?: string;
  nextLabel?: string;
};

const LETTERE = 'ABCDEFGH';

// Player del test finale. Le risposte giuste non arrivano mai qui: il server
// corregge e scrive l'Evento; questo componente mostra l'esito che riceve.
export function QuizPlayer({ iscrizioneId, learningObjectId, domande, soglia, tentativiMax, esito, corsoHref, nextHref, nextLabel }: Props) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const [fase, setFase] = useState<'intro' | 'in_corso' | 'esito'>(esito.superato ? 'esito' : 'intro');
  const [risposte, setRisposte] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [tentativiFatti, setTentativiFatti] = useState(esito.tentativi);

  const esauriti = tentativiMax != null && tentativiFatti >= tentativiMax;
  const nonRisposte = domande.filter((d) => !(risposte[d.id]?.length)).length;

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/events/quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ iscrizione_id: iscrizioneId, learning_object_id: learningObjectId, ...body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.error ?? (res.status >= 500
        ? 'Non siamo riusciti a registrare il test. Controlla la connessione e riprova tra poco.'
        : `Richiesta rifiutata (codice ${res.status}).`));
    }
    return json;
  }

  async function inizia() {
    setBusy(true); setErrore(null);
    try {
      await post({ event_type: 'quiz.started' });
      setRisposte({});
      setRisultato(null);
      setFase('in_corso');
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  function scegli(d: DomandaPublica, i: number, checked: boolean) {
    setRisposte((prev) => {
      const cur = prev[d.id] ?? [];
      if (d.tipo === 'scelta_singola') return { ...prev, [d.id]: [i] };
      return { ...prev, [d.id]: checked ? Array.from(new Set([...cur, i])) : cur.filter((x) => x !== i) };
    });
  }

  async function consegna() {
    if (nonRisposte > 0) {
      const ok = await confirm({
        titolo: 'Consegnare comunque?',
        messaggio: `Hai lasciato ${nonRisposte} domand${nonRisposte === 1 ? 'a' : 'e'} senza risposta: conter${nonRisposte === 1 ? 'à' : 'anno'} come sbagliat${nonRisposte === 1 ? 'a' : 'e'}.`,
        conferma: 'Consegna',
        annulla: 'Torna alle domande',
      });
      if (!ok) return;
    }
    setBusy(true); setErrore(null);
    try {
      const r = (await post({ event_type: 'quiz.submitted', risposte })) as Risultato;
      setRisultato(r);
      setTentativiFatti(r.tentativo);
      setFase('esito');
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  const correzioneDi = (id: string) => risultato?.correzione.find((c) => c.domanda_id === id);

  if (fase === 'intro') {
    return (
      <div className="quiz-card">
        <div className="quiz-card__head">
          <div className="quiz-card__kicker">Test finale</div>
          <h2 className="quiz-card__title">{domande.length} domand{domande.length === 1 ? 'a' : 'e'}, si supera con almeno il {soglia}% di risposte giuste</h2>
          <p className="page-lead" style={{ margin: 0 }}>
            Puoi rispondere con calma, non c&apos;è un tempo limite. Alla consegna il risultato viene registrato{tentativiMax == null ? ' e, se serve, puoi riprovare.' : ` (tentativi disponibili: ${tentativiMax}).`}
          </p>
        </div>
        {esito.tentativi > 0 && (
          <div className="quiz-card__prev">
            {esito.tentativi} tentativ{esito.tentativi === 1 ? 'o' : 'i'} finora{esito.ultima_percentuale != null ? ` · ultimo risultato ${esito.ultima_percentuale}%` : ''}{esito.migliore_percentuale != null && esito.tentativi > 1 ? ` · migliore ${esito.migliore_percentuale}%` : ''}
          </div>
        )}
        {errore && <div className="alert bad" role="alert">{errore}</div>}
        {esauriti ? (
          <div className="alert warn">Hai usato tutti i tentativi disponibili. Rivolgiti al tuo ente di formazione.</div>
        ) : domande.length === 0 ? (
          <div className="alert warn">Il test non ha ancora domande: riprova più tardi.</div>
        ) : (
          <div><button type="button" className="btn btn--lg" onClick={inizia} disabled={busy}>{busy ? 'Un attimo…' : esito.tentativi > 0 ? 'Riprova il test' : 'Inizia il test'}</button></div>
        )}
      </div>
    );
  }

  if (fase === 'esito') {
    const sup = risultato ? risultato.superato : esito.superato;
    const perc = risultato ? risultato.percentuale : esito.migliore_percentuale ?? esito.ultima_percentuale ?? 0;
    const tentativo = risultato ? risultato.tentativo : esito.tentativi;
    const puoiRiprovare = !sup && !(tentativiMax != null && tentativiFatti >= tentativiMax);
    return (
      <div>
        <div className={`quiz-result ${sup ? 'quiz-result--ok' : 'quiz-result--ko'}`} aria-live="polite">
          <div className="quiz-result__ring" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              {sup ? <path d="M5 12l4.5 4.5L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
            </svg>
          </div>
          <div className="quiz-result__title">{sup ? 'Test superato' : 'Test non superato'}</div>
          <div className="quiz-result__sub">
            {risultato ? `${risultato.punteggio} risposte giuste su ${risultato.totale} · ${perc}%` : `${perc}%`} · soglia {soglia}% · tentativo {tentativo}
            {!risultato && esito.superato_il ? ` · registrato il ${fmtDataOra(esito.superato_il)}` : ''}
          </div>
          {risultato?.attestato && (
            <div className="quiz-result__sub" style={{ color: 'var(--mint)' }}>Percorso completato: il tuo attestato n. {risultato.attestato.numero} è pronto nella pagina del corso.</div>
          )}
          <div className="quiz-result__actions">
            {sup && nextHref && <Link className="btn btn--light" href={nextHref as Route}>{nextLabel ?? 'Lezione successiva'}</Link>}
            {sup && <Link className="btn btn--glass" href={corsoHref as Route}>Torna al corso</Link>}
            {puoiRiprovare && <button type="button" className="btn btn--light" onClick={inizia} disabled={busy}>{busy ? 'Un attimo…' : 'Riprova'}</button>}
            {!sup && !puoiRiprovare && <Link className="btn btn--glass" href={corsoHref as Route}>Torna al corso</Link>}
          </div>
        </div>
        {errore && <div className="alert bad" role="alert" style={{ marginTop: 12 }}>{errore}</div>}
        {risultato && (
          <ol className="quiz-review">
            {domande.map((d, n) => {
              const c = correzioneDi(d.id);
              const scelte = risposte[d.id] ?? [];
              return (
                <li key={d.id} className={`quiz-review__q ${c?.corretta ? 'is-ok' : 'is-ko'}`}>
                  <div className="quiz-review__head"><span className="quiz-review__n">{n + 1}</span><span>{d.testo}</span><span className={`chip ${c?.corretta ? 'chip--ok' : 'chip--err'}`}>{c?.corretta ? 'giusta' : 'sbagliata'}</span></div>
                  <ul className="quiz-review__opts">
                    {d.risposte.map((r, i) => {
                      const scelta = scelte.includes(i);
                      const giusta = c?.giuste?.includes(i);
                      return <li key={i} className={`${scelta ? 'is-scelta' : ''} ${giusta ? 'is-giusta' : ''}`}><span className="quiz__lettera">{LETTERE[i]}</span>{r.testo}{scelta ? <span className="muted"> · la tua risposta</span> : ''}{giusta && !scelta ? <span className="status-ok"> · risposta giusta</span> : ''}</li>;
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz__bar">
        <span>{domande.length - nonRisposte} di {domande.length} risposte date</span>
        <span className="progress" style={{ width: 140 }}><span className="progress__bar" style={{ width: `${domande.length ? Math.round(((domande.length - nonRisposte) / domande.length) * 100) : 0}%` }} /></span>
      </div>
      <ol className="quiz__list">
        {domande.map((d, n) => (
          <li key={d.id} className="quiz__q">
            <div className="quiz__qhead">
              <span className="quiz__n">{n + 1}</span>
              <div>
                <div className="quiz__testo">{d.testo}</div>
                <div className="muted log-sub">{d.tipo === 'scelta_multipla' ? 'Più risposte possibili' : 'Una sola risposta'}</div>
              </div>
            </div>
            <div className="quiz__opts" role={d.tipo === 'scelta_singola' ? 'radiogroup' : 'group'} aria-label={`Domanda ${n + 1}`}>
              {d.risposte.map((r, i) => {
                const sel = (risposte[d.id] ?? []).includes(i);
                return (
                  <label key={i} className={`quiz__opt${sel ? ' is-selected' : ''}`}>
                    <input type={d.tipo === 'scelta_singola' ? 'radio' : 'checkbox'} name={`q-${d.id}`} checked={sel} onChange={(e) => scegli(d, i, e.target.checked)} disabled={busy} />
                    <span className="quiz__lettera">{LETTERE[i]}</span>
                    <span>{r.testo}</span>
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {errore && <div className="alert bad" role="alert">{errore}</div>}
      <div className="row row--wrap" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn--lg" onClick={consegna} disabled={busy}>{busy ? 'Correggo…' : 'Consegna le risposte'}</button>
        {nonRisposte > 0 && <span className="page-lead">{nonRisposte} senza risposta</span>}
      </div>
    </div>
  );
}
