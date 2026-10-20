/**
 * scripts/nuovo-ente.ts — onboarding di un nuovo ente (tenant) con il primo admin.
 *
 * Blocco B #8: il tenant non è mai una variabile d'ambiente; ogni ente nasce da
 * qui (o dalla RPC `tenant_crea`) e poi tutto si deriva dalla persona autenticata.
 *
 *   npm run nuovo-ente -- --nome "Ente Alfa" --ragione-sociale "Ente Alfa S.r.l." \
 *     --citta Bergamo --admin-email admin@entealfa.it --admin-nome Giulia --admin-cognome Neri
 *     [--admin-password '...']   (se omessa viene generata e stampata una volta)
 *     [--tenant-id <uuid>]       (default: generato dal DB)
 *
 * Env richiesti (pannello dell'ambiente, mai in chat né in .env committati):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Passi: 1) crea l'utente Supabase Auth dell'admin (Admin API, email confermata,
 * app_metadata.role = 'admin'); 2) chiama `tenant_crea` (tenant + stream +
 * Persona + Eventi di nascita, una transazione); se 2) fallisce, l'utente Auth
 * appena creato viene rimosso per non lasciare orfani.
 */

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = 'true';
  }
  return out;
}

function required(v: string | undefined, nome: string): string {
  if (!v || !v.trim()) {
    console.error(`[nuovo-ente] manca ${nome}`);
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'env NEXT_PUBLIC_SUPABASE_URL');
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'env SUPABASE_SERVICE_ROLE_KEY');
  const nome = required(args.nome, '--nome');
  const adminEmail = required(args['admin-email'], '--admin-email').toLowerCase();
  const adminNome = required(args['admin-nome'], '--admin-nome');
  const adminCognome = required(args['admin-cognome'], '--admin-cognome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { console.error('[nuovo-ente] --admin-email non valida'); process.exit(1); }
  const generata = !args['admin-password'];
  const adminPassword = args['admin-password'] ?? randomBytes(12).toString('base64url');

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  if (list.data.users.some((u) => u.email?.toLowerCase() === adminEmail)) {
    console.error(`[nuovo-ente] esiste già un utente Auth con email ${adminEmail}: usa un'altra email o collega quell'utente a mano.`);
    process.exit(1);
  }

  console.log(`[nuovo-ente] creo l'utente Auth ${adminEmail}…`);
  const created = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser fallito');
  const authUserId = created.data.user.id;

  console.log(`[nuovo-ente] creo tenant, stream del registro, Persona admin ed Eventi…`);
  const { data, error } = await admin.rpc('tenant_crea', {
    p_nome: nome,
    p_admin_auth_user_id: authUserId,
    p_admin_nome: adminNome,
    p_admin_cognome: adminCognome,
    p_admin_email: adminEmail,
    p_ragione_sociale: args['ragione-sociale'] ?? null,
    p_citta: args.citta ?? null,
    p_tenant_id: args['tenant-id'] ?? null,
  });
  if (error) {
    console.error('[nuovo-ente] tenant_crea fallita, rimuovo l\'utente Auth appena creato:', error.message);
    await admin.auth.admin.deleteUser(authUserId);
    process.exit(1);
  }
  const esito = data as { tenant_id: string; stream_id: string; persona_id: string };
  console.log('[nuovo-ente] fatto.');
  console.log(`  tenant_id:  ${esito.tenant_id}`);
  console.log(`  stream_id:  ${esito.stream_id}`);
  console.log(`  persona_id: ${esito.persona_id}`);
  console.log(`  admin:      ${adminEmail}${generata ? ` / ${adminPassword}   (password generata: comunicarla e farla cambiare al primo accesso)` : ''}`);
  console.log('  Dati ente, logo, firma e modello dell\'attestato si completano da /admin/ente.');
}

main().catch((err) => {
  console.error('[nuovo-ente] errore:', err instanceof Error ? err.message : err);
  process.exit(1);
});
