'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/ui/Feedback';
import { Icon } from '@/components/admin/Atlante';

export type RigaLog = {
  id: string;
  seq: number;
  tipo: string;
  etichetta: string;
  quando: string; // già formattato (Europe/Rome)
  quandoIso: string;
  attore: { nome: string | null; email: string | null; id: string | null; tipo: string | null };
  soggetto: { tipo: string; id: string | null; etichetta: string | null };
  riassunto: string;
  payload: Record<string, unknown> | null;
  actorRaw: unknown;
  prevHash: string;
  hash: string;
};

function abbrevia(hex: string): string {
  return hex.length > 14 ? `${hex.slice(0, 6)}…${hex.slice(-6)}` : hex;
}

export function LogTable({ righe }: { righe: RigaLog[] }) {
  const { toast } = useFeedback();
  const [aperte, setAperte] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setAperte((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function copia(testo: string, cosa: string) {
    try {
      await navigator.clipboard.writeText(testo);
      toast(`${cosa} copiato.`);
    } catch {
      toast('Copia non riuscita: seleziona e copia a mano.', 'errore');
    }
  }

  if (righe.length === 0) {
    return <div className="muted" style={{ padding: '18px 0' }}>Nessun evento corrisponde ai filtri.</div>;
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl log-tbl">
        <thead>
          <tr>
            <th style={{ width: 36 }}><span className="sr-only">Dettaglio</span></th>
            <th>#</th>
            <th>Quando</th>
            <th>Evento</th>
            <th>Chi</th>
            <th>Oggetto</th>
            <th>Dettagli</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => {
            const open = aperte.has(r.id);
            return (
              <RigaLogView key={r.id} r={r} open={open} onToggle={() => toggle(r.id)} onCopia={copia} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RigaLogView({ r, open, onToggle, onCopia }: { r: RigaLog; open: boolean; onToggle: () => void; onCopia: (t: string, c: string) => void }) {
  const payloadVuoto = !r.payload || Object.keys(r.payload).length === 0;
  return (
    <>
      <tr className={`log-row${open ? ' is-open' : ''}`}>
        <td>
          <button type="button" className="log-toggle" aria-expanded={open} aria-controls={`ev-${r.seq}`} aria-label={open ? 'Chiudi dettaglio' : 'Apri dettaglio'} onClick={onToggle}>
            <Icon name="chevronRight" />
          </button>
        </td>
        <td className="mono muted">{r.seq}</td>
        <td className="log-when" title={r.quandoIso}>{r.quando}</td>
        <td>
          <div className="log-ev">{r.etichetta}</div>
          <div className="mono muted log-ev__raw">{r.tipo}</div>
        </td>
        <td>
          {r.attore.nome ? (
            <>
              <div>{r.attore.nome}</div>
              {r.attore.email && <div className="muted log-sub">{r.attore.email}</div>}
            </>
          ) : r.attore.tipo === 'system' ? (
            <span className="muted">sistema</span>
          ) : (
            <span className="mono muted" title={r.attore.id ?? ''}>{r.attore.id ? abbrevia(r.attore.id) : '—'}</span>
          )}
        </td>
        <td>
          {r.soggetto.etichetta ? <div>{r.soggetto.etichetta}</div> : null}
          <div className="muted log-sub">{r.soggetto.tipo}</div>
        </td>
        <td className="log-summary">{r.riassunto || (payloadVuoto ? <span className="muted">—</span> : <span className="muted">apri per il payload</span>)}</td>
        <td>
          <span className="log-hash">
            <code title={r.hash}>{abbrevia(r.hash)}</code>
            <button type="button" className="log-copy" aria-label="Copia hash" title="Copia hash" onClick={() => onCopia(r.hash, 'Hash')}><Icon name="copy" /></button>
          </span>
        </td>
      </tr>
      {open && (
        <tr className="log-detail" id={`ev-${r.seq}`}>
          <td />
          <td colSpan={7}>
            <div className="log-detail__grid">
              <div>
                <div className="log-detail__k">Payload</div>
                <pre className="log-detail__pre">{payloadVuoto ? '—' : JSON.stringify(r.payload, null, 2)}</pre>
              </div>
              <div>
                <div className="log-detail__k">Attore (pseudonimo, come scritto nel log)</div>
                <pre className="log-detail__pre">{JSON.stringify(r.actorRaw, null, 2)}</pre>
                <div className="log-detail__k">Soggetto</div>
                <pre className="log-detail__pre">{r.soggetto.tipo}{r.soggetto.id ? ` / ${r.soggetto.id}` : ''}</pre>
                <div className="log-detail__k">Registrato il</div>
                <pre className="log-detail__pre">{r.quandoIso}</pre>
              </div>
              <div className="log-detail__hashes">
                <div className="log-detail__k">Hash dell&apos;evento</div>
                <div className="log-detail__hash"><code>{r.hash}</code><button type="button" className="btn btn--ghost btn--xs" onClick={() => onCopia(r.hash, 'Hash')}>Copia</button></div>
                <div className="log-detail__k">Hash precedente (anello della catena)</div>
                <div className="log-detail__hash"><code>{r.prevHash}</code><button type="button" className="btn btn--ghost btn--xs" onClick={() => onCopia(r.prevHash, 'Hash precedente')}>Copia</button></div>
                <div className="log-detail__k">ID evento</div>
                <div className="log-detail__hash"><code>{r.id}</code></div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
