# Brief Fase 3 — Fetta webinar (pipeline presenze + adattatori) — da consegnare a Claude Code

> **Cos'è questo documento.** È il mandato operativo per la **Fase 3** dello Step 4
> (sviluppo in Claude Code) della piattaforma e-learning. Definisce *cosa* costruire,
> *in che ordine*, e i *criteri di accettazione* delle due milestone M3a e M3.
>
> **Fonte autoritativa.** Il documento di riferimento è
> `piattaforma-elearning-stato-progetto-v7.md` (decisioni D1–D35, dettaglio
> campo-per-campo, diagramma ER) e la "Roadmap a fasi — Step 4". In caso di conflitto,
> **fa fede quello**. Questo brief non re-decide nulla: traduce in lavoro la Fase 3 della
> roadmap, dopo la chiusura della Fase 2 (assemblatore + LO completi).
>
> **Stato di partenza assunto.** Fase 1 chiusa (fetta FAD end-to-end, log append-only,
> RLS, autenticazione) e Fase 2 chiusa (assemblatore di corsi, LO `documento` su Supabase
> Storage, sblocco sequenziale lato server, congelamento della struttura del corso dopo la
> prima edizione). Le entità Tenant, Persona, Corso, LO, Struttura del corso, Edizione,
> Iscrizione (con cache di compliance), Stream di audit ed Evento esistono e funzionano.

---

## 1. Obiettivo della Fase 3

Consegnare **la fetta verticale webinar funzionante end-to-end**:

```
sessione VCS pianificata → report di partecipazione (CSV, poi API Teams)
   → grezzo write-once → riconciliazione → Eventi di presenza nel log
   → report di audit (gli stessi due della Fase 1) li rispecchiano
```

Costruendola si tirano su per forza le entità mancanti del Gruppo 3 (Sessione, Incarico,
Azienda, Piano formativo finanziato) e l'entità Report di partecipazione grezzo del
Gruppo 4. La Fase 3 chiude la spina dorsale di **tracciamento presenze** della piattaforma:
da qui in poi i fondi hanno tutti gli eventi che servono al loro report (Fase 4).

**Principio guida:** una **pipeline unica** (normalizza → riconcilia → scrive Eventi nel
log) con **adattatori intercambiabili** davanti (D7). La pipeline si costruisce una volta
sola; CSV e API Teams sono solo due bocche di ingresso diverse.

---

## 2. Principi non negoziabili

1. **Lo scope creep è il rischio n.1 (D3).** Tutto ciò che è nella sezione "Cosa NON
   costruire" resta fuori, anche se sembra facile o utile. In caso di dubbio: non
   costruirlo, segnalalo come domanda.
2. **Il log resta la fonte di verità (D8).** Le presenze webinar sono **Eventi**, non
   colonne di stato. Il report di completamento e la cache di compliance restano cache
   derivate dagli Eventi.
3. **Mai INSERT diretto in `evento`.** Ogni presenza, ogni import, ogni correzione manuale
   passa per la **funzione di append serializzato** del Task 2 della Fase 1. Nessuna
   eccezione.
4. **Grezzo write-once (D20).** Il Report di partecipazione grezzo è prova: UPDATE/DELETE
   bloccati a livello DB, esattamente come `evento`. Né la riconciliazione né le correzioni
   manuali toccano mai il grezzo — scrivono *nuovi* Eventi.
5. **Mai PII nel log (D18).** Il grezzo contiene nomi/email dei partecipanti perché servono
   a riconciliare (D20 lo legittima esplicitamente come prova-staging). Ma il `payload`
   degli Eventi *non* li replica: gli attori sono `id` pseudonimi, esattamente come in
   Fase 1.
6. **Un solo stream per tenant (D11/D19).** Anche gli Eventi della Fase 3 atterrano
   sullo stream unico esistente. Niente `scope_type`/`scope_id`.

---

## 3. Cosa costruire — scope IN

