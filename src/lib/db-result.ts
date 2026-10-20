/**
 * Scarta l'errore di una query Supabase invece di mascherarlo con `data ?? []`:
 * prima un errore del database compariva come "Nessun corso" o KPI a zero.
 * L'eccezione arriva al più vicino `error.tsx`, che la mostra in italiano.
 */
export function unwrap<T>(
  res: { data: T | null; error: { message: string } | null },
  cosa: string,
): T {
  if (res.error) {
    throw new Error(`Impossibile leggere ${cosa}: ${res.error.message}`);
  }
  if (res.data == null) {
    throw new Error(`Impossibile leggere ${cosa}: nessuna risposta dal database.`);
  }
  return res.data;
}
