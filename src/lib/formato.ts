// Formati per l'interfaccia (stress test 21/10, gruppo C): una sola fonte per
// durate e ore, così corso, lezione, riepilogo e player dicono lo stesso numero.

/** Durata in secondi → "8 min 39 s", "1 h 5 min", "45 s". Totali: si somma prima, si formatta dopo. */
export function fmtDurata(sec: number | null | undefined): string | null {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  const t = Math.round(n);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h} h${m ? ` ${m} min` : ''}`;
  if (m > 0) return `${m} min${s ? ` ${s} s` : ''}`;
  return `${s} s`;
}

/** Ore decimali → "1,83 h" (virgola italiana, al più due decimali). */
export function fmtOre(ore: number | null | undefined): string {
  const n = Number(ore);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} h`;
}

/** "1 lezione" / "3 lezioni": singolare e plurale da una coppia di forme. */
export function plurale(n: number, uno: string, molti: string): string {
  return `${n} ${n === 1 ? uno : molti}`;
}
