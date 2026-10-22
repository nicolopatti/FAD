// Giro completo dell'area admin contro un deploy (gira sul runner GitHub, vedi
// .github/workflows/verifica-scritture.yml): crea un corso di prova "Verifica
// automatica", lo compone (contenuti nuovi e dalla libreria, riordino,
// copertina), apre un'edizione (congelamento D22), iscrive una persona,
// assegna docente e sessione, registra una presenza manuale, assegna un piano,
// genera il report fondo, prova l'attestato, annulla la sessione, conclude
// l'edizione, duplica e archivia il corso. Fase 6: offerta sull'edizione,
// catalogo pubblico, pubblica/ritira, acquisto e webhook senza chiavi (503).
// Alla fine: catena del registro.
// Residui voluti nel tenant demo: 2 corsi archiviati ("Verifica automatica …"),
// 2 contenuti, 1 piano, 1 persona "Verifica Automatica" (nessuna route la
// elimina), 1 offerta ritirata sull'edizione conclusa. Gli Eventi restano nel registro per costruzione.
// Variabili: come scripts/verifica-scritture.mjs.
import process from 'node:process';

const URL_APP = (process.env.URL ?? '').replace(/\/$/, '');
const SHARE = process.env.SHARE_URL ?? '';
const SUPA = (process.env.SUPABASE_URL ?? 'https://eqtiyqoxwgnerbmdkqff.supabase.co').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
if (!URL_APP || !ANON) { console.error('URL e SUPABASE_ANON_KEY sono obbligatori'); process.exit(2); }

const TENANT = '00000000-0000-0000-0000-000000000001';
const LO_LIBRERIA = 'c10a7fe9-2937-419f-aa30-389b84a7285d'; // "Lezione 02" del corso di prova (riuso dalla libreria)
const PERSONA_DOCENTE = '33333333-0000-0000-0000-0000000d0c01'; // "Docente" del seed webinar
const TAG = Date.now().toString(36);
const NOME = `Verifica automatica ${TAG}`;

