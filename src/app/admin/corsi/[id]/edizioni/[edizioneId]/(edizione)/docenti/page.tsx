import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { edizioneStato, type IncaricoConPersona } from '@/lib/db-types';
import { IncarichiPanel } from '../../_components/IncarichiPanel';

export const dynamic = 'force-dynamic';

export default async function EdizioneDocentiPage(props: { params: Promise<{ id: string; edizioneId: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: ed } = await supabase.from('edizione').select('id, concluso_at, annullato_at').eq('id', params.edizioneId).eq('corso_id', params.id).maybeSingle<{ id: string; concluso_at: string | null; annullato_at: string | null }>();
  if (!ed) notFound();

  const [incarichi, sessioni] = await Promise.all([
    supabase.from('incarico').select('id, edizione_id, persona_id, ruolo, persona:persona_id ( nome, cognome, email )').eq('edizione_id', ed.id).returns<IncaricoConPersona[]>().then((r) => unwrap(r, 'gli incarichi')),
    supabase.from('sessione').select('incarico_id').eq('edizione_id', ed.id).not('incarico_id', 'is', null).then((r) => unwrap(r, 'le sessioni')),
  ]);
  const sessioniPerIncarico: Record<string, number> = {};
  for (const s of sessioni) { const k = s.incarico_id as string; sessioniPerIncarico[k] = (sessioniPerIncarico[k] ?? 0) + 1; }
  incarichi.sort((a, b) => `${a.persona?.cognome ?? ''}${a.persona?.nome ?? ''}`.localeCompare(`${b.persona?.cognome ?? ''}${b.persona?.nome ?? ''}`, 'it'));

  return <IncarichiPanel edizioneId={ed.id} attiva={edizioneStato(ed) === 'attiva'} incarichi={incarichi} sessioniPerIncarico={sessioniPerIncarico} />;
}
