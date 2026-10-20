import type { LearningObjectType } from '@/lib/db-types';

export const CATEGORIE = ['Sicurezza', 'Privacy', 'Antincendio', 'Primo soccorso', 'Formazione'];
export const TIPO_LABEL: Record<LearningObjectType, string> = { video: 'Video', documento: 'PDF', quiz: 'Test' };
export const TIPO_CHIP: Record<LearningObjectType, string> = { video: 'chip--teal', documento: 'chip--ocra', quiz: 'chip--accent' };
export const TIPO_ICON: Record<LearningObjectType, string> = { video: 'video', documento: 'documento', quiz: 'quiz' };

/** Trova la colonna di un CSV per alias (tollerante a maiuscole, spazi, underscore). */
export function matchCol(headers: string[], aliases: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_]+/g, ' ');
  const H = headers.map(norm);
  for (const a of aliases) { const i = H.indexOf(norm(a)); if (i >= 0) return i; }
  for (let i = 0; i < H.length; i++) { if (aliases.some((a) => H[i].includes(norm(a)))) return i; }
  return -1;
}

export type PianoMini = { id: string; titolo: string; codice: string | null; fondo: string | null };

export type IscrittoRow = {
  iscrizione_id: string;
  persona_id: string;
  /** Ha un utente Auth collegato (può entrare); altrimenti va invitato. */
  accesso: boolean;
  nome: string;
  cognome: string;
  email: string;
  codice_fiscale: string | null;
  azienda: string | null;
  piano_id: string | null;
  piano_titolo: string | null;
  /** Attestato valido (Fase 5), se emesso. */
  attestato: { id: string; numero: string; emesso_at: string } | null;
};

export const corsoHref = (corsoId: string) => `/admin/corsi/${corsoId}` as const;
export const edizioneHref = (corsoId: string, edizioneId: string) => `/admin/corsi/${corsoId}/edizioni/${edizioneId}` as const;
export const sessioneHref = (corsoId: string, edizioneId: string, sessioneId: string) =>
  `/admin/corsi/${corsoId}/edizioni/${edizioneId}/sessioni/${sessioneId}` as const;
