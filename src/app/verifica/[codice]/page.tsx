import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dataEstesa, oreLabel } from '@/lib/attestato-pdf';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Verifica attestato',
  robots: { index: false, follow: false },
};

type Esito = {
  trovato: boolean;
  stato?: 'valido' | 'sostituito';
  numero?: string;
  emesso_il?: string;
  sostituito_il?: string | null;
  hash?: string;
  hash_ricalcolato_ok?: boolean;
  discente?: { nome: string | null; cognome: string | null };
  corso?: { titolo: string | null; ore_totali: number | null; riferimento_normativo: string | null };
  edizione?: { codice: string | null; data_inizio: string | null; data_fine: string | null };
  ente?: { ragione_sociale: string | null; citta: string | null; logo_path: string | null };
  test?: { superato: boolean; percentuale: number | null; soglia: number | null } | null;
  completato_il?: string | null;
};

// Pagina pubblica, senza accesso: chi ha il codice (QR sull'attestato) vede i
// soli campi pubblici restituiti da `attestato_verifica` (RPC eseguibile da anon).
export default async function VerificaPage({ params }: { params: { codice: string } }) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc('attestato_verifica', { p_codice: params.codice.toLowerCase() });
  const e = (data ?? { trovato: false }) as Esito;

  return (
    <main className="verifica">
      <div className="verifica__card">
        <div className="verifica__brand"><span className="brand__mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8L6 20z" /></svg></span> Verifica dell&apos;attestato</div>
        {!e.trovato ? (
          <>
            <div className="verifica__stato verifica__stato--no">Nessun attestato corrisponde a questo codice</div>
            <p className="page-lead">Controlla di aver inquadrato bene il codice o di aver copiato l&apos;indirizzo per intero. Se il dubbio resta, rivolgiti all&apos;ente che ha rilasciato l&apos;attestato.</p>
          </>
        ) : (
          <>
            <div className={`verifica__stato ${e.stato === 'valido' && e.hash_ricalcolato_ok ? 'verifica__stato--ok' : 'verifica__stato--warn'}`}>
              {e.stato === 'valido'
                ? (e.hash_ricalcolato_ok ? 'Attestato autentico' : 'Attestato trovato, ma il contenuto non corrisponde all’impronta registrata')
                : `Attestato sostituito${e.sostituito_il ? ` il ${dataEstesa(e.sostituito_il)}` : ''}`}
            </div>
            {e.stato === 'sostituito' && (
              <p className="page-lead">Questo attestato è stato sostituito da una nuova emissione (per esempio per correggere un dato). Fa fede il documento più recente, che ha un proprio codice di verifica.</p>
            )}
            <dl className="verifica__dati">
              <div><dt>Intestato a</dt><dd className="verifica__nome">{e.discente?.nome} {e.discente?.cognome}</dd></div>
              <div><dt>Corso</dt><dd>{e.corso?.titolo}{e.corso?.ore_totali ? <span className="muted"> · {oreLabel(Number(e.corso.ore_totali))}</span> : null}</dd></div>
              {e.corso?.riferimento_normativo && <div><dt>Riferimento normativo</dt><dd>{e.corso.riferimento_normativo}</dd></div>}
              <div><dt>Ente</dt><dd>{e.ente?.ragione_sociale}{e.ente?.citta ? `, ${e.ente.citta}` : ''}</dd></div>
              {e.edizione?.codice && <div><dt>Edizione</dt><dd>{e.edizione.codice}{e.edizione.data_inizio ? ` · dal ${dataEstesa(e.edizione.data_inizio)}` : ''}{e.edizione.data_fine ? ` al ${dataEstesa(e.edizione.data_fine)}` : ''}</dd></div>}
              {e.test && <div><dt>Verifica finale</dt><dd>{e.test.superato ? 'superata' : 'non superata'}{e.test.percentuale != null ? ` con il ${e.test.percentuale}% di risposte giuste` : ''}</dd></div>}
              {e.completato_il && <div><dt>Percorso completato il</dt><dd>{dataEstesa(e.completato_il)}</dd></div>}
              <div><dt>Numero</dt><dd className="mono">{e.numero}</dd></div>
              <div><dt>Emesso il</dt><dd>{dataEstesa(e.emesso_il)}</dd></div>
              <div><dt>Impronta</dt><dd className="mono verifica__hash">{e.hash}</dd></div>
            </dl>
            <div className="row row--wrap" style={{ marginTop: 18 }}>
              <a className="btn" href={`/api/verifica/${params.codice.toLowerCase()}/pdf`}>Scarica il PDF</a>
            </div>
          </>
        )}
        <p className="verifica__nota">
          Il contenuto dell&apos;attestato è registrato in modo che nessuno possa modificarlo dopo l&apos;emissione: questa pagina lo legge dal registro e ne ricalcola l&apos;impronta.
          {' '}<Link href="/login">Accedi alla piattaforma</Link>
        </p>
      </div>
    </main>
  );
}