const esiti = [];
const check = (nome, ok, dettaglio = '') => { esiti.push([ok, nome, dettaglio]); console.log(`${ok ? 'OK  ' : 'FAIL'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`); };
const breve = (r) => `HTTP ${r.status} ${(r.json?.error ?? r.testo.slice(0, 100)).toString().replace(/\n/g, ' ')}`;

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
const api = async (method, path, body) => {
  const r = await fetch(`${URL_APP}${path}`, { method, headers: { cookie: cookieAdmin, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const testo = await r.text();
  let json = null; try { json = JSON.parse(testo); } catch { /* html */ }
  return { status: r.status, json, testo, headers: r.headers };
};
const pagina = async (path) => { const r = await fetch(`${URL_APP}${path}`, { headers: { cookie: cookieAdmin }, redirect: 'manual' }); return { status: r.status, html: await r.text() }; };
const ordinePresenza = (html, parole) => { const pos = parole.map((p) => html.indexOf(p)); return pos.every((p) => p >= 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]); };

// 0) sessione
{
  const r = await api('GET', '/api/admin/categorie');
  check('sessione admin riconosciuta dal deploy', r.status === 200 && r.json?.ok === true, breve(r));
  if (r.status !== 200) process.exit(1);
}

// 1) contenuti nuovi: un video e un test con domande
let loVideo = null, loQuiz = null;
{
  const v = await api('POST', '/api/admin/learning-objects', { type: 'video', titolo: `${NOME} · video`, config: { vimeo_id: 'https://vimeo.com/1236864492', durata_secondi: 600 } });
  loVideo = v.json?.learning_object?.id ?? null;
  check('contenuto video creato da un link Vimeo (ID estratto)', v.status === 200 && v.json?.learning_object?.config?.vimeo_id === '1236864492', breve(v));
  const cartella = await api('POST', '/api/admin/learning-objects', { type: 'video', titolo: 'x', config: { vimeo_id: 'https://vimeo.com/manage/folders/123', durata_secondi: 10 } });
  check('contenuto video: link di cartella rifiutato', cartella.status === 400, breve(cartella));
  const q = await api('POST', '/api/admin/learning-objects', { type: 'quiz', titolo: `${NOME} · test`, config: { soglia_percentuale: 70, tentativi_max: '', ordine_casuale: true, mostra_correzione: true } });
  loQuiz = q.json?.learning_object?.id ?? null;
  check('contenuto test creato con soglia 70%', q.status === 200 && q.json?.learning_object?.config?.soglia_percentuale === 70, breve(q));
  if (loQuiz) {
    const d = await api('PUT', `/api/admin/learning-objects/${loQuiz}/domande`, { domande: [
      { testo: 'Quanto fa 2+2?', tipo: 'scelta_singola', risposte: [{ testo: '3', corretta: false }, { testo: '4', corretta: true }] },
      { testo: 'Numeri pari', tipo: 'scelta_multipla', risposte: [{ testo: '2', corretta: true }, { testo: '3', corretta: false }, { testo: '4', corretta: true }] },
    ] });
    check('domande del test salvate (RPC quiz_domande_salva)', d.status === 200 && d.json?.ok === true, breve(d));
    const lette = await api('GET', `/api/admin/learning-objects/${loQuiz}/domande`);
    check('domande rilette: 2, con le risposte corrette', lette.status === 200 && (lette.json?.domande?.length === 2), `HTTP ${lette.status} n=${lette.json?.domande?.length}`);
    const male = await api('PUT', `/api/admin/learning-objects/${loQuiz}/domande`, { domande: [{ testo: 'Senza corrette', tipo: 'scelta_singola', risposte: [{ testo: 'a', corretta: false }, { testo: 'b', corretta: false }] }] });
    check('domande non valide rifiutate (singola senza risposta corretta)', male.status === 400, breve(male));
  }
}

// 2) corso in bozza
let corso = null;
{
  const c = await api('POST', '/api/admin/corsi', { titolo: NOME, categoria: 'Formazione', descrizione: 'Corso creato dalla verifica automatica.', sblocco_sequenziale: true, visione_integrale: false, ore_totali: 1, politica_attestato: 'automatica', soglia_frequenza_percentuale: '80' });
  corso = c.json?.corso?.id ?? null;
  check('corso creato in bozza', c.status === 200 && !!corso, breve(c));
  check('presenza minima alle sessioni salvata (80%)', Number(c.json?.corso?.soglia_frequenza_percentuale) === 80, `soglia=${c.json?.corso?.soglia_frequenza_percentuale}`);
  const sogliaMale = await api('POST', '/api/admin/corsi', { titolo: `${NOME} · soglia`, soglia_frequenza_percentuale: '150' });
  check('presenza minima oltre 100% rifiutata', sogliaMale.status === 400, breve(sogliaMale));
  const vuoto = await api('POST', '/api/admin/corsi', { titolo: '   ' });
  check('corso senza titolo rifiutato', vuoto.status === 400, breve(vuoto));
  if (!corso) { console.log('Interrompo: senza corso il giro non continua.'); process.exit(1); }
  const p = await pagina(`/admin/corsi/${corso}`);
  check('pagina del corso: bozza con "Prossimi passi"', p.status === 200 && /Bozza/.test(p.html) && /Prossimi passi/.test(p.html), `HTTP ${p.status}`);
}

// 3) lezioni: aggiunta (nuove + dalla libreria), riordino, obbligatorio, rimozione
const struttura = [];
{
  for (const [lo, nome] of [[loVideo, 'video nuovo'], [loQuiz, 'test nuovo'], [LO_LIBRERIA, 'dalla libreria']]) {
    const r = await api('POST', `/api/admin/corsi/${corso}/struttura`, { learning_object_id: lo, obbligatorio: true });
    if (r.json?.struttura?.id) struttura.push(r.json.struttura.id);
    check(`lezione aggiunta (${nome})`, r.status === 200 && !!r.json?.struttura?.id, breve(r));
  }
  const dup = await api('POST', `/api/admin/corsi/${corso}/struttura`, { learning_object_id: loVideo, obbligatorio: true });
  check('stessa lezione due volte rifiutata', dup.status === 400 || dup.status === 409, breve(dup));
  const inv = [...struttura].reverse();
  const ro = await api('POST', `/api/admin/corsi/${corso}/struttura/reorder`, { ordered_struttura_ids: inv });
  check('riordino delle lezioni (RPC atomica)', ro.status === 200, breve(ro));
  const p = await pagina(`/admin/corsi/${corso}/lezioni`);
  check('pagina Lezioni: ordine invertito (libreria, test, video)', ordinePresenza(p.html, ['Lezione 02', `${NOME} · test`, `${NOME} · video`]), `HTTP ${p.status}`);
  const fac = await api('PATCH', `/api/admin/corsi/${corso}/struttura/${struttura[2]}`, { obbligatorio: false });
  check('lezione resa facoltativa', fac.status === 200, breve(fac));
  const del = await api('DELETE', `/api/admin/corsi/${corso}/struttura/${struttura[2]}`);
  check('lezione tolta dal corso (il contenuto resta in libreria)', del.status === 200, breve(del));
  struttura.pop();
  const lib = await api('GET', `/api/admin/learning-objects/cerca?q=Lezione%2002&escludi_corso=${corso}`);
  check('ricerca libreria: la lezione tolta torna disponibile per il corso', lib.status === 200 && (lib.json?.risultati ?? []).some((r) => r.id === LO_LIBRERIA), breve(lib));
  const csv = await api('POST', `/api/admin/corsi/${corso}/struttura/import`, { rows: [{ titolo: 'Lezione 02 - Il sistema dei finanziamenti pubblici', tipo: 'video' }, { titolo: `${NOME} · video CSV`, tipo: 'video', riferimento: '1236864490', durata: '5:00' }] });
  check('import CSV delle lezioni: riuso per titolo + video nuovo', csv.status === 200 && csv.json?.ok === true, breve(csv));
}

// 4) copertina: upload nel bucket pubblico con il JWT dell'admin, poi PATCH del percorso
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const path = `${TENANT}/${corso}.png`;
  const up = await fetch(`${SUPA}/storage/v1/object/copertine/${path}`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${admin.access_token}`, 'content-type': 'image/png', 'x-upsert': 'true' }, body: png });
  check('copertina caricata nel bucket (policy admin del tenant)', up.ok, `HTTP ${up.status} ${(await up.text()).slice(0, 80)}`);
  // Stesso flusso per il bucket `loghi` (logo/firma dell'ente e del modello): carico e tolgo.
  const logo = `${TENANT}/verifica-${TAG}.png`;
  const upL = await fetch(`${SUPA}/storage/v1/object/loghi/${logo}`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${admin.access_token}`, 'content-type': 'image/png', 'x-upsert': 'true' }, body: png });
  check('logo caricato nel bucket loghi (policy admin del tenant)', upL.ok, `HTTP ${upL.status} ${(await upL.text()).slice(0, 80)}`);
  if (upL.ok) await fetch(`${SUPA}/storage/v1/object/loghi/${logo}`, { method: 'DELETE', headers: { apikey: ANON, authorization: `Bearer ${admin.access_token}` } });
  const pc = await api('PATCH', `/api/admin/corsi/${corso}`, { cover_path: path });
  check('copertina salvata sul corso', pc.status === 200 && pc.json?.corso?.cover_path === path, breve(pc));
  const fuori = await api('PATCH', `/api/admin/corsi/${corso}`, { cover_path: `altro-tenant/${corso}.png` });
  check('copertina fuori dalla cartella del tenant rifiutata', fuori.status === 400, breve(fuori));
}