- **Nuove entità del Gruppo 3** (con `tenant_id` + RLS, D2): **Azienda**, **Piano formativo
  finanziato**, **Sessione**, **Incarico**. Sull'Iscrizione si abilitano le due FK già
  previste `azienda_id` e `piano_id` (D9/D27/D33) — il campo `email_riconciliazione`
  (D17/D33) c'è già dalla Fase 1, qui inizia a venire usato.
- **Entità Report di partecipazione grezzo** (D20): write-once, una Sessione può averne
  più d'uno (es. API + CSV di fallback).
- **Pipeline unica di ingestione presenze** (D7): tre stadi indipendenti dall'adattatore —
  *(a)* persistenza del grezzo con permessi DB che impediscono UPDATE/DELETE, *(b)* Evento
  di import con `payload.hash` = hash del `contenuto` del grezzo (D20), *(c)*
  riconciliazione che legge il grezzo e scrive Eventi di presenza nel log.
- **Adattatore CSV** (primo): parser + mappatura colonne configurabile; nessuna dipendenza
  esterna, parte subito.
- **Algoritmo di riconciliazione**: match via `Iscrizione.email_riconciliazione` con
  fallback su `Persona.email`; gestione esplicita di **match ambigui** (più iscritti
  candidati, o nessun candidato per una riga) e di **partecipanti anonimi** (righe del
  grezzo senza email o con nome non identificabile).
- **UI di risoluzione dei match ambigui** nell'area admin: lista delle righe non
  riconciliate, scelta dell'iscritto corretto (o "ignora"), scrittura di Eventi di
  presenza (o di "non riconciliato") con motivazione.
- **Inserimento e correzione manuale delle presenze** (D7): admin può aggiungere o
  correggere una presenza con **motivazione obbligatoria**; ogni atto è un Evento, mai un
  UPDATE.
- **Adattatore API Teams** (secondo): scarica il report di partecipazione di una riunione
  identificata da `Sessione.vcs_meeting_id`, lo passa alla pipeline come grezzo
  `fonte = api_teams`. Richiede il setup una-tantum del Task 6.
- **Schermate dell'admin webinar**: pianificazione Sessione VCS, lista delle Sessioni di
  un'edizione, importa CSV, "scarica da Teams", risolvi match ambigui, inserimento manuale.

---

## 4. Cosa NON costruire — scope OUT (guard rail anti scope-creep)

Niente di tutto questo entra nella Fase 3.

- **Generatore di report fondi** (Fondimpresa, FonCoop/GIFCOOP) → Fase 4. In Fase 3 si
  producono gli Eventi *che alimenteranno* quel generatore, non il generatore stesso.
- **Feature Attestato** (generazione materiale, documento congelato, `Attestato.hash`)
  → Fase 5.
- **Adattatore API Zoom**. D7 menziona Zoom come scenario possibile e l'enum
  `Report.fonte` ammette `api_zoom`; *implementarlo* resta fuori dalla Fase 3 (solo Teams).
  Se si presenta una riunione su Zoom, si usa il CSV.
- **Co-docenza / staff multiplo per Sessione** (D30): la Sessione ha un solo
  `incarico_id` nullable. Quando servirà sarà una tabella-ponte additiva.
- **Qualifiche docente / satellite di accreditamento formatori** (D31).
- **Multi-stream**: stesso stream unico per tenant (D11/D19), nessun `scope_type`/`scope_id`.
- **Aziende multi-sede / unità produttiva**: una sola sede sull'Azienda per ora.
- **Verifica "iscritto finanziato ⇒ azienda aderente al fondo"** (D33): non è un campo
  né un controllo della pipeline, è una validazione del generatore di report (Fase 4).
- **Branding multi-tenant avanzato, forum, AI tutor/RAG, Open Badges, integrazioni
  Teams/Slack-native** → fuori dal Blocco 1.
