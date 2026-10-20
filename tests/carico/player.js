// Test di carico del percorso video (criterio di accettazione del Blocco B):
// N sessioni simultanee che emettono eventi del player per un tempo dato,
// misurando latenza ed errori. Si lancia con k6 (https://k6.io) contro uno
// staging o un deploy di anteprima, MAI contro la produzione con clienti veri:
// scrive eventi reali nel registro del tenant di carico, creato da
// supabase/seed/carico_tenant.sql (stream del registro separato dagli altri enti).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=… BASE_URL=https://… \
//   VUS=300 DURATA=10m k6 run tests/carico/player.js        (oppure: npm run test:carico)
//
// Variabili d'ambiente:
//   BASE_URL           app da colpire (default http://localhost:3100)
//   SUPABASE_URL, SUPABASE_ANON_KEY   obbligatorie (login e, in MODO=rpc, la chiamata)
//   VUS                sessioni simultanee (300)
//   UTENTI             utenti distinti (= VUS; se minore, più sessioni condividono un utente)
//   DURATA             durata del carico (10m)
//   INTERVALLO         secondi fra due eventi della stessa sessione (15; il player reale: 60)
//   MODO               api = POST /api/events/video dell'app con il cookie di sessione (default)
//                      rpc = chiamata diretta a evento_player_registra via PostgREST (solo DB)
//   EMAIL_PATTERN      carico-%03d@fad.local      PASSWORD   carico-pass-123
//   P95_MS             soglia sul p95 della latenza (1500)
//   LOGIN_PAUSA_MS     pausa fra due login nel setup (0)
//
// Limite noto: Supabase Auth limita i login per IP (30 ogni 5 minuti di default).
// Per 300 utenti da un solo IP alzare temporaneamente il limite (Auth → Rate
// limits) o usare UTENTI più basso. Dopo il test, sul DB:
//   select calls, round(mean_exec_time::numeric, 1) ms_medio, round(max_exec_time::numeric, 1) ms_max
//   from extensions.pg_stat_statements where query ilike '%evento_player_registra%' order by calls desc limit 3;

import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

const BASE = (__ENV.BASE_URL || 'http://localhost:3100').replace(/\/+$/, '');
const SUPA = (__ENV.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = __ENV.SUPABASE_ANON_KEY || '';
const VUS = Number(__ENV.VUS || 300);
const UTENTI = Number(__ENV.UTENTI || VUS);
const DURATA = __ENV.DURATA || '10m';
const INTERVALLO = Number(__ENV.INTERVALLO || 15);
const MODO = __ENV.MODO || 'api';
const PATTERN = __ENV.EMAIL_PATTERN || 'carico-%03d@fad.local';
const PASSWORD = __ENV.PASSWORD || 'carico-pass-123';
const LOGIN_PAUSA_MS = Number(__ENV.LOGIN_PAUSA_MS || 0);
if (!SUPA || !ANON) throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY sono obbligatorie');

export const options = {
  scenarios: { player: { executor: 'constant-vus', vus: VUS, duration: DURATA, gracefulStop: '10s' } },
  thresholds: {
    'http_req_failed{tipo:evento}': ['rate<0.01'],
    'http_req_duration{tipo:evento}': [`p(95)<${Number(__ENV.P95_MS || 1500)}`],
  },
};

function email(i) {
  return PATTERN.replace(/%0(\d)d/, (_, w) => String(i).padStart(Number(w), '0')).replace('%d', String(i));
}

function login(mail) {
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    const r = http.post(
      `${SUPA}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: mail, password: PASSWORD }),
      { headers: { apikey: ANON, 'Content-Type': 'application/json' }, tags: { tipo: 'login' } },
    );
    if (r.status === 200) return r.json();
    if (r.status === 429) { sleep(10 * (tentativo + 1)); continue; }
    throw new Error(`login ${mail}: HTTP ${r.status} ${r.body}`);
  }
  throw new Error(`login ${mail}: troppi 429 (limite di Supabase Auth per IP)`);
}

// Cookie di sessione nel formato di @supabase/ssr 0.5 (base64url con prefisso,
// spezzato in pezzi da 3180 caratteri): così l'app riconosce la sessione come
// se arrivasse dal browser.
function cookieSessione(sess) {
  const ref = SUPA.replace(/^https?:\/\//, '').split('.')[0];
  const nome = `sb-${ref}-auth-token`;
  const valore = 'base64-' + encoding.b64encode(JSON.stringify({
    access_token: sess.access_token, token_type: sess.token_type, expires_in: sess.expires_in,
    expires_at: sess.expires_at, refresh_token: sess.refresh_token, user: sess.user,
  }), 'rawurl');
  const MAX = 3180;
  if (valore.length <= MAX) return `${nome}=${valore}`;
  const parti = [];
  for (let i = 0; i * MAX < valore.length; i++) parti.push(`${nome}.${i}=${valore.slice(i * MAX, (i + 1) * MAX)}`);
  return parti.join('; ');
}

export function setup() {
  const utenti = [];
  for (let i = 1; i <= UTENTI; i++) {
    const sess = login(email(i));
    const r = http.get(
      `${SUPA}/rest/v1/iscrizione?select=id,edizione:edizione_id(corso:corso_id(struttura_corso(learning_object_id,ordine)))&limit=1`,
      { headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}` }, tags: { tipo: 'setup' } },
    );
    const righe = r.status === 200 ? r.json() : null;
    const isc = righe && righe[0];
    const struttura = isc && isc.edizione && isc.edizione.corso ? isc.edizione.corso.struttura_corso : null;
    const lo = struttura && struttura.length ? struttura.slice().sort((a, b) => a.ordine - b.ordine)[0] : null;
    if (!isc || !lo) throw new Error(`${email(i)}: nessuna iscrizione con contenuti (lanciare supabase/seed/carico_tenant.sql)`);
    utenti.push({ email: email(i), token: sess.access_token, cookie: cookieSessione(sess), iscrizione_id: isc.id, lo_id: lo.learning_object_id });
    if (LOGIN_PAUSA_MS) sleep(LOGIN_PAUSA_MS / 1000);
  }
  return { utenti };
}

let iterazione = 0; // per VU: ogni VU ha il proprio runtime

export default function (data) {
  const u = data.utenti[(__VU - 1) % data.utenti.length];
  const n = iterazione++;
  const tipo = n === 0 ? 'video.play' : 'video.progress';
  const payload = { posizione_secondi: Math.min(600, n * INTERVALLO), durata_secondi: 600, origine: 'k6' };
  let r;
  if (MODO === 'rpc') {
    r = http.post(
      `${SUPA}/rest/v1/rpc/evento_player_registra`,
      JSON.stringify({ p_iscrizione_id: u.iscrizione_id, p_learning_object_id: u.lo_id, p_event_type: tipo, p_payload: payload }),
      { headers: { apikey: ANON, Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' }, tags: { tipo: 'evento' } },
    );
  } else {
    r = http.post(
      `${BASE}/api/events/video`,
      JSON.stringify({ event_type: tipo, iscrizione_id: u.iscrizione_id, learning_object_id: u.lo_id, payload }),
      { headers: { 'Content-Type': 'application/json', Cookie: u.cookie }, tags: { tipo: 'evento' } },
    );
  }
  check(r, { 'evento registrato (200)': (res) => res.status === 200 });
  sleep(INTERVALLO);
}
