import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { EdizioneRiepilogo } from '@/lib/db-types';
import { EdizioniPanel, type EdizioneLista } from '../../_components/EdizioniPanel';

export const dynamic = 'force-dynamic';

export default async function CorsoEdizioniPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ nuova?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: corso } = await supabase.from('corso').select('id, archiviato_at').eq('id', params.id).maybeSingle<{ id: string; archiviato_at: string | null }>();
  if (!corso) notFound();

  // Conteggi dalla vista di riepilogo: una query sola, qualunque sia il numero di edizioni.
  const edizioni = unwrap(await supabase
    .from('edizione_riepilogo')
    .select('*')
    .eq('corso_id', corso.id)
    .order('creato_il', { ascending: false })
    .returns<EdizioneRiepilogo[]>(), 'le edizioni');
  const lista: EdizioneLista[] = edizioni.map((e) => ({ ...e, iscritti: e.n_iscritti, sessioni: e.n_sessioni, attestati: e.n_attestati }));

  return <EdizioniPanel corsoId={corso.id} edizioni={lista} apriNuova={searchParams?.nuova === '1' && !corso.archiviato_at} archiviato={Boolean(corso.archiviato_at)} />;
}