- **Quiz e tabelle satellite domande/risposte** (D23), **moduli/sezioni** nella Struttura
  del corso (D25), **SCORM** (D5).

Se durante lo sviluppo emerge la tentazione di costruire una di queste cose "perché
serve", **fermati e segnalalo** invece di farlo.

---

## 5. Ordine di costruzione

Sei task in sequenza, con **M3a** dopo il Task 4 (pipeline funzionante via CSV) e **M3**
dopo il Task 6 (pipeline funzionante anche via API Teams).

### Task 1 — Estensioni di schema del Gruppo 3 + entità grezzo
Migration che aggiunge **Azienda**, **Piano formativo finanziato**, **Sessione**,
**Incarico**, **Report di partecipazione grezzo** (vedi §6). Ognuna con `tenant_id` NOT
NULL e RLS attiva nella stessa migration (D2). Sul **Report di partecipazione grezzo**:
revoca a livello DB dei permessi UPDATE/DELETE (stessa tecnica della tabella `evento`,
D20). Seed minimo: un'Azienda, un Piano, un'Edizione blended con almeno **una Sessione
VCS** (`modalita = vcs`, `vcs_piattaforma = teams`, `vcs_meeting_id` plausibile), un
Incarico docente, alcuni Iscritti con `email_riconciliazione` valorizzata e almeno uno
*senza* — per esercitare il fallback.

### Task 2 — Pipeline unica (stadi a-b-c)
**Stadio (a) — Ingestione del grezzo.** Endpoint/funzione che riceve un payload normalizzato
dall'adattatore (Sessione di destinazione + `fonte` + `contenuto` + `importato_da`
opzionale), inserisce la riga in `report_partecipazione_grezzo`. È l'unico punto che scrive
sulla tabella; nessun altro path.
**Stadio (b) — Evento di import.** Calcola `hash(contenuto)` con la stessa serializzazione
canonica di D18 e scrive un **Evento `report_grezzo_importato`** (`subject_type` = grezzo,
`subject_id` = id della riga grezzo, `payload.fonte`, `payload.hash`) passando per la
funzione di append della Fase 1 (mai INSERT diretto). È la hash-chain ad attestare
l'integrità del grezzo (D20).
**Stadio (c) — Riconciliazione.** Funzione che legge il `contenuto` del grezzo, applica
l'algoritmo del Task 4, e scrive **Eventi di presenza** (es. `presenza_webinar_registrata`)
e/o **Eventi di non-riconciliazione** (es. `partecipante_non_riconciliato`) — sempre via
append. La pipeline è agnostica rispetto all'adattatore: stesso path per CSV e API Teams.

### Task 3 — Adattatore CSV
Endpoint admin di upload + parser CSV + mappatura colonne configurabile (chiavi attese:
nome partecipante, email, join/leave timestamps, durata). Chiama la pipeline del Task 2
con `fonte = csv` e `importato_da` = id pseudonimo della Persona admin che ha caricato il
file. Nessun valore di default fragile: se una colonna chiave manca, errore esplicito
all'admin **prima** di toccare il grezzo.

### Task 4 — Algoritmo di riconciliazione + risoluzione ambigui  →  **gate M3a**
Algoritmo di match: per ogni riga del grezzo della Sessione, cerca un'Iscrizione attiva
sull'edizione cui appartiene la Sessione, **prima** per `Iscrizione.email_riconciliazione`,
**poi** (se nulla) per `Persona.email` via JOIN sull'iscritto (D17/D33). Casi:
- **match esatto** (1 candidato): scrive `presenza_webinar_registrata` con `actor` /
  `subject` pseudonimi e `payload` privo di PII (join/leave ts, durata, riga grezzo
  riferita per id).
- **match ambiguo** (n candidati ≥ 2) o **match assente** (0 candidati su una riga con
  email plausibile): la riga viene messa in **coda di risoluzione**; nessun Evento di
  presenza emesso finché un admin non sceglie.
