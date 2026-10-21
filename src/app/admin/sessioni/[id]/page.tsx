import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Indirizzo vecchio (/admin/sessioni/<id>): la sessione ora vive sotto la sua edizione. */
export default async function SessioneRedirectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('sessione')
    .select('id, edizione:edizione_id ( id, corso_id )')
    .eq('id', params.id)
    .maybeSingle<{ id: string; edizione: { id: string; corso_id: string } | null }>();
  if (!data?.edizione) notFound();
  redirect(`/admin/corsi/${data.edizione.corso_id}/edizioni/${data.edizione.id}/sessioni/${data.id}`);
}
