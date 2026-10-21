# Brief Fase 6 — Vendita dei corsi (catalogo pubblico, registrazione, pagamento) — da ratificare

> **Cos'è questo documento.** La proposta di mandato operativo per la **Fase 6**, scritta su
> richiesta dell'utente (2026-10-21): *"noi come ente formativo venderemo corsi che le
> persone potranno acquistare direttamente sul sito e creare account in modo da avere tutto
> in piattaforma (come Coursera), non un marketplace ma comunque la possibilità di
> vendere"*; e poi: *"partire con la funzione vendita"*, lasciando per dopo l'impostazione
> multi-ente (appunti in `docs/visione-multi-ente.md`). Segue la forma dei brief precedenti:
> obiettivo, principi, scope IN/OUT, task con due gate (M6a, M6), schema, **sezione 10 "Da
> ratificare"**. Finché la sezione 10 non è ratificata **non si scrive codice**.
>
> **Stato di partenza.** Fasi 1–5 chiuse e in produzione. Oggi **si entra solo su invito**
> dell'admin (nessuna registrazione autonoma); un account appartiene a un solo ente; la
> finestra di fruizione è **per edizione** (date dell'edizione o finestra FAD, R2 del
> 21/10). Non esistono prezzi, ordini, pagamenti né pagine pubbliche oltre a login e verifica
> dell'attestato.

---

## 1. Obiettivo

Un visitatore trova un corso nel **catalogo pubblico** dell'ente, si **registra**, **paga**
con carta (Stripe) e si trova **iscritto**: il corso compare in "I miei corsi" e lo segue con
le stesse regole, tracciamento, test e attestato dei corsi assegnati dall'admin. L'admin
decide cosa è in vendita e a che prezzo, vede gli ordini, rimborsa, esporta i dati per la
fatturazione.

Vale per **un ente** (il vostro), ma con un modello che non vada buttato quando arriverà il
multi-ente: tutto per `tenant_id`, ente riconosciuto dall'indirizzo, chiavi Stripe
configurabili per ente.

## 2. Principi non negoziabili

1. **Il pagamento lo conferma Stripe, non il browser.** L'iscrizione nasce solo dal webhook
   firmato (`checkout.session.completed`), mai dalla pagina di ritorno. Il webhook è
   **idempotente**: ricevuto due volte, produce un'iscrizione sola.
2. **Nessun dato di carta passa dai nostri server** (Stripe Checkout ospitato).
3. **Registro eventi come sempre**: ogni passaggio dell'ordine (creato, pagato, rimborsato,
   annullato) è un Evento via `audit_append`, **senza dati personali** (solo UUID, importo,
   valuta, offerta). I dati di fatturazione (nome, CF, indirizzo) stanno nell'ordine, come i
   dati anagrafici stanno nell'attestato: sono il documento, non il log.
4. **Le regole del corso non cambiano** con la vendita: sblocco sequenziale, visione
   integrale, test, attestato, D22. Un corso venduto è un corso come gli altri.
5. **Il catalogo pubblico mostra solo ciò che l'admin ha pubblicato** e nessun dato di
   persone. Le letture anonime passano da una funzione dedicata (come `attestato_verifica`),
   non aprendo le tabelle ad `anon`.
6. **Chiavi Stripe mai nel repo né in chat**: variabili d'ambiente su Vercel (test e live).
   Senza chiavi le route di pagamento rispondono 503 (stesso schema del fail-fast di oggi).

## 3. Scope IN

### 3a. Offerta (cosa si vende)
- Nuova entità **offerta** legata a **un'edizione** (l'iscrizione è sempre a un'edizione):
  prezzo, IVA, posti massimi (facoltativo), **durata dell'accesso** in giorni dall'acquisto
  (facoltativa), stato bozza/pubblicata/ritirata, testo e immagine della scheda pubblica
  (di base quelli del corso), indirizzo leggibile (`slug`).
- Due casi con lo stesso modello:
  - **corso online "sempre disponibile"**: edizione aperta a lungo, ognuno ha la sua finestra
    (es. 365 giorni dall'acquisto);
  - **edizione a date** (webinar, corso con calendario): vale la finestra dell'edizione, posti
    limitati, vendita chiusa a posti esauriti o a edizione iniziata (regola in §10).
- Admin: scheda **Vendita** nell'edizione (crea/modifica offerta, anteprima della scheda,
  pubblica/ritira).

