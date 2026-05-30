# Brief Fase 4 — Generatore di report fondi — da consegnare a Claude Code

> **Cos'è questo documento.** È il mandato operativo per la **Fase 4** dello Step 4
> (sviluppo in Claude Code) della piattaforma e-learning. Definisce *cosa* costruire,
> *in che ordine*, e i *criteri di accettazione* delle due milestone M4a e M4.
>
> **Fonte autoritativa.** Il documento di riferimento è
> `piattaforma-elearning-stato-progetto-v8.md` (decisioni D1–D37, dettaglio
> campo-per-campo, diagramma ER) e la "Roadmap a fasi — Step 4". In caso di conflitto,
> **fa fede quello**. Questo brief non re-decide nulla: traduce in lavoro la Fase 4 della
> roadmap, dopo la chiusura della Fase 3 (pipeline presenze + adattatori).
>
> **Stato di partenza assunto.** Fasi 1, 2 e 3 chiuse. Esistono e funzionano: il substrato
> (entità con `tenant_id` + RLS), il log eventi append-only con catena hash, l'autenticazione,
> i Learning Object `video` (Vimeo) e `documento` (Supabase Storage), l'assemblatore di corsi,
> lo sblocco sequenziale lato server, il congelamento della struttura del corso (D22), e —
> dalla Fase 3 — le entità Azienda, Piano formativo finanziato, Sessione, Incarico, il Report
> di partecipazione grezzo write-once e l'intera pipeline di ingestione presenze (CSV + API
> Teams). **Il log contiene già tutti gli Eventi che servono a rendicontare**: completamenti
> FAD, presenze webinar/aula, riconciliazioni, correzioni manuali. La cache di compliance
> sull'Iscrizione (`ore_frequentate`, `frequenza_percentuale`, `completato`) è ricalcolabile
> dagli Eventi. La Fase 4 **non produce nuovi Eventi di fruizione**: legge ciò che c'è e ne
> ricava un documento per il fondo.

---

## 1. Obiettivo della Fase 4

Consegnare **il generatore di report fondi funzionante end-to-end**:

```
edizione finanziata (log + anagrafica + Piano/Azienda/Iscrizioni)
   → aggregazione (vista calcolata adesso) → validazioni di conformità
   → export nel formato del fondo (Fondimpresa, poi FonCoop/GIFCOOP)
   → snapshot depositato write-once + Evento di deposito con hash nel log
```

La Fase 4 chiude la spina dorsale di **rendicontazione** della piattaforma: è il punto in cui
tutti gli Eventi accumulati nelle Fasi 1–3 diventano l'artefatto che l'ente consegna al fondo
interprofessionale. È anche il punto in cui si scioglie l'ultima questione architetturale
rimasta aperta dalle Sessioni 5–8: il **congelamento del report** (drift dell'anagrafica —
D18).

**Principio guida (eredità diretta di D7).** Un **generatore unico** (estrai → aggrega →
valida → snapshot) con **adattatori di formato intercambiabili** davanti. Il motore di
aggregazione si costruisce una volta sola; Fondimpresa e FonCoop sono solo due bocche di
uscita diverse. È lo stesso pattern della pipeline presenze della Fase 3, ribaltato dal lato
dell'output.

---

## 2. Principi non negoziabili

1. **Lo scope creep è il rischio n.1 (D3).** Tutto ciò che è nella sezione "Cosa NON
   costruire" resta fuori, anche se sembra facile o utile. In caso di dubbio: non
   costruirlo, segnalalo come domanda. **In questa fase il magnete dello scope creep è la
   contabilità di dettaglio del rendiconto** (voci di spesa, importi, co-finanziamento,
   detrazioni pro-quota): è esplicitamente fuori (D32).
2. **Il log resta la fonte di verità (D8/D18).** Il report fondo è una **vista calcolata
   adesso** dagli Eventi + anagrafica, esattamente come i due report dell'auditor (D35). Il
   generatore **non introduce uno stato di compliance proprio**: ricalcola, non memorizza un
   parallelo.
