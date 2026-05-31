'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';

export type IscrittoOption = { id: string; label: string };
export type CodaItem = {
  id: string;
  riga: number;
  tipo: 'ambiguo' | 'assente';
  rowNome: string | null;
  rowEmail: string | null;
  candidati: IscrittoOption[];
};

export function CodaResolver({
  items,
  tuttiIscritti,
}: {
  items: CodaItem[];
  tuttiIscritti: IscrittoOption[];
}) {
  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>Coda di riconciliazione</h3>
          <div className="sub">
            Righe del report senza presenza automatica: match <strong>ambiguo</strong> (più iscritti
            candidati) o <strong>assente</strong> (nessun iscritto con quell&apos;email). Scegli
            l&apos;iscritto e conferma, oppure ignora. Ogni scelta è un Evento con motivazione.
          </div>
        </div>
        <span className="chip chip--muted">{items.length} da risolvere</span>
      </div>
      <div className="card__body">
        {items.length === 0 ? (
          <div className="muted">Nessuna riga da risolvere: tutti i partecipanti sono stati riconciliati.</div>
        ) : (
          items.map((it) => <CodaRow key={it.id} item={it} tuttiIscritti={tuttiIscritti} />)
        )}
      </div>
    </div>
  );
}

function CodaRow({ item, tuttiIscritti }: { item: CodaItem; tuttiIscritti: IscrittoOption[] }) {
  const router = useRouter();
  const options = item.tipo === 'ambiguo' ? item.candidati : tuttiIscritti;
  const [iscrizioneId, setIscrizioneId] = useState(options[0]?.id ?? '');
  const [motivazione, setMotivazione] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: 14, marginBottom: 10 }}>
      <div className="row between">
        <div>
          <span className="mono">riga {item.riga}</span>{' '}
          <strong>{item.rowNome || '(senza nome)'}</strong>{' '}
          {item.rowEmail && <span className="muted">&lt;{item.rowEmail}&gt;</span>}
        </div>
        <span className={`chip ${item.tipo === 'ambiguo' ? 'chip--ocra' : 'chip--muted'}`}>{item.tipo}</span>
      </div>

      {error && <div className="banner banner--err" style={{ marginTop: 10, marginBottom: 0 }}><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}

      <div className="grid-2" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Iscritto</label>
          <select className="select" value={iscrizioneId} onChange={(e) => setIscrizioneId(e.target.value)} disabled={busy || options.length === 0}>
            {options.length === 0 && <option value="">(nessun iscritto disponibile)</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Motivazione (obbligatoria)</label>
          <input className="input" value={motivazione} onChange={(e) => setMotivazione(e.target.value)} disabled={busy} placeholder="es. confermato dall'elenco iscritti" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy || !iscrizioneId || !motivazione.trim()}
          onClick={() => call(`/api/admin/coda/${item.id}/risolvi`, { iscrizione_id: iscrizioneId, motivazione })}
        >
          {busy ? '…' : 'Registra presenza'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy || !motivazione.trim()}
          onClick={() => call(`/api/admin/coda/${item.id}/ignora`, { motivazione })}
          title="Scrive partecipante_non_riconciliato (nessuna presenza)"
        >
          Ignora
        </button>
      </div>
    </div>
  );
}
