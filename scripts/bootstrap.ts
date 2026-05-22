/**
 * scripts/bootstrap.ts
 *
 * Bootstrap idempotente del progetto Supabase per la Fase 1.
 * Esegue (in ordine):
 *   1) crea i due utenti Supabase Auth demo (discente, auditor) via Admin API
 *   2) crea/aggiorna le righe public.persona collegate
 *   3) crea/aggiorna il Corso + LO video + Struttura corso + Edizione + Iscrizione
 *
 * Da eseguire UNA VOLTA dopo aver applicato le migration sul progetto Supabase.
 * Si esegue da Claude Code on the web (o da un qualunque ambiente che abbia gli
 * env vars). NON richiede dev locale.
 *
 *   npx tsx scripts/bootstrap.ts
 *
 * Env richiesti (da impostare nel pannello dell'ambiente, mai in .env locali):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_TENANT_ID   (default: 00000000-0000-0000-0000-000000000001)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID
  ?? '00000000-0000-0000-0000-000000000001';

const DEMO = {
  discente: {
    email: 'discente@fad.local',
    password: 'discente-pass-123',
    appMeta: { role: 'discente' },
    persona: {
      id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      nome: 'Mario',
      cognome: 'Rossi',
    },
  },
  auditor: {
    email: 'auditor@fad.local',
    password: 'auditor-pass-123',
    appMeta: { role: 'auditor' },
    persona: {
      id: 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      nome: 'Anna',
      cognome: 'Bianchi',
    },
  },
};

const COURSE = {
  corso: {
    id: 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0',
    titolo: 'Sicurezza sul lavoro — modulo introduttivo',
    descrizione: 'Corso FAD di prova per la fetta verticale di Fase 1.',
    sblocco_sequenziale: true,
  },
  // Due LO video in sequenza: D26 sblocco sequenziale richiede che LO #2 sia
  // bloccato finché LO #1 non riceve video.ended. Vimeo ID è il placeholder
  // pubblico di Fase 1; va sostituito con i video reali quando caricati
  // sull'account Vimeo con domain restriction.
  los: [
    {
      id: '10101111-1010-1010-1010-101010101010',
      type: 'video' as const,
      titolo: 'Introduzione',
      config: { vimeo_id: '76979871', durata_secondi: 160 },
      struttura: {
        id: '5550c011-5555-5555-5555-555555555555',
        ordine: 1,
        obbligatorio: true,
        regola_completamento: { tipo: 'video_ended' },
      },
    },
    {
      id: '10102222-1010-1010-1010-101010101010',
      type: 'video' as const,
      titolo: 'Approfondimento — modulo 2',
      config: { vimeo_id: '76979871', durata_secondi: 160 },
      struttura: {
        id: '5550c022-5555-5555-5555-555555555555',
        ordine: 2,
        obbligatorio: true,
        regola_completamento: { tipo: 'video_ended' },
      },
    },
  ],
  edizione: {
    id: 'ed011111-ed01-ed01-ed01-ed01ed01ed01',
    codice: 'ED-001',
  },
  iscrizione: {
    id: '15c11111-15c1-15c1-15c1-15c115c115c1',
  },
};

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log('Tenant attivo:', TENANT_ID);
  await ensureTenant(admin);

  log('Creo/aggiorno utenti Auth…');
  const discenteAuthId = await ensureAuthUser(admin, DEMO.discente);
  const auditorAuthId = await ensureAuthUser(admin, DEMO.auditor);

  log('Mappo Persone all\'anagrafica…');
  await upsertPersona(admin, DEMO.discente, discenteAuthId);
  await upsertPersona(admin, DEMO.auditor, auditorAuthId);

  log('Seed catalogo (Corso + LO + Struttura + Edizione + Iscrizione)…');
  await upsertCorso(admin);
  await upsertLearningObjects(admin);
  await upsertStrutture(admin);
  await upsertEdizione(admin);
  await upsertIscrizione(admin, DEMO.discente.persona.id);

  log('Bootstrap completato. Utenze demo:');
  log(`  ${DEMO.discente.email} / ${DEMO.discente.password}`);
  log(`  ${DEMO.auditor.email} / ${DEMO.auditor.password}`);
}

async function ensureTenant(admin: SupabaseClient) {
  const { error } = await admin
    .from('tenant')
    .upsert({ id: TENANT_ID, nome: 'Tenant Fase 1' }, { onConflict: 'id' });
  if (error) throw error;
  // Lo stream lo crea la migration di bootstrap, ma se manca lo aggiungiamo qui.
  const { data: existing } = await admin
    .from('stream_audit')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('scope', 'tenant')
    .maybeSingle();
  if (!existing) {
    const { error: errS } = await admin
      .from('stream_audit')
      .insert({ tenant_id: TENANT_ID, scope: 'tenant' });
    if (errS) throw errS;
  }
}

type DemoUser = (typeof DEMO)['discente'];

async function ensureAuthUser(admin: SupabaseClient, user: DemoUser): Promise<string> {
  // Cerca per email tramite l'admin API.
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  const existing = list.data.users.find((u) => u.email === user.email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: user.appMeta,
      email_confirm: true,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    app_metadata: user.appMeta,
  });
  if (error || !data.user) throw error ?? new Error('createUser fallito');
  return data.user.id;
}

async function upsertPersona(admin: SupabaseClient, user: DemoUser, authId: string) {
  const { error } = await admin
    .from('persona')
    .upsert(
      {
        id: user.persona.id,
        tenant_id: TENANT_ID,
        auth_user_id: authId,
        nome: user.persona.nome,
        cognome: user.persona.cognome,
        email: user.email,
      },
      { onConflict: 'id' },
    );
  if (error) throw error;
}

async function upsertCorso(admin: SupabaseClient) {
  const { error } = await admin.from('corso').upsert(
    { ...COURSE.corso, tenant_id: TENANT_ID },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function upsertLearningObjects(admin: SupabaseClient) {
  for (const lo of COURSE.los) {
    const { error } = await admin.from('learning_object').upsert(
      {
        id: lo.id,
        type: lo.type,
        titolo: lo.titolo,
        config: lo.config,
        tenant_id: TENANT_ID,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
  }
}

async function upsertStrutture(admin: SupabaseClient) {
  for (const lo of COURSE.los) {
    const { error } = await admin.from('struttura_corso').upsert(
      {
        ...lo.struttura,
        tenant_id: TENANT_ID,
        corso_id: COURSE.corso.id,
        learning_object_id: lo.id,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
  }
}

async function upsertEdizione(admin: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await admin.from('edizione').upsert(
    {
      ...COURSE.edizione,
      tenant_id: TENANT_ID,
      corso_id: COURSE.corso.id,
      inizio: today,
      fine: in60,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

async function upsertIscrizione(admin: SupabaseClient, personaId: string) {
  const { error } = await admin.from('iscrizione').upsert(
    {
      ...COURSE.iscrizione,
      tenant_id: TENANT_ID,
      persona_id: personaId,
      edizione_id: COURSE.edizione.id,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[bootstrap] env mancante: ${name}`);
    console.error(
      '             impostala nel pannello del provider (Vercel/Supabase) o nella ' +
        'configurazione dell\'ambiente Claude Code on the web.',
    );
    process.exit(1);
  }
  return v;
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[bootstrap]', ...args);
}

main().catch((err) => {
  console.error('[bootstrap] errore:', err);
  process.exit(1);
});
