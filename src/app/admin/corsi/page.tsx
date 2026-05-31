import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { durataVideoSecondi } from '@/components/admin/Atlante';
import { CorsiCatalog, type CorsoCard } from './CorsiCatalog';

export const dynamic = 'force-dynamic';

type StrutturaJoin = {
  corso_id: string;
  learning_object: { type: string; config: Record<string, unknown> } | null;
};

export default async function CorsiListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [corsiR, strutturaR, edizioniR] = await Promise.all([
    supabase
      .from('corso')
      .select('id, titolo, descrizione, categoria, cover_path, sblocco_sequenziale, creato_il')
      .order('creato_il', { ascending: false }),
    supabase
      .from('struttura_corso')
      .select('corso_id, learning_object:learning_object_id ( type, config )')
      .returns<StrutturaJoin[]>(),
    supabase.from('edizione').select('corso_id'),
  ]);

  const struttura = strutturaR.data ?? [];
  const edizioni = edizioniR.data ?? [];

  const byCorsoLo = new Map<string, { type: string; config: Record<string, unknown> }[]>();
  for (const s of struttura) {
    if (!s.learning_object) continue;
    const arr = byCorsoLo.get(s.corso_id) ?? [];
    arr.push(s.learning_object);
    byCorsoLo.set(s.corso_id, arr);
  }
  const ediCount = new Map<string, number>();
  for (const e of edizioni) ediCount.set(e.corso_id as string, (ediCount.get(e.corso_id as string) ?? 0) + 1);

  const cards: CorsoCard[] = (corsiR.data ?? []).map((c) => {
    const los = byCorsoLo.get(c.id) ?? [];
    const ne = ediCount.get(c.id) ?? 0;
    return {
      id: c.id,
      titolo: c.titolo,
      descrizione: c.descrizione,
      categoria: c.categoria,
      cover_path: c.cover_path,
      sblocco_sequenziale: c.sblocco_sequenziale,
      creato_il: c.creato_il,
      n_oggetti: los.length,
      n_edizioni: ne,
      durata_sec: durataVideoSecondi(los),
      congelato: ne > 0,
    };
  });

  return <CorsiCatalog corsi={cards} />;
}