// 5) edizione → congelamento D22
let edizione = null;
{
  const e = await api('POST', `/api/admin/corsi/${corso}/edizioni`, { codice: `VERIFICA-${TAG}`, data_inizio: '2026-11-01', data_fine: '2026-12-31', fad_apertura: '2026-11-01', fad_chiusura: '2026-12-31' });
  edizione = e.json?.edizione?.id ?? null;
  check('edizione creata', e.status === 200 && !!edizione, breve(e));
  const dataMale = await api('POST', `/api/admin/corsi/${corso}/edizioni`, { codice: 'X', data_inizio: '01/11/2026' });
  check('edizione con data non ISO rifiutata', dataMale.status === 400, breve(dataMale));
  const titolo = await api('PATCH', `/api/admin/corsi/${corso}`, { titolo: `${NOME} rinominato` });
  check('D22: titolo non modificabile a corso con edizione', titolo.status === 400, breve(titolo));
  const descr = await api('PATCH', `/api/admin/corsi/${corso}`, { descrizione: 'Descrizione aggiornata a corso attivo.' });
  check('descrizione modificabile anche a corso attivo', descr.status === 200, breve(descr));
  const lez = await api('POST', `/api/admin/corsi/${corso}/struttura`, { learning_object_id: LO_LIBRERIA, obbligatorio: true });
  check('D22: sequenza delle lezioni bloccata a corso attivo', lez.status === 400 || lez.status === 409, breve(lez));
  if (edizione) {
    const pe = await api('PATCH', `/api/admin/edizioni/${edizione}`, { codice: `VERIFICA-${TAG}-B`, data_fine: '2027-01-31' });
    check('edizione: codice e data di fine modificati', pe.status === 200, breve(pe));
    const pg = await pagina(`/admin/corsi/${corso}`);
    check('pagina del corso ora "Attivo" con l\'edizione in evidenza', /Attivo/.test(pg.html) && pg.html.includes(`VERIFICA-${TAG}-B`), `HTTP ${pg.status}`);
  }
}

