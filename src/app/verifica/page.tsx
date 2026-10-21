import type { Metadata } from 'next';
import type { Route } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Verifica attestato',
  robots: { index: false, follow: false },
};

// C (stress test 21/10): /verifica senza codice dava 404. Pagina pubblica con
// un campo per il codice stampato sull'attestato; invio → /verifica/<codice>.
export default async function VerificaSenzaCodice(props: { searchParams?: Promise<{ codice?: string }> }) {
  const sp = await props.searchParams;
  const codice = (sp?.codice ?? '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (codice) redirect(`/verifica/${codice}` as Route);
  const vuoto = sp?.codice !== undefined;

  return (
    <main className="verifica">
      <div className="verifica__card">
        <div className="verifica__brand"><span className="brand__mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8L6 20z" /></svg></span> Verifica dell&apos;attestato</div>
        <h1 style={{ fontSize: 'var(--text-xl)', margin: '8px 0 6px' }}>Verifica un attestato</h1>
        <p className="page-lead">Inquadra il QR stampato sull&apos;attestato oppure scrivi qui il codice di verifica (24 caratteri, lettere e numeri).</p>
        <form method="get" action="/verifica" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <label htmlFor="codice" className="sr-only">Codice di verifica</label>
          <input id="codice" name="codice" className="input mono" placeholder="es. d0205717a0b46223e2bbf5ef" autoComplete="off" spellCheck={false} required style={{ flex: '1 1 240px', minWidth: 0 }} aria-invalid={vuoto} />
          <button type="submit" className="btn">Verifica</button>
        </form>
        {vuoto && <p className="field__error" role="alert" style={{ marginTop: 8 }}>Il codice non contiene caratteri validi: controlla di averlo copiato per intero.</p>}
      </div>
    </main>
  );
}
