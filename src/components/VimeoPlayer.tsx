'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { Ico } from '@/components/AppShell';
import { vimeoEmbedUrl } from '@/lib/vimeo';
import { coperturaPercentuale, unisciSegmenti, type Segmento } from '@/lib/visione';

declare global {
  interface Window {
    Vimeo?: { Player: new (el: HTMLIFrameElement | HTMLElement) => VimeoPlayerInstance };
  }
}

type VimeoPlayerInstance = {
  on: (event: string, cb: (data: any) => void) => void;
  getCurrentTime: () => Promise<number>;
  setCurrentTime: (seconds: number) => Promise<number>;
  setPlaybackRate: (rate: number) => Promise<number>;
  play: () => Promise<void>;
  destroy?: () => Promise<void>;
};

type Props = {
  vimeoId: string;
  vimeoHash?: string;
  /** Corso con visione integrale: tratti visti tracciati e niente salti in avanti. */
  visioneIntegrale?: boolean;
  /** Tratti già riprodotti nelle sessioni precedenti (dal log): il player riparte da qui. */
  trattiIniziali?: Segmento[];
  coperturaIniziale?: number;
  /** Link al corso, mostrato nella schermata finale. */
  corsoHref?: string;
  /** Lezione successiva (se esiste): è l'azione principale a fine video. */
  nextHref?: string;
  nextLabel?: string;
  iscrizioneId: string;
  learningObjectId: string;
};

const VIMEO_SDK = 'https://player.vimeo.com/api/player.js';
// Oltre questo scarto tra due campioni consecutivi di `timeupdate` si apre un
// nuovo tratto (è un salto, non riproduzione continua).
const CONTINUITA_SECONDI = 2;
// Tolleranza oltre il massimo visto entro cui un seek in avanti è ammesso in
// modalità integrale (arrotondamenti del player).
const TOLLERANZA_SEEK = 1.5;
// Checkpoint `video.progress` durante la riproduzione: limita a questo intervallo
// la perdita di copertura se la pagina si chiude senza un evento di pausa.
const CHECKPOINT_MS = 60_000;

const MSG_SALTO = 'In questo corso il video va visto per intero: non si può andare oltre il punto già visto.';

