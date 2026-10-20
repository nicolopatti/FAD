'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/ui/Feedback';

// Data e luogo di nascita: li compila il discente (autocertificazione), servono
// sull'attestato. Il resto dell'anagrafica resta in mano all'ente.
export function ProfiloForm({ dataNascita, luogoNascita }: { dataNascita: string | null; luogoNascita: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [data, setData] = useState(dataNascita ?? '');
  const [luogo, setLuogo] = useState(luogoNascita ?? '');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const dirty = data !== (dataNascita ?? '') || luogo.trim() !== (luogoNascita ?? '');

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrore(null);
    try {
      const res = await fetch('/api/profilo/nascita', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_nascita: data || null, luogo_nascita: luogo || null }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Non siamo riusciti a salvare. Riprova.');
      toast('Dati di nascita salvati.');
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={salva} noValidate className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 18, margin: 0 }}>Dati per l&apos;attestato</h2>
        <p className="page-lead" style={{ margin: '4px 0 0' }}>Data e luogo di nascita compaiono sull&apos;attestato. Compilali prima di completare un corso, così l&apos;attestato esce già completo.</p>
      </div>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label className="field">
          <span>Data di nascita</span>
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} disabled={busy} max={new Date(Date.now() - 14 * 365.25 * 86400000).toISOString().slice(0, 10)} />
        </label>
        <label className="field">
          <span>Luogo di nascita</span>
          <input className="input" value={luogo} onChange={(e) => setLuogo(e.target.value)} disabled={busy} placeholder="es. Bergamo" maxLength={120} />
        </label>
      </div>
      {errore && <div className="alert bad" role="alert">{errore}</div>}
      <div><button type="submit" className="btn" disabled={busy || !dirty}>{busy ? 'Salvo…' : 'Salva'}</button></div>
    </form>
  );
}