- **partecipante anonimo** (riga senza email, o con nome non identificabile): si emette
  un Evento `partecipante_non_riconciliato` con un identificatore stabile derivato dalla
  riga (es. hash dei campi normalizzati), così che resti tracciato senza inventare una
  Persona. La riga *resta* nel grezzo (è prova).
UI admin della coda di risoluzione: per ogni riga, scegliere l'iscritto corretto (→ scrive
l'Evento di presenza con `payload.risolto_da` pseudonimo e `payload.motivazione`) o
"ignora definitivamente" (→ scrive `partecipante_non_riconciliato`). Le scelte sono Eventi,
non UPDATE.
> ⛔ **Stop & verify (M3a).** Verificare i criteri M3a (§8) *prima* di costruire
> l'adattatore Teams. Se la riconciliazione non regge o il grezzo non è davvero immutabile,
> aggiungere l'API Teams sopra peggiorerebbe solo i sintomi.

### Task 5 — Inserimento e correzione manuale delle presenze
Form admin per: aggiungere una presenza mancante (es. partecipante autenticato in
chiamata, ma fuori dal report Teams) o correggere una presenza esistente (es. orario di
join sbagliato in un CSV). **Motivazione obbligatoria.** Ogni atto è un **Evento**
(`presenza_inserita_manualmente` / `presenza_corretta_manualmente`) con `payload.motivazione`
e riferimento all'Evento precedente quando si tratta di correzione. Mai UPDATE su Eventi
esistenti — la correzione è un Evento successivo che li *sostituisce semanticamente*; la
ricostruzione dello stato gestisce la sostituzione dal log.

### Task 6 — Setup Teams + adattatore API Teams  →  **gate M3**
**Setup una-tantum** (non sviluppo, ma prerequisito): registrazione dell'app su Azure AD,
consenso admin sul tenant M365, policy di accesso, segreti gestiti via env (no commit).
È un'attività di runbook, da eseguire prima del codice del Task 6.
**Adattatore API Teams**: per una `Sessione` con `vcs_piattaforma = teams` e
`vcs_meeting_id` valorizzato, recupera il report di partecipazione via Graph API, lo
normalizza nella stessa shape del CSV, lo passa alla pipeline del Task 2 con
`fonte = api_teams` e `importato_da` = `NULL` (import automatico — D20). Riconciliazione e
risoluzione ambigui sono ereditate dal Task 4: stesso path, niente codice nuovo.
> ✅ Alla fine del Task 6 si valuta **M3** (§9): go / correggi lo scope / no-go.

---

## 6. Schema dati — entità nuove o estese in Fase 3

Tutte con `tenant_id` NOT NULL + RLS. Per i campi completi vedi il dettaglio
campo-per-campo nel documento v7.

| Entità | Stato | Ruolo nella Fase 3 | Note |
|---|---|---|---|
| **Azienda** | nuova | l'azienda cliente destinataria della formazione | identificata da P.IVA, ATECO in anagrafica (D16); FK opzionale da Iscrizione (D9) |
| **Piano formativo finanziato** | nuova | bando/piano cui le Iscrizioni possono essere imputate | nessuna FK diretta a Edizione (D27); contabilità di dettaglio fuori scope (D32) |
| **Sessione** | nuova | un evento sincrono datato (aula o VCS) dentro un'Edizione | `modalita ∈ {aula, vcs}` (niente `fad`); `vcs_piattaforma` + `vcs_meeting_id` usati dall'adattatore API; `incarico_id` nullable verso il docente di giornata (D30) |
| **Incarico** | nuova | lega Persona ↔ Edizione con ruolo ASR | enum `docente \| tutor_contenuto \| tutor_processo \| responsabile_progetto`; staff multiplo additivo (D30); qualifiche fuori scope (D31) |
| **Report di partecipazione grezzo** | nuova | prova write-once dell'import | `fonte ∈ {api_teams, api_zoom, csv}`; `contenuto` jsonb con le righe come ricevute; UPDATE/DELETE revocati a livello DB (D20) |
| **Iscrizione** | estesa | le FK `azienda_id` / `piano_id` cominciano ad essere valorizzate | nessun cambio di schema: i campi esistono dalla Fase 1 (D9/D27/D33) |
| **Evento** | invariata | accoglie i nuovi `event_type` di Fase 3 | nessuna PII nel payload (D18); append serializzato sullo stream unico (D11/D19) |

