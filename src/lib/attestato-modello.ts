/**
 * Modello dell'attestato (Fase 5): layout, testi, loghi, firmatari e campi da
 * mostrare. L'ente ha un modello predefinito (`tenant.attestato_modello`); ogni
 * corso può sostituirne i campi (`corso.attestato_modello`, parziale). Il
 * modello RISOLTO finisce nello snapshot dell'attestato al momento
 * dell'emissione: il PDF si genera solo da lì (documento riproducibile).
 *
 * Nei testi si possono usare i segnaposto {nome}, {corso}, {ore}, {ente},
 * {edizione}, {data}: vengono sostituiti alla resa.
 */

export type LayoutAttestato = 'classico' | 'essenziale' | 'elegante';

export const LAYOUT_LABEL: Record<LayoutAttestato, { nome: string; descrizione: string }> = {
  classico: { nome: 'Classico', descrizione: 'Banda blu in testa, titolo e nome centrati, firma a sinistra e QR a destra.' },
  essenziale: { nome: 'Essenziale', descrizione: 'Foglio bianco, testi allineati a sinistra, logo in alto: sobrio e leggibile.' },
  elegante: { nome: 'Elegante', descrizione: 'Cornice doppia e carattere con grazie, tutto centrato: da incorniciare.' },
};

export type Firmatario = { nome: string; ruolo: string; firma_path: string | null };

export type ModelloAttestato = {
  layout: LayoutAttestato;
  titolo: string;
  intro: string;
  frase: string;
  testo_aggiuntivo: string;
  intestazione: string;           // '' = ragione sociale dell'ente
  citta: string;                  // '' = città dell'ente
  logo_path: string | null;       // null = logo dell'ente
  loghi_secondari: string[];      // fino a 3
  firmatari: Firmatario[];        // fino a 2; [] = firmatario dell'ente
  mostra: {
    nascita: boolean;
    ore: boolean;
    riferimento: boolean;
    edizione: boolean;
    esito_test: boolean;
    lezioni: boolean;
    qr: boolean;
  };
};

/** Modello parziale salvato su un corso (ogni campo è facoltativo). */
export type ModelloParziale = Partial<Omit<ModelloAttestato, 'mostra'>> & { mostra?: Partial<ModelloAttestato['mostra']> };

export const MODELLO_PREDEFINITO: ModelloAttestato = {
  layout: 'classico',
  titolo: 'Attestato di frequenza e superamento',
  intro: 'Si attesta che',
  frase: 'ha completato con esito positivo il corso',
  testo_aggiuntivo: '',
  intestazione: '',
  citta: '',
  logo_path: null,
  loghi_secondari: [],
  firmatari: [],
  mostra: { nascita: true, ore: true, riferimento: true, edizione: true, esito_test: true, lezioni: false, qr: true },
};

const LAYOUTS: LayoutAttestato[] = ['classico', 'essenziale', 'elegante'];
const MAX = { titolo: 90, intro: 120, frase: 200, testo: 900, intestazione: 120, citta: 80, nome: 80, ruolo: 100 };

function testo(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : fallback;
}
function pathOk(v: unknown): string | null {
  return typeof v === 'string' && /^[0-9a-f-]{36}\/[\w.-]+$/i.test(v) ? v : null;
}
/** Path di un file del bucket `loghi` dentro la cartella del tenant indicato. */
export function pathNelTenant(v: unknown, tenantId: string): boolean {
  return pathOk(v) !== null && (v as string).toLowerCase().startsWith(`${tenantId.toLowerCase()}/`);
}

