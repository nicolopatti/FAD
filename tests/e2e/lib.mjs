// Strumenti comuni dei test E2E (Playwright "puro", senza test runner):
// browser, accesso, raccolta esiti, controllo di overflow ed errori JS.
//
// Variabili d'ambiente:
//   E2E_BASE_URL            indirizzo dell'app (default http://localhost:3100)
//   E2E_DISCENTE_EMAIL/PASSWORD, E2E_AUDITOR_EMAIL/PASSWORD, E2E_ADMIN_EMAIL/PASSWORD
//                           (default: utenti demo del tenant di sviluppo)
//   E2E_PROXY_SUPABASE=1    inoltra le chiamate del browser a *.supabase.co via
//                           fetch di Node (serve nel container Claude, dove
//                           Chromium non passa dal proxy; lanciare con NODE_USE_ENV_PROXY=1)
//   PLAYWRIGHT_CHROMIUM     percorso di un Chromium già installato (facoltativo)
//   E2E_DEV=1               l'app gira con `next dev`: ignora l'errore "useContext of null"
//                           che il dev server produce al primo caricamento di una pagina
import { chromium } from 'playwright';

export const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
export const UTENTI = {
  discente: { email: process.env.E2E_DISCENTE_EMAIL ?? 'discente@fad.local', password: process.env.E2E_DISCENTE_PASSWORD ?? 'discente-pass-123' },
  auditor: { email: process.env.E2E_AUDITOR_EMAIL ?? 'auditor@fad.local', password: process.env.E2E_AUDITOR_PASSWORD ?? 'auditor-pass-123' },
  admin: { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@fad.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'admin-pass-123' },
};
const DEV = process.env.E2E_DEV === '1';

export const esiti = [];
export const erroriJs = [];
export function check(nome, ok, info = '') { esiti.push([ok ? 'OK ' : 'FAIL', nome, info]); }

export async function apriBrowser() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  return chromium.launch({ executablePath });
}

export async function nuovaPagina(browser, viewport = { width: 1440, height: 900 }, opzioni = {}) {
  // Anteprime Vercel protette: il "Protection Bypass for Automation" passa come header.
  // `opzioni` va a `newContext` (es. `permissions`, `colorScheme`).
  const bypass = process.env.E2E_VERCEL_BYPASS;
  const ctx = await browser.newContext({ viewport, locale: 'it-IT', ...(bypass ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypass } } : {}), ...opzioni });
  if (process.env.E2E_PROXY_SUPABASE === '1') {
    await ctx.route(/supabase\.co/, async (route) => {
      const req = route.request();
      try {
        const r = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() });
        const h = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) h[k] = v; });
        await route.fulfill({ status: r.status, headers: h, body: Buffer.from(await r.arrayBuffer()) });
      } catch { await route.abort(); }
    });
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    if (DEV && /useContext/.test(e.message)) return;
    erroriJs.push(`${page.url()} :: ${e.message.slice(0, 140)}`);
  });
  return { ctx, page };
}

export async function accedi(page, ruolo) {
  const u = UTENTI[ruolo];
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', u.email);
  await page.fill('input[type=password]', u.password);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
}

export async function vai(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** Pagina leggibile: HTTP ok, nessun overflow orizzontale, testo atteso presente. */
export async function paginaOk(page, path, nome, atteso = null) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const testo = await page.locator('body').innerText().catch(() => '');
  const ok = Boolean(res && res.status() < 400) && !(await overflow(page)) && (atteso ? (atteso instanceof RegExp ? atteso.test(testo) : testo.includes(atteso)) : true);
  check(nome, ok, `${res?.status() ?? '-'}${!ok && atteso ? ` · atteso "${atteso}"` : ''}`);
  return testo;
}

export function riepilogo() {
  for (const r of esiti) console.log(r[0], r[1], r[2] ? `— ${r[2]}` : '');
  const ok = esiti.filter((r) => r[0] === 'OK ').length;
  console.log(`\n${ok}/${esiti.length} ok; errori JS: ${erroriJs.length}`);
  if (erroriJs.length) console.log(erroriJs.join('\n'));
  return ok === esiti.length && erroriJs.length === 0;
}
