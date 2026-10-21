// Test E2E funzionali, SOLO LETTURA (nessun Evento scritto): controlli più
// specifici della smoke su auditor, test finale, libreria e attestato.
// Alcuni controlli usano i corsi di prova del tenant demo (vedi CLAUDE.md,
// seed `supabase/seed/corso_prova_quiz.sql`): se la fixture manca, il
// controllo viene segnato come saltato, non come fallito.
// Avvio: npm run test:e2e:funzionali (stesse variabili della smoke, lib.mjs).
import { accedi, apriBrowser, BASE, check, nuovaPagina, overflow, riepilogo, vai } from './lib.mjs';

// Fixture del tenant demo (corso "Prova del test finale" e corso "solo test").
const QUIZ_LO = '38f31984-93e0-4489-b8ff-9284469d0623';
const EDIZ_QUIZ = '1cc3117c-1fd2-45ae-a766-ec1800e320ac';
const EDIZ_SOLO_TEST = 'baff688e-3c96-4253-8854-1d8931dd052b';
const ISCR_QUIZ = '9da74f31-ee37-40a3-9b5c-c1a90b95f5d3';

const browser = await apriBrowser();
const nonTrovata = async (page) => (await page.locator('.state__title', { hasText: /non trovata/i }).count()) > 0;
const salta = (nome, motivo) => check(nome, true, `saltato: ${motivo}`);