/** Normalizza un modello parziale ricevuto dal client (scarta ciò che non è valido). */
export function normalizzaParziale(input: unknown): ModelloParziale {
  if (!input || typeof input !== 'object') return {};
  const i = input as Record<string, unknown>;
  const out: ModelloParziale = {};
  if (typeof i.layout === 'string' && LAYOUTS.includes(i.layout as LayoutAttestato)) out.layout = i.layout as LayoutAttestato;
  if (typeof i.titolo === 'string') out.titolo = testo(i.titolo, MAX.titolo, '');
  if (typeof i.intro === 'string') out.intro = testo(i.intro, MAX.intro, '');
  if (typeof i.frase === 'string') out.frase = testo(i.frase, MAX.frase, '');
  if (typeof i.testo_aggiuntivo === 'string') out.testo_aggiuntivo = testo(i.testo_aggiuntivo, MAX.testo, '');
  if (typeof i.intestazione === 'string') out.intestazione = testo(i.intestazione, MAX.intestazione, '');
  if (typeof i.citta === 'string') out.citta = testo(i.citta, MAX.citta, '');
  if ('logo_path' in i) out.logo_path = pathOk(i.logo_path);
  if (Array.isArray(i.loghi_secondari)) out.loghi_secondari = i.loghi_secondari.map(pathOk).filter((p): p is string => Boolean(p)).slice(0, 3);
  if (Array.isArray(i.firmatari)) {
    out.firmatari = i.firmatari
      .filter((f) => f && typeof f === 'object')
      .map((f) => {
        const r = f as Record<string, unknown>;
        return { nome: testo(r.nome, MAX.nome, ''), ruolo: testo(r.ruolo, MAX.ruolo, ''), firma_path: pathOk(r.firma_path) };
      })
      .filter((f) => f.nome)
      .slice(0, 2);
  }
  if (i.mostra && typeof i.mostra === 'object') {
    const m = i.mostra as Record<string, unknown>;
    const mostra: Partial<ModelloAttestato['mostra']> = {};
    for (const k of Object.keys(MODELLO_PREDEFINITO.mostra) as (keyof ModelloAttestato['mostra'])[]) {
      if (typeof m[k] === 'boolean') mostra[k] = m[k] as boolean;
    }
    out.mostra = mostra;
  }
  return out;
}

export type DatiEnte = {
  ragione_sociale: string;
  citta: string | null;
  firmatario_nome: string | null;
  firmatario_ruolo: string | null;
  logo_path: string | null;
  firma_path: string | null;
};

/**
 * Modello risolto: predefinito ← modello dell'ente ← modello del corso, e poi
 * i vuoti riempiti con i dati anagrafici dell'ente (intestazione, città, logo,
 * firmatario). È ciò che entra nello snapshot.
 */
export function risolviModello(ente: DatiEnte, modelloEnte: unknown, modelloCorso: unknown): ModelloAttestato {
  const e = normalizzaParziale(modelloEnte);
  const c = normalizzaParziale(modelloCorso);
  const base: ModelloAttestato = {
    ...MODELLO_PREDEFINITO,
    ...stripUndefined(e),
    ...stripUndefined(c),
    mostra: { ...MODELLO_PREDEFINITO.mostra, ...(e.mostra ?? {}), ...(c.mostra ?? {}) },
  };
  if (!base.intestazione) base.intestazione = ente.ragione_sociale;
  if (!base.citta) base.citta = ente.citta ?? '';
  // Logo e firmatari: un valore ESPLICITO nel modello (anche "nessuno": logo_path
  // null, firmatari []) vince; solo se il modello non ne parla si prendono dall'ente.
  const logoDichiarato = 'logo_path' in c ? c.logo_path : 'logo_path' in e ? e.logo_path : undefined;
  base.logo_path = logoDichiarato === undefined ? ente.logo_path ?? null : logoDichiarato ?? null;
  const firmatariDichiarati = c.firmatari ?? e.firmatari;
  if (firmatariDichiarati !== undefined) base.firmatari = firmatariDichiarati;
  else base.firmatari = ente.firmatario_nome ? [{ nome: ente.firmatario_nome, ruolo: ente.firmatario_ruolo ?? '', firma_path: ente.firma_path ?? null }] : [];
  return base;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined && k !== ('mostra' as keyof T)) out[k] = o[k];
  return out;
}

/** Sostituisce i segnaposto nei testi del modello. */
export function compilaTesto(t: string, v: Record<string, string>): string {
  return t.replace(/\{(nome|corso|ore|ente|edizione|data)\}/g, (_, k: string) => v[k] ?? '');
}