// 6) iscritti
let iscrizione = null;
if (edizione) {
  const email = `verifica-auto-${TAG}@fad.local`;
  // Un codice fiscale diverso a ogni giro (R3: un CF appartiene a una sola persona).
  const n = String(Date.now() % 100000).padStart(5, '0');
  const cf = `VRFATM80A${n.slice(0, 2)}A${n.slice(2)}X`;
  const i = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'Verifica', cognome: 'Automatica', email, codice_fiscale: cf, azienda: 'Cliente Demo S.r.l.', partita_iva: '01234567890', data_nascita: '1980-01-01', luogo_nascita: 'Bergamo' });
  iscrizione = i.json?.iscrizione_id ?? null;
  check('iscritto aggiunto (persona nuova, azienda riconosciuta per P.IVA)', i.status === 200 && !!iscrizione, breve(i));
  const dup = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'Verifica', cognome: 'Automatica', email });
  check('stessa persona iscritta due volte → 409', dup.status === 409, breve(dup));
  // A4: stessa email ma nome diverso → conflitto da confermare, nessuna iscrizione.
  const altroNome = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'Giuseppe', cognome: 'Verdi', email });
  check('email di una persona esistente con un altro nome → 409 con la persona trovata', altroNome.status === 409 && altroNome.json?.conflitto?.persona?.cognome === 'Automatica', breve(altroNome));
  // R3: lo stesso CF su un'altra persona → rifiutato.
  const cfDoppio = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'Altra', cognome: 'Persona', email: `verifica-auto-${TAG}-b@fad.local`, codice_fiscale: cf });
  check('codice fiscale già di un\'altra persona → 409', cfDoppio.status === 409 && /codice fiscale/i.test(cfDoppio.json?.error ?? ''), breve(cfDoppio));
  const male = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'X', cognome: 'Y', email: 'non-una-email' });
  check('iscritto con email non valida rifiutato', male.status === 400, breve(male));
  const pg = await pagina(`/admin/corsi/${corso}/edizioni/${edizione}`);
  check('pagina Iscritti mostra la persona con l\'azienda', pg.status === 200 && /Automatica/.test(pg.html) && /Cliente Demo/.test(pg.html), `HTTP ${pg.status}`);
}

