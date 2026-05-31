# Redesign area ADMIN — brief & prompt per Claude Design

> Stato: **in attesa del mockup**. Approccio concordato: **mockup-first**.
> Quando il mockup HTML è pronto, riprendere da `CLAUDE.md` → sezione
> "Prossima sessione: redesign area admin".

## Decisioni ratificate con l'utente (2026-05-31)
1. **Mockup-first**: l'utente genera il mockup su Claude Design; Claude Code lo
   decodifica (come per il discente) e allinea dati/funzioni reali.
2. **Corso-first (ibrido)**: il corso è lo spazio di lavoro principale; i contenuti
   si creano/aggiungono *dentro* il builder. La libreria LO resta ma arricchita.
3. **Dashboard sì**: home `/admin` con panoramica + azioni rapide (oggi `/admin`
   fa solo `redirect` a Learning Objects).

## Vincoli del dominio da rispettare nel mockup
- La **durata** dei video è già disponibile (`learning_object.config.durata_secondi`).
- Il corso si **congela alla prima Edizione** (D22): campi strutturali e Struttura in
  sola lettura; la **copertina** (nuova) sarà un campo *non* strutturale, modificabile
  anche dopo il freeze.
- Gli **LO sono riusabili** tra più corsi; ordine/obbligatorio/regola vivono sulla riga
  di Struttura del corso, non sull'LO (D24/D25).
- Niente PII nel log eventi; gli upload vanno su Supabase Storage per-tenant.

---

## PROMPT DA INCOLLARE SU CLAUDE DESIGN

Copia-incolla il blocco seguente in Claude Design (eventualmente allega uno screenshot
dell'attuale UI discente in tema "Atlante" come riferimento di stile).

```
Crea una simulazione interattiva (HTML) dell'AREA AMMINISTRATORE di una piattaforma
e-learning italiana chiamata "FAD — Formazione a distanza". L'app reale è già costruita
con un tema chiamato "Atlante": rispettalo fedelmente.

TEMA "ATLANTE" (editoriale/scientifico, look strutturale):
- Superfici: sfondo #eeece6, pannelli #f8f6ee, superficie-2 #e6e3d9.
- Inchiostro: testo #171c25, secondario #3c424f, tenue #6e7480.
- Bordi: #d2cebd e #b5b0a0 (i bordi definiscono i blocchi: usa BORDI, non ombre morbide).
- Primary teal #1c504f, accento ocra #b07c1f, errore #8a2828.
- Font: Geist (UI), Bricolage Grotesque (titoli/display), IBM Plex Mono (codici/etichette).
- Radii piccoli (3–8px). Chip rettangolari in mono MAIUSCOLO. Tabelle dense ad alta
  leggibilità. Spaziature ordinate, niente effetti vistosi.
- Layout con SIDEBAR a sinistra (brand "FAD" + voci di menu) e area contenuto a destra.

RUOLO: amministratore/formatore che gestisce molti corsi. L'impostazione deve reggere
con TANTI contenuti (ricerca e filtri ovunque servano).

SIDEBAR (voci): Dashboard, Corsi, Contenuti (libreria), Sessioni, Report fondi.

SCHERMATE DA PROGETTARE:

1) DASHBOARD (home admin)
   - KPI in alto: Corsi totali, Edizioni attive, Iscritti, Sessioni imminenti.
   - Azioni rapide: "Nuovo corso", "Carica contenuto".
   - Elenco "Corsi recenti" e un riquadro "Attività recente".

2) CORSI — lista
   - Griglia/righe di corsi con IMMAGINE DI COPERTINA, titolo, breve descrizione,
     n° di oggetti didattici, n° di edizioni, e stato (chip "Bozza" oppure "Congelato").
   - Barra con RICERCA + filtri (stato, con/senza edizioni) e ordinamento.
   - Pulsante "Nuovo corso".

3) COURSE BUILDER — crea/modifica corso (LA SCHERMATA PIÙ IMPORTANTE)
   Organizzata in sezioni/step chiari:
   - Dati corso: titolo, descrizione, UPLOAD IMMAGINE DI COPERTINA (area drag-and-drop
     con anteprima), toggle "Sblocco sequenziale".
   - Struttura del corso: elenco degli oggetti didattici RIORDINABILE IN DRAG-AND-DROP;
     per ogni riga mostra: indice, titolo, tipo (Video/PDF), durata, regola di
     completamento in linguaggio umano ("Visione integrale" / "Lettura integrale"),
     toggle "Obbligatorio", azione "Rimuovi".
   - Aggiungi contenuto: DUE modalità affiancate:
       a) "Crea nuovo": form per Video (ID Vimeo + durata) oppure Documento (upload PDF);
       b) "Aggiungi da libreria": elenco con RICERCA e filtri per riusare contenuti esistenti.
   - Edizioni: tabella delle edizioni (codice, stato, date) + form "Nuova edizione".
     Mostra anche lo stato "CORSO CONGELATO" (banner sobrio in tema): quando il corso ha
     almeno un'edizione, i campi struttura sono in sola lettura (ma la copertina resta
     modificabile).

4) CONTENUTI — libreria (Learning Object) arricchita
   - RICERCA per titolo + filtri per Tipo (Video/PDF) e Stato (Attivi/Archiviati) + ordinamento.
   - Layout DENSO (tabella o griglia compatta) con: titolo, tipo, durata (per i video,
     formato mm:ss), miniatura/segnaposto, e un badge "Usato in N corsi".
   - Azioni: nuovo contenuto, archivia.

5) (Opzionale) SESSIONI e REPORT FONDI: versioni rifinite nello stesso tema, con tabelle
   pulite. Linguaggio semplice e professionale (niente sigle tecniche tipo "D30").

STATI DA MOSTRARE: trascinamento per il riordino, dropzone immagine con anteprima,
stati vuoti ("nessun corso ancora"), corso congelato.

Rendi la simulazione NAVIGABILE tra le schermate (sidebar + link). Tutto in ITALIANO.
Dati di esempio realistici (corsi su sicurezza sul lavoro, privacy/GDPR, antincendio).
```

---

## Cosa farà Claude Code dopo il mockup (sintesi tecnica)
- Decodifica del bundle (blob gzip+base64 in `__bundler/manifest`, template json-escaped).
- Migration: `corso.immagine_url` (campo non strutturale) + bucket Storage `copertine`
  (lettura pubblica/tenant, scrittura admin) con RLS, sul modello del bucket `documenti`.
- Libreria LO con ricerca/filtri/ordinamento + "usato in N corsi" (da `struttura_corso`)
  + durata formattata.
- Course builder corso-first in tema Atlante: drag-and-drop (riuso RPC `reorder_struttura`),
  creazione contenuti inline (`/api/admin/learning-objects` + upload), "aggiungi da libreria".
  Regola via `regolaLabel()` (`compliance.ts`), stati edizione via `edizioneStato()`.
- Dashboard `/admin` con contatori + azioni rapide.
- Refactor Atlante anche di Sessioni e Report fondi.
- Verifica: typecheck + build + `test:fase4` 15/15; migration sul live via MCP; UI nel browser.