**Tipi di Evento introdotti nella Fase 3** (lista non esaustiva, da finalizzare nello
schema applicativo): `report_grezzo_importato`, `presenza_webinar_registrata`,
`partecipante_non_riconciliato`, `match_risolto_manualmente`,
`presenza_inserita_manualmente`, `presenza_corretta_manualmente`,
`sessione_annullata` (se serve modellare il rinvio).

**Fuori dallo schema della Fase 3:** Attestato (Fase 5). Niente tabella-ponte
Sessione↔Incarico per la co-docenza (D30). Niente satellite qualifiche docente (D31).

---

## 7. Decisioni vincolanti da rispettare

- **D2** — `tenant_id` su ogni tabella nuova + RLS Postgres attiva nella stessa migration.
- **D7** — pipeline unica con adattatori intercambiabili; manuale dal giorno 1; **CSV
  prima, API Teams dopo**.
- **D8** — le presenze sono Eventi, non stato; la cache di compliance sull'Iscrizione si
  ricalcola dagli Eventi (e quel ricalcolo va aggiornato per riconoscere anche i nuovi
  `event_type` di presenza webinar).
- **D11 / D18 / D19** — append serializzato sullo stream unico; mai PII nel payload
  Eventi; hash su serializzazione canonica.
- **D17 / D33** — `Iscrizione.email_riconciliazione` come chiave di match, con fallback
  su `Persona.email`.
- **D20** — Report di partecipazione grezzo write-once; Evento di import porta
  `payload.hash = hash(contenuto)`; più report grezzi per Sessione sono ammessi (API +
  CSV di fallback).
- **D29** — Edizione: `concluso_at`/`annullato_at` come timestamp nullable; i dati a
  valle si congelano da `concluso_at` in poi.
- **D30** — la Sessione ha un solo `incarico_id` nullable, vincolato a stessa Edizione e
  ruolo didattico; co-docenza fuori scope.

---

## 8. Milestone M3a — checkpoint interno (pipeline + CSV reggono)

Da verificare **alla fine del Task 4, prima di costruire l'adattatore Teams**. Tutti i
criteri devono passare con un test esplicito e riproducibile.

1. **Grezzo immutabile.** Un `UPDATE` e un `DELETE` su `report_partecipazione_grezzo`
   falliscono a livello DB anche eseguiti dal ruolo applicativo. Esiste un test che lo
   dimostra.
2. **Import attestato.** Ogni import via CSV produce esattamente **un** Evento
   `report_grezzo_importato` con `payload.hash` = hash del `contenuto`. Riapplicando il
   ricalcolo dell'hash sul grezzo si ottiene lo stesso valore; modificando un byte del
   `contenuto` simulato (in una copia di test) il valore cambia.
3. **No INSERT diretto.** Nessun path nel codice di Fase 3 inserisce in `evento` senza
   passare per la funzione di append della Fase 1. Cercare nel codice
   `INSERT INTO evento` rende solo la funzione di append.
4. **Match esatto.** Una riga del grezzo con email corrispondente a una sola
   `Iscrizione.email_riconciliazione` produce esattamente un Evento
   `presenza_webinar_registrata` con `actor`/`subject` pseudonimi e `payload` senza PII
   (no nome, no email).
5. **Match ambiguo.** Una riga del grezzo che matcha **due** iscritti **non** produce un
   Evento di presenza automatico: finisce in coda di risoluzione. Una volta risolta dall'admin
   produce un Evento di presenza più un Evento `match_risolto_manualmente` con motivazione.
