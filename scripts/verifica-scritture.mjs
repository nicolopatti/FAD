// Verifica delle route di SCRITTURA dell'area admin (ondata C) contro un deploy
// Vercel, da un ambiente che raggiunge sia *.vercel.app sia Supabase (es. un
// runner GitHub Actions: il container di Claude Code non arriva a vercel.app e
// non ha la chiave di servizio, quindi lì le scritture rispondono 503).
//
// Fa il login dell'admin via Supabase Auth, costruisce il cookie di sessione
// nel formato di @supabase/ssr e chiama le API con le stesse richieste della
// UI. Tutte le operazioni sono reversibili o di prova (categoria creata e poi
// eliminata, corso in bozza archiviato e ripristinato, azienda di prova poi
// unita in quella demo, piano assegnato e tolto). Gli Eventi restano nel
// registro, come per qualsiasi prova fatta nel browser.
//
// Variabili: URL (deploy), SHARE_URL (link `_vercel_share` per le anteprime
// protette, opzionale), SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL,
// ADMIN_PASSWORD, AUDITOR_EMAIL, AUDITOR_PASSWORD.
import process from 'node:process';

const URL_APP = (process.env.URL ?? '').replace(/\/$/, '');
const SHARE = process.env.SHARE_URL ?? '';
const SUPA = (process.env.SUPABASE_URL ?? 'https://eqtiyqoxwgnerbmdkqff.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
if (!URL_APP || !ANON) { console.error('URL e SUPABASE_ANON_KEY sono obbligatori'); process.exit(2); }

// Fixture del tenant demo (vedi CLAUDE.md).
const CORSO_BOZZA = '66bb34ee-4e10-483f-928a-b004275d2085';      // "TEAM SI NASCE O SI DIVENTA?" (bozza)
const CORSO_ATTIVO = '45ce11f0-38c3-40e1-83df-2d8a7c7a6777';     // corso di prova a 6 video (edizione attiva)
const EDIZIONE_WEB = '33333333-0000-0000-0000-0000000000e1';     // ED-WEB-2026
const ISCR_NERI = '33333333-0000-0000-0000-000000015003';        // Carla Neri, senza piano, senza presenze
const ISCR_BIANCHI = '33333333-0000-0000-0000-000000015001';     // Mario Bianchi, 100% di frequenza
const PIANO = '33333333-0000-0000-0000-0000000000b1';            // Piano formativo 2026
const PERSONA_ROSSI = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';     // discente demo
const AZIENDA_DEMO = '33333333-0000-0000-0000-0000000000a1';     // Cliente Demo S.r.l. (P.IVA 01234567890)
const PIVA_PROVA = '09876543210';

const esiti = [];
const check = (nome, ok, dettaglio = '') => { esiti.push([ok, nome, dettaglio]); console.log(`${ok ? 'OK  ' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`); };

async function login(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
function cookieSessione(sess) {
  const ref = SUPA.replace(/^https?:\/\//, '').split('.')[0];
  const nome = `sb-${ref}-auth-token`;
  const json = JSON.stringify({ access_token: sess.access_token, token_type: sess.token_type, expires_in: sess.expires_in, expires_at: sess.expires_at, refresh_token: sess.refresh_token, user: sess.user });
  const valore = 'base64-' + Buffer.from(json).toString('base64url');
  const MAX = 3180;
  if (valore.length <= MAX) return `${nome}=${valore}`;
  const parti = [];
  for (let i = 0; i * MAX < valore.length; i++) parti.push(`${nome}.${i}=${valore.slice(i * MAX, (i + 1) * MAX)}`);
  return parti.join('; ');
}
// Anteprime protette: il link di condivisione reindirizza e imposta il cookie di Vercel.
async function cookieVercel() {
  if (!SHARE) return '';
  const raccolti = new Map();
  let url = SHARE;
  for (let hop = 0; hop < 5 && url; hop++) {
    const r = await fetch(url, { redirect: 'manual', headers: raccolti.size ? { cookie: [...raccolti].map(([k, v]) => `${k}=${v}`).join('; ') } : {} });
    for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); if (i > 0) raccolti.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) url = new URL(loc, url).toString(); else break;
  }
  return [...raccolti].map(([k, v]) => `${k}=${v}`).join('; ');
}

const vercel = await cookieVercel();
const admin = await login(process.env.ADMIN_EMAIL ?? 'admin@fad.local', process.env.ADMIN_PASSWORD ?? '');
const cookieAdmin = [vercel, cookieSessione(admin)].filter(Boolean).join('; ');
const api = async (method, path, body, cookie = cookieAdmin) => {
  const r = await fetch(`${URL_APP}${path}`, { method, headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const testo = await r.text();
  let json = null; try { json = JSON.parse(testo); } catch { /* html */ }
  return { status: r.status, json, testo };
};

// 0) la sessione è riconosciuta dall'app (non è la pagina di accesso di Vercel né un 401)
{
  const r = await api('GET', '/api/admin/categorie');
  check('sessione admin riconosciuta dal deploy', r.status === 200 && r.json?.ok === true, `HTTP ${r.status} ${r.testo.slice(0, 120).replace(/\n/g, ' ')}`);
  if (r.status !== 200) { console.log('Interrompo: senza sessione le altre prove non hanno senso.'); process.exit(1); }
}

// 1) categorie: crea → assegna a un corso in bozza → rinomina (si propaga) → togli dal corso → elimina
let catId = null;
{
  // residui di prove precedenti interrotte a metà
  const lista = await api('GET', '/api/admin/categorie');
  for (const c of lista.json?.categorie ?? []) if (/^Verifica C/.test(c.nome)) { const d = await api('DELETE', `/api/admin/categorie/${c.id}`); console.log(`pulizia categoria residua "${c.nome}": HTTP ${d.status}`); }
  const nome = `Verifica C ${Date.now().toString(36)}`;
  const c = await api('POST', '/api/admin/categorie', { nome });
  check('categoria: creazione', c.status === 200 && c.json?.categoria?.nome === nome, `HTTP ${c.status} ${c.json?.error ?? ''}`);
  catId = c.json?.categoria?.id ?? null;
  const dup = await api('POST', '/api/admin/categorie', { nome: nome.toUpperCase() });
  check('categoria: nome doppio rifiutato (senza distinzione di maiuscole)', dup.status === 400 && /già/.test(dup.json?.error ?? ''), `HTTP ${dup.status} ${dup.json?.error ?? ''}`);
  const corso = await api('PATCH', `/api/admin/corsi/${CORSO_BOZZA}`, { categoria: nome });
  check('categoria: assegnata al corso in bozza', corso.status === 200 && corso.json?.corso?.categoria === nome, `HTTP ${corso.status} ${corso.json?.error ?? ''}`);
  if (catId) {
    const ren = await api('PATCH', `/api/admin/categorie/${catId}`, { nome: `${nome} bis` });
    check('categoria: rinomina propagata al corso in bozza', ren.status === 200 && ren.json?.corsi_aggiornati === 1, `HTTP ${ren.status} corsi_aggiornati=${ren.json?.corsi_aggiornati} ${ren.json?.error ?? ''}`);
    const inUso = await api('DELETE', `/api/admin/categorie/${catId}`);
    check('categoria: eliminazione rifiutata finché un corso la usa', inUso.status === 409, `HTTP ${inUso.status} ${inUso.json?.error ?? ''}`);
  }
  const via = await api('PATCH', `/api/admin/corsi/${CORSO_BOZZA}`, { categoria: null });
  check('categoria: tolta dal corso', via.status === 200 && via.json?.corso?.categoria === null, `HTTP ${via.status}`);
  if (catId) {
    const del = await api('DELETE', `/api/admin/categorie/${catId}`);
    check('categoria: eliminata quando non è più usata', del.status === 200 && del.json?.ok === true, `HTTP ${del.status} ${del.json?.error ?? ''}`);
  }
}

// 2) archiviazione: il corso attivo è saltato, il corso in bozza si archivia e si ripristina
{
  const a = await api('POST', '/api/admin/corsi/archivia', { corso_ids: [CORSO_BOZZA, CORSO_ATTIVO] });
  check('archivia: bozza archiviata, corso attivo saltato con motivo', a.status === 200 && a.json?.fatti?.length === 1 && a.json.fatti[0] === CORSO_BOZZA && a.json?.saltati?.length === 1 && /attiv/.test(a.json.saltati[0].motivo), `HTTP ${a.status} ${JSON.stringify(a.json).slice(0, 200)}`);
  const bis = await api('POST', '/api/admin/corsi/archivia', { corso_ids: [CORSO_BOZZA] });
  check('archivia: già archiviato → saltato', bis.status === 200 && bis.json?.fatti?.length === 0 && /già/.test(bis.json?.saltati?.[0]?.motivo ?? ''), JSON.stringify(bis.json).slice(0, 160));
  const r = await api('POST', '/api/admin/corsi/archivia', { corso_ids: [CORSO_BOZZA], ripristina: true });
  check('archivia: ripristino', r.status === 200 && r.json?.fatti?.length === 1, `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
}

// 3) persona: modifica e ripristino del luogo di nascita; email non valida rifiutata
{
  const p = await api('PATCH', `/api/admin/persone/${PERSONA_ROSSI}`, { luogo_nascita: 'Bergamo (verifica)' });
  check('persona: modifica del luogo di nascita', p.status === 200 && p.json?.ok === true, `HTTP ${p.status} ${p.json?.error ?? ''}`);
  const back = await api('PATCH', `/api/admin/persone/${PERSONA_ROSSI}`, { luogo_nascita: 'Bergamo' });
  check('persona: ripristino', back.status === 200, `HTTP ${back.status}`);
  const bad = await api('PATCH', `/api/admin/persone/${PERSONA_ROSSI}`, { email: 'non-valida' });
  check('persona: email non valida rifiutata', bad.status === 400, `HTTP ${bad.status} ${bad.json?.error ?? ''}`);
  const cerca = await api('GET', '/api/admin/persone/cerca?q=rossi');
  check('persona: ricerca sul server', cerca.status === 200 && Array.isArray(cerca.json?.persone) && cerca.json.persone.some((x) => x.id === PERSONA_ROSSI), `HTTP ${cerca.status}`);
}

// 4) aziende: crea con P.IVA → doppione rifiutato → seconda senza P.IVA → modifica → unisci → pulizia (unione nella demo)
{
  const a1 = await api('POST', '/api/admin/aziende', { ragione_sociale: 'Verifica Srl', partita_iva: `IT ${PIVA_PROVA}` });
  check('azienda: creazione con P.IVA normalizzata', a1.status === 200 && a1.json?.azienda?.partita_iva === PIVA_PROVA, `HTTP ${a1.status} ${a1.json?.error ?? ''}`);
  const id1 = a1.json?.azienda?.id;
  const dup = await api('POST', '/api/admin/aziende', { ragione_sociale: 'Doppia', partita_iva: PIVA_PROVA });
  check('azienda: P.IVA doppia rifiutata', dup.status === 400 && /partita IVA/i.test(dup.json?.error ?? ''), `HTTP ${dup.status} ${dup.json?.error ?? ''}`);
  const a2 = await api('POST', '/api/admin/aziende', { ragione_sociale: 'VERIFICA S.R.L.', sede_comune: 'Bergamo', sede_provincia: 'bg' });
  check('azienda: seconda riga (doppione senza P.IVA)', a2.status === 200 && a2.json?.azienda?.sede_provincia === 'BG', `HTTP ${a2.status} ${a2.json?.error ?? ''}`);
  const id2 = a2.json?.azienda?.id;
  if (id1) {
    const mod = await api('PATCH', `/api/admin/aziende/${id1}`, { codice_ateco: '85.59.20' });
    check('azienda: modifica', mod.status === 200 && mod.json?.azienda?.codice_ateco === '85.59.20', `HTTP ${mod.status} ${mod.json?.error ?? ''}`);
    const cerca = await api('GET', `/api/admin/aziende/cerca?q=verifica&escludi=${id1}`);
    check('azienda: ricerca sul server con esclusione', cerca.status === 200 && Array.isArray(cerca.json?.aziende) && !cerca.json.aziende.some((x) => x.id === id1) && cerca.json.aziende.some((x) => x.id === id2), `HTTP ${cerca.status}`);
  }
  if (id1 && id2) {
    const u = await api('POST', `/api/admin/aziende/${id2}/unisci`, { in: id1 });
    check('azienda: unione del doppione (sede copiata, riga eliminata)', u.status === 200 && u.json?.ok === true && u.json?.n_iscrizioni === 0, `HTTP ${u.status} ${JSON.stringify(u.json).slice(0, 160)}`);
    const dopo = await api('GET', `/api/admin/aziende/cerca?q=verifica`);
    const resta = dopo.json?.aziende ?? [];
    check('azienda: dopo l\'unione resta una sola riga con sede', resta.length === 1 && resta[0].id === id1 && resta[0].sede_comune === 'Bergamo', JSON.stringify(resta).slice(0, 160));
    // pulizia: l'azienda di prova viene unita in quella demo (che tiene la sua P.IVA)
    const pul = await api('POST', `/api/admin/aziende/${id1}/unisci`, { in: AZIENDA_DEMO });
    check('azienda: pulizia (prova unita nella demo)', pul.status === 200, `HTTP ${pul.status} ${pul.json?.error ?? ''}`);
    const self = await api('POST', `/api/admin/aziende/${AZIENDA_DEMO}/unisci`, { in: AZIENDA_DEMO });
    check('azienda: unione con sé stessa rifiutata', self.status === 400, `HTTP ${self.status}`);
  }
}

// 5) iscritti in blocco: piano assegnato e tolto a Neri; attestato (Bianchi idoneo, Neri no)
{
  const p = await api('POST', `/api/admin/edizioni/${EDIZIONE_WEB}/blocco`, { azione: 'piano', iscrizione_ids: [ISCR_NERI, ISCR_BIANCHI], piano_id: PIANO });
  check('blocco piano: assegnato a Neri, Bianchi già così', p.status === 200 && p.json?.fatti === 1 && p.json?.saltati?.length === 1 && p.json.saltati[0].iscrizione_id === ISCR_BIANCHI, `HTTP ${p.status} ${JSON.stringify(p.json).slice(0, 200)}`);
  const via = await api('POST', `/api/admin/edizioni/${EDIZIONE_WEB}/blocco`, { azione: 'piano', iscrizione_ids: [ISCR_NERI], piano_id: null });
  check('blocco piano: tolto a Neri (ripristino)', via.status === 200 && via.json?.fatti === 1, `HTTP ${via.status} ${JSON.stringify(via.json).slice(0, 160)}`);
  const bad = await api('POST', `/api/admin/edizioni/${EDIZIONE_WEB}/blocco`, { azione: 'inventata', iscrizione_ids: [ISCR_NERI] });
  check('blocco: azione sconosciuta rifiutata', bad.status === 400, `HTTP ${bad.status}`);
  const att = await api('POST', `/api/admin/edizioni/${EDIZIONE_WEB}/blocco`, { azione: 'attestato', iscrizione_ids: [ISCR_NERI, ISCR_BIANCHI] });
  const saltNeri = att.json?.saltati?.find((s) => s.iscrizione_id === ISCR_NERI);
  check('blocco attestato: Neri saltata (non completato), Bianchi emesso o già emesso', att.status === 200 && saltNeri && /complet|attestato/i.test(saltNeri.motivo) && (att.json.fatti === 1 || att.json.saltati.some((s) => s.iscrizione_id === ISCR_BIANCHI && /già/.test(s.motivo))), `HTTP ${att.status} ${JSON.stringify(att.json).slice(0, 240)}`);
}

// 6) registro: la catena resta integra (auditor)
{
  const auditor = await login(process.env.AUDITOR_EMAIL ?? 'auditor@fad.local', process.env.AUDITOR_PASSWORD ?? '');
  const st = await fetch(`${SUPA}/rest/v1/rpc/current_stream_id`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${auditor.access_token}`, 'content-type': 'application/json' }, body: '{}' });
  const streamId = String(await st.json()).replace(/"/g, '');
  const v = await api('GET', `/api/audit/verify?stream_id=${encodeURIComponent(streamId)}`, undefined, [vercel, cookieSessione(auditor)].filter(Boolean).join('; '));
  const okCatena = v.status === 200 && (v.json?.ok === true || v.json?.integra === true || (Array.isArray(v.json?.problemi) && v.json.problemi.length === 0));
  check('registro: catena integra dopo le scritture', okCatena, `HTTP ${v.status} ${JSON.stringify(v.json).slice(0, 200)}`);
  if (v.json?.eventi != null) console.log(`eventi nel registro: ${v.json.eventi}, testa seq ${v.json?.testa?.seq ?? '?'}`);
}

const ok = esiti.filter((e) => e[0]).length;
console.log(`\n${ok}/${esiti.length} ok`);
process.exit(ok === esiti.length ? 0 : 1);
