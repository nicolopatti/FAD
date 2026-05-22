# Brief Fase 2 — Corsi reali: assemblatore + Learning Object completi — da consegnare a Claude Code

> **Cos'è questo documento.** È il mandato operativo per la **Fase 2** dello Step 4
> (sviluppo in Claude Code) della piattaforma e-learning. Definisce *cosa* costruire,
> *in che ordine*, e i *criteri di accettazione* della milestone M2.
>
> **Fonte autoritativa.** Il documento di riferimento è `piattaforma-elearning-stato-progetto-v7.md`
> (decisioni D1–D35, dettaglio campo-per-campo, diagramma ER). In caso di conflitto, **fa fede
> quello**. Questo brief non re-decide nulla: traduce in lavoro la Fase 2 della roadmap della
> Sessione 9.
>
> **Prerequisito.** La Fase 1 è chiusa e **M1 è stato superato**: la fetta FAD gira end-to-end,
> il log è fisicamente immutabile, e le tabelle `tenant`, `persona`, `corso`, `learning_object`,
> `struttura_corso`, `edizione`, `iscrizione`, `stream_audit`, `evento` esistono già con
> `tenant_id` + RLS. La Fase 2 **non rifà lo schema**: costruisce la UI di authoring sopra le
> tabelle che già esistono e aggiunge un solo tipo di Learning Object nuovo.

---

## 1. Obiettivo della Fase 2

Allargare la fetta FAD da **"un corso seed con un video"** a **corsi reali che un admin
costruisce dalla UI**:

```
admin compone un corso FAD multi-LO  →  un discente lo fruisce  →  il report di
completamento lo rispecchia
```

In Fase 1 il corso era inserito via migration/script. In Fase 2 c'è l'**assemblatore**: un
admin crea Learning Object, li ordina in un Corso, ne definisce le regole di completamento,
apre un'Edizione. Si aggiunge il secondo tipo di Learning Object — `documento` (PDF) — e si
manda **in esercizio reale** lo sblocco sequenziale, che in Fase 1 girava solo su un singolo
video.

**Principio guida:** si continua a costruire a *fette verticali*. La Fase 2 non è "una
schermata di amministrazione": è la slice "produzione del corso" end-to-end, da quando l'admin
lo compone a quando il discente lo completa e l'auditor lo vede nel report.

---

## 2. Principi non negoziabili

1. **Lo scope creep è il rischio n.1 (D3).** Tutto ciò che è nella sezione "Cosa NON
   costruire" resta fuori, anche se sembra facile o utile. In caso di dubbio: non costruirlo,
   segnalalo come domanda.
2. **Authoring = comporre, non disegnare (D6).** Si costruisce un **assemblatore di sequenze**:
   ordinare Learning Object esistenti e definirne le regole d'uso. **NON** si costruisce un
   costruttore di contenuti (editor di slide, registrazione, animazioni). I contenuti si
   producono con strumenti esterni; nella piattaforma si *assemblano*.
3. **Proprietà intrinseche sull'LO, regole d'uso sulla Struttura (D24).** L'LO porta solo ciò
   che è intrinseco al contenuto (durata del video, chiave del file). *Come* quel contenuto è
   usato in un corso — posizione, obbligatorietà, soglia di completamento — vive sulla riga
   `struttura_corso`. Mai duplicare un LO per cambiarne l'uso.
4. **Il congelamento è reale, non cosmetico (D22).** Alla creazione della **prima Edizione** di
   un Corso, i campi strutturali del Corso e la sua sequenza di LO si **congelano**. Dopo
   quell'atto la struttura non si tocca più — e va fatto rispettare, non solo scritto in UI.
5. **Il server è l'unica fonte di verità sulla fruizione (D26).** Lo sblocco sequenziale è
   applicato **lato server**: l'accesso a un LO non ancora sbloccato è *rifiutato*, non solo
   nascosto. Vale per tutti i tipi di LO, non solo per il video.
6. **Il log resta la fonte di verità (D8).** Anche per il LO `documento`, lo stato di
   completamento è una *cache derivata* dagli Eventi. Niente nuovo stato persistente di
   fruizione.
7. **Mai PII nel log (D18)** e **tenant-ready dal giorno 1 (D2).** Restano validi: ogni nuova
   riga ha `tenant_id`, ogni Evento passa per l'unica funzione di append, nessun INSERT diretto
   in `evento`.

---

## 3. Cosa costruire — scope IN

- **Assemblatore di Learning Object**: UI di CRUD su `learning_object` per i tipi `video` e
  `documento`. Per `video`: id Vimeo + durata nel `config` jsonb (D23). Per `documento`: upload
  del PDF su **Supabase Storage**, con la chiave di storage nel `config` jsonb.
