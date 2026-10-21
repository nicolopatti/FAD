'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { parseSoglia } from '@/lib/validazione';

export function NewCorsoForm({ categorie }: { categorie: string[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [titolo, setTitolo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [sblocco, setSblocco] = useState(true);
  const [integrale, setIntegrale] = useState(false);
  const [ore, setOre] = useState('');
  const [riferimento, setRiferimento] = useState('');
  const [politica, setPolitica] = useState('manuale');
  const [soglia, setSoglia] = useState('');
  const [errSoglia, setErrSoglia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errTitolo, setErrTitolo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titolo.trim()) { setErrTitolo('Il titolo è obbligatorio: è quello che vedranno i discenti.'); return; }
    setErrTitolo(null);
    if (parseSoglia(soglia) === undefined) { setErrSoglia('Indica una percentuale tra 1 e 100, oppure lascia vuoto.'); return; }
    setErrSoglia(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/corsi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titolo: titolo.trim(),
          descrizione: descrizione.trim() || null,
          categoria: categoria || null,
          sblocco_sequenziale: sblocco,
          visione_integrale: integrale,
          ore_totali: ore.trim() ? ore.trim().replace(',', '.') : null,
          riferimento_normativo: riferimento.trim() || null,
          politica_attestato: politica,
          soglia_frequenza_percentuale: soglia.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast('Corso creato: ora componi la struttura.');
      router.push(`/admin/corsi/${json.corso.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Nuovo corso</span>
          <h1>Crea un corso</h1>
          <p>Definisci i dati di base. Comporrai la struttura e aprirai le edizioni nel passo successivo.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--ghost" href="/admin/corsi"><Icon name="arrowLeft" /> Tutti i corsi</Link>
        </div>
      </div>

      <form className="card" onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
        <div className="card__body">
          {error && (
            <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>
          )}
          <Field id="nc-titolo" label="Titolo" required error={errTitolo}>
            <input id="nc-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); if (errTitolo) setErrTitolo(null); }} disabled={busy} placeholder="es. Sicurezza sul lavoro — Formazione generale" autoFocus aria-invalid={Boolean(errTitolo)} />
          </Field>
          <Field id="nc-categoria" label="Categoria" hint={<>Serve per il segnaposto della copertina e per ritrovare il corso nel catalogo. L&apos;elenco si gestisce in <Link href="/admin/impostazioni/categorie">Impostazioni → Categorie</Link>.</>}>
            <select id="nc-categoria" className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
              <option value="">— nessuna —</option>
              {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="nc-descrizione" label="Descrizione" hint="È il testo che il discente legge nella pagina del corso. Resta modificabile anche dopo.">
            <textarea id="nc-descrizione" className="textarea" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} disabled={busy} />
          </Field>
          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Sblocco sequenziale</div>
              <div className="muted" style={{ fontSize: 12 }}>Le lezioni si aprono una dopo l&apos;altra, solo a completamento della precedente.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={sblocco} onChange={(e) => setSblocco(e.target.checked)} disabled={busy} />
              <span className="switch__track" />
            </label>
          </div>
          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Visione integrale dei video</div>
              <div className="muted" style={{ fontSize: 12 }}>Per i corsi finanziati: un video conta come completato solo se riprodotto davvero (almeno il 95%) e il discente non può saltare avanti. Spento = fruizione libera.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={integrale} onChange={(e) => setIntegrale(e.target.checked)} disabled={busy} />
              <span className="switch__track" />
            </label>
          </div>
          <Field id="nc-soglia" label="Presenza minima alle sessioni (%)" error={errSoglia} hint="Solo per i corsi con sessioni live (webinar o aula): sotto questa presenza il discente non completa il corso. Per un corso solo online lascia vuoto.">
            <input id="nc-soglia" className="input" inputMode="decimal" value={soglia} onChange={(e) => { setSoglia(e.target.value); if (errSoglia) setErrSoglia(null); }} disabled={busy} placeholder="es. 80" style={{ maxWidth: 160 }} aria-invalid={Boolean(errSoglia)} />
          </Field>
          <h4 style={{ margin: '4px 0 8px' }}>Attestato</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Field id="nc-ore" label="Ore totali" hint="Compaiono sull’attestato (es. 8 o 2,5).">
              <input id="nc-ore" className="input" inputMode="decimal" value={ore} onChange={(e) => setOre(e.target.value)} disabled={busy} placeholder="es. 8" />
            </Field>
            <Field id="nc-rif" label="Riferimento normativo" hint="Facoltativo.">
              <input id="nc-rif" className="input" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} disabled={busy} placeholder="es. Accordo Stato-Regioni 21/12/2011" />
            </Field>
          </div>
          <Field id="nc-politica" label="Rilascio dell’attestato" hint={politica === 'automatica' ? 'Si emette da solo appena il percorso è completato (e il test superato).' : politica === 'manuale' ? 'Lo emette l’amministratore dalla scheda Iscritti dell’edizione, dopo i controlli del caso.' : 'Il corso non rilascia attestati.'}>
            <select id="nc-politica" className="select" value={politica} onChange={(e) => setPolitica(e.target.value)} disabled={busy}>
              <option value="manuale">Manuale (consigliato)</option>
              <option value="automatica">Automatico</option>
              <option value="nessuna">Nessuno</option>
            </select>
          </Field>
          <div className="field__hint" style={{ marginBottom: 14 }}>Sblocco, visione integrale, presenza minima e rilascio dell&apos;attestato si congelano alla prima edizione: scegli adesso con attenzione. Ore e riferimento normativo si possono compilare anche dopo, se lasciati vuoti.</div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Creo…' : 'Crea corso'}</button>
        </div>
      </form>
    </>
  );
}
