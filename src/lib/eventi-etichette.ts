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
  | 'fondi'
  | 'attestati'
  | 'vendite';

export const GRUPPI: { id: GruppoEvento; etichetta: string }[] = [
  { id: 'accesso', etichetta: 'Accessi' },
  { id: 'video', etichetta: 'Video' },
  { id: 'documento', etichetta: 'Documenti' },
  { id: 'test', etichetta: 'Test finali' },
  { id: 'catalogo', etichetta: 'Corsi e contenuti' },
  { id: 'edizioni', etichetta: 'Edizioni e iscrizioni' },
  { id: 'presenze', etichetta: 'Sessioni e presenze' },
  { id: 'fondi', etichetta: 'Report fondi' },
  { id: 'attestati', etichetta: 'Attestati' },
  { id: 'vendite', etichetta: 'Vendite' },
];

export const EVENTI: { tipo: string; etichetta: string; gruppo: GruppoEvento }[] = [
  { tipo: 'auth.login', etichetta: 'Accesso', gruppo: 'accesso' },
  { tipo: 'auth.logout', etichetta: 'Uscita', gruppo: 'accesso' },
  { tipo: 'auth.password_aggiornata', etichetta: 'Password aggiornata', gruppo: 'accesso' },
  { tipo: 'informativa.accettata', etichetta: 'Informativa accettata', gruppo: 'accesso' },
  { tipo: 'persona.invitata', etichetta: 'Invito inviato', gruppo: 'edizioni' },
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
  { tipo: 'piano.updated', etichetta: 'Piano finanziato modificato', gruppo: 'fondi' },
  { tipo: 'piano.removed', etichetta: 'Piano finanziato eliminato', gruppo: 'fondi' },
  { tipo: 'edizione.piano_assegnato', etichetta: 'Piano assegnato all’edizione', gruppo: 'fondi' },
  { tipo: 'incarico.created', etichetta: 'Docente o tutor assegnato', gruppo: 'edizioni' },
  { tipo: 'incarico.removed', etichetta: 'Docente o tutor rimosso', gruppo: 'edizioni' },
  { tipo: 'sessione.created', etichetta: 'Sessione pianificata', gruppo: 'presenze' },
  { tipo: 'sessione.updated', etichetta: 'Sessione modificata', gruppo: 'presenze' },
  { tipo: 'sessione.cancelled', etichetta: 'Sessione annullata', gruppo: 'presenze' },
  { tipo: 'report_grezzo_importato', etichetta: 'Report presenze importato', gruppo: 'presenze' },
  { tipo: 'presenza_webinar_registrata', etichetta: 'Presenza registrata', gruppo: 'presenze' },
  { tipo: 'partecipante_non_riconciliato', etichetta: 'Partecipante non riconosciuto', gruppo: 'presenze' },
  { tipo: 'match_risolto_manualmente', etichetta: 'Abbinamento risolto a mano', gruppo: 'presenze' },
  { tipo: 'presenza_inserita_manualmente', etichetta: 'Presenza inserita a mano', gruppo: 'presenze' },
  { tipo: 'presenza_corretta_manualmente', etichetta: 'Presenza corretta a mano', gruppo: 'presenze' },
  { tipo: 'report_fondo_depositato', etichetta: 'Report fondo depositato', gruppo: 'fondi' },
  { tipo: 'attestato.emesso', etichetta: 'Attestato emesso', gruppo: 'attestati' },
  { tipo: 'attestato.sostituito', etichetta: 'Attestato sostituito', gruppo: 'attestati' },
  { tipo: 'ente.updated', etichetta: 'Dati dell’ente aggiornati', gruppo: 'catalogo' },
  { tipo: 'tenant.created', etichetta: 'Ente creato', gruppo: 'catalogo' },
  { tipo: 'corso.attestato_modello_updated', etichetta: 'Modello attestato del corso aggiornato', gruppo: 'catalogo' },
  { tipo: 'corso.archived', etichetta: 'Corso archiviato', gruppo: 'catalogo' },
  { tipo: 'corso.unarchived', etichetta: 'Corso ripristinato', gruppo: 'catalogo' },
  { tipo: 'categoria.created', etichetta: 'Categoria creata', gruppo: 'catalogo' },
  { tipo: 'categoria.updated', etichetta: 'Categoria rinominata', gruppo: 'catalogo' },
  { tipo: 'categoria.removed', etichetta: 'Categoria eliminata', gruppo: 'catalogo' },
  { tipo: 'persona.updated', etichetta: 'Anagrafica aggiornata', gruppo: 'edizioni' },
  { tipo: 'azienda.created', etichetta: 'Azienda creata', gruppo: 'edizioni' },
  { tipo: 'azienda.updated', etichetta: 'Azienda modificata', gruppo: 'edizioni' },
  { tipo: 'azienda.unita', etichetta: 'Aziende unite', gruppo: 'edizioni' },
  { tipo: 'persona.registrata', etichetta: 'Registrazione collegata all’anagrafica', gruppo: 'accesso' },
  { tipo: 'iscrizione.revoked', etichetta: 'Accesso revocato', gruppo: 'edizioni' },
  { tipo: 'offerta.created', etichetta: 'Offerta creata', gruppo: 'vendite' },
  { tipo: 'offerta.updated', etichetta: 'Offerta modificata', gruppo: 'vendite' },
  { tipo: 'offerta.published', etichetta: 'Offerta pubblicata', gruppo: 'vendite' },
  { tipo: 'offerta.withdrawn', etichetta: 'Offerta ritirata', gruppo: 'vendite' },
  { tipo: 'ordine.created', etichetta: 'Ordine creato', gruppo: 'vendite' },
  { tipo: 'ordine.paid', etichetta: 'Ordine pagato', gruppo: 'vendite' },
  { tipo: 'ordine.refunded', etichetta: 'Ordine rimborsato', gruppo: 'vendite' },
  { tipo: 'ordine.cancelled', etichetta: 'Ordine annullato', gruppo: 'vendite' },
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
    case 'sessione.updated':
    case 'sessione.cancelled':
    case 'piano.created':
    case 'piano.removed':
      return str('titolo') ?? '';
    case 'incarico.created':
    case 'incarico.removed':
      return str('ruolo') ?? '';
    case 'edizione.piano_assegnato':
      return num('n_iscrizioni') != null ? `${num('n_iscrizioni')} iscrizioni` : '';
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
    case 'ordine.created':
    case 'ordine.paid':
    case 'ordine.refunded':
      return [
        num('importo_centesimi') != null ? `${(num('importo_centesimi')! / 100).toFixed(2).replace('.', ',')} €` : null,
        num('sconto_centesimi') ? `sconto ${(num('sconto_centesimi')! / 100).toFixed(2).replace('.', ',')} €` : null,
      ].filter(Boolean).join(' · ');
    case 'ordine.cancelled':
      return str('motivo') === 'sostituito' ? 'sostituito da un nuovo ordine' : str('motivo') === 'sessione_scaduta' ? 'pagamento non completato' : '';
    case 'offerta.created':
    case 'offerta.updated':
    case 'offerta.published':
    case 'offerta.withdrawn':
      return str('slug') ?? '';
    case 'attestato.emesso':
      return [str('numero') ? `n. ${str('numero')}` : null, p.automatico === true ? 'automatico' : 'manuale', str('sostituisce') ? 'riemissione' : null].filter(Boolean).join(' · ');
    case 'attestato.sostituito':
      return [str('numero_nuovo') ? `sostituito dal n. ${str('numero_nuovo')}` : null, str('motivazione')].filter(Boolean).join(' · ');
    case 'ente.updated':
    case 'persona.updated':
    case 'azienda.updated':
    case 'piano.updated':
      return Array.isArray(p.campi) ? (p.campi as string[]).join(', ') : '';
    case 'corso.archived':
    case 'corso.unarchived':
    case 'categoria.created':
    case 'categoria.updated':
    case 'categoria.removed':
      return str('titolo') ?? '';
    case 'azienda.unita':
      return num('n_iscrizioni') != null ? `${num('n_iscrizioni')} iscrizioni spostate` : '';
    default:
      return '';
  }
}
