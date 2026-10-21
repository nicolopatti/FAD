import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { CategoriaRow } from '@/lib/db-types';
import { ImpostazioniTabs } from '@/components/admin/SezioneTabs';
import { CategorieEditor } from './CategorieEditor';

export const dynamic = 'force-dynamic';

/** Categorie dei corsi: l'elenco che compare nei selettori e nei filtri del catalogo. */
export default async function CategoriePage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [categorie, corsi] = await Promise.all([
    supabase.from('categoria').select('id, tenant_id, nome, ordine, creato_il').order('ordine').order('nome').returns<CategoriaRow[]>().then((r) => unwrap(r, 'le categorie')),
    supabase.from('corso').select('categoria').not('categoria', 'is', null).then((r) => unwrap(r, 'i corsi')),
  ]);
  const usi = new Map<string, number>();
  for (const c of corsi) { const k = (c.categoria as string).trim().toLowerCase(); usi.set(k, (usi.get(k) ?? 0) + 1); }
  const righe = categorie.map((c) => ({ ...c, n_corsi: usi.get(c.nome.trim().toLowerCase()) ?? 0 }));
  const orfane = Array.from(usi.keys()).filter((k) => !categorie.some((c) => c.nome.trim().toLowerCase() === k));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Impostazioni</h1>
          <p>Le categorie ordinano il catalogo e danno il segnaposto della copertina. Rinominare una categoria aggiorna i corsi in bozza; i corsi attivi tengono il nome con cui sono nati.</p>
        </div>
      </div>
      <ImpostazioniTabs nCategorie={categorie.length} />
      <CategorieEditor categorie={righe} orfane={orfane} />
    </>
  );
}
