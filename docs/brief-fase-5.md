# Brief Fase 5 — Test finale, attestato e badge LinkedIn — da ratificare

> **Cos'è questo documento.** È la proposta di mandato operativo per la **Fase 5** della
> piattaforma e-learning, scritta su richiesta dell'utente (2026-10-20): *"rilasciare a chi
> chiude il percorso e supera il test un attestato e anche il badge da caricare su
> LinkedIn"*. Segue la forma dei brief delle Fasi 1–4: obiettivo, principi, scope IN/OUT,
> ordine dei task con due gate (M5a, M5), schema, decisioni vincolanti e **sezione 10 "Da
> ratificare"**. Finché la sezione 10 non è ratificata **non si scrive codice** (regola
> `CLAUDE.md`: Fase 5 solo con brief + conferma esplicita).
>
> **Fonte autoritativa.** `piattaforma-elearning-stato-progetto-v8.md` (D1–D37). Il
> documento v8 prevede già il LO `quiz` (D23, rinviato dalla Fase 2) e la **feature Attestato**
> ("generazione materiale, documento congelato, `Attestato.hash`"). Gli **Open Badges** erano
> fuori dal Blocco 1: qui si propone una via più leggera (vedi §4 e §10).
>
> **Stato di partenza assunto.** Fasi 1–4 chiuse, hardening Tappa 1, ondate UX 1–4 su
> `main`. Il log contiene già gli Eventi che determinano l'idoneità FAD (`video.ended`,
> `documento.completed`) e la frequenza webinar. Manca del tutto il **test**: non esiste né
> l'authoring né il player di un quiz. L'**attestato** non esiste. Il Corso non ha ancora i
> campi "anagrafici" dell'attestato (`ore_totali`, `riferimento_normativo`) e la Persona non ha
> data/luogo di nascita.

---

## 1. Obiettivo della Fase 5

Chiudere il ciclo del discente con un esito **spendibile**:

```
percorso completato (Eventi FAD + presenze)
   → test finale superato (Evento di esito, correzione lato server)
   → idoneità (vista calcolata adesso, come oggi)
   → attestato: documento congelato write-once + Evento con hash
   → pagina pubblica di verifica (codice non indovinabile)
   → "Aggiungi al profilo LinkedIn" + immagine badge condivisibile
```

Principio guida: **l'attestato è una prova, non una decorazione**. È uno snapshot dei dati
risolti al momento dell'emissione (come il report fondo della Fase 4), immutabile, con hash
nel log; chiunque abbia il codice può verificarne l'autenticità senza accedere alla
piattaforma. Il test è un Learning Object come gli altri, con una **regola di completamento**
propria (`quiz_passed`) che entra nel calcolo dell'idoneità già esistente.

---

## 2. Principi non negoziabili

1. **Scope creep (D3).** Il magnete qui è il "costruttore di quiz avanzato" (domande a
   risposta aperta, immagini, banche domande condivise, pesi, sezioni) e la "piattaforma
   badge" (Open Badges 3.0, issuer, wallet). Restano fuori (§4).
2. **Il log resta la fonte di verità (D8/D18).** L'esito del test è un Evento
   (`quiz.submitted`) con punteggio e superato/non superato, **calcolato dal server**. Le
   risposte giuste non viaggiano mai verso il browser. L'idoneità resta una vista derivata.
3. **Separazione PII/log (D18).** Il payload degli Eventi del quiz contiene solo indici di
   risposta e punteggi; l'attestato (snapshot con nome e cognome) sta nella sua tabella, mai
   nel log. L'Evento di emissione porta `attestato_id`, `numero` e `hash`.
4. **Write-once (D20).** Un attestato emesso non si modifica né si cancella: UPDATE/DELETE
   revocati a livello DB. Un errore si corregge **emettendo un nuovo attestato** che
   sostituisce il precedente (Evento `attestato.sostituito` che referenzia il vecchio), mai
   riscrivendo.
