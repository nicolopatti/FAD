'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Vimeo?: { Player: new (el: HTMLIFrameElement | HTMLElement) => VimeoPlayerInstance };
  }
}

type VimeoPlayerInstance = {
  on: (event: string, cb: (data: any) => void) => void;
  getCurrentTime: () => Promise<number>;
};

type Props = {
  vimeoId: string;
  iscrizioneId: string;
  learningObjectId: string;
};

const VIMEO_SDK = 'https://player.vimeo.com/api/player.js';

export function VimeoPlayer({ vimeoId, iscrizioneId, learningObjectId }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    let player: VimeoPlayerInstance | null = null;

    function attach() {
      if (!window.Vimeo || !iframeRef.current) return;
      player = new window.Vimeo.Player(iframeRef.current);
      const send = (eventType: string, payload: Record<string, unknown>) => {
        setStatus(eventType);
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
      player.on('play', (d: any) => send('video.play', { posizione_secondi: d?.seconds ?? 0 }));
      player.on('pause', (d: any) => send('video.pause', { posizione_secondi: d?.seconds ?? 0 }));
      player.on('seeked', (d: any) =>
        send('video.seek', {
          from_secondi: d?.previousSeconds ?? null,
          to_secondi: d?.seconds ?? 0,
        }),
      );
      player.on('ended', (d: any) => send('video.ended', { durata_secondi: d?.duration ?? 0 }));
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
  }, [vimeoId, iscrizioneId, learningObjectId]);

  return (
    <div>
      <div style={{ position: 'relative', paddingTop: '56.25%' }}>
        <iframe
          ref={iframeRef}
          src={`https://player.vimeo.com/video/${vimeoId}?dnt=1`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      {status && (
        <p className="muted mono" style={{ marginTop: 8 }}>
          Ultimo evento inviato: {status}
        </p>
      )}
    </div>
  );
}
