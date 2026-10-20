// Paginazione sul server (ondata C): funzioni pure usate dai Server Component
// (non stanno in `components/admin/Lista.tsx`, che è un modulo client: le sue
// esportazioni non-componente arrivano al server come riferimenti vuoti).

export const PER_PAGINA = 25;

/** Pagina corrente da `?pagina=`: intero ≥ 1. */
export function parsePagina(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Intervallo `.range(da, a)` di PostgREST per la pagina richiesta. */
export function intervallo(pagina: number, perPagina = PER_PAGINA): [number, number] {
  return [(pagina - 1) * perPagina, pagina * perPagina - 1];
}

/** PostgREST risponde 416 (PGRST103) se la pagina è oltre l'ultima: si torna alla prima. */
export function fuoriIntervallo(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === 'PGRST103' || /range not satisfiable/i.test(error.message ?? '')));
}

/** Stesso indirizzo senza `pagina` (gli altri filtri restano). */
export function hrefPaginaUno(pathname: string, sp: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== 'pagina' && typeof v === 'string' && v) next.set(k, v);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