- **Assemblatore di Corsi**: UI di CRUD su `corso`, incluso comporre la **Struttura del corso**
  — aggiungere/rimuovere/riordinare LO (`ordine`), impostare `obbligatorio` e
  `regola_completamento` per ciascuna riga (D24, D25). Sequenza **piatta**, niente moduli (D25).
- **Authoring delle Edizioni**: UI per creare un'Edizione di un Corso, con le due coppie di
  date (`data_inizio`/`data_fine` e `fad_apertura`/`fad_chiusura`) e il ciclo di vita soft
  `concluso_at`/`annullato_at` (D29).
- **Congelamento D22**: alla creazione della prima Edizione di un Corso, i campi strutturali
  del Corso (`ore_*`, `classe_rischio`, `riferimento_normativo`, `politica_attestato`,
  `sblocco_sequenziale`) **e** la sequenza di LO sulla Struttura diventano **non modificabili**.
  Fatto rispettare lato server/DB, non solo disabilitato in UI.
- **Fruizione discente multi-LO**: le schermate *dettaglio corso* e *player* della Fase 1 ora
  reggono un corso con **più LO** di tipo misto (video + documento). Visualizzatore `documento`
  che traccia la fruizione (apertura / completamento) come Eventi **server-side** nel log.
- **Sblocco sequenziale in esercizio reale (D26)**: con un corso multi-LO con LO obbligatori e
  facoltativi, lo sblocco sequenziale lato server viene esercitato sul serio. L'accesso a un LO
  non sbloccato è rifiutato dal server.
- **Report di completamento multi-LO**: il report *completamento attività* della Fase 1 (D35)
  ora ricalcola lo stato su un corso con più LO, rispettando `obbligatorio` e
  `regola_completamento` di ogni riga di Struttura. Resta una **vista derivata** dagli Eventi,
  senza stato proprio (D8).

---

## 4. Cosa NON costruire — scope OUT (guard rail anti scope-creep)

Niente di tutto questo entra nella Fase 2. Sono fasi successive o fuori dal Blocco 1:

- **Costruttore di contenuti / editor di slide / registrazione voice-over** → fuori del tutto
  (D6). L'assemblatore *compone*, non *disegna*.
- **Learning Object di tipo `quiz`** e le sue tabelle satellite domande/risposte (D23) → fase
  successiva. Il valore `quiz` dell'enum può restare, ma non si costruisce né l'authoring del
  quiz né il player.
- **Moduli / sezioni** nella Struttura del corso (D25) → additivo, non ora. La sequenza resta
  piatta; niente colonna `sezione`.
- **Pipeline webinar, adattatori CSV/API, riconciliazione** → Fase 3.
- **Generatore di report fondi** (Fondimpresa, FonCoop/GIFCOOP) → Fase 4.
- **Feature Attestato** (generazione materiale, documento congelato, `Attestato.hash`) → Fase 5.
  *Nota:* l'Attestato è sbloccato dalla fine della Fase 2 in poi; se diventa priorità, è una
  decisione di roadmap a sé — non si anticipa dentro questo brief.
- **SCORM** export e player (D5).
- **Sessioni, Incarichi, co-docenza, qualifiche docente** (D30, D31) → la fetta FAD non li
  esercita; le relative tabelle non si creano qui.
- **Azienda, Piano formativo finanziato** → la fetta FAD copre l'iscritto individuale (D9);
  `azienda_id`/`piano_id` sull'Iscrizione restano NULL.
- **Multi-stream**: un solo stream per tenant (D11/D19). Niente `scope_type`/`scope_id`.
- **Branding multi-tenant avanzato, forum, AI tutor/RAG, Open Badges, integrazioni native** →
  fuori dal Blocco 1.

Se durante lo sviluppo emerge la tentazione di costruire una di queste cose "perché serve",
**fermati e segnalalo** invece di farlo.

---

## 5. Ordine di costruzione

Cinque task in sequenza. Si parte dai contenuti (gli LO), si sale al contenitore (il Corso e la
sua Struttura), si passa all'erogazione (l'Edizione e il suo congelamento), poi al lato
discente, e si chiude verificando che il report rispecchi tutto.

### Task 1 — Authoring dei Learning Object (incluso il tipo `documento`)
UI di CRUD su `learning_object`. Per `video`: form con id Vimeo + durata, scritti nel `config`
jsonb (D23). Per `documento`: **upload del PDF su Supabase Storage**, chiave di storage scritta
nel `config`. L'accesso al file dello Storage è protetto da policy coerenti con la RLS del
tenant (un tenant non scarica i file di un altro). `archiviato_at` per il soft-archive (D15/D22),
nessun delete fisico.

