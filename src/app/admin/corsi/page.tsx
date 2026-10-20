import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { corsoStato } from '@/lib/db-types';
import { Icon, durataVideoSecondi } from '@/components/admin/Atlante';
import { CorsiTabs } from '@/components/admin/SezioneTabs';
import { CorsiCatalog, type CorsoCard, type StatoF } from './CorsiCatalog';

export const dynamic = 'force-dynamic';

type StrutturaJoin = { corso_id: string; learning_object: { type: string; config: Record<string, unknown> } | null };
type EdizioneMini = { id: string; corso_id: string; concluso_at: string | null; annullato_at: string | null };

export default async function CorsiListPage({ searchParams }: { searchParams?: { stato?: string } }) {
  await requireAdmin();
  const s = searchParams?.stato;
  const stato: StatoF = s === 'bozza' || s === 'attivo' || s === 'concluso' ? s : 'tutti';
  const supabase = createSupabaseServerClient();

  const [corsiR, strutturaR, edizioniR, iscrizioniR, libreriaR] = await Promise.all([
    supabase.from('corso').select('id, titolo, descrizione, categoria, cover_path, sblocco_sequenziale, visione_integrale, creato_il').order('creato_il', { ascending: false }),
    supabase.from('struttura_corso').select('corso_id, learning_object:learning_object_id ( type, config )').returns<StrutturaJoin[]>(),
    supabase.from('edizione').select('id, corso_id, concluso_at, annullato_at').returns<EdizioneMini[]>(),
    supabase.from('iscrizione').select('edizione_id'),
    supabase.from('learning_object').select('id', { count: 'exact', head: true }).is('archiviato_at', null),
  ]);

  const struttura = unwrap(strutturaR, 'le lezioni dei corsi');
  const edizioni = unwrap(edizioniR, 'le edizioni');
  const iscrizioni = unwrap(iscrizioniR, 'le iscrizioni');

  const byCorsoLo = new Map<string, { type: string; config: Record<string, unknown> }[]>();
  for (const r of struttura) {
    if (!r.learning_object) continue;
    const arr = byCorsoLo.get(r.corso_id) ?? [];
    arr.push(r.learning_object);
    byCorsoLo.set(r.corso_id, arr);
  }
  const ediByCorso = new Map<string, EdizioneMini[]>();
  for (const e of edizioni) { const arr = ediByCorso.get(e.corso_id) ?? []; arr.push(e); ediByCorso.set(e.corso_id, arr); }
  const iscrPerEd = new Map<string, number>();
  for (const i of iscrizioni) iscrPerEd.set(i.edizione_id as string, (iscrPerEd.get(i.edizione_id as string) ?? 0) + 1);

  const cards: CorsoCard[] = unwrap(corsiR, 'i corsi').map((c) => {
    const los = byCorsoLo.get(c.id) ?? [];
    const eds = ediByCorso.get(c.id) ?? [];
    return {
      id: c.id,
      titolo: c.titolo,
      descrizione: c.descrizione,
      categoria: c.categoria,
      cover_path: c.cover_path,
      sblocco_sequenziale: c.sblocco_sequenziale,
      visione_integrale: Boolean(c.visione_integrale),
      creato_il: c.creato_il,
      n_lezioni: los.length,
      n_edizioni: eds.length,
      n_edizioni_attive: eds.filter((e) => !e.concluso_at && !e.annullato_at).length,
      n_iscritti: eds.reduce((acc, e) => acc + (iscrPerEd.get(e.id) ?? 0), 0),
      durata_sec: durataVideoSecondi(los),
      stato: corsoStato(eds),
    };
  });

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
      <CorsiCatalog corsi={cards} statoIniziale={stato} />
    </>
  );
}
