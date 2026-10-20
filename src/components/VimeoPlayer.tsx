'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
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

export function VimeoPlayer({
  vimeoId, vimeoHash, visioneIntegrale = false, trattiIniziali, coperturaIniziale, corsoHref,
  iscrizioneId, learningObjectId,
}: Props) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<VimeoPlayerInstance | null>(null);
  const [copertura, setCopertura] = useState<number | null>(coperturaIniziale ?? null);
  const [avviso, setAvviso] = useState<string | null>(null);
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
            setAvviso('Questo corso richiede la visione integrale: non è possibile saltare avanti.');
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
        if (visioneIntegrale && to > limite + TOLLERANZA_SEEK) {
          player?.setCurrentTime(limite).catch(() => undefined);
          setAvviso('Questo corso richiede la visione integrale: non è possibile saltare avanti.');
        } else {
          setAvviso(null);
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
      <div
        style={{
          position: 'relative',
          paddingTop: '56.25%',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          background: '#1a1814',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <iframe
          ref={iframeRef}
          src={vimeoEmbedUrl(vimeoId, vimeoHash, { bloccaVelocita: visioneIntegrale })}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
        {finito && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center',
              background: 'rgba(26, 24, 20, 0.96)', color: '#f4efe6',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600 }} aria-live="polite">
              {registrazione === 'ok' ? 'Lezione completata' : registrazione === 'errore' ? 'Lezione terminata, ma non registrata' : 'Lezione terminata'}
            </div>
            <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 420 }}>
              {registrazione === 'in_corso' && 'Registrazione in corso…'}
              {registrazione === 'ok' && (visioneIntegrale
                ? `La visione è stata registrata.${copertura != null ? ` Riprodotto: ${copertura}%.` : ''} Il completamento è calcolato sul tempo reale di riproduzione.`
                : 'La visione è stata registrata.')}
              {registrazione === 'errore' && 'Non siamo riusciti a registrare la fine della lezione (connessione assente o errore del server). Non chiudere la pagina: riprova.'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
              {registrazione === 'errore' && (
                <button type="button" className="btn" onClick={() => inviaEndedRef.current?.()}>Riprova ora</button>
              )}
              <button type="button" className="btn btn--secondary" onClick={rivedi}>Rivedi</button>
              {corsoHref && <Link className="btn btn--secondary" href={corsoHref as Route}>Torna al corso</Link>}
            </div>
          </div>
        )}
      </div>
      {visioneIntegrale && (
        <div className="muted" style={{ marginTop: 10, fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Visione integrale richiesta: il video va riprodotto per intero, a velocità normale e senza salti in avanti. Il tempo conteggiato è quello reale.</span>
          {copertura != null && <span>Riprodotto finora: {copertura}%</span>}
          {avviso && <span style={{ color: 'var(--accent)' }}>{avviso}</span>}
        </div>
      )}
    </div>
  );
}
