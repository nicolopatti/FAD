import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

// "Duplica corso": nuovo Corso in bozza con gli stessi dati e la stessa
// struttura (ordine, obbligatorietà, regola) che punta agli stessi contenuti
// della libreria. Niente edizioni né iscritti: il duplicato non è congelato e
// si può modificare. La copertina viene copiata nello Storage se presente.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: orig } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, categoria, cover_path, sblocco_sequenziale, visione_integrale, soglia_frequenza_percentuale')
    .eq('id', params.id)
    .maybeSingle();
  if (!orig) return NextResponse.json({ ok: false, error: 'corso non trovato' }, { status: 404 });

  const { data: struttura, error: errStr } = await supabase
    .from('struttura_corso')
    .select('learning_object_id, ordine, obbligatorio, regola_completamento, learning_object:learning_object_id ( archiviato_at )')
    .eq('corso_id', params.id)
    .order('ordine', { ascending: true })
    .returns<{ learning_object_id: string; ordine: number; obbligatorio: boolean; regola_completamento: unknown; learning_object: { archiviato_at: string | null } | null }[]>();
  if (errStr) return NextResponse.json({ ok: false, error: errStr.message }, { status: 400 });

  const { data: nuovo, error } = await supabase
    .from('corso')
    .insert({
      tenant_id: session.tenantId,
      titolo: `${orig.titolo} (copia)`,
      descrizione: orig.descrizione,
      categoria: orig.categoria,
      sblocco_sequenziale: orig.sblocco_sequenziale,
      visione_integrale: orig.visione_integrale,
      soglia_frequenza_percentuale: orig.soglia_frequenza_percentuale,
    })
    .select('id, titolo, sblocco_sequenziale, visione_integrale')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'corso.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: nuovo.id,
    payload: { titolo: nuovo.titolo, sblocco_sequenziale: nuovo.sblocco_sequenziale, visione_integrale: nuovo.visione_integrale, duplicato_da: orig.id },
  });

  // Struttura: solo i contenuti non archiviati, stesso ordine relativo.
  const righe = (struttura ?? []).filter((s) => !s.learning_object?.archiviato_at);
  let aggiunti = 0;
  if (righe.length) {
    const { error: errIns } = await supabase.from('struttura_corso').insert(
      righe.map((s, i) => ({
        tenant_id: session.tenantId,
        corso_id: nuovo.id,
        learning_object_id: s.learning_object_id,
        ordine: i + 1,
        obbligatorio: s.obbligatorio,
        regola_completamento: s.regola_completamento,
      })),
    );
    if (errIns) return NextResponse.json({ ok: false, error: `struttura: ${errIns.message}`, corso: nuovo }, { status: 400 });
    aggiunti = righe.length;
    await appendEvent({
      tenantId: session.tenantId,
      eventType: 'struttura.imported',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'corso',
      subjectId: nuovo.id,
      payload: { aggiunti, origine: 'duplicazione', corso_origine_id: orig.id },
    });
  }

  // Copertina: copia dell'oggetto Storage (best effort: se fallisce il corso resta senza).
  if (orig.cover_path) {
    const ext = orig.cover_path.split('.').pop() || 'jpg';
    const dest = `${session.tenantId}/${nuovo.id}.${ext}`;
    const { error: errCopy } = await supabase.storage.from('copertine').copy(orig.cover_path, dest);
    if (!errCopy) {
      await supabase.from('corso').update({ cover_path: dest }).eq('id', nuovo.id);
    }
  }

  return NextResponse.json({ ok: true, corso: nuovo, aggiunti });
}
