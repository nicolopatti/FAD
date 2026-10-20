// Catalogo degli Eventi del log: etichetta leggibile e gruppo, per la vista
// dell'auditor (filtri, riga della tabella). Il tipo grezzo resta sempre
// visibile accanto: l'etichetta è un aiuto alla lettura, non una sostituzione.

export type GruppoEvento =
  | 'accesso'
  | 'video'
  | 'documento'
  | 'test'
  | 'catalogo'
  | 'edizioni'
  | 'presenze'
  | 'fondi';

export const GRUPPI: { id: GruppoEvento; etichetta: string }[] = [
  { id: 'accesso', etichetta: 'Accessi' },
  { id: 'video', etichetta: 'Video' },
  { id: 'documento', etichetta: 'Documenti' },
  { id: 'test', etichetta: 'Test finali' },
  { id: 'catalogo', etichetta: 'Corsi e contenuti' },
  { id: 'edizioni', etichetta: 'Edizioni e iscrizioni' },
  { id: 'presenze', etichetta: 'Sessioni e presenze' },
  { id: 'fondi', etichetta: 'Report fondi' },
];

export const EVENTI: { tipo: string; etichetta: string; gruppo: GruppoEvento }[] = [
  { tipo: 'auth.login', etichetta: 'Accesso', gruppo: 'accesso' },
  { tipo: 'auth.logout', etichetta: 'Uscita', gruppo: 'accesso' },
  { tipo: 'video.play', etichetta: 'Video avviato', gruppo: 'video' },
  { tipo: 'video.pause', etichetta: 'Video in pausa', gruppo: 'video' },
  { tipo: 'video.seek', etichetta: 'Salto nel video', gruppo: 'video' },
  { tipo: 'video.progress', etichetta: 'Avanzamento video', gruppo: 'video' },
  { tipo: 'video.ended', etichetta: 'Video terminato', gruppo: 'video' },
  { tipo: 'documento.opened', etichetta: 'Documento aperto', gruppo: 'documento' },
  { tipo: 'documento.completed', etichetta: 'Lettura confermata', gruppo: 'documento' },
  { tipo: 'quiz.started', etichetta: 'Test avviato', gruppo: 'test' },
  { tipo: 'quiz.submitted', etichetta: 'Test consegnato', gruppo: 'test' },
  { tipo: 'quiz.domande_aggiornate', etichetta: 'Domande del test aggiornate', gruppo: 'catalogo' },
  { tipo: 'learning_object.created', etichetta: 'Contenuto creato', gruppo: 'catalogo' },
  { tipo: 'learning_object.updated', etichetta: 'Contenuto modificato', gruppo: 'catalogo' },
  { tipo: 'learning_object.archived', etichetta: 'Contenuto archiviato', gruppo: 'catalogo' },
  { tipo: 'learning_object.unarchived', etichetta: 'Contenuto ripristinato', gruppo: 'catalogo' },
  { tipo: 'corso.created', etichetta: 'Corso creato', gruppo: 'catalogo' },
  { tipo: 'corso.updated', etichetta: 'Corso modificato', gruppo: 'catalogo' },
  { tipo: 'corso.cover_updated', etichetta: 'Copertina aggiornata', gruppo: 'catalogo' },
  { tipo: 'struttura.added', etichetta: 'Lezione aggiunta', gruppo: 'catalogo' },
  { tipo: 'struttura.updated', etichetta: 'Lezione modificata', gruppo: 'catalogo' },
  { tipo: 'struttura.removed', etichetta: 'Lezione tolta', gruppo: 'catalogo' },
  { tipo: 'struttura.reordered', etichetta: 'Struttura riordinata', gruppo: 'catalogo' },
  { tipo: 'struttura.imported', etichetta: 'Struttura importata', gruppo: 'catalogo' },
  { tipo: 'edizione.created', etichetta: 'Edizione creata', gruppo: 'edizioni' },
  { tipo: 'edizione.updated', etichetta: 'Edizione modificata', gruppo: 'edizioni' },
  { tipo: 'edizione.concluded', etichetta: 'Edizione conclusa', gruppo: 'edizioni' },
  { tipo: 'edizione.cancelled', etichetta: 'Edizione annullata', gruppo: 'edizioni' },
  { tipo: 'persona.created', etichetta: 'Persona creata', gruppo: 'edizioni' },
  { tipo: 'iscrizione.created', etichetta: 'Iscrizione creata', gruppo: 'edizioni' },
  { tipo: 'iscrizione.updated', etichetta: 'Iscrizione modificata', gruppo: 'edizioni' },
  { tipo: 'iscrizione.imported', etichetta: 'Iscrizioni importate', gruppo: 'edizioni' },
  { tipo: 'iscrizione.removed', etichetta: 'Iscrizione rimossa', gruppo: 'edizioni' },
  { tipo: 'piano.created', etichetta: 'Piano finanziato creato', gruppo: 'fondi' },
  { tipo: 'sessione.created', etichetta: 'Sessione pianificata', gruppo: 'presenze' },
  { tipo: 'report_grezzo_importato', etichetta: 'Report presenze importato', gruppo: 'presenze' },
  { tipo: 'presenza_webinar_registrata', etichetta: 'Presenza registrata', gruppo: 'presenze' },
  { tipo: 'partecipante_non_riconciliato', etichetta: 'Partecipante non riconosciuto', gruppo: 'presenze' },
  { tipo: 'match_risolto_manualmente', etichetta: 'Abbinamento risolto a mano', gruppo: 'presenze' },
  { tipo: 'presenza_inserita_manualmente', etichetta: 'Presenza inserita a mano', gruppo: 'presenze' },
  { tipo: 'presenza_corretta_manualmente', etichetta: 'Presenza corretta a mano', gruppo: 'presenze' },
  { tipo: 'report_fondo_depositato', etichetta: 'Report fondo depositato', gruppo: 'fondi' },
];

