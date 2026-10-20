import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { AziendaRiepilogo } from '@/lib/db-types';
import { PersoneTabs } from '@/components/admin/SezioneTabs';
import { fuoriIntervallo, hrefPaginaUno, intervallo, parsePagina, PER_PAGINA } from '@/lib/paginazione';
import { AziendeLista } from './AziendeLista';

export const dynamic = 'force-dynamic';

type Params = { q?: string; pagina?: string; nuova?: string };

/** Aziende dei discenti (per la rendicontazione): lista paginata, doppioni da unire. */
export default async function AziendePage({ searchParams }: { searchParams?: Params }) {
  await requireAdmin();
  const sp = searchParams ?? {};
  const q = (sp.q ?? '').trim().slice(0, 80);
  const pagina = parsePagina(sp.pagina);
  const supabase = createSupabaseServerClient();

  let query = supabase.from('azienda_riepilogo').select('*', { count: 'exact' }).order('ragione_sociale');
  if (q) {
    const like = `%${q.replace(/[%_,]/g, ' ')}%`;
    query = query.or(`ragione_sociale.ilike.${like},partita_iva.ilike.${like},sede_comune.ilike.${like}`);
  }
  const [da, a] = intervallo(pagina);
  const [righeR, personeTot, aziendeTot, senzaPiva] = await Promise.all([
    query.range(da, a).returns<AziendaRiepilogo[]>(),
    supabase.from('persona').select('id', { count: 'exact', head: true }),
    supabase.from('azienda').select('id', { count: 'exact', head: true }),
    supabase.from('azienda').select('id', { count: 'exact', head: true }).is('partita_iva', null),
  ]);
  if (fuoriIntervallo(righeR.error)) redirect(hrefPaginaUno('/admin/aziende', sp));
  const righe = unwrap(righeR, 'le aziende');

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Persone</h1>
          <p>Le aziende dei discenti, come arrivano dalle iscrizioni (ragione sociale o partita IVA). La partita IVA è unica: due righe della stessa azienda si uniscono in una.</p>
        </div>
      </div>
      <PersoneTabs nPersone={personeTot.count ?? 0} nAziende={aziendeTot.count ?? 0} />
      <AziendeLista righe={righe} totale={righeR.count ?? righe.length} pagina={pagina} perPagina={PER_PAGINA} q={q} senzaPiva={senzaPiva.count ?? 0} apriNuova={sp.nuova === '1'} />
    </>
  );
}
