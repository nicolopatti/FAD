import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { AttestatiTable, type AttestatoLista } from './AttestatiTable';
import { RendicontazioneTabs } from '@/components/admin/SezioneTabs';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; numero: string; codice_verifica: string; emesso_at: string; emesso_da: string | null; sostituito_da: string | null; sostituisce: string | null;
  contenuto: { discente?: { nome?: string; cognome?: string }; corso?: { titolo?: string }; edizione?: { codice?: string } };
};

// Elenco degli attestati del tenant (validi e sostituiti), con ricerca e PDF.
export default async function AttestatiPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const righe = unwrap(await supabase
    .from('attestato')
    .select('id, numero, codice_verifica, emesso_at, emesso_da, sostituito_da, sostituisce, contenuto')
    .order('emesso_at', { ascending: false })
    .returns<Row[]>(), 'gli attestati');
  const lista: AttestatoLista[] = righe.map((r) => ({
    id: r.id,
    numero: r.numero,
    codice_verifica: r.codice_verifica,
    emesso_at: r.emesso_at,
    automatico: r.emesso_da == null,
    stato: r.sostituito_da ? 'sostituito' : 'valido',
    riemissione: Boolean(r.sostituisce),
    discente: `${r.contenuto.discente?.cognome ?? ''} ${r.contenuto.discente?.nome ?? ''}`.trim(),
    corso: r.contenuto.corso?.titolo ?? '',
    edizione: r.contenuto.edizione?.codice ?? '',
  }));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Rendicontazione</h1>
          <p>Ogni attestato è un documento numerato e congelato al momento dell&apos;emissione: si verifica dalla pagina pubblica con il codice stampato sopra. Per correggerne uno si riemette dalla scheda Iscritti dell&apos;edizione.</p>
        </div>
      </div>
      <RendicontazioneTabs nAttestati={lista.filter((a) => a.stato === 'valido').length} />
      <AttestatiTable righe={lista} />
    </>
  );
}
