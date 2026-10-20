import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { corsoStato, type LearningObjectRow } from '@/lib/db-types';
import { LibreriaView, type ContenutoRow, type CorsoLibreria } from './LibreriaView';
import { CorsiTabs } from '@/components/admin/SezioneTabs';

export const dynamic = 'force-dynamic';

type EdMini = { corso_id: string; concluso_at: string | null; annullato_at: string | null };

/** Libreria dei contenuti, scheda della voce Corsi: per corso di utilizzo o in elenco. */
export default async function LearningObjectsListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [loR, strutturaR, corsiR, edizioniR] = await Promise.all([
    supabase.from('learning_object').select('id, tenant_id, type, titolo, config, archiviato_at, creato_il').order('creato_il', { ascending: false }).returns<LearningObjectRow[]>(),
    supabase.from('struttura_corso').select('learning_object_id, corso_id, ordine'),
    supabase.from('corso').select('id, titolo'),
    supabase.from('edizione').select('corso_id, concluso_at, annullato_at').returns<EdMini[]>(),
  ]);

  const usi = new Map<string, { id: string; ordine: number }[]>();
  for (const s of unwrap(strutturaR, 'l’utilizzo dei contenuti')) {
    const id = s.learning_object_id as string;
    const arr = usi.get(id) ?? [];
    arr.push({ id: s.corso_id as string, ordine: s.ordine as number });
    usi.set(id, arr);
  }
  const edizioni = unwrap(edizioniR, 'le edizioni');
  const corsi: CorsoLibreria[] = unwrap(corsiR, 'i corsi').map((c) => ({ id: c.id as string, titolo: c.titolo as string, stato: corsoStato(edizioni.filter((e) => e.corso_id === c.id)) }));

  const rows: ContenutoRow[] = unwrap(loR, 'i contenuti').map((lo) => ({
    id: lo.id,
    type: lo.type,
    titolo: lo.titolo,
    config: lo.config,
    archiviato: lo.archiviato_at !== null,
    creato_il: lo.creato_il,
    corsi: usi.get(lo.id) ?? [],
  }));

  return <LibreriaView rows={rows} corsi={corsi} tabs={<CorsiTabs nLibreria={rows.filter((r) => !r.archiviato).length} />} />;
}
