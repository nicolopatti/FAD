// Test E2E delle correzioni dello stress test del 21/10/2026, SOLO LETTURA:
// nessun Evento scritto (le chiamate alle API vengono rifiutate prima della
// scrittura, ed è proprio quello che si verifica). Usa le fixture del tenant
// demo (vedi CLAUDE.md); se una manca il controllo è "saltato", non fallito.
// Avvio: npm run test:e2e:correzioni (stesse variabili della smoke, lib.mjs).
import { accedi, apriBrowser, check, nuovaPagina, overflow, riepilogo, vai } from './lib.mjs';

const ED_001 = 'ed011111-ed01-ed01-ed01-ed01ed01ed01';         // fine 20/07/2026 → chiusa
const ISCR_001 = '15c11111-15c1-15c1-15c1-15c115c115c1';
const LO_001 = '10101111-1010-1010-1010-101010101010';
const ED_STRESS = '8fe0efdf-b5b7-40f8-bbf6-ec67a824b7fe';      // annullata nella pulizia del 21/10
const CORSO_STRESS = '84fd63f6-f608-4d31-8512-f8a19f918dce';
const ED_FIN = '6d2ef44e-2a5e-4804-9a98-dc0422c28a33';         // corso a 6 video, aperto
const ED_SOLO_TEST = 'baff688e-3c96-4253-8854-1d8931dd052b';
const QUIZ_LO = '38f31984-93e0-4489-b8ff-9284469d0623';