// ── auditor: log, filtri, export, sigillo, completamento, tema ─────────────
{
  const { ctx, page } = await nuovaPagina(browser, { width: 1440, height: 900 }, { permissions: ['clipboard-read', 'clipboard-write'] });
  await accedi(page, 'auditor');
  await vai(page, '/audit/log');
  const seqs = await page.locator('.log-tbl tbody tr.log-row td:nth-child(2)').allTextContents();
  check('log: ordine decrescente (primo seq > ultimo)', seqs.length > 1 && Number(seqs[0]) > Number(seqs[seqs.length - 1]), `${seqs[0]} … ${seqs[seqs.length - 1]} (${seqs.length} righe)`);
  const quando = (await page.locator('.log-when').first().textContent()) ?? '';
  check('log: data italiana con secondi', /\d{2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}/.test(quando), quando);
  const hashTxt = (await page.locator('.log-hash code').first().textContent()) ?? '';
  check('log: hash abbreviato in riga', /^[0-9a-f]{6}…[0-9a-f]{6}$/.test(hashTxt), hashTxt);
  await page.locator('.log-toggle').first().click();
  await page.waitForSelector('.log-detail');
  const fullHash = (await page.locator('.log-detail__hash code').first().textContent()) ?? '';
  check('log: riga espansa con hash completo (64 hex) e payload', /^[0-9a-f]{64}$/.test(fullHash) && ((await page.locator('.log-detail__pre').first().textContent()) ?? '').length > 0, fullHash.slice(0, 16) + '…');
  await page.locator('.log-detail__hash button').first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('log: copia dell\'hash negli appunti + toast', clip === fullHash && (await page.locator('.toast').count()) >= 1, clip ? 'copiato' : 'appunti non leggibili');
  await page.locator('.log-toggle').first().click();
  check('log: riga richiusa', (await page.locator('.log-detail').count()) === 0);

  await page.selectOption('#f-gruppo', 'video');
  await page.click('.log-filters button[type=submit]');
  await page.waitForLoadState('networkidle');
  const tipi = await page.locator('.log-ev__raw').allTextContents();
  check('log: filtro famiglia "Video" → solo video.*', tipi.length > 0 && tipi.every((t) => t.startsWith('video.')), `${tipi.length} righe`);
  check('log: URL con gruppo=video e pulsante Azzera', page.url().includes('gruppo=video') && (await page.locator('a:has-text("Azzera")').count()) === 1);
  await page.selectOption('#f-tipo', 'video.ended');
  await page.click('.log-filters button[type=submit]');
  await page.waitForLoadState('networkidle');
  const tipi2 = await page.locator('.log-ev__raw').allTextContents();
  check('log: filtro evento esatto video.ended', tipi2.length > 0 && tipi2.every((t) => t === 'video.ended'), `${tipi2.length} righe`);
  await page.fill('#f-da', '2030-01-01');
  await page.click('.log-filters button[type=submit]');
  await page.waitForLoadState('networkidle');
  check('log: filtro con data futura → nessun evento', (await page.locator('text=Nessun evento corrisponde ai filtri').count()) === 1);

  const csv = await page.request.get(`${BASE}/api/audit/export?tipo=video.ended`);
  const body = (await csv.text()).replace(/^﻿/, '');
  const righeCsv = body.split('\r\n').filter(Boolean);
  check('export CSV: 200, text/csv, intestazione + sole righe video.ended', csv.status() === 200 && (csv.headers()['content-type'] ?? '').includes('text/csv') && righeCsv[0].startsWith('seq;occurred_at') && righeCsv.slice(1).every((r) => r.split(';')[2] === 'video.ended'), `${righeCsv.length - 1} righe`);
  check('export CSV: hash esadecimali', /;[0-9a-f]{64}$/.test(righeCsv[1] ?? ''));

  await vai(page, '/audit/log');
  check('sigillo: stato iniziale', (await page.locator('.chain-seal--idle').count()) === 1);
  await page.click('.chain-seal button');
  await page.waitForSelector('.chain-seal--ok, .chain-seal--bad', { timeout: 90000 });
  const titolo = (await page.locator('.chain-seal__title').textContent()) ?? '';
  const testa = (await page.locator('.chain-seal__meta code').textContent()) ?? '';
  check('sigillo: catena integra con N eventi e hash di testa', (await page.locator('.chain-seal--ok').count()) === 1 && /\d+ eventi verificati/.test(titolo) && /^[0-9a-f]{8}…[0-9a-f]{8}$/.test(testa), `${titolo} · ${testa}`);

  await vai(page, '/audit/completamento');
  const kpi = await page.locator('.kpi-strip__value').allTextContents();
  check('completamento: 4 totali', kpi.length === 4, kpi.join('/'));
  const righe = await page.locator('.log-tbl tbody tr.log-row').count();
  await page.locator('.seg button:has-text("Idonei")').click();
  const idonei = await page.locator('.log-tbl tbody tr.log-row').count();
  check('completamento: filtro Idonei = totale idonei', String(idonei) === kpi[1], `${idonei} su ${righe}`);
  await page.locator('.seg button:has-text("Tutti")').click();
  await page.fill('.search input', 'rossi');
  check('completamento: ricerca per cognome', (await page.locator('.log-tbl tbody tr.log-row').count()) >= 1 && ((await page.locator('.log-tbl tbody tr.log-row .t-title').first().textContent()) ?? '').toLowerCase().includes('rossi'));
  await page.fill('.search input', '');
  await page.locator('.log-toggle:not([disabled])').first().click();
  check('completamento: dettaglio lezioni a scomparsa', (await page.locator('.compl-lo__row').count()) >= 1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Esporta CSV")')]);
  check('completamento: download CSV', (dl.suggestedFilename() ?? '').startsWith('completamento-'), dl.suggestedFilename());
  // fixture del test finale nel report
  await page.fill('.search input', 'ED-QUIZ');
  const row = page.locator('.log-tbl tbody tr.log-row', { hasText: 'Prova del test finale' }).first();
  if (await row.count()) {
    await row.locator('.log-toggle').first().click().catch(() => null);
    const det = (await page.locator('body').textContent()) ?? '';
    check('completamento: dettaglio del corso di prova con "Test finale" e "test superato"', det.includes('Test finale') && det.toLowerCase().includes('test superato'));
  } else salta('completamento: dettaglio del corso di prova', 'fixture assente');
  await vai(page, '/audit/log?tipo=quiz.domande_aggiornate');
  const logTxt = (await page.locator('.log-tbl tbody').textContent().catch(() => '')) ?? '';
  check('log: filtro quiz.domande_aggiornate con etichetta italiana', logTxt.includes('Domande del test aggiornate') || logTxt.includes('Nessun evento'), logTxt.slice(0, 60));

  // tema: auto → chiaro → scuro, persiste al ricaricamento
  await vai(page, '/audit/log');
  await page.click('.theme-toggle');
  await page.click('.theme-toggle');
  const t = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload({ waitUntil: 'networkidle' });
  const t2 = await page.evaluate(() => document.documentElement.dataset.theme);
  check('tema: auto → chiaro → scuro, persiste al ricaricamento', t === 'dark' && t2 === 'dark', `${t}/${t2}`);
  await ctx.close();
}

// ── admin: test finale, libreria, contenuti, ricerche ─────────────────────
{
  const { ctx, page } = await nuovaPagina(browser);
  await accedi(page, 'admin');
  await vai(page, '/admin/learning-objects/new');
  const segTest = page.locator('.seg button', { hasText: 'Test' });
  check('nuovo contenuto: terzo tipo "Test"', (await segTest.count()) === 1);
  await segTest.click();
  check('nuovo contenuto: campi soglia e tentativi del test', (await page.locator('#lo-soglia').count()) === 1 && (await page.locator('#lo-tentativi').count()) === 1);

  await vai(page, `/admin/learning-objects/${QUIZ_LO}`);
  if (await nonTrovata(page)) salta('editor del test', 'fixture assente');
  else {
    await page.waitForSelector('.quiz-ed', { timeout: 20000 });
    check('editor del test: 5 domande, 8 risposte corrette evidenziate', (await page.locator('.quiz-ed__q').count()) === 5 && (await page.locator('.quiz-ed__r.is-ok').count()) === 8);
    const salvaDis = await page.locator('button:has-text("Salva domande")').isDisabled().catch(() => true);
    check('editor del test: corso attivo → sola lettura', salvaDis && !(await overflow(page)));
  }

  await vai(page, '/admin/learning-objects');
  check('libreria: vista per corso con gruppi', (await page.locator('.card .card__head h3 a.t-link').count()) > 0);
  await page.click('.seg button:has-text("Elenco")');
  check('libreria: vista elenco', (await page.locator('table.tbl tbody tr').count()) > 0);
  const hrefVideo = await page.locator('table.tbl tbody tr:has(.type-ico--video) a.t-title').first().getAttribute('href').catch(() => null);
  if (hrefVideo) {
    await vai(page, hrefVideo);
    const t2 = await page.locator('body').innerText();
    check('contenuto video: campi reali (niente JSON) e corsi che lo usano', /ID o link Vimeo/.test(t2) && !/"vimeo_id"/.test(t2) && /Usato come lezione in/.test(t2));
    await page.click('button:has-text("Anteprima")');
    check('contenuto video: anteprima in iframe', (await page.locator('iframe[src*="player.vimeo.com"]').count()) === 1);
  } else salta('contenuto video', 'nessun video in libreria');
  await vai(page, '/admin/learning-objects');
  await page.click('.seg button:has-text("Elenco")');
  const hrefPdf = await page.locator('table.tbl tbody tr:has(.type-ico--documento) a.t-title').first().getAttribute('href').catch(() => null);
  if (hrefPdf) {
    await vai(page, hrefPdf);
    const t3 = await page.locator('body').innerText();
    check('contenuto PDF: Sostituisci PDF e Apri il PDF', /Sostituisci PDF/.test(t3) && /Apri il PDF/.test(t3));
  } else salta('contenuto PDF', 'nessun documento in libreria');
  await vai(page, '/admin/learning-objects');
  await page.click('.seg button:has-text("Elenco")');
  const hrefQuiz = await page.locator('table.tbl tbody tr:has(.type-ico--quiz) a.t-title').first().getAttribute('href').catch(() => null);
  if (hrefQuiz) {
    await vai(page, hrefQuiz);
    check('contenuto test: regole ed editor delle domande', /Regole del test/.test(await page.locator('body').innerText()));
  } else salta('contenuto test', 'nessun test in libreria');

  const r1 = await page.request.get(`${BASE}/api/admin/learning-objects/cerca?q=lezione`);
  const j1 = await r1.json().catch(() => ({}));
  check('API cerca contenuti (GET): risultati con "usato_in"', r1.status() === 200 && j1.ok && Array.isArray(j1.risultati) && j1.risultati.length > 0 && typeof j1.risultati[0].usato_in === 'number', `${r1.status()} · ${j1.risultati?.length}`);
  const r2 = await page.request.post(`${BASE}/api/admin/learning-objects/cerca`, { data: { titoli: [j1.risultati?.[0]?.titolo ?? 'x', 'Titolo inesistente ZZZ'] } });
  const j2 = await r2.json().catch(() => ({}));
  check('API cerca contenuti (POST): classifica i titoli, esente dal fail-fast', r2.status() === 200 && j2.ok && Object.keys(j2.trovati ?? {}).length === 1, String(r2.status()));

  await vai(page, '/admin/corsi?stato=bozza');
  const hrefBozza = await page.locator('.tbl--lista a.t-link[href^="/admin/corsi/"]').first().getAttribute('href').catch(() => null);
  if (hrefBozza) {
    await vai(page, `${hrefBozza}/lezioni`);
    await page.click('.seg button:has-text("Dalla libreria")');
    await page.locator('.libitem').first().waitFor({ timeout: 15000 }).catch(() => null);
    check('corso in bozza: pannello "Dalla libreria" con risultati dal server', (await page.locator('.libitem').count()) > 0);
    await page.fill('input[aria-label="Cerca nella libreria"]', 'zzzzz');
    await page.locator('text=Nessun contenuto corrisponde').waitFor({ timeout: 15000 }).catch(() => null);
    check('corso in bozza: ricerca senza risultati gestita', /Nessun contenuto corrisponde/.test(await page.locator('body').innerText()));
    const csvBtn = page.locator('.seg button', { hasText: /CSV/ });
    if (await csvBtn.count()) {
      await csvBtn.first().click();
      const hint = await page.locator('.dropzone__s', { hasText: 'colonne' }).first().textContent().catch(() => '');
      check('corso in bozza: il suggerimento del CSV cita test e soglia', /test/.test(hint ?? '') && /soglia/.test(hint ?? ''), (hint ?? '').slice(0, 80));
    }
  } else salta('corso in bozza', 'nessun corso in bozza');
  await ctx.close();
}

// ── discente: test finale bloccato/aperto, attestato PDF e badge ──────────
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = vp.width;
  const { ctx, page } = await nuovaPagina(browser, vp);
  await accedi(page, 'discente');
  await vai(page, `/corsi/${EDIZ_QUIZ}`);
  if (await nonTrovata(page)) salta(`discente@${tag}: corso di prova del test`, 'fixture assente');
  else {
    const rows = await page.locator('.lo-row').count();
    const rowTxt = (await page.locator('.lo-row').nth(1).textContent().catch(() => '')) ?? '';
    check(`discente@${tag}: corso di prova con 2 righe, la seconda è il test`, rows === 2 && /Test finale/.test(rowTxt), rowTxt.slice(0, 80));
    check(`discente@${tag}: nessun overflow`, !(await overflow(page)));
    const api = await page.evaluate(async ({ isc, lo }) => {
      const r = await fetch('/api/events/quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_type: 'quiz.started', iscrizione_id: isc, learning_object_id: lo }) });
      return r.status;
    }, { isc: ISCR_QUIZ, lo: QUIZ_LO });
    // Il discente demo ha già completato questo corso: il test è aperto e il
    // tentativo in più viene rifiutato (409) o accettato (200) solo con la
    // chiave di servizio; mai 500. Senza chiave: 503 dal fail-fast.
    check(`discente@${tag}: POST quiz.started risponde in modo controllato`, [200, 403, 409, 503].includes(api), String(api));
  }
  await vai(page, `/corsi/${EDIZ_SOLO_TEST}/lo/${QUIZ_LO}`);
  if (await nonTrovata(page)) salta(`discente@${tag}: corso "solo test"`, 'fixture assente');
  else {
    const html = await page.content();
    const intro = (await page.locator('.quiz-card, .quiz-result').first().textContent().catch(() => '')) ?? '';
    check(`discente@${tag}: pagina del test senza risposte corrette nel markup`, !html.includes('"corretta"') && !html.includes('corretta&quot;') && (await page.locator('.quiz__q').count()) === 0, intro.slice(0, 60));
    check(`discente@${tag}: intestazione con soglia 70%`, ((await page.locator('body').textContent()) ?? '').includes('70%'));
  }
  if (tag === 1440) {
    await vai(page, '/profilo');
    const links = await page.$$eval('a[href*="/api/attestati/"]', (as) => as.map((a) => a.getAttribute('href')));
    const id = links.map((h) => h?.match(/\/api\/attestati\/([0-9a-f-]+)/)?.[1]).find(Boolean);
    if (!id) salta('discente: attestato PDF e badge', 'nessun attestato nel profilo');
    else {
      for (const [path, tipo] of [[`/api/attestati/${id}/pdf`, 'application/pdf'], [`/api/attestati/${id}/badge`, 'image/png'], [`/api/attestati/${id}/badge?formato=post`, 'image/png']]) {
        const r = await page.request.get(`${BASE}${path}`);
        const ct = r.headers()['content-type'] ?? '';
        const n = (await r.body()).length;
        check(`discente: ${path.replace(`/api/attestati/${id}`, 'attestato')} → ${tipo}`, r.status() === 200 && ct.startsWith(tipo) && n > 2000, `${r.status()} ${ct} ${n} byte`);
      }
    }
  }
  await ctx.close();
}

await browser.close();
process.exit(riepilogo() ? 0 : 1);