export function VimeoPlayer({
  vimeoId, vimeoHash, visioneIntegrale = false, trattiIniziali, coperturaIniziale, corsoHref, nextHref, nextLabel,
  iscrizioneId, learningObjectId,
}: Props) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<VimeoPlayerInstance | null>(null);
  const [copertura, setCopertura] = useState<number | null>(coperturaIniziale ?? null);
  const [avviso, setAvviso] = useState<string | null>(null);
  useEffect(() => {
    if (!avviso) return;
    const t = setTimeout(() => setAvviso(null), 6000);
    return () => clearTimeout(t);
  }, [avviso]);
  // Schermata finale nostra: copre quella di Vimeo ("More from …", Follow).
  const [finito, setFinito] = useState(false);
  // Esito dell'invio di `video.ended` al server.
  const [registrazione, setRegistrazione] = useState<'in_corso' | 'ok' | 'errore'>('in_corso');
  const inviaEndedRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let player: VimeoPlayerInstance | null = null;
    // Tratti riprodotti: si parte da quelli già nel log (sessioni precedenti) e
    // si aggiungono quelli di questa sessione; nei payload va sempre l'unione,
    // e la compliance unisce a sua volta tutto ciò che trova nel log.
    const tratti: Segmento[] = (trattiIniziali ?? []).map(([a, b]) => [a, b]);
    let ultimo: number | null = null;
    let durata = 0;
    let ultimoAggiornamentoUi = 0;
    let inRiproduzione = false;
    let checkpoint: ReturnType<typeof setInterval> | null = null;

    const snapshot = () => unisciSegmenti(tratti);
    // Limite in avanti (modalità integrale): la fine del tratto riprodotto
    // CONTIGUO dall'inizio. Un buco nel mezzo non si può scavalcare, altrimenti
    // il video non raggiungerebbe mai il 95% e il discente non capirebbe perché.
    const limiteAvanzamento = () => {
      const primo = snapshot()[0];
      return primo && primo[0] <= 1 ? primo[1] : 0;
    };

    // Alla chiusura/nascondimento della pagina, se il video sta andando, si manda
    // una pausa con l'ultima posizione nota: senza, il tratto aperto andrebbe perso.
    const onPageHide = () => {
      if (!inRiproduzione) return;
      inRiproduzione = false;
      sendRef.current?.('video.pause', conTrattiRef.current?.({ posizione_secondi: ultimo ?? 0, motivo: 'pagehide' }) ?? {});
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onPageHide(); };

    function attach() {
      if (!window.Vimeo || !iframeRef.current) return;
      player = new window.Vimeo.Player(iframeRef.current);
      playerRef.current = player;
      // Il tracciamento è silenzioso: gli eventi vanno al log del tenant via API,
      // ma non sono mostrati al discente (la vista grezza è dell'auditor).
      // Ritorna true se il server ha accettato l'evento: per `ended` l'esito
      // decide cosa dice la schermata finale (mai "registrata" senza conferma).
      const send = (eventType: string, payload: Record<string, unknown>): Promise<boolean> =>
        fetch('/api/events/video', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            event_type: eventType,
            iscrizione_id: iscrizioneId,
            learning_object_id: learningObjectId,
            payload,
          }),
          keepalive: true,
        })
          .then((r) => r.ok)
          .catch(() => false);
      // Payload comune a pause/seek/ended: tratti visti finora + durata reale.
      const conTratti = (extra: Record<string, unknown>) => ({
        ...extra,
        segmenti_visti: snapshot(),
        durata_secondi: durata || undefined,
      });
      sendRef.current = send;
      conTrattiRef.current = conTratti;
      const startCheckpoint = () => {
        if (checkpoint) clearInterval(checkpoint);
        checkpoint = setInterval(() => {
          if (!inRiproduzione || ultimo == null) return;
          send('video.progress', { posizione_secondi: ultimo, durata_secondi: durata || undefined });
        }, CHECKPOINT_MS);
      };
      const stopCheckpoint = () => { if (checkpoint) { clearInterval(checkpoint); checkpoint = null; } };

      player.on('timeupdate', (d: any) => {
        const s = Number(d?.seconds);
        if (!Number.isFinite(s)) return;
        if (Number.isFinite(d?.duration) && d.duration > 0) durata = d.duration;
        // Modalità integrale: un campione oltre il massimo visto (+tolleranza)
        // è un salto non ammesso → si riporta il player indietro e non si registra.
        if (visioneIntegrale) {
          const limite = limiteAvanzamento();
          if (s > limite + TOLLERANZA_SEEK + CONTINUITA_SECONDI) {
            player?.setCurrentTime(limite).catch(() => undefined);
            setAvviso(MSG_SALTO);
            ultimo = null;
            return;
          }
        }
        if (ultimo != null && s >= ultimo && s - ultimo <= CONTINUITA_SECONDI) {
          const cur = tratti[tratti.length - 1];
          if (cur && cur[1] === ultimo) cur[1] = s; else tratti.push([ultimo, s]);
        } else {
          tratti.push([s, s]);
        }
        ultimo = s;
        const now = Date.now();
        if (durata > 0 && now - ultimoAggiornamentoUi > 1000) {
          ultimoAggiornamentoUi = now;
          setCopertura(coperturaPercentuale(snapshot(), durata));
        }
      });
      player.on('play', (d: any) => {
        ultimo = null; // il prossimo campione apre (o riprende) un tratto
        inRiproduzione = true;
        setFinito(false);
        startCheckpoint();
        send('video.play', { posizione_secondi: d?.seconds ?? 0 });
      });
      player.on('pause', (d: any) => {
        inRiproduzione = false;
        stopCheckpoint();
        send('video.pause', conTratti({ posizione_secondi: d?.seconds ?? 0 }));
      });
      player.on('seeked', (d: any) => {
        const to = Number(d?.seconds ?? 0);
        const limite = limiteAvanzamento();
        // Il messaggio resta qualche secondo (si spegne da solo): prima lo
        // cancellava subito il "seeked" del riposizionamento e il blocco era muto.
        if (visioneIntegrale && to > limite + TOLLERANZA_SEEK) {
          player?.setCurrentTime(limite).catch(() => undefined);
          setAvviso(MSG_SALTO);
        }
        ultimo = null;
        send('video.seek', conTratti({ from_secondi: d?.previousSeconds ?? null, to_secondi: to }));
      });
      if (visioneIntegrale) {
        // Velocità fissa 1x: la copertura vale solo in tempo reale (è anche
        // ricalcolata così sul server, quindi 2x non "conterebbe" comunque).
        player.setPlaybackRate(1).catch(() => undefined);
        player.on('playbackratechange', (d: any) => {
          if (Number(d?.playbackRate) !== 1) {
            player?.setPlaybackRate(1).catch(() => undefined);
            setAvviso('Questo corso richiede la visione integrale a velocità normale.');
          }
        });
      }
      player.on('ended', (d: any) => {
        if (Number.isFinite(d?.duration) && d.duration > 0) durata = d.duration;
        inRiproduzione = false;
        stopCheckpoint();
        if (durata > 0) setCopertura(coperturaPercentuale(snapshot(), durata));
        setFinito(true);
        inviaEnded();
      });
      // L'invio di `ended` è riprovabile dalla schermata finale.
      inviaEndedRef.current = inviaEnded;
      function inviaEnded() {
        setRegistrazione('in_corso');
        send('video.ended', conTratti({})).then((ok) => {
          setRegistrazione(ok ? 'ok' : 'errore');
          // Il server ricalcola il completamento dal log: aggiorna chip e lista.
          if (ok) setTimeout(() => router.refresh(), 800);
        });
      }
    }
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    if (window.Vimeo) {
      attach();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${VIMEO_SDK}"]`,
      );
      if (existing) {
        existing.addEventListener('load', attach);
      } else {
        const s = document.createElement('script');
        s.src = VIMEO_SDK;
        s.async = true;
        s.onload = attach;
        document.head.appendChild(s);
      }
    }
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      if (checkpoint) clearInterval(checkpoint);
    };
  }, [vimeoId, vimeoHash, visioneIntegrale, trattiIniziali, iscrizioneId, learningObjectId, router]);

  const sendRef = useRef<((eventType: string, payload: Record<string, unknown>) => Promise<boolean>) | null>(null);
  const conTrattiRef = useRef<((extra: Record<string, unknown>) => Record<string, unknown>) | null>(null);

  const rivedi = () => {
    const p = playerRef.current;
    if (!p) return;
    setFinito(false);
    p.setCurrentTime(0).then(() => p.play()).catch(() => undefined);
  };

  return (
    <div>
      <div className="video-frame" style={{ paddingTop: '56.25%' }}>
        <iframe
          ref={iframeRef}
          src={vimeoEmbedUrl(vimeoId, vimeoHash, { bloccaVelocita: visioneIntegrale })}
          title="Video della lezione"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
        {finito && (
          <div className="end-screen" role="dialog" aria-live="polite" aria-label="Fine della lezione">
            <div className={`end-screen__ring ${registrazione === 'in_corso' ? 'end-screen__ring--wait' : registrazione === 'errore' ? 'end-screen__ring--err' : ''}`}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {registrazione === 'errore' ? <path d="M12 7v6M12 17h.01" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
              </svg>
            </div>
            <div className="end-screen__title">
              {registrazione === 'ok' ? 'Lezione completata' : registrazione === 'errore' ? 'Lezione terminata, ma non registrata' : 'Lezione terminata'}
            </div>
            <div className="end-screen__sub">
              {registrazione === 'in_corso' && 'Stiamo registrando il completamento…'}
              {registrazione === 'ok' && (visioneIntegrale && copertura != null ? `Registrata · visione ${copertura}%` : 'Registrata nel tuo percorso.')}
              {registrazione === 'errore' && 'Non siamo riusciti a registrare la fine della lezione (connessione assente o errore del servizio). Non chiudere la pagina: riprova.'}
            </div>
            <div className="end-screen__actions">
              {registrazione === 'errore' && (
                <button type="button" className="btn btn--light" onClick={() => inviaEndedRef.current?.()}>Riprova ora</button>
              )}
              {registrazione === 'ok' && nextHref && (
                <Link className="btn btn--light" href={nextHref as Route}>{nextLabel ?? 'Lezione successiva'} <Ico name="arrowR" size={16} /></Link>
              )}
              {registrazione === 'ok' && !nextHref && corsoHref && (
                <Link className="btn btn--light" href={corsoHref as Route}>Torna al corso <Ico name="arrowR" size={16} /></Link>
              )}
              <button type="button" className="btn btn--glass" onClick={rivedi}>Rivedi</button>
              {registrazione !== 'ok' && corsoHref && <Link className="btn btn--glass" href={corsoHref as Route}>Torna al corso</Link>}
            </div>
          </div>
        )}
      </div>
      {visioneIntegrale && ((copertura != null && copertura > 0) || avviso) && (
        <div className="page-lead" style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }} aria-live="polite">
          {copertura != null && copertura > 0 && (
            <span title="Il valore registrato si calcola sul tempo reale di riproduzione, a ogni pausa e ogni minuto: dopo un ricaricamento può risultare un po' più basso di questa stima.">
              Visto finora: circa {copertura}% <span style={{ opacity: 0.75 }}>(stima; il registro conta il tempo reale ed è più prudente)</span>
            </span>
          )}
          {avviso && <span className="status-now" role="status" style={{ fontWeight: 600 }}>{avviso}</span>}
        </div>
      )}
    </div>
  );
}