6. **Partecipante anonimo.** Una riga del grezzo priva di email produce un Evento
   `partecipante_non_riconciliato` con un identificatore stabile derivato dalla riga; il
   nome del partecipante **non** compare nel `payload`.
7. **Correzione manuale.** Una correzione manuale di una presenza produce un nuovo
   Evento con `payload.motivazione` valorizzata e riferimento all'Evento precedente.
   L'Evento precedente è **invariato**.
8. **Stream unico.** Tutti i nuovi Eventi di Fase 3 atterrano sullo stesso `stream_id`
   degli Eventi di Fase 1/2; nessun nuovo stream creato.
9. **Cache di compliance ricalcolata.** Svuotando `ore_frequentate` /
   `frequenza_percentuale` / `completato` sull'Iscrizione di un discente che ha presenze
   webinar, il ricalcolo dagli Eventi riproduce i valori corretti.

> Se anche solo uno di questi criteri non passa: **stop**. Si ripensa il pezzo
> incriminato prima di aggiungere l'API Teams.

---

## 9. Milestone M3 — go/no-go (la fetta webinar gira end-to-end con API Teams)

Da valutare **alla fine del Task 6**. È il punto in cui si decide se proseguire alla
Fase 4, correggere lo scope, o fermarsi.

1. **Slice end-to-end via API.** Per una Sessione VCS reale, l'admin clicca "scarica da
   Teams" → il report di partecipazione arriva → il grezzo è salvato write-once →
   l'Evento di import porta l'hash del contenuto → la riconciliazione genera gli Eventi di
   presenza (e di non-riconciliazione dove serve) → il *report log eventi* dell'auditor li
   mostra → il *report completamento attività* dell'auditor li conta verso la frequenza.
2. **Stessa slice via CSV.** L'intero punto 1 funziona anche partendo da un CSV caricato
   manualmente, percorrendo la stessa pipeline. Per la stessa Sessione possono coesistere
   più grezzi (es. CSV di fallback + API).
3. **Criteri M3a non regrediti.** Tutti i criteri M3a continuano a reggere sotto il
   traffico reale generato dalla slice (in particolare immutabilità del grezzo, append
   serializzato, no PII nel log).
4. **Isolamento tenant.** Un tentativo di leggere righe di un grezzo, di una Sessione o di
   un Incarico di un altro `tenant_id` è bloccato da RLS a livello DB.
5. **Verifica della catena estesa.** La funzione di verifica della catena (Fase 1)
   continua a confermare l'integrità dello stream anche dopo gli Eventi di Fase 3; la
   verifica è esposta nel report *log eventi / stream grezzo* dell'auditor.
6. **Sessione senza docente assegnato.** Una Sessione con `incarico_id = NULL` (D30) è
   pianificabile e i suoi report di presenza si caricano e riconciliano correttamente;
   l'assenza di docente non blocca il flusso.

---

## 10. Da ratificare prima di iniziare

- **Teams come unica piattaforma VCS implementata in Fase 3.** D7 ammette Teams e Zoom;
  l'enum `Report.fonte` ammette `api_teams` e `api_zoom`. *Implementare* solo Teams ora.
  Se la decisione cambia, è additiva: si scriverà un secondo adattatore che chiama la
  stessa pipeline (Task 2), senza toccare il resto.
- **Setup una-tantum Teams.** Va completato (registrazione app + consenso admin + policy
  di accesso) **prima** che il codice del Task 6 abbia senso. È prerequisito esterno, va
  schedulato all'inizio della Fase 3 in parallelo ai Task 1–4 (che non ne dipendono).
- **Policy sui match ambigui: blocco + risoluzione manuale.** Orientamento forte: i match
  ambigui *non* si risolvono automaticamente. Ratificare formalmente la policy "blocco +
  admin", così il Task 4 non re-litiga la scelta a metà.
