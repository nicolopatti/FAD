'use client';

import { useRouter } from 'next/navigation';

export type EdizioneScope = { id: string; codice: string; corso: string; iscritti: number; attiva: boolean };

/**
 * Ambito del report (Blocco B #2, "paginare per edizione"): il server legge e
 * ricalcola solo le iscrizioni dell'edizione scelta; "Tutte" resta possibile ma
 * sopra la soglia è sconsigliato (la pagina ricalcola migliaia di percorsi).
 */
export function ScopeEdizione({ edizioni, scelta, totale, soglia }: { edizioni: EdizioneScope[]; scelta: string; totale: number; soglia: number }) {
  const router = useRouter();
  return (
    <div className="toolbar" style={{ marginBottom: 14, alignItems: 'center' }}>
      <label className="field" style={{ margin: 0, minWidth: 260 }}>
        <span>Edizione</span>
        <select
          className="select"
          value={scelta}
          onChange={(e) => router.push(`/audit/completamento?edizione=${encodeURIComponent(e.target.value)}`)}
          aria-label="Edizione"
        >
          <option value="tutte">Tutte le edizioni · {totale} iscrizion{totale === 1 ? 'e' : 'i'}</option>
          {edizioni.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.codice} · {ed.corso} · {ed.iscritti} iscritt{ed.iscritti === 1 ? 'o' : 'i'}{ed.attiva ? '' : ' · chiusa'}
            </option>
          ))}
        </select>
      </label>
      {scelta === 'tutte' && totale > soglia && (
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Oltre {soglia} iscrizioni: scegli un&apos;edizione per una pagina più rapida.
        </span>
      )}
    </div>
  );
}
