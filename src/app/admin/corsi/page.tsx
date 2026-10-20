import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { CorsoRiepilogo } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { CorsiTabs } from '@/components/admin/SezioneTabs';
import { fuoriIntervallo, hrefPaginaUno, intervallo, parsePagina, PER_PAGINA } from '@/lib/paginazione';
import { CatalogoLista, type StatoF, type OrdineF } from './CatalogoLista';

export const dynamic = 'force-dynamic';

type Params = { q?: string; stato?: string; categoria?: string; ordine?: string; pagina?: string };

/**
 * Catalogo dei corsi: lista filtrata, ordinata e paginata SUL SERVER sulla
 * vista `corso_riepilogo` (conteggi già calcolati). I corsi archiviati
 * compaiono solo nel filtro "Archiviati".
 */
export default async function CorsiListPage({ searchParams }: { searchParams?: Params }) {
  await requireAdmin();
  const sp = searchParams ?? {};
  const q = (sp.q ?? '').trim().slice(0, 80);
  const stato: StatoF = sp.stato === 'bozza' || sp.stato === 'attivo' || sp.stato === 'concluso' || sp.stato === 'archiviato' ? sp.stato : 'tutti';
  const categoria = (sp.categoria ?? '').trim();
  const ordine: OrdineF = sp.ordine === 'titolo' || sp.ordine === 'iscritti' ? sp.ordine : 'recenti';
  const pagina = parsePagina(sp.pagina);
  const supabase = createSupabaseServerClient();

  let query = supabase.from('corso_riepilogo').select('*', { count: 'exact' });
  if (stato === 'tutti') query = query.is('archiviato_at', null);
  else query = query.eq('stato', stato);
  if (q) {
    const like = `%${q.replace(/[%_,]/g, ' ')}%`;
    query = query.or(`titolo.ilike.${like},descrizione.ilike.${like}`);
  }
  if (categoria) query = query.eq('categoria', categoria);
  if (ordine === 'titolo') query = query.order('titolo', { ascending: true });
  else if (ordine === 'iscritti') query = query.order('n_iscritti', { ascending: false }).order('creato_il', { ascending: false });
  else query = query.order('creato_il', { ascending: false });
  const [da, a] = intervallo(pagina);

  const conta = (s: string) => supabase.from('corso_riepilogo').select('id', { count: 'exact', head: true }).eq('stato', s);
  const [righeR, attivi, bozze, conclusi, archiviati, categorieR, libreriaR] = await Promise.all([
    query.range(da, a).returns<CorsoRiepilogo[]>(),
    conta('attivo'), conta('bozza'), conta('concluso'), conta('archiviato'),
    supabase.from('categoria').select('nome').order('ordine').order('nome'),
    supabase.from('learning_object').select('id', { count: 'exact', head: true }).is('archiviato_at', null),
  ]);
  if (fuoriIntervallo(righeR.error)) redirect(hrefPaginaUno('/admin/corsi', sp));
  const righe = unwrap(righeR, 'i corsi');
  const totale = righeR.count ?? righe.length;
  const conteggi = { attivo: attivi.count ?? 0, bozza: bozze.count ?? 0, concluso: conclusi.count ?? 0, archiviato: archiviati.count ?? 0 };
  const categorie = unwrap(categorieR, 'le categorie').map((c) => c.nome as string);
  const nessunCorso = Object.values(conteggi).every((n) => n === 0);

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Corsi</h1>
          <p>L&apos;offerta formativa. Ogni corso ha le sue lezioni e viene erogato in edizioni, con iscritti, sessioni e docenti.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn" href="/admin/corsi/new"><Icon name="plus" /> Nuovo corso</Link>
        </div>
      </div>
      <CorsiTabs nLibreria={libreriaR.count ?? 0} />
      {nessunCorso ? (
        <div className="empty">
          <Icon name="corsi" className="empty__icon" />
          <div className="empty__t">Nessun corso ancora</div>
          <div className="empty__s">Crea il primo corso: lezioni, poi la prima edizione con gli iscritti.</div>
          <div className="empty__action"><Link className="btn" href="/admin/corsi/new"><Icon name="plus" /> Nuovo corso</Link></div>
        </div>
      ) : (
        <CatalogoLista righe={righe} totale={totale} pagina={pagina} perPagina={PER_PAGINA} stato={stato} conteggi={conteggi} categorie={categorie} q={q} />
      )}
    </>
  );
}
