'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  iscrizioneId: string;
  learningObjectId: string;
  filename?: string;
  alreadyCompleted: boolean;
};

export function DocumentoPlayer({
  iscrizioneId,
  learningObjectId,
  filename,
  alreadyCompleted,
}: Props) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const isCompleted = alreadyCompleted || completedClient;

  return (
    <div>
      {error && <div className="alert">{error}</div>}

      {signedUrl ? (
        <iframe
          src={signedUrl}
          title={filename ?? 'Documento'}
          style={{ width: '100%', height: '70vh', border: '1px solid #e1e1e1', borderRadius: 6 }}
        />
      ) : (
        !error && <div className="muted">Carico il PDF…</div>
      )}

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        {isCompleted ? (
          <span className="badge ok">Lettura registrata</span>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={markCompleted}
            disabled={busy || !signedUrl}
          >
            {busy ? 'Registro…' : 'Ho terminato la lettura'}
          </button>
        )}
        <span className="muted" style={{ fontSize: '0.9em' }}>
          La regola di completamento è <code>documento_completed</code>: l'LO risulta
          completato dopo aver dichiarato la lettura, gli eventi vanno nel log.
        </span>
      </div>
    </div>
  );
}
