import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { EdizioneRow } from '@/lib/db-types';
import { EdizioniPanel, type EdizioneLista } from '../../_components/EdizioniPanel';

export const dynamic = 'force-dynamic';

export default async function CorsoEdizioniPage({ params, searchParams }: { params: { id: string }; searchParams?: { nuova?: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: corso } = await supabase.from('corso').select('id').eq('id', params.id).maybeSingle<{ id: string }>();
  if (!corso) notFound();

  const edizioni = unwrap(await supabase
    .from('edizione')
    .select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il')
    .eq('corso_id', corso.id)
    .order('creato_il', { ascending: false })
    .returns<EdizioneRow[]>(), 'le edizioni');
  const ids = edizioni.map((e) => e.id);
  const [iscr, sess, att] = ids.length
    ? await Promise.all([
        supabase.from('iscrizione').select('edizione_id').in('edizione_id', ids).then((r) => unwrap(r, 'gli iscritti')),
        supabase.from('sessione').select('edizione_id').in('edizione_id', ids).is('annullato_at', null).then((r) => unwrap(r, 'le sessioni')),
        supabase.from('attestato').select('edizione_id').in('edizione_id', ids).is('sostituito_da', null).then((r) => unwrap(r, 'gli attestati')),
      ])
    : [[], [], []];
  const conta = (rows: { edizione_id: string }[], id: string) => rows.filter((r) => r.edizione_id === id).length;
  const lista: EdizioneLista[] = edizioni.map((e) => ({ ...e, iscritti: conta(iscr, e.id), sessioni: conta(sess, e.id), attestati: conta(att, e.id) }));

  return <EdizioniPanel corsoId={corso.id} edizioni={lista} apriNuova={searchParams?.nuova === '1'} />;
}