const browser = await apriBrowser();
const salta = (nome, motivo) => check(nome, true, `saltato: ${motivo}`);
const testo = async (page) => (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');

// ── discente: finestra (A1), durate e singolari (C), ordine del test (B5) ──
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = `discente@${viewport.width}`;
  const { ctx, page } = await nuovaPagina(browser, viewport);
  await accedi(page, 'discente');

  await vai(page, '/corsi');
  const elenco = await testo(page);
  check(`${tag} /corsi: edizione scaduta segnata "Chiuso"`, elenco.includes('Chiuso'), '');
  check(`${tag} /corsi: "da iniziare" separato da "in corso"`, !/\b\d+ in corso\b/.test(elenco) || /da iniziare|completat/.test(elenco), elenco.slice(0, 120));
  check(`${tag} /corsi: niente sforamento`, !(await overflow(page)));

  await vai(page, `/corsi/${ED_001}`);
  const corso = await testo(page);
  check(`${tag} corso scaduto: spiega da quando è chiuso`, /disponibili fino al 20\/07\/2026/.test(corso), '');
  check(`${tag} corso scaduto: nessun pulsante "Apri" sulle lezioni`, (await page.locator('.lo-row__action a').count()) === 0);

  await vai(page, `/corsi/${ED_001}/lo/${LO_001}`);
  check(`${tag} lezione di un'edizione chiusa: niente player`, (await page.locator('iframe').count()) === 0 && /Le lezioni sono chiuse/.test(await testo(page)));

  await vai(page, `/corsi/${ED_STRESS}`);
  const stress = await testo(page);
  if (/non trovata/i.test(stress)) salta(`${tag} edizione annullata`, 'fixture TEST-STRESS-01 assente');
  else check(`${tag} edizione annullata: lo dice e niente lezioni aperte`, /stata annullata/.test(stress) && (await page.locator('.lo-row__action a').count()) === 0, '');

  await vai(page, `/corsi/${ED_FIN}`);
  const fin = await testo(page);
  check(`${tag} durate coerenti: totale "55 min 45 s"`, fin.includes('55 min 45 s'), '');
  check(`${tag} durate coerenti: lezione "8 min 39 s" in elenco`, fin.includes('8 min 39 s'), '');
  check(`${tag} corso aperto: "Aperto fino al"`, fin.includes('Aperto fino al'), '');

  // B5 (ordine stabile per tentativo) è coperto dai test unitari: le domande si
  // vedono solo dopo "Inizia il test", che scrive un Evento (qui si legge soltanto).
  await vai(page, `/corsi/${ED_SOLO_TEST}/lo/${QUIZ_LO}`);
  check(`${tag} test finale: pagina aperta senza errori`, (await page.locator('.quiz-card, .quiz-result, .alert').count()) >= 1);

  // A1, criterio di accettazione: l'API rifiuta un evento fuori finestra (403).
  const r = await page.evaluate(async ([isc, lo]) => {
    const res = await fetch('/api/events/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_type: 'video.play', iscrizione_id: isc, learning_object_id: lo }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, [ISCR_001, LO_001]);
  check(`${tag} API video fuori finestra → 403 con il motivo`, r.status === 403 && /disponibili fino al/.test(r.body?.error ?? ''), JSON.stringify(r));

  await vai(page, '/verifica');
  check(`${tag} /verifica senza codice: pagina con il campo`, (await page.locator('input[name="codice"]').count()) === 1);
  await ctx.close();
}

// ── admin: dashboard "Da fare" (A5, B7), Persone (B6), Impostazioni (A5), agenda (C), lezioni (A3) ──
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = `admin@${viewport.width}`;
  const { ctx, page } = await nuovaPagina(browser, viewport);
  await accedi(page, 'admin');

  await vai(page, '/admin');
  const dash = await testo(page);
  check(`${tag} dashboard: card "Da fare"`, dash.includes('Da fare'), '');
  check(`${tag} dashboard: edizioni terminate da concludere`, /terminata il .* concludi l.edizione/i.test(dash), '');
  check(`${tag} dashboard: dati dell'ente incompleti segnalati`, dash.includes('Dati dell\'ente incompleti') || dash.includes('Dati dell’ente incompleti'), '');
  check(`${tag} dashboard: saluto in base all'ora`, /(Buongiorno|Buon pomeriggio|Buonasera),/.test(dash), '');
  check(`${tag} dashboard: niente sforamento`, !(await overflow(page)));

  await vai(page, '/admin/persone');
  const persone = await testo(page);
  check(`${tag} Persone: ruoli reali (amministratore, auditor)`, persone.includes('amministratore') && persone.includes('auditor'), '');

  await vai(page, '/admin/impostazioni');
  check(`${tag} Impostazioni: avviso ente incompleto`, (await testo(page)).includes('Dati dell'), '');

  await vai(page, '/admin/agenda');
  const agenda = await testo(page);
  check(`${tag} agenda: annullate nascoste di default`, (await page.locator('.chip', { hasText: 'annullata' }).count()) === 0, agenda.match(/Mostra anche [^.]*annullat\w+/)?.[0] ?? 'nessuna annullata');

  await vai(page, `/admin/corsi/${CORSO_STRESS}/lezioni`);
  const lez = await testo(page);
  if (/non trovat/i.test(lez)) salta(`${tag} lezioni: badge test vuoto`, 'fixture assente');
  else check(`${tag} lezioni: "0 domande — da completare"`, lez.includes('0 domande — da completare'), '');

  await vai(page, `/admin/corsi/${CORSO_STRESS}/edizioni/${ED_STRESS}`);
  check(`${tag} iscritti: "Emetti" disabilitato con il motivo`, (await page.locator('button:disabled', { hasText: 'Emetti' }).count()) >= 1 || (await testo(page)).includes('non ancora idoneo'), '');

  await vai(page, `/admin/corsi/${CORSO_STRESS}/edizioni/${ED_STRESS}/stato`);
  check(`${tag} Stato: presenza minima senza sessioni = in attesa`, (await testo(page)).includes('nessuna sessione pianificata'), '');

  await vai(page, '/admin/corsi/new');
  await page.fill('#nc-titolo', 'Prova validazione (non salvata)');
  await page.fill('#nc-ore', '-2');
  await page.getByRole('button', { name: /Crea corso/ }).click();
  await page.waitForTimeout(400);
  const focus = await page.evaluate(() => document.activeElement?.id ?? '');
  check(`${tag} Nuovo corso: errore ore accanto al campo e fuoco sul campo`, focus === 'nc-ore' && (await page.locator('#nc-ore[aria-invalid="true"]').count()) === 1, `fuoco su ${focus}`);
  check(`${tag} Nuovo corso: Manuale è il rilascio predefinito`, (await page.locator('#nc-politica').inputValue()) === 'manuale');
  await ctx.close();
}

// ── auditor: frequenza "in attesa di sessioni" (A2), ore in italiano (C) ──
{
  const { ctx, page } = await nuovaPagina(browser, { width: 1440, height: 900 });
  await accedi(page, 'auditor');
  await vai(page, '/audit/completamento?edizione=tutte');
  const t = await testo(page);
  check('auditor: "in attesa di sessioni" per la presenza senza sessioni', t.includes('in attesa di sessioni'), '');
  check('auditor: ore con la virgola italiana', !/\d\.\d+ h\b/.test(t), (t.match(/[\d.,]+ h su [\d.,]+ h/) ?? [''])[0]);
  await ctx.close();
}

await browser.close();
riepilogo();