5. **Congelamento D22 esteso.** `ore_totali`, `riferimento_normativo`, `politica_attestato`
   e la soglia del test sono campi strutturali: congelati alla prima edizione (il documento
   v8 li elencava già tra i campi congelati).
6. **Niente nuove dipendenze pesanti.** PDF con `pdf-lib` (puro JavaScript, ~1 MB, nessun
   binario); immagine badge con `ImageResponse` di `next/og` (già in Next 14.2, nessuna
   dipendenza nuova). Niente Puppeteer/Chromium sul server.

---

## 3. Cosa costruire — scope IN

### 3a. Test finale (LO `quiz`)
- **Enum** `lo_type` esteso con `quiz`; `config` del LO: `{ soglia_percentuale, tentativi_max
  (null = illimitati), ordine_casuale, mostra_correzione }`.
- **Tabella `quiz_domanda`** (tenant_id, learning_object_id, ordine, testo, `risposte` jsonb
  = array di `{ testo, corretta }`; tipo `scelta_singola` | `scelta_multipla`). Niente banca
  domande condivisa: le domande appartengono al LO (il LO è riusabile in più corsi come
  oggi).
- **Authoring admin**: nel Course Builder "Crea nuovo → Test" (titolo, soglia, tentativi) e
  una pagina `/admin/learning-objects/[id]` per le domande (aggiungi, riordina, marca la
  corretta), con **import CSV** (Domanda; Risposta A; B; C; D; Corretta) sulla scia degli
  import esistenti. Le domande di un LO usato in un corso **congelato non si modificano**
  (estensione del freeze: il test è parte del percorso).
- **Player discente**: una domanda per schermata o tutte insieme (scelta UI), invio unico,
  correzione **lato server** (`POST /api/events/quiz`): il server legge le domande, calcola
  punteggio e percentuale, scrive **un solo Evento** `quiz.submitted` con `payload = {
  iscrizione_id, learning_object_id, tentativo, risposte: [indici], punteggio, totale,
  percentuale, superato }`. Un Evento `quiz.started` all'apertura (per la durata del
  tentativo). Tentativi contati dagli Eventi. Sblocco sequenziale D26 rispettato: il test
  si apre solo dopo le lezioni precedenti.
- **Compliance**: `regola_completamento = { tipo: 'quiz_passed' }` → completato se esiste un
  `quiz.submitted` con `superato = true`. L'idoneità già esistente (tutti gli obbligatori
  completati) **include automaticamente il test** se è obbligatorio nella struttura.
- **Auditor**: nel completamento il LO quiz mostra "superato al N% (tentativo K)"; nel log
  gli Eventi quiz con etichette; esito mai modificabile.

### 3b. Dati per l'attestato
- `corso`: `ore_totali numeric`, `riferimento_normativo text`, `politica_attestato ∈
  {automatica, manuale, nessuna}` (default `automatica`). Congelati con D22.
- `persona`: `data_nascita date`, `luogo_nascita text` (PII in anagrafica, non nel log).
  Inseribili dall'admin (form iscritto + CSV) e **modificabili dal discente nel proprio
  profilo** prima dell'emissione (autocertificazione: la responsabilità resta all'ente).
- `tenant`: `ragione_sociale`, `logo_path` (bucket pubblico `loghi`), `firmatario_nome`,
  `firmatario_ruolo`, `firma_path` (immagine firma, facoltativa), `citta`. Pagina admin
  "Ente" minima per compilarli.

### 3c. Attestato
- **Tabella `attestato`** write-once: `id`, `tenant_id`, `iscrizione_id`, `numero` (progressivo
  per tenant e anno, es. `2026/000017`), `codice_verifica` (random, 12+ caratteri, URL-safe),
  `contenuto` jsonb (snapshot risolto: ente, firmatario, corso, ore, riferimento normativo,
  edizione, date, discente con nome/cognome/data e luogo di nascita, esito del test, elenco
  lezioni con completamento, frequenza webinar se presente, hash di testa del log al
  momento), `hash` (sha256 del canonico di `contenuto`), `pdf_path` (Storage, bucket privato
  `attestati`, path `{tenant}/{attestato_id}.pdf`), `emesso_at`, `emesso_da` (persona admin o
  `null` = automatico), `sostituito_da uuid null`.