3. **Mai INSERT diretto in `evento`.** L'unico Evento prodotto dalla Fase 4 — quello di
   generazione/deposito del report — passa per la **funzione di append serializzato** della
   Fase 1. Nessuna eccezione.
4. **Report depositato write-once (D20, applicato all'output).** Lo snapshot depositato è
   prova: UPDATE/DELETE bloccati a livello DB, esattamente come `evento` e
   `report_partecipazione_grezzo`. Rigenerare un report **non modifica** lo snapshot
   precedente: produce un **nuovo** snapshot. Più snapshot per edizione/piano coesistono
   (come più grezzi per Sessione in Fase 3).
5. **PII: ammessa nel documento-output, mai nel log (D18).** Il report destinato al fondo
   **per forza** contiene nomi, codici fiscali, aziende — è un documento amministrativo. È
   come il grezzo (D20), che contiene PII perché è prova-staging. Ma l'**Evento di deposito
   nel log porta solo l'hash** del contenuto, mai i nomi: gli attori restano `id` pseudonimi.
   I nomi nel report si risolvono dall'anagrafica **al momento dello snapshot**.
6. **Un solo stream per tenant (D11/D19).** Anche l'Evento di deposito della Fase 4 atterra
   sullo stream unico esistente. Niente `scope_type`/`scope_id`.

---

## 3. Cosa costruire — scope IN

- **Motore di aggregazione (format-agnostic):** legge il log (Eventi) + anagrafica +
  Iscrizione/Piano/Azienda/Edizione/Sessione e ricostruisce, per una coppia
  **(Edizione, Piano)**, il dataset di rendicontazione:
  - per iscritto: dati anagrafici risolti **al momento** (nome, CF, email), azienda, ore
    frequentate / percentuale di frequenza / completamento (ricalcolati dagli Eventi, non
    letti ciecamente dalla cache), esito di idoneità;
  - per sessione: data, durata, modalità (`aula`/`vcs`), docente (se `incarico_id`
    valorizzato);
  - dati di testata del Piano: `fondo`, `avviso`, `canale` (Fondimpresa), `cup`,
    `codice_piano`, date (D32).
- **Validazioni di conformità (D33):** controlli che alimentano una lista di **warning**, non
  un blocco automatico — vedi §10 per la policy. Almeno:
  - **appartenenza azienda ↔ fondo**: l'iscritto a un piano finanziato dovrebbe appartenere a
    un'impresa aderente al fondo; gli iscritti che non la soddisfano vanno **segnalati** (la
    detrazione economica del relativo costo è fuori scope — D32);
  - **CUP presente** sul Piano (obbligatorio su tutti i documenti amministrativi — D32);
  - **campi obbligatori mancanti** per il formato scelto (CF assente, azienda non valorizzata
    su un'iscrizione finanziata, ecc.).
- **Adattatori di formato (due, in sequenza):**
  - **Fondimpresa** (primo): export nel formato richiesto dal fondo, parametrizzato
    sull'**avviso** dove i formati variano.
  - **FonCoop / GIFCOOP** (secondo): GIFCOOP è la *piattaforma informatica* di FonCoop, non un
    terzo fondo (Sessione 7). Stesso motore di aggregazione, secondo adattatore di formato.
- **Congelamento / deposito (D18, lo scioglimento della questione aperta):** alla
  generazione "definitiva" si crea uno **snapshot write-once** del contenuto del report e si
  scrive un Evento di deposito con `payload.hash = hash(contenuto)`. Lo snapshot è ciò che fa
  fede; la vista "live" resta consultabile e ricalcolabile, ma il documento depositato è
  immutabile.
- **Schermate admin/auditor del report fondo:** selezione (Edizione, Piano) + formato,
  anteprima della vista calcolata adesso con i warning di conformità in evidenza, generazione
  del file, "deposita" (congela lo snapshot), elenco degli snapshot depositati con verifica
  d'integrità (hash) e possibilità di **rigenerare** (nuovo snapshot, vecchi invariati).

---

## 4. Cosa NON costruire — scope OUT (guard rail anti scope-creep)

Niente di tutto questo entra nella Fase 4.

- **Contabilità di dettaglio del rendiconto** (D32): voci di spesa, importi
  preventivo/consuntivo, co-finanziamento, costo orario, **calcolo delle detrazioni
  pro-quota** per gli iscritti non conformi. Il generatore *segnala* gli iscritti non
  conformi; **non** calcola quanto va detratto. È materia amministrativa fuori dal Blocco 1.
- **Modellare il registro vidimato** (Sessione 7): è un artefatto **cartaceo ed esterno**.
  FonCoop tiene il registro per edizione, Fondimpresa a fogli vidimati pagina per pagina; non
  concordano nemmeno sulla granularità. La piattaforma **produce il report che accompagna il
  registro**, non lo sostituisce e non lo modella. Nessun campo "registro vidimato".
- **Invio/deposito automatico verso i portali dei fondi** (upload su GIFCOOP o sul portale
  Fondimpresa via loro API/RPA). La Fase 4 **produce il file**; il caricamento sul portale del
  fondo resta un'azione manuale dell'ente — salvo ratifica diversa (§10).
- **Feature Attestato** (generazione materiale, documento congelato, `Attestato.hash`)
  → Fase 5.
- **Nuovi Eventi di fruizione.** La Fase 4 non registra presenze né completamenti: quelli
  arrivano dalle Fasi 1–3. L'unico Evento che scrive è quello di deposito del report.
- **Adattatore API Zoom** (D7), **co-docenza / staff multiplo** (D30), **qualifiche docente**
  (D31), **aziende multi-sede / unità produttiva**, **multi-stream** (D11/D19): invariati,
  fuori scope come nelle fasi precedenti.
- **Branding multi-tenant avanzato, forum, AI tutor/RAG, Open Badges** → fuori dal Blocco 1.

Se durante lo sviluppo emerge la tentazione di costruire una di queste cose "perché serve",
**fermati e segnalalo** invece di farlo. In particolare: se per "completare" un formato
sembra necessario aggiungere importi o voci di spesa, **è il segnale che stai uscendo dallo
scope** — fermati.

---

## 5. Ordine di costruzione

Sei task in sequenza, con **M4a** dopo il Task 4 (primo formato funzionante end-to-end) e
**M4** dopo il Task 6 (secondo formato + congelamento).

### Task 1 — Schema dell'entità Report fondo depositato
Migration che aggiunge l'entità **Report fondo depositato** (vedi §6), con `tenant_id` NOT
NULL e RLS attiva nella stessa migration (D2), e — come per `report_partecipazione_grezzo` —
**revoca a livello DB dei permessi UPDATE/DELETE** (stessa tecnica della tabella `evento`,
D20). Nessun cambio di schema sulle altre entità: il generatore *legge* Piano, Azienda,
Sessione, Incarico, Iscrizione, Evento così come sono. Seed: si assume disponibile (dalla
Fase 3) almeno **un'Edizione finanziata reale** — un Piano con `fondo`, `cup`, `avviso`
valorizzati, Iscrizioni con `azienda_id`/`piano_id`, Sessioni con presenze nel log e almeno un
iscritto FAD completato.

### Task 2 — Motore di aggregazione (format-agnostic)
Funzione che, data una coppia (Edizione, Piano), ricostruisce il dataset di rendicontazione
**dagli Eventi** (non dalla sola cache): risolve l'anagrafica al momento, aggrega ore e
percentuali di frequenza per iscritto, raccoglie le sessioni e i relativi docenti, monta la
testata del Piano. È il cuore della fase e non sa nulla del formato di destinazione: produce
una struttura dati intermedia, neutra, che gli adattatori traducono.

### Task 3 — Validazioni di conformità (D33)
Sopra il dataset del Task 2, calcola la lista di warning di conformità (appartenenza
azienda↔fondo, CUP presente, campi obbligatori mancanti). Output: warning **bloccanti** vs
**non bloccanti** (policy in §10). I warning si vedono nell'anteprima prima della
generazione; non producono Eventi.

### Task 4 — Adattatore formato Fondimpresa  →  **gate M4a**
Primo adattatore: traduce il dataset neutro nel formato richiesto da Fondimpresa, nel/i
formato/i file previsto/i dalla loro documentazione **aggiornata** (vedi §10 — non andare a
memoria). Parametrizzato sull'avviso dove serve. Alla fine, il primo formato gira end-to-end:
estrai → aggrega → valida → export.

> ⛔ **Stop & verify (M4a).** Verificare i criteri M4a (§8) *prima* di costruire il secondo
> formato e il congelamento. Se i numeri non riconciliano col report di completamento
> dell'auditor, o se compare PII nell'Evento, aggiungere il secondo formato sopra
> peggiorerebbe solo i sintomi.

### Task 5 — Adattatore formato FonCoop / GIFCOOP
Secondo adattatore sullo **stesso** motore di aggregazione. Nessun codice nuovo nel motore:
solo la traduzione del dataset neutro nel formato FonCoop. Conferma che l'architettura
"motore unico + adattatori" regge: il secondo formato non deve costringere a rimaneggiare il
Task 2.

### Task 6 — Congelamento / deposito  →  **gate M4**
Generazione "definitiva": si serializza il contenuto del report in uno **snapshot write-once**
(`report_fondo_depositato`), si calcola `hash(contenuto)` con la serializzazione canonica di
D18 e si scrive un Evento `report_fondo_depositato` (`subject` = lo snapshot, `payload.hash`,
`payload.fondo`, `payload.formato`, `payload.edizione_id`, `payload.piano_id`) **via la
funzione di append della Fase 1**. La UI espone gli snapshot depositati, la verifica
d'integrità e il pulsante "rigenera" (→ nuovo snapshot, i precedenti invariati).

> ✅ Alla fine del Task 6 si valuta **M4** (§9): go / correggi lo scope / no-go.

---

## 6. Schema dati — entità nuove o estese in Fase 4

Tutte con `tenant_id` NOT NULL + RLS. Per i campi delle entità esistenti vedi il dettaglio
campo-per-campo nel documento v8.

| Entità | Stato | Ruolo nella Fase 4 | Note |
|---|---|---|---|
| **Report fondo depositato** | nuova | snapshot write-once del report consegnato al fondo | `contenuto` jsonb (o riferimento al file generato) con i dati *risolti al momento dello snapshot*; `fondo`, `formato`, `edizione_id`, `piano_id`, `generato_da` pseudonimo, `generato_at`; UPDATE/DELETE revocati a livello DB (D20). Più snapshot per (Edizione, Piano) ammessi |
| **Piano formativo finanziato** | letta | testata della rendicontazione | `fondo`, `avviso`, `canale`, `cup`, `codice_piano`, date, `chiuso_at` (D32); nessuna FK diretta a Edizione (D27) |
| **Azienda** | letta | impresa dell'iscritto, base della validazione appartenenza | P.IVA, ATECO (D16) |
| **Iscrizione** | letta | righe del report; `azienda_id`/`piano_id` valorizzati in Fase 3 | cache di compliance ricalcolabile dagli Eventi (D8); `email_riconciliazione` non rilevante qui |
| **Sessione / Incarico** | lette | sessioni rendicontate + docente di giornata | `modalita ∈ {aula, vcs}`; `incarico_id` nullable (D30) |
| **Evento** | invariata | sorgente del dataset + accoglie l'Evento di deposito | nessuna PII nel payload (D18); append serializzato sullo stream unico (D11/D19) |

**Tipi di Evento introdotti nella Fase 4** (lista non esaustiva, da finalizzare nello schema
applicativo): `report_fondo_depositato` (con `payload.hash` del contenuto). Se si distingue la
*generazione* dal *deposito*, eventualmente anche `report_fondo_generato`; ma il minimo
indispensabile è **un** Evento che attesti con hash il contenuto congelato.

**Fuori dallo schema della Fase 4:** Attestato (Fase 5); qualsiasi tabella di contabilità di
dettaglio (D32); qualsiasi campo "registro vidimato" (Sessione 7); nessuna FK diretta
Piano↔Edizione (D27).

---

## 7. Decisioni vincolanti da rispettare

- **D2** — `tenant_id` sull'entità nuova + RLS Postgres attiva nella stessa migration.
- **D7** — filosofia "motore unico + adattatori intercambiabili", qui sul lato output:
  **Fondimpresa prima, FonCoop dopo**, senza toccare il motore.
- **D8 / D18** — il report è una *vista calcolata adesso* dagli Eventi + anagrafica; nessuno
  stato di compliance proprio. La cache sull'Iscrizione è un acceleratore, ma il dataset del
  report si ricostruisce dagli Eventi.
- **D11 / D19** — append serializzato sullo stream unico per l'Evento di deposito; nessun
  nuovo stream.
- **D18** — separazione PII/log: nomi e CF risolti dall'anagrafica nello snapshot; il log e il
  payload dell'Evento di deposito non li contengono, portano solo l'hash.
- **D20** — pattern write-once: lo snapshot depositato ha UPDATE/DELETE revocati a livello DB;
  è l'Evento (con `payload.hash`) ad attestarne l'integrità. Più snapshot ammessi.
- **D22** — la *metà strutturale* del problema del congelamento è già chiusa: le regole di
  completamento sono congelate alla prima edizione, quindi l'esito di compliance non cambia
  retroattivamente. La Fase 4 chiude la *metà residua*: il drift dell'anagrafica.
- **D27** — il legame al Piano vive su `Iscrizione.piano_id`; il generatore aggrega per
  (Edizione, Piano) passando per le Iscrizioni, non per una FK Piano↔Edizione.
- **D32** — campi del Piano disponibili per la testata; **contabilità di dettaglio fuori
  scope**.
- **D33** — "iscritto finanziato ⇒ azienda aderente al fondo" è una **validazione del
  generatore**, non un campo né un blocco della pipeline.
- **D35** — i due report dell'auditor restano la fonte di verità interna; il report fondo è un
  terzo output derivato dalla **stessa** sorgente (log + anagrafica), non una quarta verità.

---

## 8. Milestone M4a — checkpoint interno (primo formato regge)

Da verificare **alla fine del Task 4, prima di costruire il secondo formato e il
congelamento**. Tutti i criteri devono passare con un test esplicito e riproducibile.

1. **Aggregazione fedele al log.** Il dataset di un'edizione finanziata reale è ricostruito
   **dagli Eventi**: svuotando la cache di compliance sulle Iscrizioni coinvolte, il dataset
   prodotto è identico. Esiste un test che lo dimostra.
2. **Riconciliazione con l'auditor.** Per ogni iscritto, ore/percentuale/completamento nel
   report Fondimpresa coincidono con quanto mostra il *report completamento attività*
   dell'auditor (D35). Nessun numero "inventato" dal generatore.
3. **PII solo nel documento.** Il file esportato contiene nomi/CF/aziende (è corretto: è un
   documento per il fondo). Ma nessun Evento è stato scritto nel Task 4 (la generazione non
   deposita ancora): se per debug si scrive un Evento, il suo `payload` **non** contiene PII.
4. **Formato conforme.** Il file prodotto rispetta il formato Fondimpresa **della
   documentazione aggiornata** letta in §10 (intestazioni, ordine colonne, tracciato), per
   l'avviso di riferimento del Piano seed.
5. **Warning di conformità.** Un'iscrizione finanziata con azienda non aderente / senza CUP
   sul Piano / con campo obbligatorio mancante compare nella lista warning dell'anteprima, con
   la severità corretta (bloccante vs non bloccante).
6. **Isolamento tenant.** Un tentativo di aggregare un'Edizione o un Piano di un altro
   `tenant_id` è bloccato da RLS a livello DB.

> Se anche solo uno di questi criteri non passa: **stop**. Si ripensa il pezzo incriminato
> prima di aggiungere il secondo formato e il congelamento.

---

## 9. Milestone M4 — go/no-go (il generatore gira end-to-end, due formati + congelamento)

Da valutare **alla fine del Task 6**. È il punto in cui si decide se proseguire alla Fase 5,
correggere lo scope, o fermarsi.

1. **Report conforme generato e depositato.** Per un'Edizione finanziata reale, l'admin
   seleziona (Edizione, Piano) + formato → l'anteprima mostra dati e warning → genera il file
   conforme → "deposita" crea lo snapshot write-once → l'Evento `report_fondo_depositato`
   porta l'hash del contenuto → l'auditor vede l'Evento nel *report log eventi* e può
   verificarne l'integrità.
2. **Entrambi i formati.** Lo stesso percorso funziona sia per **Fondimpresa** sia per
   **FonCoop/GIFCOOP**, sullo stesso motore di aggregazione.
3. **Snapshot immutabile.** Un `UPDATE` e un `DELETE` su `report_fondo_depositato` falliscono
   a livello DB anche dal ruolo applicativo. Esiste un test che lo dimostra.
4. **Rigenerazione additiva.** Rigenerare il report per la stessa (Edizione, Piano) crea un
   **nuovo** snapshot; il precedente è **invariato**, e il suo hash continua a verificare.
5. **Drift dell'anagrafica gestito (il cuore di D18).** Modificando un cognome
   nell'anagrafica **dopo** il deposito: lo **snapshot depositato non cambia** (riflette il
   nome al momento del deposito), mentre una **nuova** anteprima/rigenerazione "live" mostra
   il nome aggiornato. Questo dimostra che il congelamento serve e funziona.
