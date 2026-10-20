import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { edizioneStato } from '@/lib/db-types';
import { FondoPanel, type PianoFondo } from '../../_components/FondoPanel';

export const dynamic = 'force-dynamic';

type EdMini = { id: string; concluso_at: string | null; annullato_at: string | null; corso: { soglia_frequenza_percentuale: number | null } | null };

export default async function EdizioneFondoPage({ params }: { params: { id: string; edizioneId: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: ed } = await supabase.from('edizione').select('id, concluso_at, annullato_at, corso:corso_id ( soglia_frequenza_percentuale )').eq('id', params.edizioneId).eq('corso_id', params.id).maybeSingle<EdMini>();
  if (!ed) notFound();

  const [iscrizioni, piani] = await Promise.all([
    supabase.from('iscrizione').select('piano_id').eq('edizione_id', ed.id).then((r) => unwrap(r, 'gli iscritti')),
    supabase.from('piano_formativo_finanziato').select('id, titolo, codice, fondo, cup').order('titolo', { ascending: true }).returns<Omit<PianoFondo, 'iscritti'>[]>().then((r) => unwrap(r, 'i piani')),
  ]);
  const perPiano = new Map<string, number>();
  for (const i of iscrizioni) if (i.piano_id) perPiano.set(i.piano_id as string, (perPiano.get(i.piano_id as string) ?? 0) + 1);
  const lista: PianoFondo[] = piani.map((p) => ({ ...p, iscritti: perPiano.get(p.id) ?? 0 }));
  const senzaPiano = iscrizioni.filter((i) => !i.piano_id).length;

  return <FondoPanel edizioneId={ed.id} attiva={edizioneStato(ed) === 'attiva'} piani={lista} nIscritti={iscrizioni.length} senzaPiano={senzaPiano} soglia={ed.corso?.soglia_frequenza_percentuale ?? null} />;
}
