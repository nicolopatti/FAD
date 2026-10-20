'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/ui/Feedback';
import { fmtIstante } from '@/components/admin/Atlante';

type Testa = { seq: number; hash: string; occurred_at: string } | null;
type Esito =
  | { ok: true; eventi: number; testa: Testa; verificato_il: string }
  | { ok: false; problemi: Array<{ seq: number; problema: string }>; eventi: number; testa: Testa; verificato_il: string }
  | { ok: false; errore: string };

function abbrevia(hex: string): string {
  return hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : hex;
}

// Verifica della catena come "momento firma": il sigillo si disegna solo
// quando il server ha ricontrollato tutti gli hash.
export function ChainVerifyButton({ streamId }: { streamId: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Esito | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/audit/verify?stream_id=${streamId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        errore: `Verifica non eseguita: ${err instanceof Error ? err.message : String(err)}. Riprova.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function copia(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      toast('Hash di testa copiato.');
    } catch {
      toast('Copia non riuscita: seleziona e copia a mano.', 'errore');
    }
  }

  const stato = busy ? 'wait' : result ? (result.ok ? 'ok' : 'bad') : 'idle';

  return (
    <section className={`chain-seal chain-seal--${stato}`} aria-live="polite">
      <div className="chain-seal__art" aria-hidden="true">
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
          <circle cx="48" cy="48" r="44" className="chain-seal__track" strokeWidth="2" />
          <circle cx="48" cy="48" r="40" className="chain-seal__ring" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 48 48)" />
          {stato === 'bad' ? (
            <path className="chain-seal__mark" d="M34 34l28 28M62 34L34 62" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <path className="chain-seal__mark" d="M32 49l11 11 22-24" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>
      <div className="chain-seal__body">
        {stato === 'idle' && (
          <>
            <div className="chain-seal__title">Verifica l&apos;integrità del registro</div>
            <p className="chain-seal__text">Il server ricalcola l&apos;hash di ogni evento e lo confronta con quello scritto: se anche un solo byte fosse cambiato, la catena si spezzerebbe.</p>
          </>
        )}
        {stato === 'wait' && (
          <>
            <div className="chain-seal__title">Verifica in corso…</div>
            <p className="chain-seal__text">Ricalcolo degli hash di tutti gli eventi dello stream.</p>
          </>
        )}
        {result && result.ok && (
          <>
            <div className="chain-seal__kicker">Catena integra</div>
            <div className="chain-seal__title">{result.eventi} event{result.eventi === 1 ? 'o verificato' : 'i verificati'}, tutti gli hash combaciano</div>
            <dl className="chain-seal__meta">
              {result.testa && (
                <>
                  <dt>Hash di testa</dt>
                  <dd>
                    <code title={result.testa.hash}>{abbrevia(result.testa.hash)}</code>
                    <button type="button" className="chain-seal__copy" onClick={() => copia(result.testa!.hash)}>copia</button>
                    <span className="muted"> · evento {result.testa.seq}</span>
                  </dd>
                </>
              )}
              <dt>Verificata il</dt>
              <dd>{fmtIstante(result.verificato_il)}</dd>
            </dl>
          </>
        )}
        {result && !result.ok && 'errore' in result && (
          <>
            <div className="chain-seal__kicker">Verifica non eseguita</div>
            <p className="chain-seal__text">{result.errore}</p>
          </>
        )}
        {result && !result.ok && 'problemi' in result && (
          <>
            <div className="chain-seal__kicker">Catena NON integra</div>
            <div className="chain-seal__title">{result.problemi.length} problem{result.problemi.length === 1 ? 'a' : 'i'} su {result.eventi} eventi</div>
            <ul className="chain-seal__problems">
              {result.problemi.slice(0, 20).map((p, i) => (
                <li key={i}><code>seq {p.seq}</code> {p.problema}</li>
              ))}
              {result.problemi.length > 20 && <li>… e altri {result.problemi.length - 20}</li>}
            </ul>
          </>
        )}
        <div className="chain-seal__actions">
          <button type="button" className={`btn ${result ? 'btn--secondary' : ''}`} onClick={verify} disabled={busy}>
            {busy ? 'Verifica in corso…' : result ? 'Verifica di nuovo' : 'Verifica integrità catena'}
          </button>
        </div>
      </div>
    </section>
  );
}
