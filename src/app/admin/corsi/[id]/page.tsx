import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type {
  CorsoRow,
  EdizioneRow,
  LearningObjectRow,
  StrutturaCorsoConLO,
} from '@/lib/db-types';
import { normalizzaParziale, risolviModello } from '@/lib/attestato-modello';
import { CorsoEditor, type IscrittoRow, type PianoMini } from './CorsoEditor';

export const dynamic = 'force-dynamic';

type IscrizioneJoin = {
  id: string;
  edizione_id: string;
  piano_id: string | null;
  persona: { id: string; nome: string; cognome: string; email: string; codice_fiscale: string | null } | null;
  azienda: { ragione_sociale: string } | null;
  piano: { titolo: string } | null;
};

export default async function CorsoDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, ore_totali, riferimento_normativo, politica_attestato, attestato_modello, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();

  // Modello dell'attestato ereditato dall'ente (per l'editor del corso).
  const { data: ente } = await supabase
    .from('tenant')
    .select('nome, ragione_sociale, citta, firmatario_nome, firmatario_ruolo, logo_path, firma_path, attestato_modello')
    .eq('id', corso.tenant_id)
    .maybeSingle<{ nome: string; ragione_sociale: string | null; citta: string | null; firmatario_nome: string | null; firmatario_ruolo: string | null; logo_path: string | null; firma_path: string | null; attestato_modello: unknown }>();
  const modelloEnte = risolviModello(
    { ragione_sociale: ente?.ragione_sociale?.trim() || ente?.nome || 'Ente di formazione', citta: ente?.citta ?? null, firmatario_nome: ente?.firmatario_nome ?? null, firmatario_ruolo: ente?.firmatario_ruolo ?? null, logo_path: ente?.logo_path ?? null, firma_path: ente?.firma_path ?? null },
    ente?.attestato_modello ?? null,
    null,
  );
  const modelloCorso = corso.attestato_modello ? normalizzaParziale(corso.attestato_modello) : null;

  const struttura = unwrap(await supabase
    .from('struttura_corso')
    .select(`
      id, tenant_id, corso_id, learning_object_id, ordine, obbligatorio,
      regola_completamento,
      learning_object:learning_object_id ( titolo, type, config )
    `)
    .eq('corso_id', params.id)
    .order('ordine', { ascending: true })
    .returns<StrutturaCorsoConLO[]>(), 'la struttura del corso');

  const edizioni = unwrap(await supabase
    .from('edizione')
    .select(`
      id, tenant_id, corso_id, codice,
      data_inizio, data_fine, fad_apertura, fad_chiusura,
      concluso_at, annullato_at, creato_il
    `)
    .eq('corso_id', params.id)
    .order('creato_il', { ascending: false })
    .returns<EdizioneRow[]>(), 'le edizioni');

  const usedLoIds = new Set(struttura.map((s) => s.learning_object_id));
  const allLo = unwrap(await supabase
    .from('learning_object')
    .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
    .is('archiviato_at', null)
    .order('titolo', { ascending: true })
    .returns<LearningObjectRow[]>(), 'i contenuti disponibili');
  const availableLo = allLo.filter((lo) => !usedLoIds.has(lo.id));

  // Piani finanziati del tenant (per assegnarli agli iscritti).
  const piani = unwrap(await supabase
    .from('piano_formativo_finanziato')
    .select('id, titolo, codice, fondo')
    .order('titolo', { ascending: true })
    .returns<PianoMini[]>(), 'i piani finanziati');

  // Iscritti per ogni edizione del corso (persona + azienda + piano).
  const edizioneIds = edizioni.map((e) => e.id);
  let iscrittiByEdizione: Record<string, IscrittoRow[]> = {};
  if (edizioneIds.length) {
    const iscrizioni = unwrap(await supabase
      .from('iscrizione')
      .select(`
        id, edizione_id, piano_id,
        persona:persona_id ( id, nome, cognome, email, codice_fiscale ),
        azienda:azienda_id ( ragione_sociale ),
        piano:piano_id ( titolo )
      `)
      .in('edizione_id', edizioneIds)
      .returns<IscrizioneJoin[]>(), 'gli iscritti');
    // Attestati validi degli iscritti (Fase 5).
    const { data: attestati } = await supabase
      .from('attestato')
      .select('id, iscrizione_id, numero, emesso_at')
      .in('edizione_id', edizioneIds)
      .is('sostituito_da', null)
      .returns<{ id: string; iscrizione_id: string; numero: string; emesso_at: string }[]>();
    const attestatoDi = new Map((attestati ?? []).map((a) => [a.iscrizione_id, a]));
    iscrittiByEdizione = iscrizioni.reduce<Record<string, IscrittoRow[]>>((acc, r) => {
      const arr = acc[r.edizione_id] ?? (acc[r.edizione_id] = []);
      arr.push({
        iscrizione_id: r.id,
        nome: r.persona?.nome ?? '',
        cognome: r.persona?.cognome ?? '',
        email: r.persona?.email ?? '',
        codice_fiscale: r.persona?.codice_fiscale ?? null,
        azienda: r.azienda?.ragione_sociale ?? null,
        piano_id: r.piano_id,
        piano_titolo: r.piano?.titolo ?? null,
        attestato: (() => { const a = attestatoDi.get(r.id); return a ? { id: a.id, numero: a.numero, emesso_at: a.emesso_at } : null; })(),
      });
      return acc;
    }, {});
    for (const id of Object.keys(iscrittiByEdizione)) {
      iscrittiByEdizione[id].sort((a, b) => `${a.cognome}${a.nome}`.localeCompare(`${b.cognome}${b.nome}`, 'it'));
    }
  }

  return (
    <CorsoEditor
      corso={corso}
      struttura={struttura}
      edizioni={edizioni}
      availableLo={availableLo}
      iscrittiByEdizione={iscrittiByEdizione}
      piani={piani}
      modelloEnte={modelloEnte}
      modelloCorso={modelloCorso}
    />
  );
}
