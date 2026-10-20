'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';

type Props = {
  iscrizioneId: string;
  learningObjectId: string;
  filename?: string;
  alreadyCompleted: boolean;
  nextHref?: string;
  nextLabel?: string;
};

export function DocumentoPlayer({
  iscrizioneId,
  learningObjectId,
  filename,
  alreadyCompleted,
  nextHref,
  nextLabel,
}: Props) {
  const router = useRouter();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedClient, setCompletedClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const openedSent = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/storage/documento/${learningObjectId}/signed-url?iscrizione_id=${iscrizioneId}`,
        );
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setSignedUrl(json.signed_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [iscrizioneId, learningObjectId]);

  // Invia documento.opened una volta al primo signed-url ottenuto.
  useEffect(() => {
    if (!signedUrl || openedSent.current) return;
    openedSent.current = true;
    fetch('/api/events/documento', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_type: 'documento.opened',
        iscrizione_id: iscrizioneId,
        learning_object_id: learningObjectId,
        payload: filename ? { filename } : {},
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [signedUrl, iscrizioneId, learningObjectId, filename]);

  async function markCompleted() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/events/documento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: 'documento.completed',
          iscrizione_id: iscrizioneId,
          learning_object_id: learningObjectId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCompletedClient(true);
      // Il server ricalcola il completamento dal log: aggiorna chip, barra e
      // lista delle lezioni (prima restavano fermi fino a un ricaricamento).
      router.refresh();
    } catch (err) {
      setError(
        `Non siamo riusciti a registrare la lettura (${err instanceof Error ? err.message : String(err)}). Riprova.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const isCompleted = alreadyCompleted || completedClient;

  return (
    <div>
      {error && <div className="alert bad" role="alert">{error}</div>}

      {signedUrl ? (
        <div className="video-frame" style={{ background: 'var(--surface-2)' }}>
          <iframe
            src={signedUrl}
            title={filename ?? 'Documento'}
            style={{ width: '100%', height: '70vh', border: 0, display: 'block' }}
          />
        </div>
      ) : (
        !error && <div className="skeleton" style={{ height: '50vh', borderRadius: 'var(--radius-xl)' }} aria-busy="true" />
      )}

      {signedUrl && (
        <div style={{ marginTop: 10 }}>
          <a className="back-link" href={signedUrl} target="_blank" rel="noreferrer">Apri il documento in una nuova scheda</a>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {isCompleted ? (
          <>
            <span className="chip chip--ok"><span className="dot" /> Lettura completata</span>
            {nextHref && <Link className="btn btn--sm" href={nextHref as Route}>{nextLabel ?? 'Lezione successiva'}</Link>}
          </>
        ) : (
          <button type="button" className="btn" onClick={markCompleted} disabled={busy || !signedUrl}>
            {busy ? 'Registro…' : 'Ho terminato la lettura'}
          </button>
        )}
      </div>
    </div>
  );
}