6. **Criteri M4a non regrediti.** Tutti i criteri M4a continuano a reggere sul traffico reale
   (in particolare aggregazione dal log, riconciliazione con l'auditor, no PII nel log).
7. **Verifica della catena estesa.** La funzione di verifica della catena (Fase 1) continua a
   confermare l'integrità dello stream anche dopo l'Evento di deposito; la verifica è esposta
   nel report *log eventi / stream grezzo* dell'auditor.
8. **Edizione con sessione senza docente.** Un'Edizione finanziata che contiene una Sessione
   con `incarico_id = NULL` (D30) si rendiconta correttamente; l'assenza di docente non blocca
   la generazione.

---

## 10. Da ratificare prima di iniziare

- **Congelamento del report: SÌ — snapshot write-once al deposito.** È la questione aperta
  dalle Sessioni 5–8 che la roadmap assegna proprio a questa fase. Orientamento forte:
  **congelare**. Il report depositato è prova e fa fede; la vista "live" resta consultabile e
  ricalcolabile, ma ciò che si è consegnato al fondo è lo snapshot + il suo Evento con hash.
  La metà strutturale del problema è già chiusa da D22; qui si chiude il drift
  dell'anagrafica. Ratificare formalmente prima del Task 1 (decide l'esistenza dell'entità del
  Task 1).