// 7) docente, sessione, presenza manuale
let incarico = null, sessione = null;
if (edizione) {
  const inc = await api('POST', `/api/admin/edizioni/${edizione}/incarichi`, { persona_id: PERSONA_DOCENTE, ruolo: 'docente' });
  incarico = inc.json?.incarico?.id ?? null;
  check('docente assegnato all\'edizione (persona esistente)', inc.status === 200 && !!incarico, breve(inc));
  const ruoloMale = await api('POST', `/api/admin/edizioni/${edizione}/incarichi`, { persona_id: PERSONA_DOCENTE, ruolo: 'preside' });
  check('ruolo sconosciuto rifiutato', ruoloMale.status === 400, breve(ruoloMale));
  const s = await api('POST', '/api/admin/sessioni', { edizione_id: edizione, titolo: `${NOME} · sessione`, data_ora: '2026-11-15T10:00:00+01:00', durata_minuti: 60, modalita: 'vcs', vcs_piattaforma: 'teams', vcs_meeting_id: 'verifica-auto' });
  sessione = s.json?.sessione?.id ?? null;
  check('sessione Teams pianificata', s.status === 200 && !!sessione, breve(s));
  const senza = await api('POST', '/api/admin/sessioni', { edizione_id: edizione, titolo: 'x', modalita: 'vcs' });
  check('sessione VCS senza piattaforma rifiutata', senza.status === 400, breve(senza));
  if (sessione && incarico) {
    const ps = await api('PATCH', `/api/admin/sessioni/${sessione}`, { incarico_id: incarico, titolo: `${NOME} · sessione 1` });
    check('sessione: docente e titolo aggiornati', ps.status === 200, breve(ps));
    const delUsato = await api('DELETE', `/api/admin/incarichi/${incarico}`);
    check('docente usato da una sessione: rimozione rifiutata (409)', delUsato.status === 409, breve(delUsato));
    const ag = await pagina('/admin/agenda');
    check('agenda mostra la sessione pianificata', ag.status === 200 && ag.html.includes(`${NOME} · sessione 1`), `HTTP ${ag.status}`);
  }
  if (sessione && iscrizione) {
    const pm = await api('POST', `/api/admin/sessioni/${sessione}/presenza-manuale`, { iscrizione_id: iscrizione, durata: '45', motivazione: 'Verifica automatica: presenza inserita a mano' });
    check('presenza manuale registrata (Evento, mai UPDATE)', pm.status === 200 && pm.json?.ok === true, breve(pm));
    const evId = JSON.stringify(pm.json?.result ?? {}).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    if (evId) {
      const corr = await api('POST', `/api/admin/presenze/${evId}/correggi`, { durata: '60', motivazione: 'Verifica automatica: correzione' });
      check('presenza corretta con nuovo Evento che referenzia il precedente', corr.status === 200 && corr.json?.ok === true, breve(corr));
    } else check('presenza manuale: id dell\'Evento nella risposta', false, JSON.stringify(pm.json?.result ?? null).slice(0, 120));
    const senzaMot = await api('POST', `/api/admin/sessioni/${sessione}/presenza-manuale`, { iscrizione_id: iscrizione, durata: '10', motivazione: '' });
    check('presenza manuale senza motivazione rifiutata', senzaMot.status === 400, breve(senzaMot));
    const stato = await pagina(`/admin/corsi/${corso}/edizioni/${edizione}/sessioni/${sessione}`);
    check('pagina della sessione mostra la presenza registrata', stato.status === 200 && /Automatica/.test(stato.html), `HTTP ${stato.status}`);
  }
}

// 8) piano, assegnazione, report fondo (generazione; il deposito resta bloccato dai warning senza override)
let piano = null;
if (edizione && iscrizione) {
  const p = await api('POST', '/api/admin/piani', { titolo: `${NOME} · piano`, codice: `VA-${TAG}`.slice(0, 20), fondo: 'fondimpresa', avviso: 'Avviso di prova', canale: 'conto_formazione' });
  piano = p.json?.piano?.id ?? null;
  check('piano finanziato creato', p.status === 200 && !!piano, breve(p));
  if (piano) {
    const tutti = await api('POST', `/api/admin/edizioni/${edizione}/piano`, { piano_id: piano });
    check('piano assegnato a tutti gli iscritti dell\'edizione', tutti.status === 200 && tutti.json?.ok === true, breve(tutti));
    const uno = await api('PATCH', `/api/admin/iscrizioni/${iscrizione}`, { piano_id: null });
    const ri = await api('PATCH', `/api/admin/iscrizioni/${iscrizione}`, { piano_id: piano });
    check('piano tolto e rimesso al singolo iscritto', uno.status === 200 && ri.status === 200, `${breve(uno)} / ${breve(ri)}`);
    const mod = await api('PATCH', `/api/admin/piani/${piano}`, { avviso: 'Avviso di prova (modificato)' });
    check('piano modificato (avviso)', mod.status === 200 && mod.json?.piano?.avviso === 'Avviso di prova (modificato)', breve(mod));
    const cupMale = await api('PATCH', `/api/admin/piani/${piano}`, { cup: 'CORTO' });
    check('piano: CUP non valido rifiutato', cupMale.status === 400, breve(cupMale));
    const gen = await api('GET', `/api/admin/report-fondo/genera?edizione=${edizione}&piano=${piano}&formato=fondimpresa`);
    check('report fondo generato (anteprima/file) per edizione + piano', gen.status === 200, `HTTP ${gen.status} ${(gen.headers.get('content-type') ?? '').slice(0, 40)}`);
    const dep = await api('POST', '/api/admin/report-fondo/deposita', { edizione, piano, formato: 'fondimpresa' });
    check('deposito bloccato dai warning bloccanti (CUP mancante) senza override', dep.status === 409 || dep.status === 400, breve(dep));
    const fondo = await pagina(`/admin/corsi/${corso}/edizioni/${edizione}/fondo`);
    check('scheda Fondo mostra il piano con 1 iscritto', fondo.status === 200 && fondo.html.includes(`${NOME} · piano`), `HTTP ${fondo.status}`);
    check('scheda Fondo: controlli del report (CUP mancante = bloccante)', /bloccant/.test(fondo.html) && /Apri il report del piano/.test(fondo.html), `HTTP ${fondo.status}`);
    const rep = await pagina(`/admin/rendicontazione?edizione=${edizione}&piano=${piano}`);
    check('report della coppia in una vista propria (senza l\'elenco dei piani)', rep.status === 200 && /Report —/.test(rep.html) && !/Edizioni finanziate/.test(rep.html) && /Tutti i piani e le edizioni/.test(rep.html), `HTTP ${rep.status}`);
  }
}

