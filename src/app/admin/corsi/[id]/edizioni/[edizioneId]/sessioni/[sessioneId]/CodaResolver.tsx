'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';

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
            Righe del report a cui non è stato possibile attribuire la presenza da soli:
            <strong> più iscritti possibili</strong> (stesso nome o email) oppure
            <strong> nessun iscritto</strong> con quell&apos;email. Scegli l&apos;iscritto e registra la
            presenza, oppure ignora la riga. Ogni scelta resta nel registro con la motivazione.
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
  const { confirm, toast } = useFeedback();

  async function call(url: string, body: unknown, successo: string) {
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
      toast(successo);
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
        <span className={`chip ${item.tipo === 'ambiguo' ? 'chip--ocra' : 'chip--muted'}`}>{item.tipo === 'ambiguo' ? 'più iscritti possibili' : 'nessun iscritto'}</span>
      </div>

      {error && <div className="banner banner--err" style={{ marginTop: 10, marginBottom: 0 }}><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}

      <div className="grid-2" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`coda-${item.id}-iscritto`}>Iscritto</label>
          <select id={`coda-${item.id}-iscritto`} className="select" value={iscrizioneId} onChange={(e) => setIscrizioneId(e.target.value)} disabled={busy || options.length === 0}>
            {options.length === 0 && <option value="">(nessun iscritto disponibile)</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`coda-${item.id}-motivo`}>Motivazione <span className="req" aria-hidden="true">*</span></label>
          <input id={`coda-${item.id}-motivo`} className="input" value={motivazione} onChange={(e) => setMotivazione(e.target.value)} disabled={busy} placeholder="es. confermato dall'elenco iscritti" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy || !iscrizioneId || !motivazione.trim()}
          onClick={() => call(`/api/admin/coda/${item.id}/risolvi`, { iscrizione_id: iscrizioneId, motivazione }, 'Presenza registrata.')}
        >
          {busy ? 'Registro…' : 'Registra presenza'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={busy || !motivazione.trim()}
          onClick={async () => {
            const ok = await confirm({
              titolo: 'Ignorare questa riga del report?',
              messaggio: 'Il partecipante viene registrato come non riconciliato: nessuna presenza gli sarà attribuita. La scelta resta nel registro e non si può annullare.',
              conferma: 'Ignora riga',
              pericolosa: true,
            });
            if (ok) call(`/api/admin/coda/${item.id}/ignora`, { motivazione }, 'Riga ignorata: nessuna presenza attribuita.');
          }}
          title="Nessuna presenza attribuita a questa riga"
        >
          Ignora
        </button>
      </div>
    </div>
  );
}