- **Leggere la documentazione AGGIORNATA dei formati — non andare a memoria.** Prerequisito
  esterno (runbook), analogo al setup Teams della Fase 3, da completare **prima** del codice
  dei Task 4–5. I tracciati di Fondimpresa e FonCoop/GIFCOOP cambiano per **avviso**; vanno
  letti dalle fonti ufficiali correnti e il generatore va parametrizzato sull'avviso dove i
  formati divergono. **Schedulare questa lettura all'inizio della fase**, in parallelo ai
  Task 1–3 (che non ne dipendono).
- **Due formati, non tre.** GIFCOOP è la piattaforma informatica di FonCoop, non un terzo
  fondo (Sessione 7). I formati da implementare sono **Fondimpresa** e **FonCoop**.
- **Policy di validazione appartenenza azienda↔fondo: warning, non blocco.** Non esiste un
  campo "azienda aderente al fondo" nel modello, e il calcolo della detrazione è fuori scope
  (D32). Orientamento: gli iscritti non conformi si **segnalano** (warning non bloccante), si
  consente la generazione, la decisione resta all'operatore. Ratificare quali warning sono
  bloccanti (es. CUP mancante) e quali no.
- **Deposito sul portale del fondo: manuale.** Orientamento: la Fase 4 produce il file; il
  caricamento su GIFCOOP / portale Fondimpresa resta manuale. Se si vorrà automatizzarlo sarà
  additivo (un "adattatore di trasporto" sopra lo stesso snapshot), fuori dalla Fase 4.
  Ratificare.