// 9) attestato manuale su percorso non completato, blocco azioni, annullamento sessione
if (edizione && iscrizione) {
  const att = await api('POST', `/api/admin/iscrizioni/${iscrizione}/attestato`, {});
  check('attestato manuale rifiutato: percorso non completato', att.status === 409 || att.status === 400, breve(att));
  const blocco = await api('POST', `/api/admin/edizioni/${edizione}/blocco`, { azione: 'attestato', iscrizione_ids: [iscrizione] });
  check('azione in blocco "attestato": iscritto saltato con motivo', blocco.status === 200 && blocco.json?.fatti === 0 && blocco.json?.saltati?.length === 1, breve(blocco));
  if (sessione) {
    const ann = await api('PATCH', `/api/admin/sessioni/${sessione}`, { annulla: true });
    check('sessione annullata', ann.status === 200, breve(ann));
    const ag = await pagina('/admin/agenda?quando=tutte');
    check('agenda: sessione annullata segnalata', ag.status === 200, `HTTP ${ag.status}`);
    const pmAnn = await api('POST', `/api/admin/sessioni/${sessione}/presenza-manuale`, { iscrizione_id: iscrizione, durata: '60', motivazione: 'prova su sessione annullata' });
    check('sessione annullata: niente presenze manuali (409)', pmAnn.status === 409, breve(pmAnn));
    const csvAnn = await api('POST', `/api/admin/sessioni/${sessione}/import-csv`, { csv: 'Name,Email,Duration\nProva,prova@fad.local,60' });
    check('sessione annullata: niente import del report (409)', csvAnn.status === 409, breve(csvAnn));
  }
  if (incarico) {
    const delInc = await api('DELETE', `/api/admin/incarichi/${incarico}`);
    check('docente: rimozione dopo l\'annullamento della sessione', delInc.status === 200 || delInc.status === 409, breve(delInc));
  }
}

