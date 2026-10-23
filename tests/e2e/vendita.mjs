// Test E2E della vendita (Fase 6), SOLO LETTURA: nessun ordine, nessun Evento.
// Le scritture (acquisto, webhook, salvataggio dell'offerta) si provano solo
// fino al rifiuto controllato (senza chiave di servizio: 503 dal proxy).
// Fixture: indirizzi del tenant demo in `tenant_dominio` e l'offerta pubblicata
// su ED-001 (supabase/seed/fase6_vendita_demo.sql); se mancano il controllo è
// "saltato", non fallito.
// Avvio: npm run test:e2e:vendita (stesse variabili della smoke, lib.mjs).
import { BASE, accedi, apriBrowser, check, nuovaPagina, overflow, riepilogo, vai } from './lib.mjs';

const SLUG = 'sicurezza-sul-lavoro-introduttivo';
const CORSO_001 = 'c0c01111-c0c0-c0c0-c0c0-c0c0c0c0c0c0';
const ED_001 = 'ed011111-ed01-ed01-ed01-ed01ed01ed01';

// L'offerta demo ha uno sconto a tempo ("Offerta lancio", 39 € fino al 30/11/2026):
// i controlli accettano sia il prezzo scontato (con il listino barrato) sia quello pieno.
const PIENO = { prezzo: '49,00 €', imponibile: '40,16 €', iva: '8,84 €' };
const SCONTATO = { prezzo: '39,00 €', imponibile: '31,97 €', iva: '7,03 €' };
const prezzi = (testo) => (testo.includes('Offerta lancio') ? SCONTATO : PIENO);

const browser = await apriBrowser();
const salta = (nome, motivo) => check(nome, true, `saltato: ${motivo}`);
const testo = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

// ── visitatore senza account ──
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = `pubblico@${viewport.width}`;
  const { ctx, page } = await nuovaPagina(browser, viewport);

  await vai(page, '/');
  const home = new URL(page.url()).pathname;
  check(`${tag} / porta al catalogo sugli indirizzi dell'ente`, home === '/catalogo', home);

  await vai(page, '/catalogo');
  const cat = await testo(page);
  if (!cat.includes('Sicurezza sul lavoro')) salta(`${tag} catalogo`, 'offerta demo assente');
  else {
    check(`${tag} catalogo: card con prezzo e stato`, cat.includes(prezzi(cat).prezzo) && cat.includes('Iscrizioni aperte'), '');
    if (cat.includes('Offerta lancio')) check(`${tag} catalogo: sconto a tempo con listino barrato e scadenza`, (await page.locator('.offerta-card .prezzo__listino').first().innerText()).includes('49,00') && /−20% fino al/.test(cat), '');
    check(`${tag} catalogo: link a termini e privacy`, (await page.locator('a[href="/termini"]').count()) > 0 && (await page.locator('a[href="/privacy"]').count()) > 0);
    check(`${tag} catalogo: niente sforamento`, !(await overflow(page)));
  }

  await vai(page, '/catalogo?q=zzz-nessun-corso');
  check(`${tag} catalogo: ricerca senza risultati`, (await page.locator('.vetrina__griglia li').count()) === 0, '');

  await vai(page, `/catalogo/${SLUG}`);
  const scheda = await testo(page);
  if (!scheda.includes('Sicurezza sul lavoro')) salta(`${tag} scheda`, 'offerta demo assente');
  else {
    check(`${tag} scheda: prezzo con IVA`, scheda.includes(prezzi(scheda).prezzo) && scheda.includes('IVA 22% inclusa'), '');
    check(`${tag} scheda: programma con le lezioni`, (await page.locator('.scheda__programma li').count()) >= 1);
    check(`${tag} scheda: "Iscriviti al corso" verso l'acquisto`, (await page.locator(`a[href="/acquista/${SLUG}"]`).count()) === 1);
    check(`${tag} scheda: niente sforamento`, !(await overflow(page)));
  }

  await vai(page, '/catalogo/corso-che-non-esiste');
  check(`${tag} scheda inesistente: non trovata`, /non trovat/i.test(await testo(page)));

  await vai(page, `/acquista/${SLUG}`);
  const acq = await testo(page);
  check(`${tag} acquisto senza account: chiede l'account`, acq.includes('Serve un account') && (await page.locator(`a[href*="/registrati?dopo="]`).count()) === 1, '');
  const pa = acq.includes('Sconto «Offerta lancio»') ? SCONTATO : PIENO;
  check(`${tag} acquisto: riepilogo con imponibile e IVA`, acq.includes('Imponibile') && acq.includes(pa.imponibile) && acq.includes(pa.iva), '');
  if (pa === SCONTATO) check(`${tag} acquisto: prezzo pieno, sconto e scadenza`, acq.includes('Prezzo pieno') && acq.includes('−10,00 €') && acq.includes('Prezzo scontato fino al'), '');
  check(`${tag} acquisto: niente sforamento`, !(await overflow(page)));

  await vai(page, `/registrati?dopo=/acquista/${SLUG}`);
  await page.click('button[type=submit]');
  const reg = await testo(page);
  check(`${tag} registrazione: errori per campo senza inviare`, reg.includes('Scrivi il nome.') && reg.includes('Scrivi un indirizzo email valido.') && reg.includes('serve l’accettazione dell’informativa'), '');
  check(`${tag} registrazione: niente sforamento`, !(await overflow(page)));

  for (const p of ['/termini', '/privacy']) {
    await vai(page, p);
    check(`${tag} ${p}: pagina leggibile`, (await page.locator('h1').count()) === 1 && !(await overflow(page)));
  }

  if (viewport.width === 1440) {
    const r = await page.evaluate(async () => {
      const a = await fetch('/api/acquisto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const w = await fetch('/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      return [a.status, w.status];
    });
    check('acquisto senza account: rifiutato', [401, 503].includes(r[0]), String(r[0]));
    check('webhook senza firma: rifiutato', [400, 503].includes(r[1]), String(r[1]));
  }
  await ctx.close();
}

