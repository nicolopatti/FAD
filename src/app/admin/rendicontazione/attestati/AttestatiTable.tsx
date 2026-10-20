'use client';

import { useMemo, useState } from 'react';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { Pager } from '@/components/admin/Form';

export type AttestatoLista = {
  id: string;
  numero: string;
  codice_verifica: string;
  emesso_at: string;
  automatico: boolean;
  stato: 'valido' | 'sostituito';
  riemissione: boolean;
  discente: string;
  corso: string;
  edizione: string;
};

const PER_PAGINA = 25;

export function AttestatiTable({ righe }: { righe: AttestatoLista[] }) {
  const [q, setQ] = useState('');
  const [stato, setStato] = useState<'tutti' | 'validi' | 'sostituiti'>('validi');
  const [pagina, setPagina] = useState(1);
  const filtrate = useMemo(() => {
    const n = q.trim().toLowerCase();
    return righe.filter((r) => {
      if (stato === 'validi' && r.stato !== 'valido') return false;
      if (stato === 'sostituiti' && r.stato !== 'sostituito') return false;
      return !n || `${r.numero} ${r.discente} ${r.corso} ${r.edizione}`.toLowerCase().includes(n);
    });
  }, [righe, q, stato]);
  const pagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const cur = Math.min(pagina, pagine);
  const visibili = filtrate.slice((cur - 1) * PER_PAGINA, cur * PER_PAGINA);
  const validi = righe.filter((r) => r.stato === 'valido').length;

  return (
    <div className="card">
      <div className="card__head">
        <div><h3>{validi} attestat{validi === 1 ? 'o valido' : 'i validi'}</h3><div className="sub">{righe.length - validi > 0 ? `${righe.length - validi} sostituit${righe.length - validi === 1 ? 'o' : 'i'}` : 'Nessuna riemissione finora.'}</div></div>
        <div className="seg">
          <button type="button" className={stato === 'validi' ? 'is-active' : ''} onClick={() => { setStato('validi'); setPagina(1); }}>Validi</button>
          <button type="button" className={stato === 'sostituiti' ? 'is-active' : ''} onClick={() => { setStato('sostituiti'); setPagina(1); }}>Sostituiti</button>
          <button type="button" className={stato === 'tutti' ? 'is-active' : ''} onClick={() => { setStato('tutti'); setPagina(1); }}>Tutti</button>
        </div>
      </div>
      <div className="card__body">
        {righe.length === 0 ? (
          <div className="empty">
            <Icon name="shield" className="empty__icon" />
            <div className="empty__t">Nessun attestato emesso</div>
            <div className="empty__s">Gli attestati compaiono qui quando un iscritto completa un corso che li prevede (o quando li emetti dalla scheda Iscritti dell&apos;edizione).</div>
          </div>
        ) : (
          <>
            {righe.length > 8 && (
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <div className="search"><Icon name="search" /><input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per numero, persona, corso…" aria-label="Cerca tra gli attestati" /></div>
              </div>
            )}
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Numero</th><th>Intestato a</th><th>Corso / Edizione</th><th>Emesso</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {visibili.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.numero}{r.riemissione && <span className="muted"> · riemissione</span>}</td>
                    <td className="t-title">{r.discente || <span className="muted">—</span>}</td>
                    <td><div>{r.corso}</div><div className="muted mono" style={{ fontSize: 11 }}>{r.edizione}</div></td>
                    <td className="muted">{fmtDataOra(r.emesso_at)} · {r.automatico ? 'automatico' : 'manuale'}</td>
                    <td>{r.stato === 'valido' ? <span className="chip chip--ok"><span className="dot" />valido</span> : <span className="chip chip--muted">sostituito</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <a className="btn btn--ghost btn--xs" href={`/api/attestati/${r.id}/pdf`} target="_blank" rel="noreferrer"><Icon name="download" /> PDF</a>
                        <a className="btn btn--ghost btn--xs" href={`/verifica/${r.codice_verifica}`} target="_blank" rel="noreferrer">Verifica</a>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibili.length === 0 && <tr><td colSpan={6} className="muted">Nessun attestato corrisponde ai filtri.</td></tr>}
              </tbody>
            </table></div>
            <Pager page={cur} pages={pagine} total={filtrate.length} perPage={PER_PAGINA} onChange={setPagina} cosa="attestati" />
          </>
        )}
      </div>
    </div>
  );
}