### Task 2 — Assemblatore di corsi
UI di CRUD su `corso` e composizione della **Struttura del corso**: aggiungere LO esistenti al
corso, riordinarli (`ordine`), impostare per ogni riga `obbligatorio` e `regola_completamento`
(D24). Unicità `(corso_id, learning_object_id)` — un LO al più una volta per corso (D25).
Sequenza piatta, niente moduli. Finché il Corso non ha Edizioni, struttura e campi sono
liberamente editabili.

### Task 3 — Authoring delle Edizioni + il congelamento D22
UI per creare un'Edizione di un Corso (le due coppie di date, ciclo di vita soft D29). La
creazione della **prima Edizione** di un Corso **congela** i campi strutturali del Corso e la
sequenza di LO sulla Struttura: da quel momento sono in sola lettura, e i tentativi di modifica
sono **rifiutati lato server/DB**, non solo disabilitati in UI.
> ⚠️ **Punto di attenzione.** Il congelamento è la garanzia che un corso erogato non cambi
> sotto i piedi di chi lo sta seguendo o di chi lo audita. Va verificato con un test esplicito:
> creata la prima Edizione, ogni UPDATE ai campi congelati del Corso e ogni modifica alle righe
> di Struttura deve fallire. Se il congelamento non regge, va sistemato prima di proseguire.

### Task 4 — Fruizione discente multi-LO
Le schermate *dettaglio corso* e *player* reggono un corso con più LO di tipo misto.
Visualizzatore del LO `documento` (PDF servito da Supabase Storage) che registra la fruizione
— apertura e completamento — come Eventi **server-side**, passando per l'unica funzione di
append del log (mai INSERT diretto in `evento`). Lo **sblocco sequenziale** (D26) è esercitato
sul serio: con `corso.sblocco_sequenziale = true`, un LO non ancora sbloccato dal completamento
del precedente LO obbligatorio è **inaccessibile** — la richiesta è rifiutata dal server.

### Task 5 — Report di completamento multi-LO  →  **gate M2**
Il report *completamento attività* (D35) ricalcola lo stato di avanzamento su un corso
multi-LO: distingue LO obbligatori e facoltativi, applica la `regola_completamento` di ogni
riga di Struttura, deriva l'idoneità dell'iscrizione. Resta **ricalcolato dagli Eventi a ogni
apertura**, senza stato persistente proprio (D8). Il report *log eventi* della Fase 1 continua
a funzionare invariato sui nuovi Eventi.
> ✅ Alla fine del Task 5 si valuta **M2** (§8): go / correggi lo scope / no-go.

---

## 6. Schema dati della Fase 2

La Fase 2 **non introduce nuove entità di business**. Tutte le tabelle che esercita esistono
già dalla Fase 1. Cambia solo *come* vengono popolate (dalla UI, non più via seed) e si
aggiunge l'uso del tipo `documento`.

| Entità | Cosa cambia in Fase 2 | Note |
|---|---|---|
| **Learning Object** | esercitato anche con `type = documento` | `config` jsonb: chiave Supabase Storage (D23) |
| **Corso** | creato e modificato dalla UI; congelato da D22 | campi strutturali in sola lettura dopo la prima Edizione |
| **Struttura del corso** | composta dalla UI (ordine, obbligatorio, regola) | sequenza piatta; unicità `(corso_id, LO_id)` (D25); congelata da D22 |
| **Edizione** | creata dalla UI | la prima Edizione di un Corso fa scattare D22 |
| **Evento** | nuovi tipi di evento per la fruizione `documento` | sempre via funzione di append; payload senza PII (D18) |

**Niente migration di nuove tabelle di business.** L'unica novità infrastrutturale è
l'attivazione di **Supabase Storage** con le sue policy di accesso per-tenant. Le entità fuori
dalla fetta FAD (Azienda, Piano, Sessione, Incarico, Report di partecipazione, Attestato)
restano non create — arriveranno, tenant-ready, nelle fasi che le usano.

---

## 7. Decisioni vincolanti da rispettare

- **D2** — `tenant_id` su ogni riga + RLS attiva; le policy di Supabase Storage rispettano lo
  stesso isolamento per-tenant.
- **D6** — authoring = assemblatore (comporre LO esistenti), mai costruttore di contenuti.
- **D8** — la compliance e il completamento sono cache derivate dagli Eventi; in caso di
  disaccordo vince il ricalcolo.
