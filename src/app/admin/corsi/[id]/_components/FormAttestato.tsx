'use client';

import { useState } from 'react';
import type { CorsoRow, PoliticaAttestato } from '@/lib/db-types';
import { Field } from '@/components/admin/Form';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

const POLITICHE: [PoliticaAttestato, string, string][] = [
  ['automatica', 'Automatico', 'Si emette da solo appena il percorso è completato (e il test superato).'],
  ['manuale', 'Manuale', 'Lo emette l’amministratore dalla scheda Iscritti dell’edizione, dopo i controlli del caso.'],
  ['nessuna', 'Nessuno', 'Il corso non rilascia attestati.'],
];

/**
 * Scheda "Attestato" del corso, parte dati: ore totali, riferimento normativo
 * e politica di rilascio. Ore e riferimento si compilano una volta anche a
 * corso attivo, se erano vuoti; la politica si fissa con la prima edizione.
 */
export function FormAttestato({ corso, frozen }: { corso: CorsoRow; frozen: boolean }) {
  const { call, busy, error, setError } = useCall();
  const [salvando, setSalvando] = useState(false);
  const oreIniziali = corso.ore_totali != null ? String(corso.ore_totali).replace('.', ',') : '';
  const [ore, setOre] = useState(oreIniziali);
  const [riferimento, setRiferimento] = useState(corso.riferimento_normativo ?? '');
  const [politica, setPolitica] = useState<PoliticaAttestato>(corso.politica_attestato ?? 'automatica');

  const oreEditabile = !frozen || corso.ore_totali == null;
  const riferimentoEditabile = !frozen || !corso.riferimento_normativo;
  const oreDirty = oreEditabile && ore.trim() !== oreIniziali;
  const riferimentoDirty = riferimentoEditabile && riferimento.trim() !== (corso.riferimento_normativo ?? '');
  const politicaDirty = !frozen && politica !== (corso.politica_attestato ?? 'automatica');
  const dirty = oreDirty || riferimentoDirty || politicaDirty;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    const oreNum = ore.trim() ? Number(ore.trim().replace(',', '.')) : null;
    if (ore.trim() && (!Number.isFinite(oreNum) || (oreNum as number) <= 0)) { setError('Le ore totali devono essere un numero maggiore di zero (es. 8 o 2,5).'); return; }
    const body = {
      ...(oreDirty ? { ore_totali: oreNum } : {}),
      ...(riferimentoDirty ? { riferimento_normativo: riferimento.trim() || null } : {}),
      ...(politicaDirty ? { politica_attestato: politica } : {}),
    };
    try {
      await call('PATCH', `/api/admin/corsi/${corso.id}`, body, { successo: 'Dati dell’attestato salvati.', busy: setSalvando });
    } catch { /* banner */ }
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <div className="card__head"><div><h3>Dati sull&apos;attestato</h3><div className="sub">Compaiono sul documento. Ore e riferimento si possono compilare una volta anche a corso attivo, se erano vuoti.</div></div></div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="grid-3">
          <Field id="corso-ore" label="Ore totali" hint={frozen && !oreEditabile ? 'Fissate con la prima edizione.' : 'es. 8 oppure 2,5'}>
            <input id="corso-ore" className="input" inputMode="decimal" value={ore} onChange={(e) => setOre(e.target.value)} disabled={busy || !oreEditabile} placeholder="es. 8" />
          </Field>
          <Field id="corso-rif" label="Riferimento normativo" hint={frozen && !riferimentoEditabile ? 'Fissato con la prima edizione.' : 'Facoltativo.'}>
            <input id="corso-rif" className="input" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} disabled={busy || !riferimentoEditabile} placeholder="es. Accordo Stato-Regioni 21/12/2011" />
          </Field>
          <Field id="corso-politica" label="Rilascio" hint={frozen ? 'Fissato con la prima edizione.' : POLITICHE.find((p) => p[0] === politica)?.[2]}>
            <select id="corso-politica" className="select" value={politica} onChange={(e) => setPolitica(e.target.value as PoliticaAttestato)} disabled={busy || frozen}>
              {POLITICHE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <button type="submit" className="btn" disabled={busy || !dirty}>{salvando ? 'Salvo…' : 'Salva'}</button>
      </div>
    </form>
  );
}