- **Policy sull'esecuzione della riconciliazione.** Orientamento: la riconciliazione gira
  **automaticamente** al momento dell'import; le righe non risolte si vedono in coda;
  l'admin può **rieseguirla** manualmente (utile dopo che l'admin ha aggiornato una
  `email_riconciliazione`). Da ratificare.
- **`stato_idoneita` automatico vs manuale** (questione aperta v7): per i corsi di sola
  presenza, l'idoneità passa automaticamente a `idoneo` al raggiungimento della soglia, o
  serve sempre un atto umano? È un dettaglio di workflow, non di schema (D34), ma va
  ratificato perché tocca cosa fa la cache di compliance al ricalcolo.

---

## 11. Note tecniche

- **Stack:** stesso della Fase 1 — Next.js + Supabase (Postgres). Nessun nuovo servizio.
- **Migrations:** ogni tabella nuova nasce con `tenant_id` NOT NULL e policy RLS nella
  stessa migration che la crea; `report_partecipazione_grezzo` ha *anche* la revoca dei
  permessi UPDATE/DELETE nella stessa migration.
- **Append degli Eventi:** sempre attraverso l'unica funzione di append della Fase 1,
  anche per tutti i nuovi `event_type` di Fase 3.
- **Hash del grezzo:** stessa logica di hashing canonico di D18 applicata al `contenuto`
  jsonb (serializzazione deterministica a chiavi ordinate). Il valore va nel
  `payload.hash` dell'Evento `report_grezzo_importato`. Nessuna colonna `hash` sulla
  tabella `report_partecipazione_grezzo` — è l'Evento ad attestare (D20).
- **API Teams:** segreti in env, mai in repo; chiamate via Microsoft Graph; gestione
  graceful di errori 4xx/5xx con retry sui transienti; il fallimento di una chiamata
  *non* lascia righe orfane nel grezzo (transazione: si scrive il grezzo solo se la
  chiamata è andata a buon fine).
- **CSV:** parser tollerante a varianti di intestazione comuni di Teams/Zoom; in caso di
  intestazioni inattese, errore esplicito all'admin prima di scrivere il grezzo.
- **Cache di compliance:** aggiornare la funzione di ricalcolo per riconoscere i nuovi
  `event_type` di presenza webinar e contarli verso `ore_frequentate` e
  `frequenza_percentuale` (D8/D33).
- **Definition of Done della Fase 3:** tutti i criteri M3a e M3 passano con test
  espliciti; la slice webinar è dimostrabile end-to-end sia via CSV sia via API Teams; lo
  scope OUT non è stato toccato.

---

## Note di implementazione (aggiunte in corso d'opera, non parte del mandato originale)

- **Scope di questa sessione Claude Code:** Tasks 1–5 fino a **M3a**, verificati sul
  Supabase live. Task 6 (adattatore API Teams) + M3 sono rinviati: richiedono il setup
  Azure AD / segreti / egress verso Microsoft Graph, che non è eseguibile dall'ambiente
  Claude Code on the web.
- **Discrepanze schema sanate nel Task 1:** il brief assumeva che
  `iscrizione.email_riconciliazione`, `ore_frequentate`, `frequenza_percentuale`
  esistessero dalla Fase 1; non c'erano. Sono state aggiunte dalla migration
  `20260527000001_fase3_gruppo3_grezzo.sql`, insieme alle FK `azienda_id`/`piano_id`
  (prima erano `uuid` nudi) e a `corso.soglia_frequenza_percentuale` (per l'idoneità
  auto alla soglia).
- **Decisioni §10 ratificate (2026-05-27):** Teams unica piattaforma VCS; match ambigui →
  blocco + risoluzione manuale; riconciliazione → automatica all'import + ri-esecuzione
  manuale; idoneità corsi di presenza → automatica al raggiungimento della soglia
  (`corso.soglia_frequenza_percentuale`).
