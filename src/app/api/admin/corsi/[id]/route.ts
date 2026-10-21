import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { normalizzaParziale, pathNelTenant } from '@/lib/attestato-modello';
import { MSG_ORE, parseOre, parseSoglia } from '@/lib/validazione';

type UpdateBody = {
  titolo?: string;
  descrizione?: string | null;
  sblocco_sequenziale?: boolean;
  visione_integrale?: boolean;
  categoria?: string | null;
  cover_path?: string | null;
  ore_totali?: number | string | null;
  riferimento_normativo?: string | null;
  politica_attestato?: string;
  attestato_modello?: unknown;   // modello parziale del corso; null = usa quello dell'ente
  soglia_frequenza_percentuale?: number | string | null;
};

const POLITICHE = new Set(['automatica', 'manuale', 'nessuna']);

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.titolo === 'string') {
    const t = body.titolo.trim();
    if (!t) return NextResponse.json({ ok: false, error: 'titolo non valido' }, { status: 400 });
    updates.titolo = t;
  }
  if (body.descrizione !== undefined) {
    updates.descrizione = typeof body.descrizione === 'string' ? (body.descrizione.trim() || null) : null;
  }
  if (typeof body.sblocco_sequenziale === 'boolean') {
    updates.sblocco_sequenziale = body.sblocco_sequenziale;
  }
  if (typeof body.visione_integrale === 'boolean') {
    updates.visione_integrale = body.visione_integrale;
  }
  if (body.categoria !== undefined) {
    updates.categoria = typeof body.categoria === 'string' ? (body.categoria.trim() || null) : null;
  }
  if (body.cover_path !== undefined) {
    const cover = typeof body.cover_path === 'string' ? (body.cover_path.trim() || null) : null;
    // Solo un file del bucket `copertine` nella cartella del tenant (finisce in una URL pubblica).
    if (cover !== null && !pathNelTenant(cover, session.tenantId)) {
      return NextResponse.json({ ok: false, error: 'copertina non valida: il file deve stare nella cartella dell\'ente' }, { status: 400 });
    }
    updates.cover_path = cover;
  }
  // Presenza minima alle sessioni live: campo strutturale, congelato con D22.
  if (body.soglia_frequenza_percentuale !== undefined) {
    const soglia = parseSoglia(body.soglia_frequenza_percentuale);
    if (soglia === undefined) return NextResponse.json({ ok: false, error: 'La presenza minima deve essere una percentuale tra 1 e 100.', campo: 'soglia_frequenza_percentuale' }, { status: 400 });
    updates.soglia_frequenza_percentuale = soglia;
  }
  // Dati dell'attestato (Fase 5). A corso congelato il DB accetta solo il
  // passaggio da vuoto a valore (D22 esteso): il trigger risponde con errore.
  if (body.ore_totali !== undefined) {
    const ore = parseOre(body.ore_totali);
    if (ore === undefined) return NextResponse.json({ ok: false, error: MSG_ORE, campo: 'ore_totali' }, { status: 400 });
    updates.ore_totali = ore;
  }
  if (body.riferimento_normativo !== undefined) {
    updates.riferimento_normativo = typeof body.riferimento_normativo === 'string' ? (body.riferimento_normativo.trim() || null) : null;
  }
  if (body.politica_attestato !== undefined) {
    if (!POLITICHE.has(body.politica_attestato)) return NextResponse.json({ ok: false, error: 'politica attestato non valida' }, { status: 400 });
    updates.politica_attestato = body.politica_attestato;
  }
  // Modello dell'attestato del corso: editoriale, non congelato (vale per le
  // emissioni future). null = torna al modello dell'ente.
  if (body.attestato_modello !== undefined) {
    updates.attestato_modello = body.attestato_modello === null ? null : normalizzaParziale(body.attestato_modello);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('corso')
    .update(updates)
    .eq('id', params.id)
    .select('id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, ore_totali, riferimento_normativo, politica_attestato, soglia_frequenza_percentuale, creato_il')
    .single();
  if (error) {
    const msg = error.message.includes('congelato') ? 'Corso congelato: ore e riferimento normativo si compilano una volta sola se erano vuoti; gli altri campi strutturali non si cambiano.' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // Se l'unico cambiamento è la copertina (o il modello dell'attestato), è un
  // evento dedicato (avviene anche a corso congelato: non sono campi strutturali).
  const onlyCover = Object.keys(updates).length === 1 && 'cover_path' in updates;
  const onlyModello = Object.keys(updates).length === 1 && 'attestato_modello' in updates;
  await appendEvent({
    tenantId: session.tenantId,
    eventType: onlyCover ? 'corso.cover_updated' : onlyModello ? 'corso.attestato_modello_updated' : 'corso.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: data.id,
    payload: onlyCover
      ? { has_cover: data.cover_path !== null }
      : onlyModello
        ? { personalizzato: updates.attestato_modello !== null }
        : { titolo: data.titolo, sblocco_sequenziale: data.sblocco_sequenziale, visione_integrale: data.visione_integrale },
  });

  return NextResponse.json({ ok: true, corso: data });
}