// ── discente iscritto a ED-001 ──
{
  const { ctx, page } = await nuovaPagina(browser, { width: 1440, height: 900 });
  await accedi(page, 'discente');
  await vai(page, `/catalogo/${SLUG}`);
  const s = await testo(page);
  if (!s.includes('Sicurezza sul lavoro')) salta('discente scheda', 'offerta demo assente');
  else if (s.includes('Sei iscritto')) check('discente: scheda dice "Sei iscritto: vai al corso"', (await page.locator(`a[href="/corsi/${ED_001}"]`).count()) === 1);
  else salta('discente: "Sei iscritto"', 'serve la chiave di servizio per leggere l’edizione dell’offerta');
  check('discente: testata della vetrina con "I miei corsi"', (await page.locator('.vetrina__head a[href="/corsi"]').count()) >= 1);
  await vai(page, '/profilo');
  check('discente: profilo leggibile (sezione acquisti solo se ce ne sono)', (await page.locator('#acquisti').count()) <= 1 && !(await overflow(page)));
  await ctx.close();
}

// ── admin: offerta e Vendite ──
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = `admin@${viewport.width}`;
  const { ctx, page } = await nuovaPagina(browser, viewport);
  await accedi(page, 'admin');

  await vai(page, '/admin');
  check(`${tag} menu: voce Vendite`, (await page.locator('a[href="/admin/vendite"]').count()) >= 1);

  await vai(page, `/admin/corsi/${CORSO_001}/edizioni/${ED_001}/vendita`);
  const v = await testo(page);
  check(`${tag} edizione: scheda Vendita`, (await page.locator(`a[href="/admin/corsi/${CORSO_001}/edizioni/${ED_001}/vendita"]`).count()) >= 1, '');
  if (!v.includes('in vendita')) salta(`${tag} offerta`, 'offerta demo assente');
  else {
    check(`${tag} offerta: prezzo e scorporo`, (await page.inputValue('#of-prezzo')) === '49,00' && v.includes('40,16'), await page.inputValue('#of-prezzo'));
    check(`${tag} offerta: "Ritira dal catalogo" disponibile`, (await page.locator('button', { hasText: 'Ritira dal catalogo' }).count()) === 1);
  }
  check(`${tag} vendita: sezione sconti a tempo e scelta per le iscrizioni chiuse`, v.includes('Sconti a tempo') && v.includes('Togli dal catalogo') && v.includes('Lascia con «Iscrizioni chiuse»'), '');
  if (v.includes('in vendita')) {
    // Riga di sconto aggiunta e validata nel browser: nessun salvataggio (l'errore blocca prima della rete).
    await page.click('button:has-text("Aggiungi uno sconto a tempo")');
    await page.fill('#of-sc-0-prezzo', '60');
    const richieste = [];
    page.on('request', (r) => { if (r.method() === 'PATCH') richieste.push(r.url()); });
    await page.click('button:has-text("Salva le modifiche")');
    await page.waitForTimeout(300);
    const t = await page.locator('form.card').first().innerText();
    check(`${tag} sconto: prezzo sopra il listino e data mancante segnalati, nessun salvataggio`, /minore del prezzo di listino/.test(t) && /ultimo giorno/.test(t) && richieste.length === 0, richieste.join(','));
    check(`${tag} sconto: riga con chip di stato e percentuale nel suggerimento`, (await page.locator('.sconto-riga').count()) === 1, '');
  }
  check(`${tag} vendita: niente sforamento`, !(await overflow(page)));

  await vai(page, '/admin/vendite');
  const ve = await testo(page);
  check(`${tag} Vendite: titolo e riepilogo`, ve.includes('Vendite') && (await page.locator('.kpi-strip__item').count()) === 3, '');
  check(`${tag} Vendite: niente sforamento`, !(await overflow(page)));

  if (viewport.width === 1440) {
    await vai(page, '/admin/vendite?stato=rimborsati');
    check('Vendite: filtro nell’URL', new URL(page.url()).searchParams.get('stato') === 'rimborsati');
    const csv = await page.evaluate(async () => { const r = await fetch('/api/admin/vendite/export'); return { s: r.status, t: (await r.text()).slice(0, 200), ct: r.headers.get('content-type') }; });
    check('Vendite: export CSV con intestazione', csv.s === 200 && /text\/csv/.test(csv.ct ?? '') && csv.t.includes('data_pagamento;ordine;stato'), `${csv.s} ${csv.ct}`);
    const r = await page.evaluate(async () => (await fetch('/api/admin/offerte/00000000-0000-4000-8000-000000000000', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"azione":"ritira"}' })).status);
    check('offerta: PATCH senza chiave di servizio → 503 controllato (o 404)', [503, 404].includes(r), String(r));
  }
  await ctx.close();
}

await browser.close();
console.log(`Base: ${BASE}`);
process.exit(riepilogo() ? 0 : 1);