### 3b. Accesso per iscrizione
- `iscrizione.accesso_fino_al` (e `accesso_dal`): la finestra effettiva diventa
  **l'intersezione** fra finestra dell'edizione e finestra dell'iscrizione. Aggiornati
  `lib/finestra.ts`, `edizione_finestra_stato` (o una nuova `iscrizione_finestra_stato`) e
  `evento_player_registra`: stesso blocco totale di R2, stesso messaggio al discente ("il tuo
  accesso è scaduto il …").
- Le iscrizioni fatte dall'admin restano come oggi (campi vuoti = nessun limite proprio).

### 3c. Catalogo pubblico
- `/catalogo` (elenco con categorie e ricerca) e `/catalogo/[slug]` (scheda: descrizione,
  programma delle lezioni, durata, ore, attestato, docenti se presenti, prezzo, posti
  rimasti, pulsante **Acquista**). Sistema grafico F, pagine indicizzabili (SEO di base:
  titolo, descrizione, immagine social).
- La home pubblica (`/`) per chi non è loggato porta al catalogo invece che al login (da
  decidere, §10).
- Ente riconosciuto dall'indirizzo: tabella minima **`tenant_dominio`** (host → ente),
  premessa del multi-ente.

### 3d. Registrazione e account
- `/registrati`: nome, cognome, email, password, accettazione di termini e privacy (Evento
  `informativa.accettata`, già esistente, con versione). Email di conferma di Supabase Auth.
- Alla prima conferma si crea la **Persona** nell'ente del catalogo (ruolo discente). Se
  esiste già una Persona con quell'email (iscritta dall'admin senza accesso), si **collega**
  a quella invece di crearne un'altra.
- Il CF e la data/luogo di nascita si chiedono all'acquisto (servono a fattura e attestato).

### 3e. Acquisto
- "Acquista" → (se serve login/registrazione) → riepilogo con **dati di fatturazione**
  (privato o azienda; CF obbligatorio; per le aziende P.IVA, SDI o PEC) e **consensi**
  (termini di vendita; recesso, §10) → **Stripe Checkout** → ritorno su
  `/acquisto/esito` che aspetta la conferma del server.
- Webhook `/api/stripe/webhook`: verifica firma → ordine `pagato` → iscrizione (riuso di
  `addIscritto`, con il collegamento della persona) e `accesso_fino_al` → Eventi
  `ordine.pagato` + `iscrizione.created {origine: 'acquisto'}` → email di conferma.
- Codici sconto: quelli di Stripe (promotion codes), attivabili per offerta.
- Un corso per ordine (niente carrello).

### 3f. Area admin "Vendite"
- Voce di menu **Vendite**: ordini con stato, importo, offerta, data, acquirente; filtri;
  dettaglio con dati di fatturazione; **Rimborsa** (Stripe API, totale) con conferma; export
  CSV per la fatturazione/contabilità; KPI in dashboard (incassi del mese, ordini, rimborsi).