- **Quale formato per primo.** Orientamento: il formato del fondo per cui esiste già
  un'**Edizione finanziata reale** con dati nel log (così M4a si verifica su dati veri).
  Confermare Fondimpresa o FonCoop come primo adattatore in base a quale edizione seed è
  disponibile.

---

## 11. Note tecniche

- **Stack:** stesso delle fasi precedenti — Next.js + Supabase (Postgres). Nessun nuovo
  servizio.
- **Modalità di lavoro:** invariata — tutto in cloud (Claude Code on the web, repo GitHub,
  deploy Vercel, DB Supabase); credenziali come variabili d'ambiente, mai in `.env` locali.
- **Migrations:** l'unica tabella nuova (`report_fondo_depositato`) nasce con `tenant_id` NOT
  NULL + policy RLS *e* la revoca dei permessi UPDATE/DELETE nella stessa migration.
- **Aggregazione dal log:** il dataset si ricostruisce dagli Eventi; la cache di compliance
  sull'Iscrizione è un acceleratore di lettura, ma il test di M4a deve dimostrare che svuotarla
  non cambia il risultato. Riusare, dove esiste, la stessa logica di ricalcolo della cache già
  scritta nelle Fasi 1–3 (non duplicarla).
- **Adattatori di formato:** un'interfaccia comune `dataset neutro → file` con
  un'implementazione per fondo; parametrizzazione per avviso isolata nell'adattatore, **mai**
  nel motore. Aggiungere un terzo formato in futuro non deve toccare il Task 2.
- **Hash dello snapshot:** stessa logica di hashing canonico di D18 applicata al `contenuto`
  (serializzazione deterministica a chiavi ordinate). Il valore va nel `payload.hash`
  dell'Evento `report_fondo_depositato`. È l'Evento ad attestare, non una colonna `hash` sulla
  tabella (coerente con D20).
- **Append dell'Evento di deposito:** sempre attraverso l'unica funzione di append della
  Fase 1.
- **Formati file:** rispettare ciò che il fondo richiede (CSV / XLSX / PDF / tracciato
  specifico) secondo la documentazione corrente; per XLSX/PDF valutare le librerie già
  presenti nello stack prima di introdurne di nuove.
- **PII:** il file generato e lo snapshot contengono PII (è corretto); applicare ai loro
  artefatti le stesse cautele di accesso del grezzo (RLS, signed URL a scadenza breve se il
  file vive su Supabase Storage). Il log resta PII-free.
- **Definition of Done della Fase 4:** tutti i criteri M4a e M4 passano con test espliciti; il
  generatore è dimostrabile end-to-end su un'edizione finanziata reale per entrambi i formati;
  il congelamento regge (drift dell'anagrafica gestito); lo scope OUT — in particolare la
  contabilità di dettaglio — non è stato toccato.
