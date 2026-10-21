import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { datiEnteMancanti, ENTE_SELECT, normalizzaParziale, pathNelTenant, type EnteTenantRow } from '@/lib/attestato-modello';
import { emettiPerEdizioneSeIdonee } from '@/lib/attestati';

type Body = {
  ragione_sociale?: string | null;
  citta?: string | null;
  firmatario_nome?: string | null;
  firmatario_ruolo?: string | null;
  logo_path?: string | null;
  firma_path?: string | null;
  linkedin_organization_id?: string | null;
  attestato_modello?: unknown;
};

const CAMPI: (keyof Body)[] = ['ragione_sociale', 'citta', 'firmatario_nome', 'firmatario_ruolo', 'logo_path', 'firma_path', 'linkedin_organization_id'];

// Dati dell'ente emittente (intestazione, firmatario, logo) usati dagli attestati
// emessi DA QUI IN POI: gli attestati già emessi restano com'erano (snapshot).
export async function PATCH(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const updates: Record<string, unknown> = {};
  for (const k of CAMPI) {
    if (body[k] !== undefined) updates[k] = typeof body[k] === 'string' ? ((body[k] as string).trim().slice(0, 200) || null) : null;
  }
  if (body.attestato_modello !== undefined) {
    // Modello predefinito dell'attestato: normalizzato (campi non validi scartati).
    updates.attestato_modello = body.attestato_modello === null ? null : normalizzaParziale(body.attestato_modello);
  }
  // Logo e firma: solo file del bucket `loghi` nella cartella del tenant (il path
  // finisce nello snapshot e in una URL costruita dal server).
  for (const k of ['logo_path', 'firma_path'] as const) {
    if (typeof updates[k] === 'string' && !pathNelTenant(updates[k] as string, session.tenantId)) {
      return NextResponse.json({ ok: false, error: `${k === 'logo_path' ? 'Il logo' : 'La firma'} deve essere un file caricato nella cartella dell’ente.` }, { status: 400 });
    }
  }
  if (typeof updates.linkedin_organization_id === 'string' && !/^\d{1,12}$/.test(updates.linkedin_organization_id)) {
    return NextResponse.json({ ok: false, error: 'L’ID della pagina LinkedIn è un numero (lo trovi nell’URL della pagina aziendale su LinkedIn).' }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'nessun campo' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const prima = await supabase.from('tenant').select(ENTE_SELECT).eq('id', session.tenantId).maybeSingle<EnteTenantRow>();
  const mancavano = datiEnteMancanti(prima.data ?? null).length > 0;
  const { data, error } = await supabase.from('tenant').update(updates).eq('id', session.tenantId).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'ente non aggiornato' }, { status: 403 });
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'ente.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'tenant',
    subjectId: session.tenantId,
    payload: { campi: Object.keys(updates) },
  });

  // B11/A5: se l'ente è appena diventato completo, partono gli attestati
  // automatici rimasti in attesa (corsi con politica automatica, edizioni attive).
  let emessi = 0;
  if (mancavano) {
    const dopo = await supabase.from('tenant').select(ENTE_SELECT).eq('id', session.tenantId).maybeSingle<EnteTenantRow>();
    if (dopo.data && datiEnteMancanti(dopo.data).length === 0) {
      const { data: edizioni } = await supabase
        .from('edizione')
        .select('id, corso:corso_id!inner ( politica_attestato )')
        .is('concluso_at', null).is('annullato_at', null)
        .eq('corso.politica_attestato', 'automatica')
        .returns<{ id: string }[]>();
      for (const e of edizioni ?? []) {
        try { emessi += (await emettiPerEdizioneSeIdonee(e.id, session.personaId)).length; } catch (err) { console.error('[ente] emissione attestati in attesa', e.id, err); }
      }
    }
  }
  return NextResponse.json({ ok: true, attestati_emessi: emessi });
}