- Rimborso → webhook `charge.refunded` → ordine `rimborsato` → accesso revocato
  (`accesso_fino_al` = ora; l'iscrizione e i suoi Eventi restano: il registro è append-only).

### 3g. Area discente
- "I miei corsi" invariata (i corsi acquistati compaiono come gli altri) + scadenza
  dell'accesso visibile; in `/profilo` la sezione **I miei acquisti** (ordini, ricevute
  Stripe, eventuale fattura caricata dall'admin).

## 4. Scope OUT (rinviato)

- Tutto il **multi-ente** (`docs/visione-multi-ente.md`): appartenenze, console di
  piattaforma, domini per ente, Stripe Connect per gli altri enti.
- **Fattura elettronica automatica** verso lo SDI (si parte con l'export, §10.3).
- Carrello con più corsi, abbonamenti, pacchetti, prezzi per azienda, **voucher/posti
  aziendali** (si legano al referente aziendale), affiliazioni, recensioni, marketplace.
- Corsi **finanziati** in vendita (i fondi seguono la rendicontazione, non l'acquisto).
- Pagamenti diversi dalla carta (bonifico, PayPal) salvo quelli che Stripe Checkout offre
  senza lavoro aggiuntivo.

## 5. Ordine di costruzione

1. **Schema**: `offerta`, `ordine`, `tenant_dominio`, `iscrizione.accesso_dal/fino_al`,
   finestra per iscrizione nella RPC del player, funzione anonima del catalogo, RPC di
   transizione dell'ordine con Evento. pgTAP: isolamento, anon vede solo il pubblicato,
   finestra per iscrizione, idempotenza.
2. **Offerte (admin)**: scheda Vendita dell'edizione.
3. **Catalogo pubblico** e scheda corso.
4. **Registrazione** + collegamento della Persona.
5. **Acquisto**: dati di fatturazione, consensi, Checkout, webhook, esito, email → **gate M6a**.
6. **Vendite (admin)**: elenco, rimborso, export, KPI; "I miei acquisti" → **gate M6**.

## 6. Schema dati (proposta)

- `tenant_dominio (host pk, tenant_id)`.
- `offerta (id, tenant_id, edizione_id, slug unico per ente, stato, prezzo_centesimi,
  valuta 'eur', aliquota_iva, iva_inclusa, natura_iva (es. esente art. 10), posti_max,
  accesso_giorni, vendita_dal, vendita_al, codici_sconto bool, titolo_pubblico,
  descrizione_pubblica, cover_path, creato_il, pubblicata_il, ritirata_il)`.
- `ordine (id, tenant_id, persona_id, offerta_id, stato in_attesa|pagato|rimborsato|annullato,
  importo_centesimi, sconto_centesimi, valuta, stripe_checkout_session unico,
  stripe_payment_intent, fatturazione jsonb (PII: tipo, nome/ragione sociale, CF, P.IVA,
  indirizzo, SDI/PEC), consensi jsonb (versioni e orari), iscrizione_id, creato_il, pagato_il,
  rimborsato_il)`. Modificabile solo dalle RPC di transizione (service role), mai dal client.
- `iscrizione` + `accesso_dal`, `accesso_fino_al`, `origine` (admin|import|acquisto).
- Eventi nuovi: `offerta.created/updated/published/withdrawn`, `ordine.created/paid/refunded/
  cancelled` (payload: offerta_id, importo, valuta, stripe id — niente dati personali).

## 7. Decisioni vincolanti da rispettare

D8 (tutto si ricalcola dagli Eventi), D18 (niente PII nel log), D22 (il corso si congela alla
prima edizione: un'offerta si crea su un'edizione, quindi su un corso già congelato), D26
(sblocco per Eventi), R2 (fuori finestra blocco totale, ora anche per iscrizione), regola
"ogni funzione nuova revoca EXECUTE ad anon" (salvo la lettura del catalogo, voluta).

## 8. Gate M6a — si compra e si studia (Stripe in modalità test)

1. Un visitatore anonimo vede in `/catalogo` **solo** le offerte pubblicate del proprio
   ente; nessuna PII nelle risposte.
2. Registrazione con conferma email → Persona creata; con un'email già presente →
   collegamento, nessun doppione.
3. Acquisto con carta di test → webhook → ordine `pagato`, iscrizione, Evento; il corso è in
   "I miei corsi" e si segue fino all'attestato.
4. Webhook ripetuto o fuori ordine → una sola iscrizione, un solo `ordine.paid`.
5. Pagina di ritorno senza webhook (pagamento non confermato) → nessuna iscrizione.
6. Accesso a scadenza: dopo `accesso_fino_al` la RPC del player rifiuta, la pagina spiega.
7. Posti esauriti → acquisto bloccato prima di Stripe; corsa all'ultimo posto → un solo
   ordine pagato con posto, l'altro rimborsato automaticamente o rifiutato (§10).
8. Catena del registro integra; test di isolamento fra enti verdi.

## 9. Gate M6 — si gestisce

1. Rimborso dall'admin → ordine `rimborsato`, accesso revocato, Evento, registro integro.
2. Export ordini con i dati necessari alla fattura.
3. Consensi (termini, recesso) registrati con versione e orario.
4. Passaggio alle chiavi **live** documentato e provato con un acquisto reale di prova e
   rimborso.
5. Email di conferma d'acquisto col nome dell'ente.

## 10. Da ratificare prima di iniziare

1. **Cosa si vende all'inizio.** (a) Solo corsi online "sempre disponibili" con accesso di N
   giorni; (b) anche edizioni a date con posti limitati. *Proposta: (b), lo stesso modello
   copre entrambi a costo quasi nullo.*
2. **Account prima o dopo il pagamento.** (a) Registrazione, poi acquisto; (b) acquisto come
   ospite e account creato dopo con un link. *Proposta: (a), più semplice e senza account
   "orfani"; il passaggio in più è breve.*
3. **Fatturazione.** (a) All'inizio export degli ordini e fatture emesse dal vostro gestionale
   (Stripe manda la ricevuta); (b) subito fattura elettronica automatica via un servizio
   (Fatture in Cloud, Aruba…). *Proposta: (a) per il gate M6a/M6, (b) come fase successiva.*
4. **IVA.** Aliquota e natura per offerta (22% o esenzione art. 10 n. 20 DPR 633/72 se
   l'ente ne ha i requisiti), prezzi **IVA inclusa** per i privati. *Da decidere col
   commercialista; il software supporta entrambe.*
5. **Recesso (contenuti digitali).** (a) Casella obbligatoria "chiedo di iniziare subito e
   prendo atto di perdere il diritto di recesso"; (b) recesso pieno di 14 giorni con rimborso
   su richiesta. *Proposta: (a), è la prassi per i contenuti digitali; testo da far
   validare.*
6. **Rimborso e attestato.** Se c'è già un attestato: (a) rimborso possibile, l'attestato
   resta valido; (b) rimborso bloccato salvo conferma esplicita dell'admin con motivo.
   *Proposta: (b).*
7. **Vendita delle edizioni a date**: chiude (a) all'inizio dell'edizione, (b) a posti
   esauriti, (c) a una data impostata. *Proposta: tutte e tre, la prima che arriva.*
8. **Home per chi non è loggato**: (a) catalogo; (b) login come oggi, catalogo su `/catalogo`.
   *Proposta: (a).*
9. **Dati chiesti all'acquisto**: CF obbligatorio, data e luogo di nascita (per
   l'attestato) chiesti subito o al primo attestato? *Proposta: CF subito, nascita al primo
   attestato come oggi.*

## 11. Prerequisiti lato utente (prima del gate M6, alcuni già prima di M6a)

- **Account Stripe** dell'ente (verifica aziendale) e chiavi di **test** su Vercel come
  variabili d'ambiente (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`): mai in chat.
- **SMTP** su Supabase (Brevo o simili): senza, le email di conferma della registrazione
  arrivano a pochissime persone l'ora. **Bloccante per M6a.**
- **Supabase Pro** prima di incassare davvero: sul piano gratuito il progetto va in pausa dopo
  7 giorni di inattività, e un negozio non può fermarsi.
- **Testi legali**: termini e condizioni di vendita, informativa privacy aggiornata
  (acquirenti), clausola di recesso, dati dell'ente venditore (P.IVA, sede, PEC).
- **Ente reale** creato con `npm run nuovo-ente` (non il tenant demo) prima delle chiavi live.
- Decisione IVA col commercialista (§10.4).

## 12. Note tecniche

- Dipendenza nuova: `stripe` (SDK ufficiale, solo server). Checkout in modalità `payment`,
  `client_reference_id` = id dell'ordine, `metadata` con ordine e offerta.
- Posti limitati: il controllo dei posti e la creazione dell'ordine `in_attesa` in una RPC con
  lock sull'offerta; l'ordine in attesa scade con la sessione Stripe (30 minuti).
- Il webhook gira con la service role (come `quiz.submitted`), il fail-fast di `proxy.ts` si
  estende a `/api/stripe/*` e `/api/acquisto/*`.
- Prove: Stripe in modalità test; dal container `api.stripe.com` potrebbe non essere
  raggiungibile → i flussi completi si provano sull'anteprima Vercel (carte di test) e con un
  workflow come `verifica-scritture.yml`; la logica (idempotenza, transizioni, finestra) con
  unit test e pgTAP.