- **Emissione**: RPC SECURITY DEFINER `attestato_emetti(iscrizione_id, emesso_da)` che (a)
  verifica l'idoneità **ricalcolandola** (stessa logica di `compliance.ts`, portata in SQL o
  invocata dal server prima della RPC — vedi §11), (b) assegna il numero progressivo in
  modo serializzato, (c) inserisce lo snapshot, (d) scrive `attestato.emesso` con
  `payload = { iscrizione_id, attestato_id, numero, hash }` tramite `audit_append`. Il PDF
  si genera dopo, dal server, **dallo snapshot** (così il PDF è riproducibile dal DB).
- **Politica**: `automatica` → il server emette al primo ricalcolo che trova l'idoneità
  (dopo `quiz.submitted` superato o dopo l'ultimo completamento); `manuale` → l'admin preme
  "Emetti attestato" nella sezione Iscritti; `nessuna` → mai.
- **Discente**: nella pagina del corso completato (pannello "sigillo" già esistente) compare
  "Il tuo attestato": scarica PDF, apri pagina di verifica, **Aggiungi a LinkedIn**, scarica
  badge. Nel profilo: elenco dei propri attestati.
- **Admin**: sezione Iscritti mostra stato attestato (numero, data) con azioni Emetti /
  Riemetti (con motivazione → `attestato.sostituito`); pagina `/admin/attestati` con elenco,
  ricerca, scarica PDF.
- **Auditor**: Eventi `attestato.emesso` / `attestato.sostituito` nel registro con etichette;
  nel completamento colonna "Attestato n. … del …".

### 3d. Verifica pubblica e LinkedIn
- **Pagina pubblica** `/verifica/[codice]` (senza login, `robots: noindex`): mostra
  **nome e cognome**, corso, ente, ore, numero, data di emissione, "valido" / "sostituito
  il …", hash, e un pulsante per scaricare il PDF. Dati letti via RPC `attestato_verifica
  (codice)` eseguibile da `anon` **solo per questo scopo** (restituisce i campi minimi, non
  il CF né la data di nascita). Codice non enumerabile; rate limit leggero.
- **Aggiungi al profilo LinkedIn**: link precompilato
  `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=<corso>&
  organizationName=<ente>&issueYear=&issueMonth=&certUrl=<pagina di verifica>&certId=<numero>`
  (funzione "Add to profile" di LinkedIn: non serve alcuna integrazione né account
  LinkedIn dell'ente; `organizationName` compare come testo se l'ente non ha una pagina
  LinkedIn collegata, con `organizationId` se ce l'ha → campo facoltativo su `tenant`).
- **Badge**: immagine PNG 1200×1200 (e 1200×630 per i post) generata dal server con
  `ImageResponse` dallo snapshot: logo/nome ente, corso, nome discente, data, numero, QR
  della pagina di verifica. Il discente la scarica e la pubblica come post o la allega.
  **Non è un Open Badge** (vedi §4): è un'immagine la cui autenticità è verificabile
  tramite il QR/codice.

---

## 4. Cosa NON costruire — scope OUT

- **Open Badges 2.0/3.0, issuer, wallet, firme JSON-LD** → fuori. LinkedIn non legge Open
  Badges direttamente; l'"Add to profile" + pagina di verifica copre il caso d'uso. Se un
  giorno servirà, è additivo sopra lo stesso snapshot.
- **Integrazione API LinkedIn** (OAuth, pubblicazione automatica) → fuori: il link "Add to
  profile" è l'unico meccanismo ufficiale che non richiede partnership.
- **Quiz avanzato**: risposte aperte, immagini/video nelle domande, banche domande
  condivise, pesi per domanda, sezioni, tempo massimo, anti-cheating (webcam, blocco
  finestra) → fuori. Solo scelta singola/multipla, testo, soglia, tentativi.
- **Firma digitale qualificata / marca temporale** sul PDF → fuori. L'integrità è data
  dall'hash nel log append-only e dalla pagina di verifica. Se un cliente richiede la firma
  qualificata, è un adattatore di trasporto esterno.
- **Template grafici multipli dell'attestato** → uno solo, con logo/firma dell'ente.
- **Invio email automatico dell'attestato** → fuori finché non esiste SMTP (Blocco C).
- **Attestati per i corsi solo-webinar senza LO** → **dentro** (l'idoneità per frequenza
  esiste già), ma senza test: il test è richiesto solo se presente nella struttura.

---

## 5. Ordine di costruzione

### Task 1 — Schema: quiz, campi attestato, tenant
Migration: enum `quiz`, tabella `quiz_domanda` + RLS (admin scrive; discente **non legge**
`risposte.corretta` → vista `quiz_domanda_discente` senza il flag, oppure RPC), campi su
`corso`/`persona`/`tenant`, freeze D22 esteso, bucket `loghi` (pubblico) e `attestati`
(privato). Revoche EXECUTE ad `anon` su ogni funzione nuova (regola hardening). pgTAP.

### Task 2 — Authoring del test (admin)
Builder: "Crea nuovo → Test"; pagina domande con riordino, correzione, import CSV. Eventi
`learning_object.created/updated`, `quiz.domande_aggiornate` (conteggio, mai il testo).

### Task 3 — Player del test + correzione server + compliance  →  **gate M5a**
`/api/events/quiz`, Eventi `quiz.started`/`quiz.submitted`, `compliance.ts` con
`quiz_passed`, player discente, viste auditor. Test unitari sul calcolo del punteggio
(singola/multipla, tentativi, soglia) e pgTAP sull'invarianza del log.

### Task 4 — Emissione attestato (RPC, snapshot, hash, Evento)
Tabella `attestato`, RPC `attestato_emetti`, politica automatica/manuale, numerazione,
`attestato.sostituito`. pgTAP: write-once, numero progressivo serializzato, hash
riproducibile, Evento senza PII.

### Task 5 — PDF e badge
Generazione PDF con `pdf-lib` dallo snapshot (una pagina A4 orizzontale, logo, titolo, dati,
QR della verifica, numero, hash abbreviato, firma), caricamento su Storage; badge PNG con
`ImageResponse`. Route `GET /api/attestati/[id]/pdf` e `/badge.png` (RLS: il discente
titolare, l'admin del tenant, l'auditor).

### Task 6 — Verifica pubblica, LinkedIn, UI discente/admin/auditor  →  **gate M5**
`/verifica/[codice]`, pulsanti nel pannello "corso completato" e nel profilo, sezione
Iscritti con stato attestato, `/admin/attestati`, etichette nel registro.

---

## 6. Schema dati — entità nuove o estese

| Entità | Stato | Ruolo | Note |
|---|---|---|---|
| **learning_object** | estesa | tipo `quiz` | `config`: soglia, tentativi, ordine casuale, mostra correzione |
| **quiz_domanda** | nuova | domande del test | tenant_id, LO, ordine, testo, tipo, `risposte` jsonb; il flag `corretta` mai esposto al discente |
| **corso** | estesa | dati dell'attestato | `ore_totali`, `riferimento_normativo`, `politica_attestato` (congelati D22) |
| **persona** | estesa | anagrafica attestato | `data_nascita`, `luogo_nascita` (PII in anagrafica, mai nel log) |
| **tenant** | estesa | ente emittente | `ragione_sociale`, `logo_path`, `firmatario_nome`, `firmatario_ruolo`, `firma_path`, `citta`, `linkedin_organization_id` |
| **attestato** | nuova | documento congelato | write-once (D20); `numero`, `codice_verifica`, `contenuto` jsonb, `hash`, `pdf_path`, `emesso_at`, `emesso_da`, `sostituito_da` |

Eventi nuovi: `quiz.started`, `quiz.submitted`, `quiz.domande_aggiornate`,
`attestato.emesso`, `attestato.sostituito`. Tutti senza PII; `attestato.*` porta solo UUID,
numero e hash.

---

## 7. Decisioni vincolanti da rispettare

- **D2** tenant_id + RLS in ogni migration. **D8/D18** idoneità e stato del test derivati
  dagli Eventi; PII solo in anagrafica e nello snapshot. **D11/D19** stream unico.
  **D20** write-once per `attestato`. **D22** nuovi campi strutturali congelati. **D23**
  LO polimorfico: il quiz è `type + config`, le domande in tabella satellite. **D26**
  correzione e sblocco lato server. **D35** le viste dell'auditor restano la verità interna:
  l'attestato è un terzo output dalla stessa sorgente.
- **Regola hardening**: ogni funzione nuova in `public` revoca EXECUTE ad `anon`/PUBLIC,
  salvo `attestato_verifica(codice)` che è **volutamente** eseguibile da `anon` e
  restituisce solo i campi pubblici.

---

## 8. Milestone M5a — il test regge

1. L'admin crea un test con ≥ 3 domande (singola e multipla), soglia e tentativi, lo mette
   in struttura come obbligatorio; il corso si congela con la prima edizione e le domande
   non sono più modificabili (verificato a livello DB).
2. Il discente non può aprire il test prima delle lezioni precedenti (D26, server).
3. Il browser non riceve mai il flag della risposta corretta (verifica sulla risposta
   dell'API e sulla vista).
4. L'invio produce **un** Evento `quiz.submitted` con punteggio calcolato dal server; un
   invio forgiato con `superato: true` viene ignorato (il server ricalcola).
5. Tentativi oltre il massimo rifiutati; percentuale sotto soglia → non completato;
   sopra → completato; l'idoneità del corso compare solo con il test superato.
6. Auditor: completamento mostra l'esito del test; catena integra.

## 9. Milestone M5 — l'attestato regge

1. Idoneità raggiunta → attestato emesso (automatico) con numero progressivo, snapshot,
   hash, Evento; PDF scaricabile e riproducibile dallo snapshot (stesso hash del contenuto).
2. UPDATE/DELETE su `attestato` rifiutati dal DB; una riemissione crea un nuovo numero e
   marca il precedente come sostituito (Evento che lo referenzia).
3. `/verifica/<codice>` risponde senza login con i dati pubblici; un codice inesistente dà
   "non trovato"; un attestato sostituito lo dice.
4. "Aggiungi a LinkedIn" apre il form di LinkedIn precompilato (corso, ente, data, numero,
   URL di verifica); il badge PNG si scarica e contiene il QR che porta alla verifica.
5. Il discente vede l'attestato nel corso completato e nel profilo; l'admin nella sezione
   Iscritti e in `/admin/attestati`; l'auditor nel registro e nel completamento.
6. Isolamento tenant: un tenant non vede gli attestati dell'altro (RLS, test sentinella).
7. `audit_verify_chain` = 0 problemi dopo i nuovi tipi di Evento.

---

## 10. Da ratificare prima di iniziare

1. **Il "test" è un LO `quiz` nella struttura del corso**, obbligatorio, con soglia per
   corso. Orientamento: soglia predefinita **70%**, **tentativi illimitati** (ogni
   tentativo è un Evento, l'auditor li vede tutti), ordine casuale delle domande attivo,
   correzione mostrata solo se il test è superato. Confermare soglia e tentativi.
2. **Emissione automatica** all'idoneità (politica `automatica` di default), con possibilità
   di impostare `manuale` o `nessuna` per corso. Confermare.
3. **Contenuto dell'attestato**: ente (ragione sociale, logo, firmatario), discente (nome,
   cognome, **data e luogo di nascita**; **niente codice fiscale** sul documento, resta in
   anagrafica per i fondi), corso (titolo, **ore totali**, riferimento normativo), edizione e
   periodo, esito del test, data e luogo di emissione, numero, codice di verifica + QR, hash
   abbreviato. **Serve una vostra conferma su cosa richiede la normativa dei vostri corsi**
   (es. Accordo Stato-Regioni per la sicurezza: durata, soggetto formatore, firma del
   responsabile del progetto formativo). I campi mancanti si aggiungono al modello.
4. **Pagina pubblica di verifica con nome e cognome** del titolare (è ciò che un datore di
   lavoro o un auditor vuole confrontare). Chi ha il codice vede nome, corso, ente, ore,
   data, numero. Niente motore di ricerca (`noindex`), codice non indovinabile. Confermare o
   preferire una verifica "cieca" (solo "valido/non valido" + corso, senza nome).
5. **LinkedIn via "Aggiungi al profilo"** (link precompilato) **+ immagine badge** da
   pubblicare come post. Niente Open Badges, niente API LinkedIn. Se l'ente ha una pagina
   LinkedIn, fornire l'`organizationId` così la certificazione risulta collegata. Confermare.
6. **Riemissione = nuovo attestato** che sostituisce il precedente (mai modifica). Confermare.
7. **Corsi solo-webinar**: attestato emesso sull'idoneità per frequenza (nessun test
   richiesto se il corso non ha LO quiz). Confermare.
8. **Ordine**: Task 1–3 (test, gate M5a) prima di Task 4–6 (attestato, gate M5). In
   alternativa si può partire dall'attestato sui corsi che già danno l'idoneità senza test e
   aggiungere il quiz dopo. Confermare l'ordine.

---

## 11. Note tecniche

- **Correzione server-side**: `/api/events/quiz` usa il client con RLS del discente per
  leggere la struttura/sblocco e il **client di servizio** per leggere `quiz_domanda` con i
  flag corretti (il discente non ha SELECT sul flag). Il punteggio per `scelta_multipla` è
  tutto-o-niente per domanda (semplice, auditabile); si può ratificare un punteggio parziale
  ma complica la lettura dell'auditor.
- **Idoneità in SQL**: l'emissione automatica richiede che il server riconosca l'idoneità
  subito dopo l'Evento decisivo. Prima opzione (semplice): dopo ogni `quiz.submitted`
  superato o `video.ended`/`documento.completed`, la route ricalcola con `compliance.ts` e,
  se idonea e politica `automatica` e nessun attestato valido, chiama `attestato_emetti`.
  Seconda opzione (Blocco B #2): portare il ricalcolo in una funzione SQL e far emettere
  dalla RPC stessa. Si parte dalla prima.
- **PDF riproducibile**: il PDF è una *resa* dello snapshot; l'hash nel log è quello del
  `contenuto` jsonb (canonico), non del file PDF. Chi vuole verificare confronta i dati della
  pagina di verifica con il documento; il PDF può essere rigenerato in qualunque momento dallo
  snapshot (stesso contenuto).
- **Numerazione progressiva**: sequenza per (tenant, anno) in una tabella `attestato_contatore`
  aggiornata dentro la RPC con lock di riga → niente buchi né doppioni sotto concorrenza.
- **QR**: generato lato server senza dipendenze native (`qrcode` è una libreria pura
  JavaScript; in alternativa si disegna la matrice con `pdf-lib`/SVG). Da aggiungere allo
  stack: `pdf-lib`, `qrcode`.
- **Storage**: bucket `attestati` privato con policy: il discente legge i propri
  (`{tenant}/{attestato_id}.pdf` → join su iscrizione), admin e auditor del tenant leggono
  tutti; scrittura solo dal server (service role). Il download passa comunque da una route
  con signed URL, come per i documenti.
