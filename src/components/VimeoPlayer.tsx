'use client';

import { useEffect, useRef, useState } from 'react';
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
};

type Props = {
  vimeoId: string;
  vimeoHash?: string;
  /** Corso con visione integrale: tratti visti tracciati e niente salti in avanti. */
  visioneIntegrale?: boolean;
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

export function VimeoPlayer({ vimeoId, vimeoHash, visioneIntegrale = false, iscrizioneId, learningObjectId }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [copertura, setCopertura] = useState<number | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  useEffect(() => {
    let player: VimeoPlayerInstance | null = null;
    // Tratti riprodotti in questa sessione di pagina (uniti al momento dell'invio).
    // Le sessioni precedenti sono già nel log: la compliance fa l'unione di tutto.
    const tratti: Segmento[] = [];
    let ultimo: number | null = null;
    let durata = 0;
    let maxVisto = 0;
    let ultimoAggiornamentoUi = 0;

    const snapshot = () => unisciSegmenti(tratti);

    function attach() {
      if (!window.Vimeo || !iframeRef.current) return;
      player = new window.Vimeo.Player(iframeRef.current);
      // Il tracciamento è silenzioso: gli eventi vanno al log del tenant via API,
      // ma non sono mostrati al discente (la vista grezza è dell'auditor).
      const send = (eventType: string, payload: Record<string, unknown>) => {
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
        }).catch(() => undefined);
      };
      // Payload comune a pause/seek/ended: tratti visti finora + durata reale.
      const conTratti = (extra: Record<string, unknown>) => ({
        ...extra,
        segmenti_visti: snapshot(),
        durata_secondi: durata || undefined,
      });

      player.on('timeupdate', (d: any) => {
        const s = Number(d?.seconds);
        if (!Number.isFinite(s)) return;
        if (Number.isFinite(d?.duration) && d.duration > 0) durata = d.duration;
        // Modalità integrale: un campione oltre il massimo visto (+tolleranza)
        // è un salto non ammesso → si riporta il player indietro e non si registra.
        if (visioneIntegrale && s > maxVisto + TOLLERANZA_SEEK + CONTINUITA_SECONDI) {
          player?.setCurrentTime(maxVisto).catch(() => undefined);
          setAvviso('Questo corso richiede la visione integrale: non è possibile saltare avanti.');
          ultimo = null;
          return;
        }
        if (ultimo != null && s >= ultimo && s - ultimo <= CONTINUITA_SECONDI) {
          const cur = tratti[tratti.length - 1];
          if (cur && cur[1] === ultimo) cur[1] = s; else tratti.push([ultimo, s]);
        } else {
          tratti.push([s, s]);
        }
        ultimo = s;
        if (s > maxVisto) maxVisto = s;
        const now = Date.now();
        if (durata > 0 && now - ultimoAggiornamentoUi > 1000) {
          ultimoAggiornamentoUi = now;
          setCopertura(coperturaPercentuale(snapshot(), durata));
        }
      });
      player.on('play', (d: any) => {
        ultimo = null; // il prossimo campione apre (o riprende) un tratto
        send('video.play', { posizione_secondi: d?.seconds ?? 0 });
      });
      player.on('pause', (d: any) => send('video.pause', conTratti({ posizione_secondi: d?.seconds ?? 0 })));
      player.on('seeked', (d: any) => {
        const to = Number(d?.seconds ?? 0);
        if (visioneIntegrale && to > maxVisto + TOLLERANZA_SEEK) {
          player?.setCurrentTime(maxVisto).catch(() => undefined);
          setAvviso('Questo corso richiede la visione integrale: non è possibile saltare avanti.');
        } else {
          setAvviso(null);
        }
        ultimo = null;
        send('video.seek', conTratti({ from_secondi: d?.previousSeconds ?? null, to_secondi: to }));
      });
      player.on('ended', (d: any) => {
        if (Number.isFinite(d?.duration) && d.duration > 0) durata = d.duration;
        send('video.ended', conTratti({}));
        if (durata > 0) setCopertura(coperturaPercentuale(snapshot(), durata));
      });
    }

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
  }, [vimeoId, vimeoHash, visioneIntegrale, iscrizioneId, learningObjectId]);

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
          src={vimeoEmbedUrl(vimeoId, vimeoHash)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      {visioneIntegrale && (
        <div className="muted" style={{ marginTop: 10, fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Visione integrale richiesta: il video va riprodotto per intero, senza salti in avanti.</span>
          {copertura != null && <span>Riprodotto in questa sessione: {copertura}%</span>}
          {avviso && <span style={{ color: 'var(--accent)' }}>{avviso}</span>}
        </div>
      )}
    </div>
  );
}