// 9b) vendita (Fase 6): offerta sull'edizione, catalogo pubblico, pubblica/ritira.
// Senza chiavi Stripe l'acquisto e il webhook rispondono 503; con le chiavi, il
// corpo vuoto si ferma alla validazione (400). Nessun ordine viene creato.
if (edizione) {
  const anonimo = async (path) => { const r = await fetch(`${URL_APP}${path}`, { headers: vercel ? { cookie: vercel } : {}, redirect: 'manual' }); return { status: r.status, html: await r.text() }; };
  const slug = `verifica-${TAG}`;
  const male = await api('POST', `/api/admin/edizioni/${edizione}/offerta`, { slug, tipo: 'online', accesso_giorni: '365', prezzo: '0,10', aliquota_iva: '22' });
  check('offerta: prezzo sotto 0,50 € rifiutato sul campo', male.status === 400 && male.json?.campo === 'prezzo', breve(male));
  const o = await api('POST', `/api/admin/edizioni/${edizione}/offerta`, { slug, tipo: 'online', accesso_giorni: '365', prezzo: '19,90', aliquota_iva: '22', titolo_pubblico: NOME, descrizione_pubblica: 'Offerta di prova del giro automatico.' });
  const offerta = o.json?.offerta?.id ?? null;
  check('offerta creata in bozza (19,90 €, 365 giorni)', o.status === 200 && o.json?.offerta?.stato === 'bozza' && o.json?.offerta?.prezzo_centesimi === 1990, breve(o));
  const due = await api('POST', `/api/admin/edizioni/${edizione}/offerta`, { slug: `${slug}-b`, tipo: 'online', accesso_giorni: '30', prezzo: '10', aliquota_iva: '22' });
  check('una sola offerta per edizione (409)', due.status === 409, breve(due));
  if (offerta) {
    const bozza = await anonimo(`/catalogo/${slug}`);
    check('offerta in bozza: non visibile nel catalogo pubblico', !bozza.html.includes(NOME), `HTTP ${bozza.status}`);
    const pub = await api('PATCH', `/api/admin/offerte/${offerta}`, { azione: 'pubblica' });
    check('offerta pubblicata', pub.status === 200 && pub.json?.offerta?.stato === 'pubblicata', breve(pub));
    const pub2 = await api('PATCH', `/api/admin/offerte/${offerta}`, { azione: 'pubblica' });
    check('offerta già pubblicata: seconda pubblicazione rifiutata (409)', pub2.status === 409, breve(pub2));
    const scheda = await anonimo(`/catalogo/${slug}`);
    check('scheda pubblica senza account: titolo e prezzo', scheda.status === 200 && scheda.html.includes(NOME) && scheda.html.includes('19,90'), `HTTP ${scheda.status}`);
    const cat = await anonimo('/catalogo');
    check('catalogo pubblico elenca l\'offerta', cat.status === 200 && cat.html.includes(NOME), `HTTP ${cat.status}`);
    const mod = await api('PATCH', `/api/admin/offerte/${offerta}`, { slug, tipo: 'online', accesso_giorni: '180', prezzo: '24,90', aliquota_iva: '22', titolo_pubblico: NOME });
    check('offerta modificata (prezzo e durata per gli ordini futuri)', mod.status === 200 && mod.json?.offerta?.prezzo_centesimi === 2490 && mod.json?.offerta?.accesso_giorni === 180, breve(mod));
    const acq = await api('POST', '/api/acquisto', { slug });
    check('acquisto senza Stripe (503) o con dati mancanti (400): nessun ordine', acq.status === 503 || acq.status === 400, breve(acq));
    const wh = await fetch(`${URL_APP}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(vercel ? { cookie: vercel } : {}) }, body: '{}' });
    check('webhook senza firma rifiutato (503 senza chiavi, 400 con)', wh.status === 503 || wh.status === 400, `HTTP ${wh.status}`);
    const tab = await pagina(`/admin/corsi/${corso}/edizioni/${edizione}/vendita`);
    check('scheda Vendita dell\'edizione con l\'offerta', tab.status === 200 && tab.html.includes(slug), `HTTP ${tab.status}`);
    const ve = await pagina(`/admin/vendite?offerta=${offerta}`);
    check('area Vendite filtrata per offerta', ve.status === 200 && /Vendite/.test(ve.html), `HTTP ${ve.status}`);
    const csv = await api('GET', '/api/admin/vendite/export');
    check('export degli ordini in CSV per il gestionale', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') ?? '') && csv.testo.includes('data_pagamento;ordine;stato'), `HTTP ${csv.status}`);
    const rit = await api('PATCH', `/api/admin/offerte/${offerta}`, { azione: 'ritira' });
    check('offerta ritirata dal catalogo', rit.status === 200 && rit.json?.offerta?.stato === 'ritirata', breve(rit));
    const via = await anonimo(`/catalogo/${slug}`);
    check('offerta ritirata: non più nel catalogo pubblico', !via.html.includes(NOME), `HTTP ${via.status}`);
  }
}

// 10) conclusione, duplicazione, archiviazione
{
  if (edizione) {
    const conc = await api('POST', `/api/admin/edizioni/${edizione}/concludi`, {});
    check('edizione conclusa', conc.status === 200, breve(conc));
    const bis = await api('POST', `/api/admin/edizioni/${edizione}/concludi`, {});
    check('edizione già conclusa: seconda conclusione rifiutata (409)', bis.status === 409, breve(bis));
    const annConc = await api('POST', `/api/admin/edizioni/${edizione}/annulla`, {});
    check('edizione conclusa: annullamento rifiutato (409)', annConc.status === 409, breve(annConc));
    const dopo = await api('POST', `/api/admin/edizioni/${edizione}/iscritti`, { nome: 'Tardi', cognome: 'Vo', email: `tardivo-${TAG}@fad.local` });
    check('niente iscritti su edizione conclusa (409)', dopo.status === 409, breve(dopo));
  }
  const dup = await api('POST', `/api/admin/corsi/${corso}/duplica`, {});
  const copia = dup.json?.corso?.id ?? null;
  check('corso duplicato in bozza "(copia)" con le lezioni', dup.status === 200 && !!copia && /copia/i.test(dup.json?.corso?.titolo ?? ''), breve(dup));
  const arch = await api('POST', '/api/admin/corsi/archivia', { corso_ids: [corso, copia].filter(Boolean) });
  check('corso concluso e copia archiviati', arch.status === 200 && (arch.json?.fatti?.length ?? 0) === [corso, copia].filter(Boolean).length, breve(arch));
  const cat = await api('GET', '/admin/corsi?stato=archiviato');
  check('catalogo "Archiviati" elenca il corso di prova', cat.status === 200 && cat.testo.includes(NOME), `HTTP ${cat.status}`);
  if (piano && iscrizione) {
    const usato = await api('DELETE', `/api/admin/piani/${piano}`);
    check('piano assegnato a un iscritto: eliminazione rifiutata (409)', usato.status === 409, breve(usato));
  }
  if (iscrizione) {
    const rim = await api('DELETE', `/api/admin/iscrizioni/${iscrizione}`);
    check('iscritto rimosso (nessun attestato collegato)', rim.status === 200, breve(rim));
  }
  if (piano) {
    // Il piano di prova non resta in Rendicontazione: senza iscritti si elimina.
    const del = await api('DELETE', `/api/admin/piani/${piano}`);
    check('piano di prova eliminato (non più assegnato)', del.status === 200, breve(del));
  }
  const daArchiviare = [loVideo, loQuiz].filter(Boolean);
  if (daArchiviare.length) {
    const a = await api('POST', '/api/admin/learning-objects/archivia', { ids: daArchiviare });
    check('contenuti di prova archiviati in blocco', a.status === 200 && a.json?.fatti?.length === daArchiviare.length, breve(a));
    const bis = await api('POST', '/api/admin/learning-objects/archivia', { ids: daArchiviare });
    check('archivio in blocco: già archiviati saltati con motivo', bis.status === 200 && bis.json?.fatti?.length === 0 && bis.json?.saltati?.length === daArchiviare.length, breve(bis));
  }
}

// 11) registro integro
{
  const auditor = await login(process.env.AUDITOR_EMAIL ?? 'auditor@fad.local', process.env.AUDITOR_PASSWORD ?? '');
  const cookieAud = [vercel, cookieSessione(auditor)].filter(Boolean).join('; ');
  const sid = await fetch(`${SUPA}/rest/v1/rpc/current_stream_id`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${auditor.access_token}`, 'content-type': 'application/json' }, body: '{}' });
  const stream = (await sid.text()).replace(/"/g, '');
  const r = await fetch(`${URL_APP}/api/audit/verify?stream_id=${stream}`, { headers: { cookie: cookieAud } });
  const j = await r.json().catch(() => null);
  check('registro: catena integra dopo il giro completo', r.status === 200 && j?.ok === true, `HTTP ${r.status} eventi=${j?.eventi ?? '?'}`);
}

// Tempi di risposta (solo informativi, non sono controlli): mediana di 5 richieste
// per pagina, dal runner GitHub. Servono a confrontare le regioni delle funzioni.
{
  const mediana = (xs) => { const v = [...xs].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  for (const path of ['/admin', '/admin/corsi', '/admin/rendicontazione']) {
    const tempi = [];
    for (let i = 0; i < 5; i++) { const t0 = performance.now(); await pagina(path); tempi.push(performance.now() - t0); }
    console.log(`tempo ${path}: mediana ${Math.round(mediana(tempi))} ms (min ${Math.round(Math.min(...tempi))}, max ${Math.round(Math.max(...tempi))})`);
  }
}

const ko = esiti.filter(([ok]) => !ok);
console.log(`\n${esiti.length - ko.length}/${esiti.length} ok`);
process.exit(ko.length ? 1 : 0);
