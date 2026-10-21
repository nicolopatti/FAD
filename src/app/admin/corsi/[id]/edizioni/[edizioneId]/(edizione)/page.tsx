import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { edizioneStato, type PoliticaAttestato } from '@/lib/db-types';
import type { IscrittoRow, PianoMini } from '../../../_components/shared';
import { Iscritti } from '../_components/Iscritti';

export const dynamic = 'force-dynamic';

type EdMini = { id: string; codice: string; concluso_at: string | null; annullato_at: string | null; corso: { politica_attestato: PoliticaAttestato | null } | null };
type IscrizioneJoin = {
  id: string; piano_id: string | null;
  persona: { id: string; nome: string; cognome: string; email: string; codice_fiscale: string | null; auth_user_id: string | null } | null;
  azienda: { ragione_sociale: string } | null;
  piano: { titolo: string } | null;
};

export default async function EdizioneIscrittiPage(props: { params: Promise<{ id: string; edizioneId: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: ed } = await supabase
    .from('edizione')
    .select('id, codice, concluso_at, annullato_at, corso:corso_id ( politica_attestato )')
    .eq('id', params.edizioneId).eq('corso_id', params.id)
    .maybeSingle<EdMini>();
  if (!ed) notFound();

  const [iscrizioni, attestati, piani] = await Promise.all([
    supabase.from('iscrizione')
      .select('id, piano_id, persona:persona_id ( id, nome, cognome, email, codice_fiscale, auth_user_id ), azienda:azienda_id ( ragione_sociale ), piano:piano_id ( titolo )')
      .eq('edizione_id', ed.id)
      .returns<IscrizioneJoin[]>()
      .then((r) => unwrap(r, 'gli iscritti')),
    supabase.from('attestato').select('id, iscrizione_id, numero, emesso_at').eq('edizione_id', ed.id).is('sostituito_da', null)
      .returns<{ id: string; iscrizione_id: string; numero: string; emesso_at: string }[]>()
      .then((r) => unwrap(r, 'gli attestati')),
    supabase.from('piano_formativo_finanziato').select('id, titolo, codice, fondo').order('titolo', { ascending: true }).returns<PianoMini[]>().then((r) => unwrap(r, 'i piani finanziati')),
  ]);
  const attestatoDi = new Map(attestati.map((a) => [a.iscrizione_id, a]));
  const righe: IscrittoRow[] = iscrizioni.map((r) => ({
    iscrizione_id: r.id,
    persona_id: r.persona?.id ?? '',
    accesso: Boolean(r.persona?.auth_user_id),
    nome: r.persona?.nome ?? '',
    cognome: r.persona?.cognome ?? '',
    email: r.persona?.email ?? '',
    codice_fiscale: r.persona?.codice_fiscale ?? null,
    azienda: r.azienda?.ragione_sociale ?? null,
    piano_id: r.piano_id,
    piano_titolo: r.piano?.titolo ?? null,
    attestato: (() => { const a = attestatoDi.get(r.id); return a ? { id: a.id, numero: a.numero, emesso_at: a.emesso_at } : null; })(),
  })).sort((a, b) => `${a.cognome}${a.nome}`.localeCompare(`${b.cognome}${b.nome}`, 'it'));

  return (
    <Iscritti
      edizioneId={ed.id}
      codice={ed.codice}
      attiva={edizioneStato(ed) === 'attiva'}
      iscritti={righe}
      piani={piani}
      politicaAttestato={ed.corso?.politica_attestato ?? 'manuale'}
    />
  );
}
