import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { edizioneStato, RUOLI_DIDATTICI, type IncaricoConPersona, type SessioneRow } from '@/lib/db-types';
import { SessioniList, type SessioneLista } from '../../_components/SessioniList';

export const dynamic = 'force-dynamic';

export default async function EdizioneSessioniPage({ params }: { params: { id: string; edizioneId: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: ed } = await supabase.from('edizione').select('id, concluso_at, annullato_at').eq('id', params.edizioneId).eq('corso_id', params.id).maybeSingle<{ id: string; concluso_at: string | null; annullato_at: string | null }>();
  if (!ed) notFound();

  const [sessioni, incarichi] = await Promise.all([
    supabase.from('sessione')
      .select('id, tenant_id, edizione_id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id, annullato_at, creato_il')
      .eq('edizione_id', ed.id)
      .order('data_ora', { ascending: true, nullsFirst: false })
      .returns<SessioneRow[]>()
      .then((r) => unwrap(r, 'le sessioni')),
    supabase.from('incarico').select('id, edizione_id, persona_id, ruolo, persona:persona_id ( nome, cognome, email )').eq('edizione_id', ed.id).returns<IncaricoConPersona[]>().then((r) => unwrap(r, 'gli incarichi')),
  ]);
  const ids = sessioni.map((s) => s.id);
  const [coda, presenze] = ids.length
    ? await Promise.all([
        supabase.from('coda_riconciliazione').select('sessione_id').in('sessione_id', ids).is('risolto_at', null).then((r) => unwrap(r, 'la coda')),
        supabase.from('evento').select('subject_id').in('subject_id', ids).in('event_type', ['presenza_webinar_registrata', 'presenza_inserita_manualmente']).then((r) => unwrap(r, 'le presenze')),
      ])
    : [[], []];
  const incaricoDi = new Map(incarichi.map((i) => [i.id, i]));
  const lista: SessioneLista[] = sessioni.map((s) => {
    const inc = s.incarico_id ? incaricoDi.get(s.incarico_id) : null;
    return {
      ...s,
      docente: inc?.persona ? `${inc.persona.cognome} ${inc.persona.nome}` : null,
      coda: coda.filter((c) => c.sessione_id === s.id).length,
      presenze: presenze.filter((p) => p.subject_id === s.id).length,
    };
  });
  const docenti = incarichi.filter((i) => RUOLI_DIDATTICI.includes(i.ruolo));

  return <SessioniList corsoId={params.id} edizioneId={ed.id} attiva={edizioneStato(ed) === 'attiva'} sessioni={lista} docenti={docenti} />;
}
