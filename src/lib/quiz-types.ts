// Tipi del test condivisi tra server e client (nessuna logica, importabile
// dai Client Component senza trascinare il parser CSV).
import type { QuizTipoDomanda } from './db-types';

export type DomandaPublica = {
  id: string;
  ordine: number;
  testo: string;
  tipo: QuizTipoDomanda;
  risposte: { testo: string }[];
};