- **D15 / D22** — soft-archive con `archiviato_at`, mai delete fisico; la prima Edizione
  congela i campi strutturali del Corso e la sua Struttura.
- **D18** — mai PII nel payload degli Eventi di fruizione del `documento`; attori pseudonimi.
- **D23** — LO polimorfico `type` + `config` jsonb leggero; per `documento` il `config`
  contiene la chiave di storage, non il file.
- **D24** — proprietà intrinseche sull'LO, regole d'uso (ordine, obbligatorietà,
  completamento) sulla Struttura del corso.
- **D25** — Struttura del corso a sequenza piatta, niente moduli; un LO al più una volta per
  corso.
- **D26** — sblocco sequenziale come policy del Corso, fatto rispettare server-side per ogni
  tipo di LO.
- **D35** — il report di completamento non memorizza stato proprio, lo ricalcola dagli Eventi.

---

## 8. Milestone M2 — go/no-go (corsi reali end-to-end)

Tutti i criteri devono passare con un test esplicito e riproducibile.

1. **Authoring funzionante.** Dalla UI un admin crea un LO `video` e un LO `documento` (PDF
   caricato su Supabase Storage), crea un Corso e ne compone la Struttura con più LO ordinati,
   alcuni obbligatori e alcuni facoltativi.
2. **Congelamento reale (D22).** Creata la prima Edizione del Corso, ogni modifica ai campi
   strutturali del Corso e alla sua Struttura è rifiutata lato server/DB — non solo disabilitata
   in UI.
3. **Fruizione multi-LO.** Un discente apre il corso multi-LO; il video e il documento sono
   entrambi fruibili e la loro fruizione genera Eventi server-side nel log.
4. **Sblocco sequenziale in esercizio (D26).** Con `sblocco_sequenziale = true`, l'accesso a un
   LO non ancora sbloccato è rifiutato dal server, non solo nascosto.
5. **Report di completamento corretto (D35).** Il report ricalcola lo stato del corso multi-LO
   dagli Eventi, rispetta `obbligatorio` e `regola_completamento` di ogni LO, e l'idoneità
   dell'iscrizione riflette il completamento reale.
6. **Isolamento tenant esteso allo Storage.** Un tentativo di scaricare il file `documento` di
   un altro `tenant_id` è bloccato dalle policy di Supabase Storage.
7. **Il log della Fase 1 regge.** Il report *log eventi* e la verifica della catena hash
   continuano a funzionare invariati, ora anche sui nuovi tipi di Evento.

---

## 9. Da ratificare prima di iniziare

- **Supabase Storage come hosting dei file `documento`.** Orientamento naturale — lo stack è
  già Supabase (D4) e le policy di Storage si agganciano alla RLS per-tenant esistente. È però
  una decisione ancora formalmente aperta nelle "Questioni aperte" della v7: va ratificata
  all'avvio della Fase 2, perché il Task 1 dipende da dove finiscono i PDF. Se si ratifica
  diversamente, cambia solo l'implementazione dell'upload/serving del `documento`: il resto
  della slice non si tocca.

---

## 10. Note tecniche

- **Niente nuove tabelle di business.** La Fase 2 lavora sulle tabelle della Fase 1. L'unica
  migration infrastrutturale è la configurazione del bucket Supabase Storage e delle sue
  policy di accesso per-tenant.
- **Append degli Eventi:** la fruizione del `documento` genera Eventi sempre attraverso
  l'unica funzione di append del log (Task 2 della Fase 1) — nessun INSERT diretto in `evento`
  da nessun punto del codice.
- **Congelamento D22:** preferire un controllo a livello DB (trigger che rifiuta UPDATE sui
  campi strutturali del Corso e su `struttura_corso` quando il Corso ha almeno un'Edizione),
  così la garanzia non dipende dalla disciplina del codice applicativo. La UI riflette lo stato
  congelato disabilitando i controlli, ma non è lei a far rispettare la regola.
- **`regola_completamento`:** è un jsonb sulla riga di Struttura (D24). In Fase 2 va definito
  un piccolo insieme di regole supportate — almeno "visione/lettura integrale" per video e
  documento. Tenerlo minimo: regole esotiche sono scope creep.
- **Sblocco sequenziale:** la logica server-side esiste già dalla Fase 1; in Fase 2 va
  *esercitata* su corsi multi-LO reali, non riscritta. Verificare il comportamento con LO
  obbligatori e facoltativi mescolati.
- **Definition of Done della Fase 2:** tutti i criteri M2 passano con test espliciti; un admin
  costruisce un corso FAD reale dalla UI e un discente lo completa end-to-end; lo scope OUT non
  è stato toccato.