const BY_TIPO = new Map(EVENTI.map((e) => [e.tipo, e]));

export function etichettaEvento(tipo: string): string {
  return BY_TIPO.get(tipo)?.etichetta ?? tipo;
}

export function gruppoDi(tipo: string): GruppoEvento | null {
  return BY_TIPO.get(tipo)?.gruppo ?? null;
}

export function tipiDelGruppo(g: GruppoEvento): string[] {
  return EVENTI.filter((e) => e.gruppo === g).map((e) => e.tipo);
}

function sec(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Riassunto in una riga del payload (senza PII: il payload non ne contiene).
export function riassuntoEvento(tipo: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : null);
  switch (tipo) {
    case 'video.play':
    case 'video.pause':
    case 'video.progress':
    case 'video.ended': {
      const pos = sec(p.posizione_secondi ?? p.position_seconds ?? p.current_time);
      const cop = num('copertura_secondi');
      const parts = [pos ? `a ${pos}` : null, cop != null ? `visti ${Math.round(cop)} s` : null].filter(Boolean);
      return parts.join(' · ');
    }
    case 'video.seek': {
      const da = sec(p.from_seconds);
      const a = sec(p.to_secondi ?? p.to_seconds);
      return da && a ? `da ${da} a ${a}` : '';
    }
    case 'corso.created':
    case 'corso.updated':
    case 'learning_object.created':
    case 'learning_object.updated':
    case 'learning_object.archived':
    case 'learning_object.unarchived':
    case 'sessione.created':
    case 'piano.created':
      return str('titolo') ?? '';
    case 'struttura.added':
      return str('lo_titolo') ?? '';
    case 'quiz.submitted':
      return [
        num('percentuale') != null ? `${num('percentuale')}%` : null,
        p.superato === true ? 'superato' : p.superato === false ? 'non superato' : null,
        num('tentativo') != null ? `tentativo ${num('tentativo')}` : null,
      ].filter(Boolean).join(' · ');
    case 'quiz.started':
      return num('tentativo') != null ? `tentativo ${num('tentativo')}` : '';
    case 'quiz.domande_aggiornate':
      return num('n_domande') != null ? `${num('n_domande')} domande` : '';
    case 'struttura.imported':
      return num('aggiunti') != null ? `${num('aggiunti')} aggiunte${str('origine') ? ` (${str('origine')})` : ''}` : '';
    case 'edizione.created':
    case 'edizione.updated':
    case 'edizione.concluded':
    case 'edizione.cancelled':
      return str('codice') ?? '';
    case 'iscrizione.imported':
      return num('aggiunti') != null ? `${num('aggiunti')} nuove, ${num('duplicati') ?? 0} duplicate` : '';
    case 'report_grezzo_importato':
      return [str('fonte') ? `fonte ${str('fonte')}` : null, num('righe') != null ? `${num('righe')} righe` : null].filter(Boolean).join(' · ');
    case 'presenza_webinar_registrata':
    case 'presenza_inserita_manualmente':
    case 'presenza_corretta_manualmente':
      return str('durata') ? `durata ${str('durata')}` : num('durata_minuti') != null ? `${num('durata_minuti')} min` : '';
    case 'report_fondo_depositato':
      return str('formato') ? `formato ${str('formato')}` : '';
    default:
      return '';
  }
}
