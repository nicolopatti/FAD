import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { messaggioCfDoppio, personaConCodiceFiscale } from '@/lib/iscritti';
import { isCodiceFiscale, isEmail } from '@/lib/validazione';

type Body = {
  nome?: unknown; cognome?: unknown; email?: unknown; codice_fiscale?: unknown;
  data_nascita?: unknown; luogo_nascita?: unknown;
};

/**
 * Anagrafica di una persona dall'area admin. L'Evento `persona.updated` porta
 * solo i nomi dei campi cambiati (mai i valori: D18).
 *
 * R4 (stress test 21/10): se la persona ha già un accesso, cambiare l'email
 * cambia anche quella con cui entra (utente Auth via service role, senza email
 * di conferma: la modifica la fa l'admin). Prima l'Auth, poi l'anagrafica; se
 * l'anagrafica fallisce l'Auth torna com'era. L'Evento dice `auth_aggiornato`.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const updates: Record<string, string | null> = {};
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (body.nome !== undefined) { const v = txt(body.nome, 80); if (!v) return NextResponse.json({ ok: false, error: 'nome obbligatorio' }, { status: 400 }); updates.nome = v; }
  if (body.cognome !== undefined) { const v = txt(body.cognome, 80); if (!v) return NextResponse.json({ ok: false, error: 'cognome obbligatorio' }, { status: 400 }); updates.cognome = v; }
  if (body.email !== undefined) { const v = txt(body.email, 160).toLowerCase(); if (!isEmail(v)) return NextResponse.json({ ok: false, error: 'email non valida' }, { status: 400 }); updates.email = v; }
  if (body.codice_fiscale !== undefined) {
    const v = txt(body.codice_fiscale, 16).toUpperCase();
    if (v && !isCodiceFiscale(v)) return NextResponse.json({ ok: false, error: 'codice fiscale non valido' }, { status: 400 });
    updates.codice_fiscale = v || null;
  }
  if (body.data_nascita !== undefined) {
    const v = txt(body.data_nascita, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return NextResponse.json({ ok: false, error: 'data di nascita non valida' }, { status: 400 });
    updates.data_nascita = v || null;
  }
  if (body.luogo_nascita !== undefined) updates.luogo_nascita = txt(body.luogo_nascita, 120) || null;
  if (!Object.keys(updates).length) return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: attuale, error: errAtt } = await supabase.from('persona').select('id, email, auth_user_id').eq('id', params.id).maybeSingle<{ id: string; email: string; auth_user_id: string | null }>();
  if (errAtt) return NextResponse.json({ ok: false, error: errAtt.message }, { status: 400 });
  if (!attuale) return NextResponse.json({ ok: false, error: 'persona non trovata' }, { status: 404 });
  if (updates.email === attuale.email) delete updates.email;
  if (!Object.keys(updates).length) return NextResponse.json({ ok: true, invariato: true });
  // R3: un codice fiscale, una persona.
  if (updates.codice_fiscale) {
    const altra = await personaConCodiceFiscale(supabase, session.tenantId, updates.codice_fiscale, params.id);
    if (altra) return NextResponse.json({ ok: false, error: messaggioCfDoppio(altra), campo: 'codice_fiscale' }, { status: 409 });
  }

  // R4: l'email di accesso segue quella dell'anagrafica.
  const service = updates.email && attuale.auth_user_id ? createSupabaseServiceClient() : null;
  if (service) {
    const { error: errAuth } = await service.auth.admin.updateUserById(attuale.auth_user_id!, { email: updates.email!, email_confirm: true });
    if (errAuth) {
      const giaUsata = /already|registered|exists/i.test(errAuth.message);
      return NextResponse.json({ ok: false, error: giaUsata ? 'Questa email è già usata da un altro accesso.' : `Email di accesso non aggiornata: ${errAuth.message}`, campo: 'email' }, { status: giaUsata ? 409 : 400 });
    }
  }
  const { data, error } = await supabase.from('persona').update(updates).eq('id', params.id).select('id').maybeSingle();
  if (error || !data) {
    if (service) await service.auth.admin.updateUserById(attuale.auth_user_id!, { email: attuale.email, email_confirm: true });
    if (!data && !error) return NextResponse.json({ ok: false, error: 'persona non trovata' }, { status: 404 });
    const msg = error!.code === '23505' ? 'Esiste già una persona con questa email.' : error!.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'persona.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'persona',
    subjectId: params.id,
    payload: { campi: Object.keys(updates), auth_aggiornato: Boolean(service) },
  });
  return NextResponse.json({ ok: true, auth_aggiornato: Boolean(service) });
}
