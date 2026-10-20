// Test E2E di fumo, SOLO LETTURA: niente scritture sul DB (nessun Evento).
// Percorre le pagine dei tre ruoli a 1440 e 390 px, controlla che rispondano,
// che non ci sia scorrimento orizzontale e che non emergano errori JS.
// Avvio: npm run test:e2e (vedi variabili in lib.mjs).
import { accedi, apriBrowser, BASE, check, nuovaPagina, paginaOk, overflow, riepilogo, vai } from './lib.mjs';

const browser = await apriBrowser();

// ── pubblico ─────────────────────────────────────────────────────────────
{
  const { ctx, page } = await nuovaPagina(browser, { width: 390, height: 844 });
  await paginaOk(page, '/login', 'pubblico: login (390)', /Bentornato|Entra|Accedi/);
  await paginaOk(page, '/verifica/000000000000000000000000', 'pubblico: verifica con codice inesistente', 'Nessun attestato');
  const r = await page.request.get(`${BASE}/api/attestati/00000000-0000-0000-0000-000000000000/pdf`);
  check('pubblico: PDF privato senza accesso → 401', r.status() === 401, String(r.status()));
  await ctx.close();
}

// ── discente ─────────────────────────────────────────────────────────────
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = vp.width;
  const { ctx, page } = await nuovaPagina(browser, vp);
  await accedi(page, 'discente');
  await paginaOk(page, '/corsi', `discente@${tag}: elenco corsi`, /Ciao|I tuoi corsi/);
  const card = page.locator('.corso-card').first();
  check(`discente@${tag}: almeno un corso`, (await page.locator('.corso-card').count()) >= 1);
  const hrefCorso = await card.getAttribute('href');
  if (hrefCorso) {
    const testo = await paginaOk(page, hrefCorso, `discente@${tag}: pagina del corso`, /Le lezioni|Il tuo percorso/);
    check(`discente@${tag}: nessuna parola "idoneità" nelle pagine del discente`, !/idone/i.test(testo));
    const lezione = page.locator('.lo-row a.btn').first();
    const hrefLez = (await lezione.count()) ? await lezione.getAttribute('href') : null;
    if (hrefLez) await paginaOk(page, hrefLez, `discente@${tag}: pagina di una lezione`, /Programma/);
  }
  // corso con il solo test (fixture di sviluppo), se presente
  await vai(page, '/corsi');
  const cardTest = page.locator('.corso-card', { hasText: 'solo test' });
  if (await cardTest.count()) {
    const href = await cardTest.first().getAttribute('href');
    await vai(page, href);
    const btn = page.locator('.lo-row a.btn').first();
    const hrefTest = await btn.getAttribute('href');
    const html = await (async () => { await vai(page, hrefTest); return page.content(); })();
    check(`discente@${tag}: pagina del test senza risposte corrette nel markup`, !html.includes('"corretta"') && (await page.locator('.quiz-card, .quiz-result').count()) === 1);
  }
  await paginaOk(page, '/profilo', `discente@${tag}: profilo`, 'Il tuo profilo');
  await ctx.close();
}

// ── auditor ──────────────────────────────────────────────────────────────
{
  const { ctx, page } = await nuovaPagina(browser);
  await accedi(page, 'auditor');
  await paginaOk(page, '/audit/log', 'auditor: log eventi', 'Log eventi');
  check('auditor: il log ha righe', (await page.locator('.tbl tbody tr').count()) > 0);
  await paginaOk(page, '/audit/log?tipo=auth.login', 'auditor: filtro per tipo di evento', 'Accesso');
  await page.locator('.log-toggle').first().click().catch(() => null);
  check('auditor: riga espandibile con payload', (await page.locator('.log-detail').count()) >= 1);
  await paginaOk(page, '/audit/completamento', 'auditor: completamento', 'Completamento');
  check('auditor: tabella completamento con righe e colonna Attestato', (await page.locator('.tbl tbody tr').count()) > 0 && (await page.locator('th', { hasText: 'Attestato' }).count()) === 1);
  const csv = await page.request.get(`${BASE}/api/audit/export?tipo=auth.login`);
  check('auditor: export CSV del log', csv.status() === 200 && (csv.headers()['content-type'] ?? '').includes('text/csv'), String(csv.status()));
  // Sigillo di verifica della catena (sola lettura): dal pulsante della pagina.
  await vai(page, '/audit/log');
  await page.locator('button', { hasText: /Verifica/ }).first().click();
  await page.locator('.chain-seal', { hasText: /integra|manomess|errore|problem/i }).first().waitFor({ timeout: 90000 }).catch(() => null);
  const sigillo = await page.locator('.chain-seal').first().innerText().catch(() => '');
  check('auditor: verifica della catena → integra', /integra/i.test(sigillo) && !/manomess|non integra/i.test(sigillo), sigillo.replace(/\n/g, ' | ').slice(0, 120));
  await ctx.close();
}

// ── admin ────────────────────────────────────────────────────────────────
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = vp.width;
  const { ctx, page } = await nuovaPagina(browser, vp);
  await accedi(page, 'admin');
  await paginaOk(page, '/admin', `admin@${tag}: dashboard`, 'Dashboard');
  await paginaOk(page, '/admin/corsi', `admin@${tag}: catalogo corsi`, 'Corsi');
  const primo = page.locator('.course-card a, a.course-card').first();
  const hrefCorso = (await primo.count()) ? await primo.getAttribute('href') : null;
  if (hrefCorso) {
    await paginaOk(page, hrefCorso, `admin@${tag}: course builder`, 'Dati del corso');
    check(`admin@${tag}: sezione Attestato nel builder`, (await page.locator('#corso-ore').count()) === 1);
  }
  await paginaOk(page, '/admin/corsi/new', `admin@${tag}: nuovo corso`, 'Crea un corso');
  await paginaOk(page, '/admin/learning-objects', `admin@${tag}: contenuti`, 'Contenuti');
  await paginaOk(page, '/admin/learning-objects/new', `admin@${tag}: nuovo contenuto`, /Test/);
  await paginaOk(page, '/admin/sessioni', `admin@${tag}: sessioni`, 'Sessioni');
  await paginaOk(page, '/admin/report-fondo', `admin@${tag}: report fondi`, 'Report');
  await paginaOk(page, '/admin/attestati', `admin@${tag}: attestati`, 'Attestati');
  await paginaOk(page, '/admin/ente', `admin@${tag}: ente`, 'Modello predefinito');
  if (tag === 1440) {
    const pdf = await page.request.post(`${BASE}/api/admin/attestati/anteprima`, { data: { ambito: 'ente', modello: { layout: 'classico' } } });
    check('admin: anteprima PDF del modello', pdf.status() === 200 && (pdf.headers()['content-type'] ?? '').includes('application/pdf'), String(pdf.status()));
    // Scrittura con corpo vuoto: 400 (validazione) o 503 (chiave di servizio
    // assente, middleware fail-fast). Mai 500, mai 200.
    const w = await page.request.post(`${BASE}/api/admin/piani`, { data: {} });
    check('admin: scrittura senza dati rifiutata in modo controllato (400 o 503)', [400, 503].includes(w.status()), String(w.status()));
  }
  check(`admin@${tag}: nessun overflow sull'ultima pagina`, !(await overflow(page)));
  await ctx.close();
}

await browser.close();
process.exit(riepilogo() ? 0 : 1);
