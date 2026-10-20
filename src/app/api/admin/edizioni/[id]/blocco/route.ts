import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { invitaPersona, type PersonaDaInvitare } from '@/lib/inviti';
import { emettiAttestatoManuale } from '@/lib/attestati';

type Azione = 'invita' | 'piano' | 'attestato' | 'rimuovi';
type Body = { azione?: Azione; iscrizione_ids?: unknown; piano_id?: unknown };
type Iscr = { id: string; edizione_id: string; persona_id: string; piano_id: string | null; persona: PersonaDaInvitare | null };

const AZIONI = new Set<Azione>(['invita', 'piano', 'attestato', 'rimuovi']);
const MAX = 500;

/**
 * Azioni in blocco sugli iscritti selezionati di un'edizione. Ogni iscrizione
 * è trattata da sola (stessi Eventi delle azioni singole): un errore non ferma
 * le altre, e l'esito riporta cosa è stato fatto e cosa no, con il motivo.
 *  - invita:    email di invito a chi non ha ancora un accesso
 *  - piano:     assegna (o toglie, piano_id null) il piano finanziato
 *  - attestato: emette l'attestato a chi risulta idoneo e non ne ha uno valido
 *  - rimuovi:   toglie l'iscrizione (la persona resta in anagrafica)
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.azione || !AZIONI.has(body.azione)) return NextResponse.json({ ok: false, error: 'azione non valida' }, { status: 400 });
  const ids = Array.isArray(body.iscrizione_ids) ? (body.iscrizione_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ ok: false, error: 'nessun iscritto selezionato' }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ ok: false, error: `al massimo ${MAX} iscritti per volta` }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: iscrizioni, error } = await supabase
    .from('iscrizione')
    .select('id, edizione_id, persona_id, piano_id, persona:persona_id ( id, email, nome, auth_user_id )')
    .eq('edizione_id', params.id)
    .in('id', ids)
    .returns<Iscr[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  let pianoId: string | null = null;
  if (body.azione === 'piano') {
    pianoId = typeof body.piano_id === 'string' && body.piano_id ? body.piano_id : null;
    if (pianoId) {
      const { data: piano } = await supabase.from('piano_formativo_finanziato').select('id').eq('id', pianoId).maybeSingle();
      if (!piano) return NextResponse.json({ ok: false, error: 'piano non trovato' }, { status: 404 });
    }
  }

  const actor = { persona_id: session.personaId, type: 'persona' as const };
  let fatti = 0;
  const saltati: { iscrizione_id: string; motivo: string }[] = [];
  const invitate = new Set<string>();

  for (const i of iscrizioni ?? []) {
    try {
      switch (body.azione) {
        case 'invita': {
          if (!i.persona) { saltati.push({ iscrizione_id: i.id, motivo: 'persona non leggibile' }); continue; }
          if (i.persona.auth_user_id) { saltati.push({ iscrizione_id: i.id, motivo: 'ha già un accesso' }); continue; }
          if (invitate.has(i.persona.id)) continue;
          await invitaPersona(supabase, session, i.persona);
          invitate.add(i.persona.id);
          fatti += 1;
          break;
        }
        case 'piano': {
          if (i.piano_id === pianoId) { saltati.push({ iscrizione_id: i.id, motivo: 'già così' }); continue; }
          const { error: e } = await supabase.from('iscrizione').update({ piano_id: pianoId }).eq('id', i.id);
          if (e) throw new Error(e.message);
          await appendEvent({ tenantId: session.tenantId, eventType: 'iscrizione.updated', actor, subjectType: 'iscrizione', subjectId: i.id, payload: { edizione_id: i.edizione_id, piano_id: pianoId } });
          fatti += 1;
          break;
        }
        case 'attestato': {
          const { data: valido } = await supabase.from('attestato').select('id').eq('iscrizione_id', i.id).is('sostituito_da', null).limit(1).maybeSingle();
          if (valido) { saltati.push({ iscrizione_id: i.id, motivo: 'ha già un attestato valido' }); continue; }
          await emettiAttestatoManuale(i.id, session.personaId);
          fatti += 1;
          break;
        }
        case 'rimuovi': {
          const { error: e } = await supabase.from('iscrizione').delete().eq('id', i.id);
          if (e) throw new Error(e.message);
          await appendEvent({ tenantId: session.tenantId, eventType: 'iscrizione.removed', actor, subjectType: 'iscrizione', subjectId: i.id, payload: { edizione_id: i.edizione_id, persona_id: i.persona_id } });
          fatti += 1;
          break;
        }
      }
    } catch (err) {
      saltati.push({ iscrizione_id: i.id, motivo: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const id of ids) if (!(iscrizioni ?? []).some((i) => i.id === id)) saltati.push({ iscrizione_id: id, motivo: 'iscrizione non trovata in questa edizione' });

  return NextResponse.json({ ok: true, fatti, saltati });
}
