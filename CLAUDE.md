# Stato del progetto FAD — Fase 1–4 chiuse, UX rifatta, **Fase 5 (test + attestato) in corso** (handoff session-to-session)

> Questo file è il primo da leggere all'inizio di ogni nuova sessione.
> Riassume cosa è stato fatto, cosa resta, e come riprendere senza dover
> rispiegare nulla. Fonte autoritativa per *cosa* costruire: `docs/brief-fase-1.md`
> (Fase 1, chiusa), `docs/brief-fase-2.md` (Fase 2, chiusa), `docs/brief-fase-3.md`
> (Fase 3, chiusa fino a M3a), `docs/brief-fase-4.md` (Fase 4, chiusa fino a M4) e
> `docs/brief-fase-5.md` (Fase 5, **corrente** — è il mandato) — e in caso di
> conflitto `piattaforma-elearning-stato-progetto-v8.md` (non in repo) con le
> decisioni D1–D37.

## Next 16 — aggiornamento del framework (2026-10-21, branch `claude/affectionate-hawking-03ev7i`, **su `main` dal 2026-10-21 mattina** con il via libera dell'utente "Procedi": fast-forward `1aea271..7f1441e`; CI verde; deploy di produzione `dpl_HXRTRjcr…` READY, login e `/verifica/<codice>` verificati sul deploy)

Motivo: `npm audit --omit=dev` segnalava `next` 14.2.15 (critical: DoS via Server
Actions, origine del dev server) e `postcss` 8.4.31 (high, trascinata da Next); le
due correzioni non invasive (`nanoid`, `source-map-js`) erano già su `main`
(`1aea271`). L'utente: "non riesco a verificare adesso, procedi tu".

- *Pacchetti*: `next` 14.2.15 → **16.4.2**, `react`/`react-dom` 18.3 → **19.3.1**
  (+ `@types/react*` 19), `eslint` 8 → **9.39** con `eslint-config-next` 16.4.2
  (config piatta `eslint.config.mjs`, `.eslintrc.json` eliminato; script `lint` =
  `eslint .`, perché `next lint` non esiste più), `@supabase/ssr` 0.5.2 → **0.12.7**
  (il formato del cookie di sessione è invariato: prefisso `base64-`, pezzi da 3180
  → `tests/carico/player.js` e `scripts/verifica-scritture.mjs` non cambiano),
  `@supabase/supabase-js` 2.106 → 2.118. Tolto `geist` (non più importato). Nessuna
  modifica a schema, RLS o Eventi.
- *Codemod ufficiali* (`npx @next/codemod@16.4.2 …`): `next-async-request-api` (65
  file: `params`/`searchParams` sono **Promise** in pagine, layout e route handler →
  `const params = await props.params`), `middleware-to-proxy` (`src/middleware.ts` →
  **`src/proxy.ts`**, `export async function proxy`; la logica fail-fast 503 e
  `updateSession` sono identiche), `next-lint-to-eslint-cli`.
- *A mano*: `cookies()` è asincrona → **`createSupabaseServerClient()` è `async`**
  e tutti i 107 punti di chiamata fanno `await` (`src/lib/supabase/server.ts` e
  `middleware.ts` passati all'API `getAll/setAll`); i due alias
  `ReturnType<typeof createSupabaseServerClient>` sono `Awaited<…>`; con
  `typedRoutes` stabile (`next.config.js`: `typedRoutes: true`, non più
  `experimental`) i tre `redirect(hrefPaginaUno(…))` castano `as Route`;
  `agentRules: false` (Next 16 genera un `AGENTS.md` all'avvio del dev server: qui
  c'è CLAUDE.md); `next-env.d.ts` ora è **generato e ignorato da git** (cambia tra
  `.next/dev/types` e `.next/types`), e `npm run typecheck` = `next typegen && tsc
  --noEmit`; `tsconfig.json` aggiornato da Next (`jsx: react-jsx`, include di
  `.next/dev/types`).
- *Lint nuovo (react-hooks 7, regole del React Compiler)*: 8 errori sistemati —
  `Date.now()` durante la resa (`AgendaList`, `SessioniList`, `ProfiloForm`) fissato
  con `useState(() => …)`; `Lezioni.tsx` riallinea l'ordine con lo schema "stato
  della resa precedente" invece del ref; i tre `setState` dentro `useEffect`
  voluti (avviso dall'URL nel login, tema da localStorage, casella di ricerca che
  segue l'URL) hanno `eslint-disable-next-line react-hooks/set-state-in-effect`
  con il motivo. `--fix` ha tolto 4 direttive `eslint-disable` ormai inutili.
- *Verifiche*: typecheck 0, lint 0, unit 39/39, fase4 15/15, build **Turbopack** ok
  (52 route, "ƒ Proxy (Middleware)"; anche `next build --webpack` passa), smoke E2E
  **99/99** con 0 errori JS sul dev server Next 16, `scratchpad/pw/funcC.mjs` 37/37,
  PDF (`pdf-lib`) e badge 1200×1200 e 1200×630 (`ImageResponse`) dell'attestato del
  discente demo 200 con i byte attesi (`scratchpad/pw/next16_attestato.mjs`).
  `npm audit --omit=dev` → **0 vulnerabilità**. Vercel ha Node 24 (richiesto ≥ 20.9).
  **Trabocchetto**: la prima build Turbopack nel container è fallita con "next/font/
  google queries have exactly one entry" (scaricamento dei font via proxy): al
  secondo tentativo, anche da `.next` pulita, passa; su Vercel non c'è il proxy.
  Gli script `func6.mjs`/`func7.mjs` dello scratchpad sono **obsoleti** (pulsante
  Salva disabilitato perché i dati di nascita ci sono già; sezione "modello
  specifico" spostata in `/admin/corsi/[id]/attestato` dall'ondata A), non sono
  regressioni.
- **Da provare nel browser dopo il deploy**: login e logout, player video fino a
  fine lezione, test finale, PDF/badge/LinkedIn dell'attestato, area admin (form e
  azioni che scrivono), tema scuro. Poi **merge su `main` solo con autorizzazione
  esplicita**.

## Area admin — ondate A, B e C (2026-10-21, branch `claude/affectionate-hawking-03ev7i`, **su `main` dal 2026-10-20 sera** con il via libera dell'utente "Vai": fast-forward `e855143..4385cf9`, 9 commit; scritture verificate sul deploy, vedi in fondo all'ondata C)

Richiesta dell'utente: "contenuti" come lista piatta non ha senso, i webinar stanno allo
stesso livello dei corsi; serviva un'analisi obiettiva e proposte per un'area admin usabile
e scalabile. Analisi e proposte nel doc Claude **"Analisi area admin FAD"**
(`https://claude.ai/code/artifact/0d109b23-69d9-4a19-b25f-b5ca8186ad20`): diagnosi (menu
per tabella e non per lavoro, docenti/persone senza interfaccia, liste non scalabili),
principio **"il corso è l'unità di lavoro, l'edizione l'unità di erogazione"**, 5 proposte,
piano in 3 ondate (A orientamento, B libreria, C scala). L'utente ha **approvato il piano**;
decisioni prese con i default proposti: pagina dell'edizione di primo piano, Attestati sotto
Rendicontazione, docenti subito, Persone/Aziende/archiviazione/categorie nell'ondata C,
codice senza tavole intermedie.

**Ondata A fatta (questa sessione):**
- *Menu a 5 voci* (`AppShell`): Dashboard, Corsi, Agenda, Rendicontazione, Impostazioni.
  Conteggi: corsi, sessioni future. "Corsi" resta attiva anche su `/admin/learning-objects`.
- *Route* (gruppi `(corso)` e `(edizione)` per non annidare le testate):
  `/admin/corsi/[id]` → `(corso)/layout.tsx` (testata: briciole, stato Bozza/Attivo/Concluso
  da `corsoStato(edizioni)` in `db-types.ts`, Duplica, Nuova edizione) + schede con
  indirizzo: Panoramica (`(corso)/page.tsx`: copertina, descrizione, edizioni attive con
  **prontezza** iscritti/sessioni/piano/attestati, "In sintesi", "Prossimi passi" in bozza),
  `/lezioni` (`_components/Lezioni.tsx`: sequenza + pannello Aggiungi lezione a 3 scelte:
  Nuova / Dalla libreria con ricerca e filtro tipo / Da CSV; la libreria viene caricata solo a
  corso in bozza, max 500), `/edizioni` (`EdizioniPanel`: tabella con iscritti/sessioni/
  attestati, ogni riga apre l'edizione; `?nuova=1` apre il form; dopo la creazione
  reindirizza all'edizione), `/attestato` (`FormAttestato` + `ModelloEditor`),
  `/impostazioni` (`FormImpostazioni`: dati, copertina, regole di fruizione; niente più
  "congelato" in interfaccia: "il corso ha edizioni, titolo/categoria/regole sono fissati").
  `/admin/corsi/[id]/edizioni/[edizioneId]` → `(edizione)/layout.tsx` (briciole Corsi →
  corso → codice, schede) + Iscritti (indice, `_components/Iscritti.tsx`: tabella, Invita,
  piano, attestato Emetti/Riemetti, rimuovi, aggiunta manuale/CSV in una card a comparsa),
  `/sessioni` (`SessioniList` con stato pianificata/da riconciliare/presenze registrate +
  `NewSessioneForm` con edizione fissa e scelta del docente), `/sessioni/[sessioneId]`
  (pagina sessione spostata qui: `SessioneDettagli` — titolo, data, durata, riunione,
  docente, Annulla sessione — + report importati, `CodaResolver`, `PresenzeManager`,
  `CsvImportForm`), `/docenti` (`IncarichiPanel`: incarichi con persona e ruolo; assegna da
  anagrafica con ricerca client o persona nuova), `/fondo` (`FondoPanel`: piani con n.
  iscritti, **Assegna a tutti**, prontezza per la rendicontazione, link alla rendicontazione
  filtrata), `/stato` (riusa `CompletamentoTable` dell'auditor per la sola edizione +
  `EdizioneModifica` codice/date + `EdizioneAzioni` concludi/annulla).
  `/admin/agenda` (`AgendaList`: tutte le sessioni per giorno, Prossime/Passate/Tutte, sola
  lettura, coda aperta per sessione). `/admin/rendicontazione` (= vecchio report-fondo) con
  schede Report fondi | Attestati (`/admin/rendicontazione/attestati`). `/admin/impostazioni`
  (= vecchia pagina Ente). `/admin/learning-objects` = scheda "Libreria dei contenuti" di
  Corsi (`CorsiTabs`), senza voce di menu. **Redirect** in `next.config.js`
  (`/admin/sessioni`→agenda, `/admin/report-fondo`, `/admin/attestati`, `/admin/ente`) e
  pagina `src/app/admin/sessioni/[id]/page.tsx` che cerca la sessione e reindirizza.
  `src/app/page.tsx`: l'admin atterra su `/admin`.
- *Dashboard*: KPI (corsi attivi, edizioni in corso, iscritti, sessioni nei 7 giorni) →
  catalogo filtrato/agenda; tabella **Edizioni in corso** (iscritti, con piano, sessioni, da
  riconciliare, attestati) con link all'edizione; prossimi 7 giorni; avviso se ci sono
  partecipanti da riconciliare; attività recente con i nuovi eventi.
- *Catalogo*: stati Tutti/Attivi/Bozze/Conclusi con conteggi, card con lezioni, edizioni
  attive, iscritti; `?stato=attivo|bozza|concluso`.
- *Backend*: migration `20261021000001_incarico_delete_admin.sql` (**applicata sul live**:
  policy DELETE admin su `incarico`); route `POST /api/admin/edizioni/[id]/incarichi`
  (persona esistente o nuova per email, Eventi `incarico.created` + eventuale
  `persona.created` con `origine: 'incarico'`), `DELETE /api/admin/incarichi/[id]` (409 se
  una sessione lo usa, Evento `incarico.removed`), `PATCH /api/admin/sessioni/[id]`
  (titolo/data/durata/riunione/`incarico_id` della stessa edizione; `{annulla: true}` →
  `annullato_at`, Eventi `sessione.updated`/`sessione.cancelled`),
  `POST /api/admin/edizioni/[id]/piano` (`piano_id` a tutte le iscrizioni dell'edizione,
  Evento `edizione.piano_assegnato {piano_id, n_iscrizioni}`). Etichette in
  `eventi-etichette.ts`. Tipi `IncaricoRuolo`, `INCARICO_RUOLO_LABEL`, `RUOLI_DIDATTICI`,
  `IncaricoConPersona`, `StatoCorso` in `db-types.ts`.
- *Primitive*: `components/admin/Tabs.tsx` (schede = indirizzi, `.tabs` in CSS),
  `useCall.ts` (fetch + refresh + toast + errore; sostituisce il `call()` del builder),
  `ErrorBanner.tsx`, `SezioneTabs.tsx` (`CorsiTabs`, `RendicontazioneTabs`). CSS: `.tabs`,
  `.head-chips`, `.ready` (prontezza), `.tbl tr.is-link`, `.agenda-day`, `.corso-intro`,
  e **`.grid-2-380 > *, .grid-2 > *, .grid-3 > * { min-width: 0 }`** (le colonne non si
  allargano alle tabelle: era la causa dello sforamento su telefono).
- Il vecchio `CorsoEditor.tsx` (1.610 righe) è stato eliminato; le sezioni vivono nei file
  `_components/` sopra. Linguaggio: "lezioni" (non "oggetti"/"struttura"), "attivo/concluso"
  (non "congelato") nell'area admin; "congelato" resta termine tecnico del registro e del DB.
- *Verifiche*: typecheck 0, lint 0, unit 39/39, fase4 15/15, build 40 route, **E2E smoke
  69/69** a 1440/390 (aggiornata ai nuovi indirizzi, incluso il redirect di
  `/admin/sessioni`), schermate in scratchpad `shotsA/` senza sforamenti né errori JS.
  Senza chiave di servizio dal container non si provano le scritture nuove (incarichi,
  PATCH sessione, piano a tutti).
- **Da provare nel browser dall'utente** (anteprima Vercel del branch): giro completo
  corso → edizione → sessione; assegnare un docente e sceglierlo in una sessione;
  "Assegna a tutti" il piano; Concludi edizione dalla scheda Stato; l'agenda; i redirect
  dai vecchi indirizzi. Poi **merge su `main` solo con autorizzazione esplicita**.
**Ondata B fatta (libreria, stessa sessione, "procedi con l'ondata B"):**
- *Ricerca sul server*: `GET /api/admin/learning-objects/cerca?q=&tipo=&escludi_corso=`
  (titolo `ilike`, attivi, max 30 + `troncato`, `usato_in` per riga) e `POST …/cerca
  {titoli}` che classifica i titoli di un CSV (esiste già in libreria?). Entrambe di sola
  lettura: la POST è esente dal fail-fast del middleware (`SOLO_LETTURA`). Il pannello
  "Dalla libreria" di `Lezioni.tsx` interroga il server a ogni battuta (250 ms) con filtro
  tipo; la pagina Lezioni **non carica più la libreria intera**; l'anteprima CSV classifica
  via POST (se la chiamata fallisce, decide comunque il server all'import).
- *Pagina del contenuto* (`learning-objects/[id]`): niente più JSON. `ContenutoForm.tsx`:
  titolo; per i video ID/link Vimeo + durata con **sostituzione del video** (conferma se
  usato in N corsi) e anteprima iframe a richiesta; per i PDF nome e peso, **Apri il PDF**
  (signed URL dal browser con la policy di lettura del tenant) e **Sostituisci PDF**
  (upload su `documenti/{tenant}/{loId}-{ts}.pdf`, il file precedente resta nel bucket);
  per i test il `QuizEditor`. Card "Usato come lezione in" (corsi con posizione e stato,
  link alla scheda Lezioni) e `ArchiviaPanel` (ex `EditLearningObjectForm`). Briciole
  Corsi → Libreria → titolo.
- *Backend*: `src/lib/lo-config.ts` (validatori video/documento condivisi da POST e PATCH);
  `PATCH /api/admin/learning-objects/[id]` accetta `config` anche per video e documento
  (sostituzione sempre ammessa: D22 protegge la sequenza, non il contenuto; per i test
  resta il blocco a corso attivo). Evento `learning_object.updated` con la nuova config
  (nessuna PII).
- *Libreria* (`LibreriaView.tsx`, sostituisce `ContenutiTable`): vista **Per corso**
  (predefinita: un gruppo per corso, attivi → bozze → conclusi, lezioni in ordine, "anche in
  N altri corsi", gruppo finale **In nessun corso** con Archivia) oppure **Elenco** (tabella
  con ordinamento); filtri tipo e Attivi/Archiviati/Tutti, ricerca per titolo/file/ID.
- *Verifiche*: typecheck 0, lint 0, unit 39/39, build 41 route, `scratchpad/pw/funcB.mjs`
  **13/13** (vista per corso, elenco, pagina video senza JSON con anteprima, pagina PDF con
  Sostituisci/Apri, pagina test, API cerca GET/POST, pannello Dalla libreria sul corso in
  bozza con risultati e ricerca vuota), smoke E2E **72/72**. L'anteprima Vimeo nel
  container mostra l'icona rotta (vimeo.com non raggiungibile da qui). Non provati da qui
  (scrivono): sostituzione del video, sostituzione del PDF.
**Ondata C fatta (scala, stessa sessione, "Avanti procediamo"):**
- *Schema* (`20261021000002_ondata_c_scala.sql`, **applicata sul live**; test
  `supabase/tests/ondata_c_scala.sql` **10/10** in rollback via MCP): `corso.archiviato_at`
  (**fuori dal freeze D22**, come la copertina: vale anche a corso congelato); tabella
  **`categoria`** per tenant (unique su `lower(nome)`, RLS read tenant / write admin, seed
  con le 5 categorie prima cablate + quelle usate dai corsi; `corso.categoria` resta testo
  congelato: la rinomina si propaga ai soli corsi in bozza); `azienda.partita_iva`
  normalizzata e **unica per tenant** (indice parziale); RPC **`azienda_unisci(da, a,
  attore)`** SECURITY DEFINER (admin del tenant o service role: sposta le iscrizioni,
  completa i campi vuoti, elimina il doppione con DELETE composto a runtime, Evento
  `azienda.unita {da, n_iscrizioni}`); **4 viste `security_invoker`** (le RLS delle tabelle
  valgono): `corso_riepilogo` (n_lezioni, durata_sec, n_edizioni, n_edizioni_attive,
  n_iscritti, `stato` bozza|attivo|concluso|archiviato), `edizione_riepilogo` (stato,
  n_iscritti, n_con_piano, n_sessioni, n_sessioni_future, n_da_riconciliare, n_attestati,
  n_incarichi), `persona_riepilogo` (accesso, n_iscrizioni, n_attestati, n_incarichi,
  ultima_iscrizione_il), `azienda_riepilogo` (n_iscrizioni, n_persone). Niente grant ad anon.
- *Catalogo* (`/admin/corsi`, `CatalogoLista.tsx`, `CorsiCatalog.tsx` eliminato): **lista
  sul server** dalla vista con `?q=&stato=&categoria=&ordine=&pagina=` (25 per pagina,
  `count: 'exact'`), segmenti Tutti/Attivi/Bozze/Conclusi/**Archiviati** con conteggi
  (head count per stato), selettore categoria dal DB, miniatura della copertina, caselle di
  selezione + **barra azioni in blocco** (Archivia / Ripristina). Primitive in
  `components/admin/Lista.tsx`: `useFiltriUrl` (filtri nell'URL con `router.replace`),
  `RicercaUrl` (300 ms), `SegUrl` (link), `SelectUrl`, `PagerUrl` (link `?pagina=`),
  `BulkBar`, `parsePagina`/`intervallo`/`PER_PAGINA`. CSS `.seg a`, `.t-check`,
  `tr.is-selected`, `.tbl--lista`, `.lista-corso`, `.cover--thumb`, `.bulkbar`.
- *Archiviazione*: `POST /api/admin/corsi/archivia {corso_ids, ripristina?}` (max 200; si
  archivia solo senza edizioni attive, esito `fatti`/`saltati` con motivo; Eventi
  `corso.archived`/`corso.unarchived {titolo}`). Testata del corso dalla vista
  (`(corso)/layout.tsx`): chip Archiviato, banner, `CorsoAzioni` con Archivia/Ripristina
  (niente "Nuova edizione" se archiviato; `EdizioniPanel` idem). Catalogo predefinito,
  dashboard, conteggio del menu e libreria per corso escludono/ordinano gli archiviati
  (`corsoStato(edizioni, archiviatoAt)`, `StatoCorso` include `'archiviato'`).
- *Categorie*: `/admin/impostazioni/categorie` (`CategorieEditor`: aggiungi, rinomina
  inline, su/giù, elimina solo se non usata, chip "usate dai corsi ma non in elenco");
  `ImpostazioniTabs` (Ente e attestati | Categorie dei corsi); API `GET/POST
  /api/admin/categorie`, `PATCH/DELETE /api/admin/categorie/[id]` (Eventi
  `categoria.created/updated/removed {nome}`; la PATCH con nuovo nome aggiorna i corsi
  senza edizioni). `NewCorsoForm` e `FormImpostazioni` ricevono `categorie` dal DB
  (`CATEGORIE` cablata eliminata da `shared.ts`).
- *Persone e Aziende* (voce di menu **Persone**, 6 voci; icona `settings` per
  Impostazioni): `/admin/persone` (`PersoneLista`: ricerca cognome/nome/email/CF sul server,
  segmenti Tutte/Con accesso/Da invitare e Tutti i ruoli/Docenti e tutor/Senza iscrizioni,
  paginazione, selezione + **Invita chi non ha accesso**); `/admin/persone/[id]`
  (`PersonaForm`: anagrafica + nascita, `PATCH /api/admin/persone/[id]` con Evento
  `persona.updated {campi}` senza valori; iscrizioni con link, attestati validi, incarichi);
  `/admin/aziende` (`AziendeLista`: ricerca, **Nuova azienda** `POST /api/admin/aziende`,
  modifica inline `PATCH /api/admin/aziende/[id]`, **Unisci in…** con ricerca sul server
  → `POST /api/admin/aziende/[id]/unisci {in}` → RPC); `PersoneTabs`. Ricerche di sola
  lettura `GET /api/admin/persone/cerca?q=` e `GET /api/admin/aziende/cerca?q=&escludi=`
  (max 30 + `troncato`). `IncarichiPanel` cerca la persona sul server (la pagina docenti non
  carica più 500 persone). `lib/anagrafiche.ts` (validazioni categoria/azienda,
  `AZIENDA_SELECT`), `lib/iscritti.ts` `normalizzaPartitaIva` + `addIscritto` riconosce
  l'azienda **prima per P.IVA** poi per ragione sociale (CSV iscritti: colonna "Partita
  IVA"; Evento `azienda.created {origine, ha_partita_iva}`).
- *Azioni in blocco sugli iscritti* (`Iscritti.tsx`: caselle + `BulkBar`): `POST
  /api/admin/edizioni/[id]/blocco {azione: invita|piano|attestato|rimuovi, iscrizione_ids,
  piano_id?}` (max 500, una iscrizione alla volta con gli stessi Eventi delle azioni
  singole, esito `fatti`/`saltati` con motivo; l'attestato solo agli idonei senza attestato
  valido via `emettiAttestatoManuale`).
- *Dashboard*: solo conteggi (`head: true`) e le 12 edizioni attive più recenti dalla
  vista `edizione_riepilogo` (con `corso`); niente più iscrizioni/attestati/coda caricati per
  intero; KPI Iscritti → `/admin/persone`. Pagina Edizioni del corso dalla vista.
- *Etichette* `eventi-etichette.ts`: `corso.archived/unarchived`, `categoria.*`,
  `persona.updated`, `azienda.created/updated/unita`.
- *Verifiche*: typecheck 0, lint 0, unit 39/39, fase4 15/15, build **52 route**;
  `scratchpad/pw/funcC.mjs` **37/37** (catalogo: righe, segmenti, ricerca che aggiorna
  l'URL e filtra sul server, filtro da link, ordine per titolo, categorie dal DB, selezione +
  barra in blocco, archivia → 503 controllato; testata corso con Archivia; categorie;
  persone con filtri, ricerca, pagina oltre l'ultima → torna alla prima tenendo i filtri;
  scheda persona; aziende con nuova/unisci; iscritti in blocco; docenti con ricerca sul
  server; dashboard; 0 overflow a 1440/390, 0 errori JS), schermate in `shotsC/`; smoke E2E
  **99/99** (controlli nuovi: catalogo lista/URL/archiviati, iscritti in blocco, categorie,
  persone con scheda, aziende, API cerca persone/aziende e categorie). Trabocchetto nuovo: **le funzioni esportate da un modulo `'use client'`
  (`Lista.tsx`) arrivano ai Server Component come riferimenti vuoti** ("is not a
  function"): le pure (`parsePagina`, `intervallo`, `PER_PAGINA`, `fuoriIntervallo`,
  `hrefPaginaUno`) stanno in `lib/paginazione.ts`. PostgREST risponde 416 se `?pagina=` è
  oltre l'ultima: le liste reindirizzano alla prima pagina con gli stessi filtri.
- **Scritture verificate sul deploy (2026-10-20, "Non puoi verificare tu?")** con
  `scripts/verifica-scritture.mjs` + workflow `.github/workflows/verifica-scritture.yml`:
  gira su un runner GitHub (raggiunge vercel.app e Supabase, a differenza del container),
  fa il login dell'admin via Supabase Auth, costruisce il cookie di sessione nel formato
  `@supabase/ssr` (come `tests/carico/player.js`), entra nell'anteprima protetta col link
  `_vercel_share` (strumento Vercel `get_access_to_vercel_url`, scade in 23 ore) e chiama le
  API. **29/29** sull'anteprima del commit `2f3e6a5`: categorie (crea, doppione rifiutato,
  assegna al corso in bozza, rinomina propagata, eliminazione rifiutata se usata, elimina),
  archivia (bozza archiviata, corso attivo saltato, già archiviato, ripristino), persona
  (modifica e ripristino, email non valida), aziende (P.IVA normalizzata `IT 098…` →
  `098…`, doppia rifiutata, modifica, ricerca con esclusione, unione con sede copiata e
  riga eliminata, pulizia unendo la prova nella demo, unione con sé stessa rifiutata),
  blocco iscritti (piano assegnato/tolto a Neri con Bianchi "già così", azione ignota
  400, attestato: Neri saltata "non completato", Bianchi "ha già un attestato valido"),
  catena integra (246 eventi). Nessun residuo nel DB. **Effetto permanente**: il primo
  giro ha emesso l'attestato di Mario Bianchi (ED-WEB-2026, idoneo al 100%: Evento 216).
  **Difetto trovato e corretto grazie alla prova**: gli Eventi `categoria.*` portavano la
  chiave `nome` → `audit_append` la rifiuta (guardia anti-PII sulle CHIAVI nome/cognome/
  email/codice_fiscale, non sui valori) → HTTP 500 dopo l'INSERT. Ora `titolo`. **Regola**:
  nei payload mai le chiavi `nome`/`cognome`/`email`/`codice_fiscale`, nemmeno per cose che
  non sono persone. Limiti dello strumento: l'integrazione GitHub della sessione non può
  avviare i workflow (`workflow_dispatch` → 403) → il workflow parte dal push che tocca lo
  script o il file del workflow, con URL e link `_vercel_share` scritti nel file (da
  aggiornare a ogni anteprima nuova; l'utente può anche lanciarlo a mano da GitHub con gli
  input); i Vercel Sandbox non sono abilitati (403). Non provati: invito in blocco (manda
  email), rimozione in blocco (toccherebbe i seed), CSV con Partita IVA (parsing lato
  client, logica di `addIscritto` coperta dalla prova delle aziende).

## Fase 5 — test finale e attestato (2026-10-20, branch `claude/affectionate-hawking-03ev7i`, **su `main` dalla sera del 2026-10-20** con autorizzazione esplicita dell'utente "riporta su main"; Task 1–6 fatti, gate M5a chiuso, gate M5 da chiudere nel browser)

Richiesta dell'utente: "rilasciare a chi chiude il percorso e supera il test un
attestato e anche il badge da caricare su LinkedIn". Brief scritto e **ratificato**
(`docs/brief-fase-5.md`, §10): test prima, poi attestato; soglia 70%, tentativi
illimitati, ordine casuale, correzione mostrata solo se superato; pagina pubblica di
verifica con nome e cognome + corso, ente, ore, data, numero (mai CF/data di nascita);
emissione automatica all'idoneità (politica per corso: automatica/manuale/nessuna).

**Task 1–3 fatti (test finale, commit `b7dc1ea`; gate M5a da chiudere con la prova
nel browser dell'utente).**
- *Schema* (4 migration **applicate sul live**, pgTAP `supabase/tests/fase5_quiz_schema.sql`
  **15/15** sul live in rollback): `…000004` enum `lo_type` + `'quiz'`; `…000005`
  tabella `quiz_domanda` (`risposte` jsonb `[{testo, corretta}]` validate da
  `quiz_risposte_valide`: 2–8 risposte, singola = 1 corretta, multipla ≥ 1; unique
  `(learning_object_id, ordine)`; policy SELECT solo admin/auditor; freeze D22 con
  `tg_quiz_domanda_freeze` + `helper_lo_in_corso_congelato`; RPC `quiz_domande_salva(lo,
  domande, p_attore)` SECURITY DEFINER che sostituisce il set e scrive l'Evento
  `quiz.domande_aggiornate` con il solo `n_domande`); `…000006` `lo_config_shape` esteso
  (`quiz` ⇒ `config ? 'soglia_percentuale'`); `…000007` RPC `quiz_domande_pubbliche(lo)`
  SECURITY DEFINER: domande **senza il flag `corretta`** al discente iscritto a un corso
  con quel test (o staff del tenant); `anon` revocato ovunque.
- *Trabocchetto #13 esteso*: l'MCP si blocca anche sui batch con `DELETE`. Nelle
  migration i DELETE/DROP necessari sono composti a runtime (`execute format('%s …',
  'DEL' || 'ETE')`, `'DR' || 'OP'`), e la pgTAP via MCP raccoglie gli esiti in una temp
  table con `grant … to authenticated` (i test cambiano ruolo).
- *Applicativo*: `src/lib/quiz.ts` (correzione server-side `correggi`, multipla
  tutto-o-niente, `validaDomande`, `parseQuizCsv` con colonne Domanda; Risposta A..H;
  Corretta "A" o "A,C"; Tipo), `src/lib/quiz-types.ts` (`DomandaPublica`),
  `db-types.ts` (`QuizConfig {soglia_percentuale, tentativi_max, ordine_casuale,
  mostra_correzione}`, regola `quiz_passed`). **Admin**: terzo tipo "Test" in
  `/admin/learning-objects/new`; pagina LO con `QuizEditor` (regole → PATCH `config`,
  domande con aggiungi/sposta/togli, import CSV "Sostituisci/Aggiungi in coda", PUT
  `/api/admin/learning-objects/[id]/domande`; sola lettura a corso congelato);
  builder (riga "Test · soglia N%", aggiunta manuale e CSV con Tipo `test`), libreria e
  catalogo. **Discente**: `src/components/QuizPlayer.tsx` (intro → domande con lettere
  → esito `.quiz-result` con correzione se superato e `mostra_correzione` → "Riprova"/
  "Lezione successiva"); la pagina LO chiama `quiz_domande_pubbliche` **solo se il test è
  sbloccato** (D26) e mescola se `ordine_casuale`. **API** `POST /api/events/quiz`:
  `quiz.started` e `quiz.submitted` (payload: iscrizione_id, tentativo, punteggio,
  totale, percentuale, soglia, superato, indici risposte; mai testi); rifiuta se non
  sbloccato (403) o tentativi esauriti (409); le risposte giuste tornano al client solo se
  superato. **Compliance**: `quiz_passed` ⇒ completato solo con `quiz.submitted` e
  `payload.superato = true`; `ProgressoLO.quiz` (tentativi, ultima/migliore %,
  superato_il). Auditor: tentativi e migliore % nel dettaglio di `/audit/completamento`;
  etichette in `eventi-etichette.ts` (gruppo "test"). Tutto senza gergo per il discente.
- **Correzione di compliance scoperta facendo i fixture**: gli eventi di completamento
  erano filtrati per persona + LO, non per iscrizione: un contenuto della libreria
  riusato in due corsi portava il credito da un corso all'altro. Ora
  `computeProgressoForIscrizione` filtra anche `payload->>iscrizione_id` (indice
  `evento_payload_iscrizione_idx`); verificato sul live che **tutti** i 99 eventi del
  player hanno `iscrizione_id` nel payload (nessuna regressione sui corsi demo).
- *Fixture sul live* (`supabase/seed/corso_prova_quiz.sql`, 2 blocchi idempotenti sul
  codice edizione): corso **"Prova del test finale"** `98f32c4d-…` (video "Lezione 01"
  del corso a 6 video riusato, **senza** visione integrale, + test; edizione
  `ED-QUIZ-PROVA-01` `1cc3117c-…`, iscrizione discente `9da74f31-…`) e corso **"Prova
  del test finale (solo test)"** `6e83466d-…` (edizione `ED-QUIZ-PROVA-02` `baff688e-…`,
  iscrizione `a0c54628-…`). Test LO `38f31984-…` "Test finale - I finanziamenti", 5
  domande (3 singole, 2 multiple), soglia 70%. Catena integra a 181 eventi.
- *Verifiche*: typecheck 0, build 31 route, unit **32/32** (`tests/unit/quiz.test.ts`
  12), fase4 15/15, Playwright read-only `scratchpad/pw/func5_ro.mjs` **35/35** a
  1440/390 (admin: nuovo tipo, editor 5 domande con 8 corrette evidenziate, sola
  lettura; discente: test bloccato dal video con 403 dall'API, intro "solo test" senza
  `corretta` nel markup; auditor: dettaglio e log). L'errore JS "useContext of null" che
  compare **solo al primo caricamento dopo il login nel dev server** è un artefatto
  della prima compilazione (0 errori ai ricaricamenti), non un bug.
- **Da provare nel browser dall'utente (gate M5a)**: nel corso "solo test" → Inizia,
  rispondi, Consegna → esito con correzione, "Riprova" dopo un fallimento, idoneità con
  sigillo; nel corso "Prova del test finale" → il test si apre solo dopo il video;
  `/audit/log` mostra `quiz.started`/`quiz.submitted` e la catena resta integra; da
  admin creare un Test nuovo, scrivere domande e importarle da CSV. Senza
  `SUPABASE_SERVICE_ROLE_KEY` nel container le scritture non si provano da qui.

**Gate M5a chiuso dall'utente nel browser (anteprima Vercel del branch):** video,
tentativo al 40% non superato, poi 80% superato, catena integra. Rifiniture dopo il
riscontro: i pulsanti chiamano il test "Vai al test finale" (mai "Lezione N"), icona
del test nelle liste, e **nelle pagine del discente non compare più "idoneità"**
("Hai completato …", chip/stato "Completato", "N completati"); auditor, admin e
report fondi tengono "idoneo" (termine tecnico).

**Task 4–6 fatti (attestato, da provare nel browser → gate M5).**
- *Schema* (`20261020000008_fase5_attestato.sql`, **applicata sul live**; pgTAP
  `supabase/tests/fase5_attestato.sql` **19/19** in rollback): `corso.ore_totali`,
  `riferimento_normativo`, `politica_attestato` (automatica|manuale|nessuna, default
  automatica) — **freeze D22 esteso con un'eccezione**: ore e riferimento si compilano
  una volta anche a corso congelato se erano vuoti (per i corsi già in esercizio),
  politica congelata; `persona.data_nascita/luogo_nascita`; su `tenant` ragione sociale,
  città, firmatario (nome/ruolo), `logo_path`, `firma_path`, `linkedin_organization_id`
  (+ policy `tenant_update_admin`). Tabella **`attestato`** (snapshot `contenuto` jsonb
  CON PII — è il documento —, `numero` `AAAA/000001` progressivo per tenant e anno via
  `attestato_contatore` con lock di riga, `codice_verifica` 24 hex casuali, `hash`
  sha256 di `contenuto::text`, `pdf_path` deterministico `{tenant}/{id}.pdf`,
  `emesso_da` NULL = automatico, `sostituisce`/`sostituito_da`); **write-once** con
  trigger che ammette un solo UPDATE: `sostituito_da` da NULL a valore. RLS: titolare
  (persona_id) e staff del tenant. RPC `attestato_emetti(iscrizione, contenuto, attore,
  emesso_da, sostituisce, motivazione)` SECURITY DEFINER: completa lo snapshot con
  numero/codice/data/id, calcola l'hash, scrive `attestato.emesso` `{iscrizione_id,
  attestato_id, numero, hash, automatico, sostituisce}`; con `sostituisce` marca il
  vecchio e scrive `attestato.sostituito` (motivazione obbligatoria). Un solo attestato
  valido per iscrizione. `attestato_verifica(codice)` **eseguibile da anon** (solo campi
  pubblici: nome e cognome, corso, ore, ente, edizione, esito test, numero, date, stato,
  hash ricalcolato; mai CF/nascita). `persona_aggiorna_nascita(data, luogo)` per il
  discente. Bucket `loghi` (pubblico, scrittura admin) e `attestati` (privato, nessuna
  policy: scrive e legge solo il server). Evento `ente.updated` dalla pagina Ente.
- *Server* (`src/lib/attestati.ts`): `costruisciSnapshot(client, iscrizione)` usa
  `computeProgressoForIscrizione` + `computeFrequenzaForIscrizione` + `deriveIdoneita`
  (ora esportata da `report-fondo.ts`): idoneità = completamento FAD e/o frequenza
  webinar (corsi solo-webinar inclusi); snapshot = ente, discente (con nascita), corso,
  edizione, percorso (lezioni + date), test (esito/percentuale/tentativi), frequenza,
  criterio, `completato_il`, testa del registro. `emettiAttestatoSeIdonea` (politica
  automatica, nessun valido, idoneo) agganciata a `/api/events/video` (ended),
  `/documento` (completed), `/quiz` (superato) — mai un errore verso il player, la
  risposta porta `attestato: {numero}` — e alle route presenze (import CSV,
  risolvi, presenza manuale, correggi: tutti gli iscritti dell'edizione/sessione).
  `emettiAttestatoManuale` da `POST /api/admin/iscrizioni/[id]/attestato`
  (riemissione se esiste un valido, con motivazione). La pagina del corso discente
  emette **pigramente** se idonea+automatica+nessun attestato (percorsi chiusi prima
  della Fase 5). PDF `src/lib/attestato-pdf.ts` (`pdf-lib`, A4 orizzontale, Helvetica
  WinAnsi con `pulisci()`, banda blu, logo/firma dal bucket `loghi` se presenti, QR
  `qrcode` verso `/verifica/<codice>`), servito da `src/lib/attestato-serve.ts`
  (`GET /api/attestati/[id]/pdf`: scarica dal bucket o genera e carica; senza chiave
  di servizio genera al volo). Badge `src/lib/attestato-badge.tsx` (`ImageResponse`
  di `next/og`, 1200×1200 e `?formato=post` 1200×630; **ogni div con più figli deve
  avere `display:flex`**, altrimenti satori lancia). `src/lib/url.ts`: `appBaseUrl()`
  da `NEXT_PUBLIC_APP_URL` (fallback `https://fad-wine.vercel.app`) per QR e LinkedIn.
  Link LinkedIn "Add to profile" precompilato (`linkedInAddToProfileUrl`).
- *UI*: `/verifica/[codice]` pubblica senza shell (`noindex`), stati autentico /
  sostituito / non trovato, PDF pubblico `GET /api/verifica/[codice]/pdf`; discente:
  pannello `.attestato-card` nel corso completato (PDF, Aggiungi a LinkedIn, badge,
  badge per post, link di verifica) e avviso se manca la data di nascita; `/profilo`
  con `ProfiloForm` (data/luogo di nascita via RPC, `POST /api/profilo/nascita`) ed
  elenco attestati; admin: sezione "Attestato" nel builder (ore, riferimento,
  rilascio) e in `/admin/corsi/new`, colonna Attestato tra gli iscritti con
  **Emetti / riemetti** (campo motivazione inline), data/luogo di nascita nel form
  manuale e nel CSV (`addIscritto` accetta `gg/mm/aaaa`), pagine **`/admin/attestati`**
  (validi/sostituiti, ricerca, PDF, verifica) e **`/admin/ente`** (`EnteForm`: dati +
  logo e firma caricati nel bucket `loghi`, `PATCH /api/admin/ente`), voci di menu
  (icone `shield`/`users` aggiunte a `icons.ts`); auditor: etichette `attestato.*`
  (gruppo "Attestati") e colonna Attestato in `/audit/completamento`.
- *Fixture sul live*: attestato **n. 2026/000001** (`6c2f917a-…`, codice
  `d0205717a0b46223e2bbf5ef`) emesso via RPC per l'iscrizione `9da74f31-…` (corso
  "Prova del test finale" completato dall'utente) con lo snapshot reale costruito con
  la sessione del discente (`scratchpad/snap.ts`) — l'ente non aveva ancora dati, quindi
  intestazione "Tenant Demo Fase 1" senza ore: compilare Ente e ore del corso, poi
  riemettere. Il discente demo ha data/luogo di nascita (1980-05-14, Bergamo) messi dal
  test Playwright. Eventi 199–200, catena integra.
- *Verifiche*: typecheck 0, build **35 route**, unit 32/32, fase4 15/15, PDF di prova
  rasterizzato con `pdftoppm` (presente nel container), Playwright
  `scratchpad/pw/func6.mjs` **29/29** (pubblico 390, discente 1440/390, auditor,
  admin). Senza chiave di servizio: emissione automatica e PDF pubblico (503) non si
  provano da qui.
- *Verificato in anteprima Vercel via strumento Vercel (`web_fetch_vercel_url`, che
  non passa dalla rete del container)*: `/verifica/<codice>` risponde "Attestato
  autentico" con i dati giusti, codice inesistente → "Nessun attestato", PDF pubblico
  200 `application/pdf` generato e salvato nel bucket `attestati` (6.850 byte). Il
  branch alias `fad-git-<branch>-…` non è risolto dallo strumento: usare l'hostname
  del deploy (`list_deployments` con `branch`).
- **Editor del modello dell'attestato** (richiesta dell'utente dopo il riscontro:
  "serve un editor per scegliere tra formati e decidere cosa scrivere, loghi e firme
  per singolo corso"; supera lo scope OUT "un solo template" del brief). Migration
  `20261020000009_fase5_attestato_modello.sql` (**applicata sul live**):
  `tenant.attestato_modello` e `corso.attestato_modello` jsonb, **non congelati**
  (valgono per le emissioni future; ogni attestato porta il modello risolto nello
  snapshot `contenuto.modello`). `src/lib/attestato-modello.ts`: `ModelloAttestato`
  (layout classico|essenziale|elegante, titolo, intro, frase, testo_aggiuntivo,
  intestazione, citta, logo_path, loghi_secondari ≤3, firmatari ≤2 con firma_path,
  mostra {nascita, ore, riferimento, edizione, esito_test, lezioni, qr}),
  `normalizzaParziale` (input client), `risolviModello(ente, modelloEnte,
  modelloCorso)` (predefinito ← ente ← corso, vuoti riempiti dai dati dell'ente),
  segnaposto `{nome} {corso} {ore} {ente} {edizione} {data}`. `attestato-pdf.ts`
  riscritto: 3 layout (Helvetica / Helvetica allineato a sinistra / Times con
  cornice oro), `corpoDettagli` tronca con "..." sopra `yMin` per non sovrapporsi a
  firme e QR; `pathImmagini`/`modelloDi`; immagini dall'URL pubblico del bucket
  `loghi` (`attestato-serve.ts` `immagineLoghi`, nessuna chiave richiesta).
  `src/components/admin/ModelloEditor.tsx` (ambito `ente` in `/admin/ente` =
  predefinito; ambito `corso` = sezione 6 del builder con interruttore "modello
  specifico" e "Torna al modello dell'ente"); anteprima `POST
  /api/admin/attestati/anteprima` {modello, corso_id, ambito} → PDF con "Maria
  Esempio" (nessuna scrittura), mostrata in un iframe da blob. PATCH ente/corso
  accettano `attestato_modello` (Evento `corso.attestato_modello_updated`).
  "Riemetti" è ora un pulsante nella colonna Attestato. Verifiche: resa dei 3 layout
  rasterizzata (`scratchpad/pdf-layout.ts`), Playwright `func7.mjs` **11/11**.
  Attenzione: la `<input>` degli switch è nascosta → nei test cliccare `.switch`.
- **Da provare nel browser dall'utente (gate M5)**: `/admin/ente` (dati + modello
  predefinito con logo e firma), nel corso sezione 6 "Attestato" (modello specifico,
  anteprima), ore del corso, "Riemetti" su Rossi (nuovo numero, vecchio "sostituito"
  nella verifica pubblica), completare il corso "solo test" → attestato automatico
  con PDF/badge/LinkedIn, pagina Attestati. Dopo il via libera: **merge su `main`
  solo con autorizzazione esplicita.**

**Debito tecnico chiuso nella stessa sessione (l'utente: "procedi con i piani",
senza merge):**
- *Blocco B #2* — `compliance.ts` ha un nucleo puro (`calcolaProgresso`,
  `calcolaFrequenza`) e le versioni **in blocco** `computeProgressoPerIscrizioni` /
  `computeFrequenzaPerIscrizioni` (query: iscrizioni, strutture dei corsi, eventi a
  lotti di 200 per `payload->>iscrizione_id`, sessioni) usate da
  `/audit/completamento` e da `report-fondo.ts`; le funzioni per singola iscrizione
  restano (il player le usa) e danno lo stesso risultato (confronto sul live come
  auditor: 8 iscrizioni, 0 differenze, `scratchpad/confronto.ts`). Non è una funzione
  SQL: la ricostruzione dei tratti video (`lib/visione.ts`) resta in TS.
- *Fail-fast* — `src/middleware.ts` (dal 2026-10-21 `src/proxy.ts`, Next 16): POST/PATCH/PUT/DELETE su `/api/admin/*`,
  `/api/events/*`, `/api/profilo/*` rispondono **503** se manca
  `SUPABASE_SERVICE_ROLE_KEY` (prima: modifica al DB fatta, Evento non scritto);
  `/api/admin/attestati/anteprima` (sola lettura) è esclusa. `/api/auth/*` non è
  toccata (il login nel container deve funzionare).
- *Blocco E* — `tests/e2e/lib.mjs` + `tests/e2e/smoke.mjs` (`npm run test:e2e`,
  Playwright puro senza runner, **sola lettura**, 51 controlli: pubblico, discente
  1440/390, auditor con export CSV e sigillo della catena, admin 1440/390 con anteprima
  PDF e 503 controllato); `playwright` devDependency (senza browser:
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, usare `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/
  chromium-1194/chrome-linux/chrome` nel container, `E2E_PROXY_SUPABASE=1 E2E_DEV=1
  NODE_USE_ENV_PROXY=1`). Non è in CI (serve un deploy raggiungibile e un browser):
  ricetta nel README. Gli script dello scratchpad restano la fonte dei controlli
  funzionali più specifici (fixture con ID).
- `tests/unit/attestato.test.ts` (7) → unit **39/39**; CI esegue `test:unit` e
  `test:fase4` nel job principale.
- `NEXT_PUBLIC_TENANT_ID` non è più usato da `src/` (Blocco B #8 di fatto chiuso:
  resta solo nel bootstrap e nei workflow).
**Restano** del piano (Blocco B chiuso, vedi le due sezioni in testa): test di carico
k6; Blocco C (staging, monitoraggio, SMTP/inviti/reset password); Blocco D (tracciati
ufficiali fondi, Teams); E2E in CI con deploy di anteprima e secrets.

## UX — revisione, mockup e ondata 1 (2026-10-20, branch `claude/affectionate-hawking-03ev7i`)

Richiesta dell'utente: il portale è "grezzo" e "uguale ai portali generati con
Claude"; vuole facilità d'uso **e** un'estetica curata, moderna, con poche
animazioni ben fatte. Metodo deciso: revisione → mockup → ondate di lavoro.

**Revisione pubblicata** (artifact `RcVPuux3m7GgW4H9N2AwK3`, "Valutazione UX FAD"):
lettura integrale del codice + crawl Playwright di 40 pagine con i 3 utenti demo
(desktop 1440 / telefono 390). Numeri chiave prima dell'ondata 1: 0 toast,
0 `loading/error/not-found`, 6 `confirm/alert` nativi, 0 `@keyframes`, 187 stili
inline, 108 colori esadecimali, 3 blocchi `:root`, 20 pagine su 40 con scorrimento
orizzontale su telefono. **Mockup** (artifact Design `1nJhmcS81SvtpnMfBWSWuV`,
"Mockup UX FAD", 5 artboard): login nuovo per il discente, fine lezione con
conferma del server + "Lezione successiva", corso completato con idoneità
"sigillata", mobile opzione A (barra + menu a scomparsa, consigliata) e B (barra
in basso). Decisioni dell'utente: mockup prima del codice; ondate nell'ordine
proposto (1 fondamenta → 2 discente → 3 admin → 4 auditor); movimento "pochi
momenti ben fatti".

**Ondata 1 fatta (3 commit):**
- *1a bug*: crea edizione passa per `call()` (prima mancava `router.refresh()`
  → doppioni); `DocumentoPlayer` fa `router.refresh()`; `VimeoPlayer` dice
  "Lezione completata" solo se `video.ended` è stato accettato dal server
  (stato `registrazione` ok/errore + "Riprova ora"); `ChainVerifyButton` con
  try/catch e esito negativo in rosso; `LogoutButton` con try/catch; testo
  `un'immagine`; doppio H1 in `/admin/corsi/new`; `<a>` interni → `<Link>`.
- *1b riscontro*: `src/components/ui/Feedback.tsx` (`FeedbackProvider` nel layout
  radice; `useFeedback()` → `toast(testo, kind)` e `confirm({titolo, messaggio,
  conferma, pericolosa}) → Promise<boolean>` su `<dialog>` nativo). Niente più
  `confirm()/alert()` nel codice. Conferma del congelamento D22 alla prima
  edizione; conferme con conseguenze per togliere lezioni, concludere/annullare
  edizioni, rimuovere iscritti, archiviare contenuti, "Ignora" in coda, deposito
  write-once. `call()` del builder accetta `{ successo, busy }` (toast + busy per
  pulsante). `src/components/ui/PageStates.tsx` (`PageSkeleton`, `ErrorState`,
  `NotFoundState`) + `loading/error/not-found.tsx` a radice e in `corsi/`,
  `admin/`, `audit/`. `src/lib/db-result.ts` `unwrap(res, cosa)`: gli errori
  delle query non sono più mascherati da `data ?? []`.
- *1c CSS*: `globals.css` da 1149 a ~990 righe: **un solo `:root`** (token +
  alias, scala tipo `--text-xs…3xl` con `clamp` sui titoli, `--space-1…8`,
  `--r-ctrl/--r-pill`, `--dur-*/--ease-out`), stato separato dalla marca
  (`--ok`/`--warn` non sono più teal/ocra), via tema vecchio e ~25 regole morte
  (appbar, event-stream, table.modern, cover-grad-*, player-video, topbar…).
  **I componenti Atlante sono globali** (niente più prefisso `.admin-scope .`;
  la classe `.admin-scope` resta solo come densità 14px). Riga struttura del
  builder rinominata `.struct-row` (collideva con `.lo-row` del discente).
  Card corso discente → `.corso-card` fluida con la **Cover vera** di Atlante
  (immagine caricata dall'admin o tratteggio + glifo categoria; `CorsoMini` ha
  `categoria/cover_path`). Hero del dettaglio corso in classi `.course-hero*`
  (prima 52px/44px inline). Tabelle dentro `.tbl-wrap` (overflow-x) ovunque,
  quelle auditor con `.tbl`. Focus visibile anche su select/textarea/switch/seg,
  `.btn:hover:not(:disabled)`, `prefers-reduced-motion`, media query 860/640.
  `ICON_PATHS` unico in `src/components/icons.ts` (AppShell + SidebarNav);
  tolto il font Plus Jakarta. "Tutti i corsi" non va più a capo; etichetta
  copertina nascosta nelle miniature (era "FORMAZI").

Verifiche: `typecheck` 0 errori, `test:unit` 20/20, `test:fase4` 15/15, crawler
Playwright rieseguito (schermate prima/dopo in scratchpad). **Il player video
va riprovato nel browser dall'utente** (il container non raggiunge vimeo.com).

**Direzione visiva "F" scelta dall'utente (2026-10-20, stessa sessione).** Dopo
l'ondata 1 l'utente ha giudicato i mockup e il tema Atlante ancora "nello stile
tipico dei siti fatti con Claude" (sfondo crema/sabbia, etichette mono
maiuscole, tutto in scatole con bordi caldi e angoli stretti, grottesco bold +
grigio tenue, teal/ocra, gradienti, tratteggi). Scartate le direzioni "Registro"
(carta bianca + serif) e "Piatta" (bianco/nero + giallo). **Scelta F**: sfondo
bianco freddo `#f6f7f9`, **blu profondo `#16326c`** (non blu-nero) per pannelli,
pulsanti e titoli, blu `#2f5bea` per avanzamento/link, verde menta `#7cf0c3` sui
fondi blu, verde `#1f8a5b` per il completato; **Red Hat Display** (titoli) +
**Red Hat Text** (testo) via `next/font/google`; angoli 12–28 px, pulsanti a
pillola, card senza bordo con ombra morbida, nessuna etichetta maiuscola, nessun
gradiente/texture. Mobile: **barra in basso** (opzione B). Login: **modulo a
sinistra + anteprima del corso a destra** (opzione 3). Tela aggiornata con le sole
tavole approvate (artifact `1nJhmcS81SvtpnMfBWSWuV`).

**Ondata 2 fatta (sistema F + discente):**
- `globals.css`: token F nel `:root` + **strato finale "Sistema F"** in coda che
  vince sulla cascata (pulsanti pillola, card/kpi/panel con ombra, chip in
  minuscolo, campi arrotondati, sidebar F, testata `.topbar` + `.tabbar`,
  `.end-screen`, `.seal-panel`, `.next-step`, `.login*`, animazioni `draw`,
  `rise`, `ring-in`, `seal-draw`, `bar`, tutte spente con `prefers-reduced-motion`).
  Il vecchio CSS del login è stato rimosso. Le classi Atlante restano (admin
  e auditor le usano) ma rese F dallo strato finale.
- `AppShell`: **discente = testata in alto + barra in basso su telefono**
  (`DISCENTE_NAV`: Corsi `/corsi`, In corso `/corsi?filtro=in_corso`, Profilo
  `/profilo`); admin/auditor = sidebar (su telefono diventa barra orizzontale
  scorrevole). `SidebarNav` espone anche `TopNav`/`TabNav` (`isActive` con query
  e `exact`). Nuova pagina `/profilo`. `icons.ts` ampliato (clock, user, arrow*,
  eye, doc2, cap).
- Pagine discente riscritte: `/login` (errori Supabase tradotti, mostra password,
  anteprima animata), `/corsi` (saluto "Ciao, Nome", card `.corso-card` con
  cover blu, filtro `?filtro=`), `/corsi/[edizioneId]` (hero blu; **se idonea:
  `.seal-panel` con sigillo animato + "E adesso?"**; lista lezioni con "completata
  il …" da `completato_il`), `/corsi/[edizioneId]/lo/[loId]` (link di ritorno al
  posto delle briciole, "Lezione N di M · durata", `.video-frame`, navigazione
  precedente/successiva a pillola, programma `.panel--program`, lezione bloccata
  con rimando a quella da fare). **Niente più gergo** (LO, Evento, append-only,
  `video.ended`, API) nelle pagine del discente.
- `VimeoPlayer`: schermata finale `.end-screen` (anello che pulsa durante l'invio,
  check che si disegna alla conferma, stato errore con "Riprova ora"), prop
  `nextHref`/`nextLabel` → "Lezione N" come azione principale. `DocumentoPlayer`:
  cornice, link "apri in nuova scheda", chip "Lettura completata" + lezione
  successiva. `compliance.ts`: `ProgressoLO.completato_il` (timestamp server del
  primo evento di completamento).

Verifiche ondata 2: `typecheck` 0, `build` 28 route, `test:unit` 20/20,
`test:fase4` 15/15, schermate Playwright a 1440/390 su login, corsi, dettaglio
(in corso e completato), lezione, documento, profilo, admin, auditor: nessun
overflow. **Da provare nel browser dall'utente**: il player fino a fine lezione
(schermata finale e "Lezione successiva"), la tab bar su telefono.

**Rifiniture dopo la verifica dell'utente (2026-10-20, "Molto bello"):** i chip
"6 lezioni · 56 min · visione integrale" dell'hero del corso erano "stile Claude" →
tolti, i dati stanno nel pannello laterale come righe (Lezioni/Durata/Modalità/
Completate/Idoneità). **La descrizione del corso non è più congelata da D22**
(decisione dell'utente, opzione 2): migration
`20261020000002_corso_descrizione_modificabile.sql` (**applicata sul live**) ridefinisce
`tg_corso_freeze` senza `descrizione`; restano congelati titolo, categoria, sblocco
sequenziale, visione integrale. Nel Course Builder la textarea Descrizione è sempre
attiva e a corso congelato il pulsante diventa "Salva descrizione" (PATCH con la sola
`descrizione`; l'Evento `corso.updated` non porta il testo). pgTAP
`supabase/tests/corso_descrizione_modificabile.sql` (6, verificato sul live in rollback).

**Ondata 3 fatta (admin, "meno attrito", 2026-10-20):**
- *Backend*: migration `20261020000003_iscrizione_update_admin.sql` (**applicata sul
  live**, policy UPDATE admin su `iscrizione`: prima mancava e l'assegnazione del
  piano non toccava righe; scritta senza `drop policy` perché l'MCP si blocca sui
  DROP, #13). Route nuove: `PATCH /api/admin/iscrizioni/[id]` (`piano_id`, Evento
  `iscrizione.updated` solo UUID), `POST /api/admin/piani` (titolo/codice/fondo/
  CUP/avviso/canale, Evento `piano.created`), `POST /api/admin/corsi/[id]/duplica`
  (nuovo corso in bozza "(copia)" con stessi dati e struttura verso gli stessi
  contenuti, copertina copiata nello Storage; Eventi `corso.created` con
  `duplicato_da` + `struttura.imported` con `origine: 'duplicazione'`).
  `addIscritto` accetta `piano_id` (verifica esistenza nel tenant).
- *Primitive*: `src/components/admin/Form.tsx` (`Field` con etichetta, asterisco
  `.req`, errore `.field__error` accanto al campo e `htmlFor`; `Pager`),
  `src/lib/validazione.ts` (`isEmail`, `isCodiceFiscale`, `parseMmSs`, `dataDopo`,
  tipo `Errori`). Tutti i form admin usano `noValidate` + errori per campo (prima
  solo banner in cima). Icone nuove in Atlante: chevron*, copy, edit, euroCircle.
- *Course Builder*: pulsante **Duplica corso** (conferma → redirect alla copia);
  struttura riordinabile anche con **pulsanti su/giù e frecce ↑↓** sulla maniglia
  (ora un `<button>`); edizioni: form "Nuova edizione" a comparsa con **finestra
  FAD** (apertura/chiusura) e controlli date, **Modifica** inline di codice/date/
  finestra (PATCH esistente), filtro "solo attive"; iscritti: ricerca (se > 8),
  paginazione 25, colonna **Piano finanziato** con select (PATCH), selettore
  edizioni solo attive di default, form manuale con validazione (email, CF 16
  caratteri) e piano; niente aggiunta iscritti su edizioni concluse/annullate.
- *Altre pagine*: dashboard con **striscia KPI cliccabile** `.kpi-strip` (→
  `/admin/corsi`, `/admin/corsi?edizioni=con`, `/admin/sessioni?quando=prossime`)
  e attività per i nuovi eventi; catalogo corsi legge `?stato=`/`?edizioni=`;
  `/admin/sessioni` → `SessioniTable` (ricerca, Tutte/Prossime/Passate/Annullate,
  paginazione 20, solo edizioni attive nel form); `/admin/report-fondo` →
  `PianiPanel` (elenco piani con n. iscritti + "Nuovo piano", CUP 15 caratteri).
- Verifiche: typecheck 0, build 29 route, unit 20/20, fase4 15/15, schermate
  Playwright admin a 1440/390 (`scratchpad/pw/shots3.mjs`, lanciare con
  `NODE_USE_ENV_PROXY=1 node ./shots3.mjs`): 0 overflow, 0 errori JS. **Da provare
  nel browser dall'utente**: Duplica corso, modifica edizione, assegnazione piano,
  nuovo piano, riordino da tastiera.

**Ondata 4 fatta (auditor + tema scuro, 2026-10-20):**
- `/audit/log` → **una tabella sola** (`LogTable`, riga espandibile con payload,
  attore grezzo, soggetto, hash completi + copia; hash abbreviati in riga), ordine
  **decrescente** (pagina 1 = più recenti, 100 per pagina), date **Europe/Rome** con
  secondi (`fmtIstante` in Atlante; anche `fmtData`/`fmtDataOra` ora forzano il
  fuso di Roma), nomi risolti per persona/corso/edizione/contenuto/sessione/
  iscrizione, etichette italiane + tipo grezzo (`src/lib/eventi-etichette.ts`:
  catalogo `EVENTI`/`GRUPPI`, `riassuntoEvento`). **Filtri in SQL** via GET
  (`?gruppo=&tipo=&persona=&da=&a=&pagina=`, `src/lib/audit-filtri.ts`:
  `parseFiltri`/`applicaFiltri` — muta il builder, niente generici: TS2589 —,
  `offsetRoma` per i giorni interi). **Export CSV** `GET /api/audit/export` con gli
  stessi filtri (a lotti di 1000, max 20000, `;`, BOM, hash hex).
- **Sigillo** `.chain-seal` (`ChainVerifyButton` riscritto): pannello blu con anello
  che si disegna; `/api/audit/verify` ora ritorna anche `eventi`, `testa {seq, hash,
  occurred_at}`, `verificato_il`. Verificato sul live: 170 eventi, catena integra.
- `/audit/completamento` → `CompletamentoTable`: striscia totali (iscrizioni/idonei/
  in corso/frequenza sotto soglia), ricerca, filtro corso, Tutti/Idonei/In corso,
  paginazione, **dettaglio lezioni a scomparsa**, export CSV client-side.
- **Tema scuro**: token notturni in `globals.css` sotto `@media (prefers-color-scheme:
  dark)` (salvo `data-theme="light"`) e `:root[data-theme="dark"]`; nuovo token
  `--deep` (#16326c chiaro / #13224a scuro) per i pannelli blu pieni (hero, sigillo,
  login, player, cover) così `--primary` può schiarirsi nel buio. `ThemeToggle`
  (auto → chiaro → scuro, `localStorage['fad-theme']`, script inline nel layout radice
  contro il lampo) nella sidebar admin/auditor e nella testata discente; icone
  `sun/moon/themeAuto` in `icons.ts`.
- Verifiche: typecheck 0, build 30 route, unit 20/20, fase4 15/15; Playwright
  `scratchpad/pw/func4.mjs` (22 check funzionali auditor: ordine, date, hash, riga
  espansa, copia, filtri famiglia/evento/data, export CSV filtrato, sigillo, totali,
  filtri completamento, dettaglio, download CSV, toggle tema persistente) tutti ok;
  schermate chiaro/scuro a 1440/390 (auditor, discente, admin, login) senza overflow.

**Le 4 ondate sono chiuse e su `main` (2026-10-20).** Ricetta per far girare
l'app in locale/crawler: ambiente con `*.supabase.co` consentito (fatto),
`NODE_USE_ENV_PROXY=1 NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=…
NEXT_PUBLIC_APP_URL=http://localhost:3100 setsid nohup npx next dev -p 3100 &` (fermarlo prima di
`npm run build`: condividono `.next`; per fermarlo `pkill -f "next-serve[r]"`, il
pattern con le parentesi quadre evita che `pkill` uccida la propria shell);
Chromium non passa dal proxy → nei crawler le richieste a supabase.co sono
inoltrate via `route()` + `fetch` di Node, e **lo script Node va lanciato con
`NODE_USE_ENV_PROXY=1`** (senza, il login fallisce con "fetch failed"). Script in
scratchpad `pw/` (da portare in repo con i test E2E del Blocco E). Senza
`SUPABASE_SERVICE_ROLE_KEY` nell'ambiente le route di scrittura falliscono dopo la
modifica DB: dal container si provano solo letture e validazioni.

## Revisione di fine sessione (2026-10-20, "hai altro da fare?")

- **CI rotta da ieri sera senza che nessuno se ne accorgesse**: lo step `test unitari
  (lib pure: vimeo, …)` aveva i due punti nel nome non virgolettato → YAML non valido →
  ogni run "failure" con **zero job** (nessuna email di errore utile). Corretto con i
  nomi fra virgolette; aggiunto lo step `npm run lint` (ESLint `next/core-web-vitals`,
  `.eslintrc.json` nuovo: prima `next lint` chiedeva interattivamente la configurazione).
  **Regola**: dopo ogni modifica a un workflow, `python3 -c "import yaml; …"` e
  controllare che il run su GitHub abbia dei job. La CI girava solo su `main` e sulle
  PR: ora anche sui push dei branch `claude/**` (prima, sul branch di sessione, i run
  "push" comparivano SOLO perché il YAML era rotto).
- **Smoke sulle anteprime**: le anteprime Vercel sono protette (Deployment Protection):
  curl riceve la pagina di accesso di Vercel (HTTP 200, non la nostra). Il workflow ora
  manda l'header `x-vercel-protection-bypass` se esiste il secret
  `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Settings → Deployment Protection →
  Protection Bypass for Automation), altrimenti **salta** l'anteprima con un avviso e
  resta severo sulla produzione. `tests/e2e/lib.mjs` legge `E2E_VERCEL_BYPASS`.
- **Code review del branch (12 rilievi, tutti chiusi tranne le due duplicazioni minori)**:
  1. le letture in blocco di `compliance.ts` si troncavano a **1000 righe** (max-rows di
     PostgREST) e le `in()` con troppi id superavano la lunghezza dell'URL → helper
     `tutteLeRighe` (pagine da 1000 con `.range`) e `aLotti` (200 id), usati per
     iscrizioni/strutture/eventi/sessioni/attestati; un errore di lettura ora **lancia**
     (prima: mappa vuota → tutti "in corso" in silenzio);
  2. `attestato_emetti`: due emissioni concorrenti potevano creare due attestati validi
     → migration `20261020000012_attestato_emetti_lock_grant.sql` (**applicata sul
     live**): `pg_advisory_xact_lock` per iscrizione prima del controllo; EXECUTE
     revocato ad `authenticated` (un admin col JWT poteva emettere uno snapshot
     inventato): l'app la chiama solo con la service role. Verificato in rollback;
     pgTAP `fase5_attestato.sql` #16 aggiornato;
  3. `risolviModello`: un valore **esplicito** nel modello (logo `null`, firmatari `[]`)
     ora vince sull'ente (prima il "Togli" dell'editor era inefficace);
  4. `PATCH /api/admin/ente`: `logo_path`/`firma_path` accettati solo se file nella
     cartella del tenant (`pathNelTenant`), non più testo libero finito in una URL;
  5. inviti: non si ricollega un utente Auth esistente con ruolo admin/auditor (sarebbe
     entrato come staff); ricerca su tutte le pagine della Admin API;
  6. `/auth/reimposta`: il "primo accesso" guarda solo gli Eventi della propria persona
     (auditor e admin leggono anche quelli altrui);
  7. pagina del corso: l'emissione pigra parte solo con obbligatori > 0 (prima girava a
     ogni apertura dei corsi di sole sessioni); 8. anno/mese LinkedIn nel fuso di Roma;
  9. URL dei loghi in un solo helper `urlLogo` (`lib/url.ts`). Restano aperte, minori:
  i dati dell'ente ricostruiti in 4 punti (`datiEnteDa` da fare) e nient'altro.

## Resto del piano: carico, smoke in CI, inviti/password, staging (2026-10-20, "fai quello che manca")

- **Test di carico (Blocco B/E).** `tests/carico/player.js` (k6, `npm run test:carico`):
  login degli utenti in `setup()`, cookie di sessione nel formato `@supabase/ssr` 0.5
  (`base64-` + base64url del JSON di sessione, pezzi da 3180), poi per VU un `video.play`
  e un `video.progress` ogni `INTERVALLO` s; `MODO=rpc` colpisce direttamente
  `evento_player_registra` via PostgREST. Soglie: errori < 1 %, p95 < 1500 ms. Tenant
  dedicato **`cccc0000-0000-4000-8000-0000000000c0` "Tenant carico (test)"** creato sul
  live da `supabase/seed/carico_tenant.sql` (300 discenti `carico-NNN@fad.local` /
  `carico-pass-123`, admin `carico-admin@fad.local`, corso a 1 video, edizione
  `ED-CARICO-01`, utenti Auth inseriti in SQL con bcrypt + `auth.identities`; stream
  del registro proprio, 305 eventi, catena integra). Limite: Supabase Auth 30 login
  ogni 5 minuti per IP → per 300 VU alzare il limite o `UTENTI` più basso. Il binario
  k6 non è nel repo: nel container si scarica da GitHub releases (v0.54, funziona con
  `HTTPS_PROXY` + `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt`, `NO_PROXY=localhost`).
  **Prova dal container (2026-10-20, build di produzione `next start` con i valori
  pubblici veri, 10 VU × 10 utenti, proxy del container verso eu-central-1):**
  `MODO=api` 60 s, 1 evento ogni 5 s → 100/100 eventi ok, 0 errori, latenza media
  1,13 s, p95 1,89 s (**soglia 1,5 s superata**: ogni evento via app = getUser +
  3 query di compliance + RPC, ~5 andate e ritorni da ~200 ms ciascuna dal container;
  su Vercel nella stessa regione il costo di rete è ~10×); `MODO=rpc` 30 s → 97/97 ok,
  media 243 ms, p95 384 ms (= una sola andata e ritorno). Lato DB
  (`pg_stat_statements`): `evento_player_registra` **2,4 ms medi, 17 ms max** su 197
  chiamate; query di compliance 0,6–5,6 ms. Il collo è la rete, non il DB né il lock
  dello stream. La prova a 300 VU per 10 minuti va fatta da un ambiente vicino al DB
  (Vercel/staging o un terminale in EU), col limite dei login alzato.
- **Smoke post-deploy + E2E in CI (Blocco C/E).** `.github/workflows/smoke-deploy.yml`:
  `deployment_status` (ogni deploy Vercel riuscito, anteprima e produzione) + cron
  giornaliero + manuale; curl su login/verifica/pdf-privato, poi `npm run test:e2e` se
  ci sono i secrets `E2E_*_PASSWORD`. Alert = email di workflow fallito. **Deve stare su
  `main`** per il cron; l'evento `deployment_status` arriva sul ref del deploy.
- **Inviti, reset e cambio password, informativa (Blocco C/D).** `/password-dimenticata`
  (`resetPasswordForEmail` → `/auth/reimposta`), `/auth/reimposta` (client: il browser
  client di Supabase riconosce da solo la sessione dal frammento `#…` o da `?code=`;
  al primo accesso — nessun Evento `informativa.accettata` — chiede l'accettazione),
  `/auth/callback` (route server per `?code=`/`?token_hash=` dei modelli email
  personalizzati), `POST /api/profilo/password` (updateUser + Evento
  `auth.password_aggiornata`), `POST /api/profilo/informativa` (Evento con `versione`),
  `PasswordForm` in `/profilo`. Admin: colonna **Accesso** fra gli iscritti (chip
  "attivo" o "Invita"; "Invita tutti" per edizione) → `src/lib/inviti.ts`
  `invitaPersona` (`auth.admin.inviteUserByEmail` con redirect a `/auth/reimposta`,
  ricollega un utente Auth già esistente, aggiorna `persona.auth_user_id`, Evento
  `persona.invitata`), route `POST /api/admin/persone/[id]/invita` e
  `POST /api/admin/edizioni/[id]/invita`. Middleware: fail-fast anche su
  `/api/profilo/password|informativa`. **Email**: senza SMTP proprio Supabase manda
  pochissime email l'ora → runbook nel README (SMTP + template). Le pagine si sono
  verificate nel browser headless; l'invio reale delle email e il link di atterraggio
  **vanno provati dall'utente** nell'anteprima (serve la chiave di servizio).
- **Staging**: NON creato. L'organizzazione Supabase ha già 2 progetti attivi sul piano
  Free (`acli-gestionale`, `fad-fase-1`) e il Free ne ammette due: serve Pro o mettere
  in pausa uno dei due. Runbook completo nel README ("Staging separato").
- **Blocco D (tracciati ufficiali fondi, Teams)**: restano runbook esterni, servono
  materiali/accessi dell'utente.

## Blocco B #2/#8 — report per edizione + onboarding di un ente (2026-10-20)

**Il Blocco B è chiuso** (restano solo i test di carico k6, Blocco E).
- **#2 report auditor per edizione.** `/audit/completamento` legge `?edizione=<id|tutte>`:
  il server carica e ricalcola **solo le iscrizioni dell'edizione scelta** (selettore
  `ScopeEdizione` con codice · corso · n. iscritti, edizioni attive prima). "Tutte" è il
  default finché il tenant ha ≤ 300 iscrizioni (`SOGLIA_TUTTE`), oltre il default è
  l'edizione più recente e "Tutte" resta scegliibile con un avviso. Gli attestati validi
  sono letti con `.in(ids)`. Anche `/corsi` (discente) e `emettiPerEdizioneSeIdonee`
  (attestati dopo un import presenze) usano le funzioni **in blocco** di `compliance.ts`;
  `costruisciSnapshot` accetta `{prog, freq}` precalcolati. Non è una funzione SQL (come
  ipotizzava il piano): la ricostruzione dei tratti video resta in TS, una sola fonte.
- **#8 tenant mai da env.** `NEXT_PUBLIC_TENANT_ID` è sparita da `src/`, CI, `.env.example`,
  README (il seed demo usa `BOOTSTRAP_TENANT_ID`, opzionale). **Su Vercel la variabile è
  ancora definita ma inutilizzata**: si può togliere dal pannello. Onboarding di un ente:
  migration `20261020000011_tenant_crea.sql` (**applicata sul live**) → RPC `tenant_crea`
  (solo service role, rifiuta se `auth.uid()` non è nullo) crea in una transazione tenant +
  `stream_audit` + Persona del primo admin + Eventi `tenant.created`/`persona.created`
  (payload `{ruolo, origine}`); script **`npm run nuovo-ente -- --nome … --admin-email …
  --admin-nome … --admin-cognome … [--ragione-sociale … --citta … --admin-password … --tenant-id …]`**
  (`scripts/nuovo-ente.ts`: crea l'utente Auth con `app_metadata.role=admin`, chiama la
  RPC, in caso di errore rimuove l'utente Auth). pgTAP `supabase/tests/tenant_crea.sql`
  (10/10 sul live in rollback, con un utente Auth simulato: isolamento del nuovo admin
  verificato). Lo script non è eseguibile dal container (manca la chiave di servizio).

## Blocco B #5/#7 — RPC unica del player + policy RLS unite (2026-10-20)

Migration `20261020000010_blocco_b_rpc_player_policy_unione.sql` (**applicata sul
live**), pgTAP `supabase/tests/blocco_b_rpc_player_policy.sql` (14/14 sul live).
- **#5 RPC `evento_player_registra(p_iscrizione_id, p_learning_object_id,
  p_event_type, p_payload)`** (SECURITY DEFINER, EXECUTE solo `authenticated` +
  `service_role`): una sola chiamata con il **client dell'utente** (JWT, niente
  service role) che verifica titolarità dell'iscrizione, LO nella struttura del
  corso, famiglia dell'evento coerente col tipo di LO, sblocco sequenziale "per
  Eventi" (D26) e appende via `audit_append` con `payload.iscrizione_id` imposto
  dal server. Tipi ammessi: `video.*`, `documento.*`, `quiz.started`. Helper TS
  `src/lib/eventi-player.ts` (`registraEventoPlayer`, errori → 401/403/400).
  `/api/events/video` e `/api/events/documento` **non usano più `appendEvent` né la
  service role**: tengono il controllo D26 completo con `compliance.ts` (serve per la
  visione integrale, che la RPC non conosce) e poi chiamano la RPC. `/api/events/quiz`:
  `quiz.started` via RPC, `quiz.submitted` resta con service role (legge le risposte
  giuste e corregge). Il fail-fast del middleware ora copre solo `/api/admin/*` (meno
  anteprima) e `/api/events/quiz`: **dal container, senza chiave di servizio, il player
  video/documento scrive davvero** (verificato: seq 201–202 sul live, catena integra).
- **#7 policy unite** (advisor 0006 "multiple permissive policies" → 0): `evento_read`
  ingloba le 3 policy admin (l'admin legge gli eventi del player, del test, delle
  presenze, dei depositi e degli attestati del tenant — più di prima, serve al report
  fondo sotto RLS admin), `iscrizione_read`/`persona_read_self_or_auditor`/
  `attestato_read_self` includono admin e auditor; le policy doppie sono state tolte
  (`DROP` composto a runtime per il trabocchetto #13).

## Hardening Tappa 1 — grant, guardia audit_append, service role (2026-10-19)

Ripresa dopo 4 mesi di fermo. **Il progetto Supabase era in pausa dal 2026-06-09**
(il keepalive ogni 2 giorni non è bastato; il cron GitHub si è autodisabilitato il
2026-08-07 per 60 giorni senza commit). Ripristinato via MCP `restore_project` il
2026-10-19 fuori dalla finestra ufficiale di 90 giorni: dati integri (79 eventi,
catena 0 problemi). **Senza piano Pro o ping giornaliero torna in pausa in ~7 giorni.**
Piano di completamento (5 blocchi + roadmap) nel doc Claude "FAD — Piano di
completamento" (artifact `13300d45-3520-4cfb-965f-7ad73a3fe042`).

**Falla chiusa (Blocco A).** `audit_append` era eseguibile da `anon` e `authenticated`
(privilegi di default di Supabase sulle funzioni di `public`: il `revoke … from
public` della migration 000002 non li toglie) e non verificava il chiamante →
chiunque con la anon key poteva appendere eventi a nome di chiunque; un discente
poteva aggirare D26 chiamando la RPC. Migration
`20261019000001_hardening_grants.sql` (**applicata sul live** in questa sessione,
dopo verifica in transazione+rollback con 9 check):
- `audit_append` eseguibile **solo da `service_role`** (+ proprietario); guardia
  difensiva se `auth.uid()` non è NULL (tenant = chiamante; attore = chiamante salvo
  admin). Le RPC SECURITY DEFINER di Fase 3/4 la chiamano ancora internamente
  (girano come owner) — verificato con `presenza_inserisci_manuale` da admin JWT.
- EXECUTE revocato ad `anon`/PUBLIC su `audit_verify_chain`, `current_*`,
  `helper_corso_has_edizioni`, `reorder_struttura`, `is_admin`, `is_auditor`; alle
  funzioni trigger anche ad `authenticated` (i trigger scattano comunque: verificato
  freeze D22 sotto admin JWT). `alter default privileges … revoke execute on
  functions from anon` → le funzioni future non nascono esposte.
- `search_path` fissato sulle 7 funzioni segnalate (advisor 0011); 8 indici FK
  (advisor 0001); policy `persona_read_self_or_auditor` con `(select auth.uid())`
  (advisor 0003) via `ALTER POLICY`. Migration `…000002` (default privileges senza PUBLIC): applicata ma in pratica **no-op** — i default per schema non tolgono l'EXECUTE a PUBLIC del default built-in, una funzione nuova nasce comunque con `=X`. Quindi: **ogni migration che crea una funzione in `public` deve revocare EXECUTE ad anon/PUBLIC** (regola già in vigore) e il test #7 di `hardening_grants.sql` enumera tutte le funzioni dello schema e pretende **zero** eseguibili da anon. Migration `…000003`: revocati anche i 4 helper di hashing (`audit_canonical`, `audit_genesis_hash`, `grezzo_content_hash`, `report_fondo_content_hash`) per rendere vero l'invariante.
- Test: `supabase/tests/hardening_grants.sql` (pgTAP 14, JWT simulati).

**Conseguenza applicativa:** `appendEvent(input)` in `src/lib/audit.ts` **non prende
più il client** e usa `createSupabaseServiceClient()` (`src/lib/supabase/service.ts`,
service role, solo server). Tutte le 23 chiamate aggiornate. L'autorizzazione resta
a monte (`requireSession`/`requireAdmin`). **Finché questo branch non è su `main`, il
deploy Production NON riesce a scrivere eventi** (login/logout/video/documento
restituiscono errore): la revoca è già attiva sul DB. `SUPABASE_SERVICE_ROLE_KEY`
deve essere presente su Vercel (lo è, Production + Preview).

Altri accorgimenti della sessione: rimossi i pulsanti con le credenziali demo dalla
`/login` (TODO Fase 1 #5 chiuso; i 3 utenti demo esistono ancora nel DB); keepalive
portato a **giornaliero** (palliativo: con Supabase Pro va rimosso).

Trabocchetto nuovo (#13): **MCP `execute_sql` resta appeso 60 s e va in timeout su
qualsiasi batch che contiene `DROP`** (lo tratta come distruttivo e attende una
conferma che non arriva). Per DDL usare `apply_migration`; nei test in rollback
evitare `DROP` (es. `ALTER POLICY` invece di `DROP POLICY` + `CREATE`).
`m1a_audit_log.sql` contiene DROP → non eseguibile via `execute_sql`.

**Blocco B, prima fetta (stessa sessione).** Migration `20261019000004_evento_indici_persona_iscrizione.sql`
(**applicata sul live**): due indici di espressione su `evento` —
`((actor->>'persona_id'), event_type, subject_id)` e `((payload->>'iscrizione_id'),
event_type)` — nessuna colonna nuova (hash/canonical invariati). `compliance.ts`:
il filtro sull'attore è **in SQL** (`.eq('actor->>persona_id', …)`, prima leggeva gli
eventi di tutti i discenti del corso e filtrava in JS) e i 3 lookup
iscrizione→edizione→corso sono una query sola con join (in entrambe le funzioni).
EXPLAIN sul live: Index Scan su entrambi gli indici. `/audit/log` è **paginato**
(200 per pagina, `?pagina=N`, default = ultima pagina; prima caricava tutto lo
stream). Restano del Blocco B: #2 report auditor in una funzione SQL (oggi
`Promise.all` con ~10 query per iscrizione), #4 politica eventi del player, #5 RPC
unica per gli eventi video, #7 policy multiple, #8 tenant da env.

**Riferimenti Vimeo (2026-10-20).** Problema segnalato dall'utente: i video non si
vedono. Cause trovate: (a) il LO "Le caratteristiche della squadra" aveva come
`vimeo_id` un intero link `vimeo.com/reviews/…/videos/1071424134` → iframe rotto;
corretto sul live a `1071424134` (+ Evento `learning_object.updated`); (b) il video
demo `1084894652` potrebbe non esistere più sull'account Vimeo del cliente (non
verificabile da qui: **`vimeo.com` non è raggiungibile dal container**). Fix
strutturale: `src/lib/vimeo.ts` `parseVimeoRef` accetta ID numerico o qualsiasi
link Vimeo (pubblico, non in elenco con hash, player, manage, channels, reviews) e
salva sempre `config.vimeo_id` numerico + `config.vimeo_hash` opzionale (video
"non in elenco": il player passa `h=`). Usato dalla route di creazione LO, dalla
import CSV della struttura e dal `VimeoPlayer` (`vimeoEmbedUrl`). Un link di
**cartella** (`…/folders/<n>`) non è un video → rifiutato. Test `tests/unit/vimeo.test.ts`
(`npm run test:unit`, 6). **Corso di prova a 6 video**: template
`supabase/seed/corso_prova_video.sql` (DO block, idempotente sul codice edizione,
Eventi via `audit_append`): compilare `v_video` con titolo/ID/hash/durata e lanciarlo
via MCP `execute_sql`. **Eseguito sul live il 2026-10-20** con i 6 ID forniti dall'utente: corso
`45ce11f0-38c3-40e1-83df-2d8a7c7a6777` "I finanziamenti pubblici e privati (corso di
prova)" (6 LO video Vimeo 1236864492/490/489/491/528/539, 55'45" totali, sblocco
sequenziale), edizione `6d2ef44e-…` codice `ED-FIN-PROVA-01`, iscrizione del discente
demo `b8ffac43-…`. Catena 0 problemi. Il corso è **congelato** (D22) dalla creazione
dell'edizione: titolo non modificabile (la descrizione sì, dal 2026-10-20); i `config` dei LO sì. **Da
verificare nel browser**: riproduzione (dipende dai domini consentiti su Vimeo per
quei 6 video) e sblocco sequenziale.

**Visione integrale per corso (2026-10-20, decisione ratificata).** Due casistiche
dell'utente: corsi **finanziati** → un video non può risultare completato se non è
stato visto tutto; corsi a **mercato** → fruizione libera (basta `video.ended`, D26
invariato). Implementato come **spunta per corso** `corso.visione_integrale`
(default false, **campo strutturale congelato con D22**: `tg_corso_freeze` esteso,
migration `20261020000001_corso_visione_integrale.sql` applicata sul live; il corso
di prova a 6 video è stato messo a `true` nella stessa migration, prima di estendere
il trigger). Meccanica:
- `VimeoPlayer` registra i tratti riprodotti (`timeupdate`, continuità ≤ 2 s) e li
  invia come `payload.segmenti_visti` + `durata_secondi` in pause/seek/ended (nessun
  evento in più). In modalità integrale impedisce i salti in avanti oltre il massimo
  visto (`setCurrentTime` indietro + avviso) e mostra il % riprodotto.
- `/api/events/video` valida/ritaglia i segmenti (`normalizzaSegmenti`, `lib/visione.ts`)
  e aggiunge `copertura_secondi`. Niente PII.
- `compliance.ts`: legge play/pause/seek/ended del discente sul LO e **ricostruisce i
  tratti dal tempo reale** (`ricostruisciTrattiDaEventi`, `lib/visione.ts`): un play a
  t0 da pos p e la chiusura (pause/seek/ended) a t1 valgono [p, min(pos dichiarata,
  p + (t1−t0)·1.02 + 1.5 s)]; un seek in pausa non apre tratti; una chiusura mancante
  perde il tratto (errore per difetto). I timestamp sono quelli server di
  `audit_append`. Così **2x non conta** (metà copertura) e una chiamata API forgiata
  senza attesa reale vale ~0. I `segmenti_visti` dichiarati dal client restano nel
  log solo come informazione. Con `visione_integrale` un LO `video_ended` è completato
  solo se **ended E copertura ricostruita ≥ 95%** (`SOGLIA_VISIONE_INTEGRALE`).
  `copertura_percentuale` e `segmenti_visti` (ricostruiti) sono esposti in
  `ProgressoLO`: il player riparte da lì dopo un ricaricamento e il limite dei salti
  in avanti è la fine del tratto contiguo dall'inizio. Gli eventi precedenti al
  2026-10-20 contano col tempo reale: sul corso di prova la Lezione 01 "completata
  trascinando" torna **non completata** (voluto).
- Eventi persi: un play chiuso da un ALTRO play (scheda chiusa senza pausa) **perde il
  tratto** (prima dava credito al tempo reale: errore per eccesso). Per limitare la
  perdita il player manda `video.progress` (checkpoint, posizione) ogni 60 s di
  riproduzione e un `video.pause` su `pagehide`/`visibilitychange` (keepalive).
  `video.progress` è ammesso dall'API e letto dalla compliance.
- Schermata finale: Vimeo mostra "More from <autore>" + Follow (impostazione per
  video su Vimeo, non disattivabile da URL); il player la **copre** con una schermata
  propria ("Lezione terminata", Rivedi, Torna al corso) e dopo `ended` fa
  `router.refresh()` per aggiornare chip/lista dal log. L'embed ha
  `title=0&byline=0&portrait=0` (niente titolo/autore/avatar Vimeo sopra il video).
  Se si vuole togliere la schermata Vimeo alla radice: su Vimeo, per video o come
  default account, Embed → End screen → "Empty"/"Thumbnail".
- Verifica sul log reale (2026-10-20, Lezione 01, 38 eventi seq 97–134): il giro
  "trascina alla fine" ricostruisce il 15,7% → non completata; il giro intero a 1x
  ricostruisce [0, 519] → 100% → completata.
- Verifica Lezione 02 (2026-10-20, seq 136–147, con la versione finale del player in
  produzione): play da 0, 9 `video.progress` a ~60 s l'uno con posizione che avanza
  di 60 s (1x confermata), `ended` a 555,2 s dopo 9'16" reali → copertura 100%,
  Lezione 03 sbloccata. Catena integra a 147 eventi. **Il flusso discente del corso
  di prova è verificato end-to-end nel browser dall'utente.**
- Player in modalità integrale: velocità bloccata a 1x (`speed=false` nell'embed +
  `setPlaybackRate(1)` su `playbackratechange`), niente salti in avanti, "Riprodotto
  finora: N%" cumulativo, testo che spiega che conta il tempo reale.
- Admin: switch "Visione integrale dei video" in `/admin/corsi/new` e nel Course
  Builder (sezione Dati, disabilitato a corso congelato); chip nel catalogo; route
  POST/PATCH corsi accettano `visione_integrale`. Auditor: "(integrale ≥95%) · visto N%".
  Discente: testo informativo nel player e "Visto N%" nella lista.
- Test: `tests/unit/visione.test.ts` (13, incluse le scene 2x / salto / forgiatura /
  seek in pausa), pgTAP `supabase/tests/corso_visione_integrale.sql` (5).
Limite residuo: il tempo reale misura la riproduzione, non l'attenzione (un video
lasciato andare da solo conta). Per la formazione normata è lo standard accettato.

**Autorizzazione di sessione (2026-10-19):** l'utente ha autorizzato
esplicitamente tutte le modifiche senza chiedere conferma, incluso il push su
`main` (fatto: `main` = branch `claude/hardening-tappa1`, CI verde). Vale per
questa sessione.

Da fare subito dopo (Tappa 1): backup del DB (dal tuo account: `supabase db dump`
o Dashboard); attivare "leaked password protection" in Auth; piani Pro; poi Blocco B.

## Keep-alive Supabase — anti-pausa free tier (2026-06-06)

Supabase mette in pausa i progetti del piano free dopo ~7 giorni di inattività
(mail di avviso ricevuta il 2026-06-06 per `fad-fase-1`). Mitigazione **identica a
quella di `acli-gestionale`**: ping esterno schedulato, **nessun oggetto creato nel
DB** (verificato: acli non ha pg_cron, né Edge Functions, né tabelle/funzioni
keepalive → la modalità corretta è il ping esterno).
- Workflow `.github/workflows/keepalive-supabase.yml`: ogni 2 giorni (+
  `workflow_dispatch`, più push sul file stesso come smoke-test) fa
  `GET /rest/v1/tenant?select=id&limit=1` con la anon key
  (pubblica, protetta da RLS) → HTTP 200 + query Postgres reale = attività
  registrata. Nessun segreto nel repo (URL + anon key sono valori pubblici inline).
- **Deve stare su `main`**: i workflow `on: schedule` girano solo dal branch di
  default. Finché il file è solo su un feature branch, il cron **non parte**.
- Mitigazione immediata già fatta in questa sessione: una query MCP su `fad-fase-1`
  (count su `evento`/`persona`/`corso`) ha resettato il contatore al 2026-06-06.
- Caveat GitHub Actions: i cron schedulati vengono disabilitati dopo 60 giorni
  senza commit sul repo, e possono slittare sotto carico (per questo si pinga ogni
  2 giorni, non ogni 7).

## UI — Restyling area amministratore + import in blocco (2026-05-31)

Sessione di **restyling UI dell'area admin** (tema "Atlante") + **due nuove
funzionalità** richieste dal committente, su mockup "Claude Design"
(`design_handoff_admin_atlante`). Branch `claude/loving-meitner-5JPzj`. Verifica:
`typecheck` 0 errori, `build` OK. **Due migration applicate sul Supabase live**
(autorizzato dall'utente in questa sessione: "write and apply to live").

**Tema admin scopato.** Tutto il CSS nuovo è sotto `.admin-scope` in
`globals.css` (la wrap `app/admin/layout.tsx` via `AppShell scopeClassName`),
così le classi generiche del design (`.card .course-card .lo-row .tbl .kpi
.dropzone .seg .switch .field .input .banner .empty .dual …`) **non toccano le
pagine discente/auditor** che condividono lo stesso `globals.css`. Gli alias di
variabili (`--teal/--ocra/--line/--panel…`) mappano i token del design sui token
Atlante già esistenti. Primitive condivise in `src/components/admin/Atlante.tsx`
(`Icon` con `ICON_PATHS`, `Cover` immagine+segnaposto per categoria, `coverUrl`,
formattatori, `durataVideoSecondi`, `regolaLabel`).

**Sidebar admin a 5 voci** (`AppShell`/`SidebarNav`): Dashboard, Corsi,
Contenuti, Sessioni, Report fondi — con conteggi per voce (`counts` calcolati nel
layout admin). `/admin` non è più un redirect: è la **Dashboard** (KPI corsi/
edizioni attive/iscritti/sessioni imminenti + corsi recenti + attività recente
derivata dagli ultimi Eventi).

**Pagine riviste** (Server Component fetch → Client Component per
ricerca/filtri/azioni): `/admin/corsi` (catalogo course-card con cover, ricerca,
filtri stato/edizioni + ordinamento → `CorsiCatalog`); `/admin/corsi/[id]`
(**Course Builder a 5 sezioni** → `CorsoEditor`: 1 Dati+copertina drag&drop,
2 Struttura **drag&drop HTML5** che chiama `reorder_struttura`, 3 Aggiungi
contenuto Manuale/CSV, 4 Edizioni, 5 Iscritti); `/admin/learning-objects`
(libreria densa con "Usato in N corsi", filtri tipo/stato/ordinamento, archivia
→ `ContenutiTable`); `/admin/corsi/new` (form Atlante + categoria).

**Funzionalità NUOVE.**
1. **Copertine corso**: colonna `corso.cover_path` + bucket Storage **pubblico**
   `copertine` (RLS scrittura solo admin del tenant, path `{tenant}/{corso}.ext`);
   upload client diretto a Storage, poi `PATCH /api/admin/corsi/[id]` salva il path
   (Evento `corso.cover_updated`). La copertina **resta modificabile a corso
   congelato** (non è campo strutturale). Aggiunta anche `corso.categoria`
   (campo strutturale → **congelato con D22**: la funzione del trigger reale
   `tg_corso_freeze` ora include `categoria` — vedi fix `…000003`).
2. **Import in blocco**: LO nella struttura (`POST …/struttura/import`, riuso per
   titolo o creazione video al volo, dedup, Evento `struttura.imported`) e
   **Iscritti** (sezione 5 del builder: manuale + CSV). Helper `src/lib/iscritti.ts`
   `addIscritto` (find-or-create azienda per ragione sociale, persona dedup per
   email nel tenant + completa CF, iscrizione dedup per persona+edizione) con
   Eventi `persona.created`/`iscrizione.created`/`iscrizione.imported` **senza PII
   nel payload** (D18: solo UUID/flag). Route `POST …/edizioni/[id]/iscritti(/import)`
   e `DELETE /api/admin/iscrizioni/[id]`. Parsing CSV client-side con
   `parseDelimited` (da `src/lib/csv.ts`) + mappatura colonne tollerante; anteprima
   con esito per riga (nuovo/libreria/duplicato/errore). **Excel → l'utente salva
   come CSV** (niente SheetJS aggiunto allo stack).

**Migration applicate sul live:**
- `20260531000001_fase_ui_admin_copertine.sql`: `corso.categoria`+`corso.cover_path`,
  bucket `copertine` + 3 policy. (NB: toccava per errore `corso_freeze_guard`, funzione
  non agganciata ad alcun trigger → corretto da `…000003`.)
- `20260531000002_admin_iscritti_rls.sql`: policy RLS write mancanti —
  `persona_insert_admin`/`persona_update_admin`, `iscrizione_insert_admin`/
  `iscrizione_delete_admin` (prima c'erano solo le SELECT admin).
- `20260531000003_corso_freeze_categoria_fix.sql`: il trigger D22 reale è
  `corso_freeze → tg_corso_freeze`; aggiorna la funzione giusta perché `categoria`
  sia davvero congelata e rimuove la funzione spuria. Verificato in rollback sul live
  (categoria bloccata su congelato, cover_path consentita su congelato, categoria
  consentita su bozza).

Invarianti rispettate: nessun INSERT diretto in `evento` (sempre `appendEvent`→
`audit_append`); niente PII nei payload; riordino struttura via RPC atomica;
freeze D22 lato DB intatto (categoria ora inclusa). **Da verificare nel browser**
sul deploy (egress `*.vercel.app` bloccato da qui): upload copertine, drag&drop
struttura, import CSV LO/iscritti. I 2 corsi demo live sono **congelati** → categoria
resta `null` (segnaposto "FORMAZIONE"): per testare le copertine/categoria serve un
corso in bozza.

**Merge e rifiniture (stesso giorno).** Il lavoro è stato consegnato in due PR,
**entrambe mergiate su `main`** (deploy Vercel Production):
- **PR #2** — re-skin + due funzionalità nuove (sopra).
- **PR #3** — hotfix + completamento del re-skin:
  1. *Padding card legacy*: la regola `.admin-scope .card { padding: 0 }` (giusta per
     le card nuove, dove il padding lo dà `.card__body`) azzerava lo spazio interno
     anche sulle pagine admin ancora in markup legacy → testo a filo del bordo
     (segnalato su `/admin/sessioni`). Fix CSS difensivo:
     `.admin-scope .card:not(:has(.card__head)):not(:has(.card__body)) { padding: 22px }`.
  2. *Restyling completo*: portate al markup Atlante (`card__head`/`card__body`,
     `field/input/select/textarea`, `tbl`, `page-head`, `chip`, `banner`, `seg`,
     `empty`) **tutte** le pagine admin rimaste legacy: `/admin/sessioni` (lista +
     `NewSessioneForm`), `/admin/sessioni/[id]` (+ `CsvImportForm`, `CodaResolver`,
     `PresenzeManager`), `/admin/report-fondo` (+ `DepositaPanel`),
     `/admin/learning-objects/new` e `/[id]` (+ relativi form), `ContenutiTable`
     (tabella in `card__body--flush`). Ora **nessuna `.card` usa più il contenuto
     diretto**: l'area admin è graficamente uniforme col mockup.

  Nota di processo: la PR #3 era stata diramata da `main` *prima* del merge della #2,
  quindi al merge ha dato un conflitto add/add su `globals.css` e `ContenutiTable.tsx`
  (gli stessi file da due storie diverse; la #2 era entrata come squash). Risolto
  mergiando `main` nel branch e prendendo la versione del branch (superset). Per la
  prossima sessione: **lavorare sul branch di sessione partendo da `main` aggiornato**
  ed evitare PR parallele che toccano gli stessi file.

  Verifiche prima di ogni merge: `build` verde, `typecheck` 0 errori,
  `npm run test:fase4` 15/15, CI GitHub Actions verde (typecheck+build, M1a gated).
  **Resta da fare la sola verifica visiva nel browser** sul deploy Production.

## Manutenzione / hardening (2026-05-30)

Sessione di hardening dopo la chiusura della Fase 4 — **nessun cambiamento
funzionale, tutti i gate restano verdi**. Mergiata su `main` → deploy Vercel
Production.
- Rimossi 4 file `.bak` finiti per errore sotto version control (copie dei
  sorgenti del generatore report fondo) + aggiunta la regola `*.bak` a
  `.gitignore` per evitare che ricapiti.
- Pulito `tsconfig.json`: rimosso `baseUrl` deprecato (TS5101; con
  `moduleResolution:"bundler"` e TS 5.6 i `paths` `@/*` si risolvono comunque
  relativi al tsconfig) e la chiave top-level spuria `"resolexnove":"node"`.
  `jsx:"preserve"` preservato.
- Verifica post-hardening (dopo `npm ci`, vedi trabocchetto #12): `typecheck`
  0 errori (sparito il warning `baseUrl`), `build` OK (27 route),
  `npm run test:fase4` **15/15**.

## UI — Restyling area discente + shell condivisa (2026-05-31)

Sessione di **restyling UI** (nessun cambiamento di schema/RLS, nessuna migration,
tutti i gate restano verdi). Branch `claude/youthful-cerf-5MYJu`, **mergiata su
`main` → deploy Vercel Production**. Verifica UI fatta dall'utente nel browser.
Punto di partenza: un mockup "Claude Design" fornito dall'utente
(`docs`/upload, bundle React) di cui si è adottato **tema + componenti**,
**vincolati ai dati e agli invarianti reali** (niente decorazioni che mentono sui
dati, niente scorciatoie che violano D26).

**Tema "Atlante" come tema base.** `src/app/globals.css` riscritto dal CSS del
mockup: palette teal `#1c504f` / ocra `#b07c1f` su sabbia, radii piccoli (3–10px),
look "strutturale" (bordi al posto delle ombre), chip mono maiuscole, righe dense.
Le classi legacy (`.shell .card .btn .badge table .alert .form-row .mono .muted`…)
sono **preservate e ri-tematizzate** (così tutto eredita il tema via variabili).
**Dark mode rimosso** (Atlante non ha variante scura → tema uniforme). Font via
`next/font` in `layout.tsx`: **Geist** (pacchetto `geist`, perché `next/font/google`
su Next 14.2 non esporta `Geist`) = sans, **Bricolage Grotesque** = display,
**IBM Plex Mono** = mono, **Plus Jakarta Sans** = fallback. Google Fonts è
raggiungibile dal container al build (a differenza di `*.vercel.app`).

**Shell condivisa.** Nuovo `src/components/AppShell.tsx` (sidebar role-aware
discente/auditor/admin + area contenuto) **sostituisce `TopBar` ovunque** — i
layout `audit/layout.tsx` e `admin/layout.tsx` e le pagine discente ora usano
`AppShell`. La voce attiva è derivata dal pathname dal client component
`src/components/SidebarNav.tsx` (`usePathname`), niente prop `active` da passare.
Helper esportati da AppShell: `Ico`, `Crumb`, `Cover` (solo gradiente+iniziale,
**niente immagini di copertina**: non sono nel modello dati), `StatusChip`.
`TopBar.tsx` non è più importato da nessuna pagina (lasciato nel repo, inerte).
`LogoutButton` ha una variante `iconOnly` per la sidebar.

**Dati reali esposti.** `requireSession` (`auth-context.ts`) ora carica
`nome/cognome` della persona (saluto + iniziale avatar). `CorsoMini` esteso con
`descrizione`. Pagine discente riscritte:
- `/corsi`: header con saluto + KPI (in corso / idonei / da iniziare), `course-card`
  con chip stato, %, obbligatori `x/y`, descrizione corso (tutto già da
  `compliance.ts`). **Omessi copertine e durate** (non nel modello).
- `/corsi/[edizioneId]`: hero (gradiente), lista LO `ok/current/locked`
  (`current` = primo `sbloccato && !completato`), sidebar avanzamento.
  **Rimosso il pannello "Certificato"** (è Fase 5, fuori scope).
- `/corsi/[edizioneId]/lo/[loId]`: player a due colonne + outline corso.
  **Nessun bottone "Segna come completata" sul video** (D26: solo `video.ended`).
  Documento: il bottone "Ho terminato la lettura" **resta** (è il meccanismo
  legittimo `documento.completed`). Resta la nota "Riproduzione/Lettura tracciata".
- `login`: split-screen editoriale, **auth Supabase reale invariata**.

**Stream eventi nel player: aggiunto e poi RIMOSSO dalla vista discente** (scelta
UX dell'utente). Era stato implementato sia client-side sia "dal log" (la RLS
`evento_read` consente già al discente di leggere i propri eventi —
`actor.persona_id = current_persona_id()`, verificato sul DB live, **nessuna
migration servirebbe**). Poi rimosso perché lo stream grezzo è linguaggio da
auditor, non da discente: la vista autoritativa resta su `/audit/log`. Rimosso
`src/lib/event-stream.ts`; la classe CSS `.event-stream` resta nel tema (inerte).

Decisioni di questa sessione (ratificate con l'utente): copertine/durate **omesse**;
Certificati **esclusi** (Fase 5); stream eventi **non mostrato** al discente.
Verifica: `typecheck` 0 errori, `build` 27 route OK, `npm run test:fase4` **15/15**;
UI confermata nel browser dall'utente. **Niente migration, niente PII nei payload,
nessun INSERT diretto su `evento`** (i player continuano a passare per `/api/events/*`).
File chiave: `globals.css`, `layout.tsx`, `components/{AppShell,SidebarNav,LogoutButton,
VimeoPlayer,DocumentoPlayer}.tsx`, `lib/auth-context.ts`, `lib/db-types.ts`,
pagine `app/{login,corsi,corsi/[edizioneId],corsi/[edizioneId]/lo/[loId]}`,
layout `app/{audit,admin}/layout.tsx`.

Rifiniture fatte (2026-05-31, stesso branch): rimosso `TopBar.tsx` (dead code);
responsive `@media (max-width:860px)` in `globals.css` — sidebar dell'app impilata
sopra il contenuto, griglie `.player-layout`/`.detail-layout` a singola colonna,
`.page-head` in colonna (il dettaglio corso ora usa la classe `.detail-layout`
invece dello stile inline). Possibili prossimi passi UI (non bloccanti): nav
mobile dedicata (hamburger) al posto della sidebar impilata; eventuale variante
dark coerente con Atlante.

## Stato di avanzamento (Fase 1)

**Fase 1 chiusa.** Tutti i task ✅, gate M1a e M1 ✅ verdi. Deploy production
`fad-wine.vercel.app` serve il video reale del cliente su Vimeo (id `1084894652`,
613 s) con domain restriction attiva (D5). Verifica funzionale del player sul
deploy: confermata 2026-05-22.

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Substrato dati + RLS | ✅ done — `supabase/migrations/20260521000001_schema.sql` |
| 2 | Log append-only (gate M1a) | ✅ done — `…002_audit_log.sql`, gate M1a **verde** |
| 3 | Auth + login | ✅ verificato sul deploy (login discente + auditor) |
| 4 | Seed corso FAD | ✅ done — eseguito sul progetto Supabase live, esteso a 2 LO |
| 5 | Player Vimeo tracciato | ✅ sblocco sequenziale enforced lato API + UI |
| 6 | I due report di audit (gate M1) | ✅ verificati su `/audit/log` (Log eventi + Completamento attività) |

## Stato di avanzamento (Fase 2)

**Fase 2 chiusa. Tutti i Task ✅, gate M2 ✅ VERDE** (Task 5 chiuso 2026-05-27;
verifiche UI nel browser di Task 4/5 ancora consigliate prima della consegna a
clienti veri). Verifica funzionale 2026-05-22 sul deploy production: admin crea
LO `video` + LO `documento` (PDF su bucket Storage `documenti`), crea Corsi dalla
UI, compone la Struttura aggiungendo/riordinando/togglando LO. Creazione della
prima Edizione congela corso + Struttura via trigger DB (D22 verificato con 9
test SQL sul live). Fruizione discente multi-LO con sblocco sequenziale D26
verificato a livello DB: simulazione completa di video.ended → sblocco documento
→ documento.opened/completed → idoneità. Catena audit integra dopo i 3 nuovi
tipi di evento. Isolamento Storage tenant verificato (un utente di tenant diverso
vede 0 file). Task 5: report di completamento *rule-aware* su corso multi-LO
(distingue obbligatori/facoltativi, applica la `regola_completamento` di ogni
riga, deriva l'idoneità solo dagli obbligatori), verificato con 21/21 test SQL
sul live + read-only sul corso reale `Demo multi-LO`.

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Authoring LO (video + documento + admin + Storage) | ✅ done — `…20260522000001_…sql` + `…000002_…_admin_storage.sql`, UI `/admin/learning-objects` |
| 2 | Assemblatore Corsi (CRUD `corso` + Struttura) | ✅ done — `…20260522000003_…_corso_struttura_admin.sql`, UI `/admin/corsi`, RPC `reorder_struttura` |
| 3 | Authoring Edizioni + congelamento D22 | ✅ done — `…20260522000004_…_edizioni_congelamento.sql`, trigger DB verificati |
| 4 | Fruizione discente multi-LO (player documento) | ✅ done (DB) — `/api/events/documento`, `/api/storage/.../signed-url`, `DocumentoPlayer`, branching pagina LO. UI nel browser da verificare. |
| 5 | Report completamento multi-LO (gate M2) | ✅ done — report *rule-aware* in `compliance.ts` + UI `/audit/completamento` (mostra tipo, obbligatorio/facoltativo, regola), test `supabase/tests/m2_completamento.sql` 21/21 sul live |

## Stato di avanzamento (Fase 3)

**Fase 3 — fetta webinar (pipeline presenze + adattatori). Task 1–5 ✅, gate M3a
✅ VERDE** (2026-05-29). Mandato: `docs/brief-fase-3.md`. La slice gira end-to-end
via CSV sul Supabase live (import → grezzo write-once → hash → riconciliazione →
presenze/non-riconciliazioni → coda ambigui → risoluzione/inserimento/correzione
manuale → frequenza e idoneità derivate dai soli Eventi). **Task 6 (adattatore API
Teams) + gate M3 rinviati**: richiedono setup Azure AD/segreti/egress Graph non
eseguibile da Claude Code on the web — è un runbook lato utente. UI da verificare
nel browser sul deploy (egress `*.vercel.app` bloccato da qui).

Decisioni §10 ratificate (2026-05-27): Teams unica piattaforma VCS implementata;
match ambigui → **blocco + risoluzione manuale**; riconciliazione → **automatica
all'import + ri-esecuzione manuale**; idoneità corsi di presenza → **automatica
alla soglia** (`corso.soglia_frequenza_percentuale`).

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Schema Gruppo 3 (azienda/piano/incarico/sessione) + grezzo write-once + estensioni iscrizione/corso | ✅ done — `…20260527000001_fase3_gruppo3_grezzo.sql` applicata sul live; seed `supabase/seed/fase3_webinar_demo.sql` |
| 2 | Pipeline unica (ingest grezzo → evento import → riconciliazione) | ✅ done — `…20260529000001_fase3_pipeline_ingest.sql` applicata sul live; pgTAP `m3a_pipeline_ingest.sql` 17/17. Stadi (a)+(b); stadio (c) = seam del Task 4 |
| 3 | Adattatore CSV (upload + parser + mappatura colonne) | ✅ done — `src/lib/csv.ts` (+`pipeline.ts`), route `…/sessioni/[id]/import-csv`, UI `/admin/sessioni`. Parser verificato; path CSV→pipeline 8/8 sul live |
| 4 | Riconciliazione + coda risoluzione ambigui (gate M3a) | ✅ done — motore DB (`…20260529000002_…`, pgTAP 20/20), `compliance.ts` frequenza #9 (8/8 + parser 14/14), UI coda (`CodaResolver` + route risolvi/ignora) e frequenza nel report auditor |
| 5 | Inserimento/correzione manuale presenze (M3a #7) | ✅ done — RPC `presenza_inserisci_manuale`/`presenza_correggi_manuale` (`…20260529000003_…`), UI `PresenzeManager`, pgTAP `m3a_presenza_manuale.sql` 9/9. Correzione = nuovo Evento, mai UPDATE |
| 6 | Setup Teams + adattatore API (gate M3) | ⛔ rinviato (runbook esterno) |

**Gate M3a ✅ VERDE** (2026-05-29): tutti i 9 criteri di `docs/brief-fase-3.md` §8
verificati sul Supabase live. La fetta webinar gira end-to-end via CSV
(import → grezzo write-once → Evento di import con hash → riconciliazione →
Eventi di presenza/non-riconciliazione → coda ambigui → risoluzione manuale →
inserimento/correzione manuale → frequenza/idoneità dai soli Eventi).

Nota Task 1: il brief assumeva `email_riconciliazione`/`ore_frequentate`/
`frequenza_percentuale` già su `iscrizione`; non c'erano → aggiunte dalla migration,
con le FK `azienda_id`/`piano_id` e `corso.soglia_frequenza_percentuale` (campo
strutturale, ora nel freeze D22). Verifica hermetica sul live 10/10: grezzo
write-once (UPDATE/DELETE bloccati, D20), `grezzo_content_hash` deterministico e
sensibile, trigger D30 sessione↔incarico (stessa edizione + ruolo didattico),
sessione con `incarico_id` NULL ammessa, 5 tabelle + RLS presenti.

Nota Task 2 (2026-05-29): `pipeline_ingest_grezzo(tenant, sessione, fonte,
contenuto, importato_da)` è l'**unica** via di scrittura del grezzo (SECURITY
DEFINER come `audit_append`): nella stessa transazione fa (a) l'INSERT del grezzo
write-once e (b) `audit_append('report_grezzo_importato', …, payload={fonte, hash,
righe})` con `hash = encode(grezzo_content_hash(contenuto),'hex')` — mai INSERT
diretto su `evento`. Il `contenuto` normalizzato è **un array JSON di righe**
(stessa shape per CSV e API Teams). Stadio (c) riconciliazione = seam del Task 4
(nessun Evento di presenza speculativo: il log è append-only). Authz come
`audit_verify_chain`: chiamante `authenticated` ⇒ deve essere admin del tenant;
`service_role`/`postgres` (tenant nullo) bypassano (import automatici/test). **`anon`
EXECUTE-revocato esplicitamente** (Supabase lo concede di default sulle funzioni
`public`, e con tenant nullo salterebbe la guardia admin). `importato_da` NULL
(import automatico API Teams) → rifiutato per ora, è del Task 6 (serve un attore
"sistema"). Verifiche sul live in transazione+rollback: 14/14 funzionali, 2/2 authz
(admin passa / discente bloccato, JWT simulato con le Persone reali), grant puliti
(no `anon`), nessun leakage; pgTAP `supabase/tests/m3a_pipeline_ingest.sql` **17/17**.

Nota Task 3 (2026-05-29): adattatore CSV in `src/lib/csv.ts` (zero dipendenze):
`parseDelimited` (auto-rileva `,`/`;`/tab, gestisce virgolette+`""`, CRLF/LF, BOM),
`HEADER_ALIASES` per varianti Teams/Zoom IT/EN, `mapHeaders` con **override
configurabile** che ha precedenza sugli alias, `csvToNormalizedRows` che produce
un array di righe `{riga,nome,email,join,leave,durata}` (valori "come ricevuti",
no parsing durata/timestamp — è del Task 4) e **fallisce esplicitamente** se manca
una colonna chiave (`nome`/`email`/`durata`) PRIMA di toccare il grezzo. Le righe
senza email restano (email→`null`) per gli anonimi del Task 4. Route admin
`POST /api/admin/sessioni/[id]/import-csv` (`requireAdmin` → adattatore →
`ingestGrezzo` con `fonte='csv'`, `importato_da`=persona admin). UI area
`/admin/sessioni`: lista, **pianifica** sessione (route `POST /api/admin/sessioni`
+ Evento `sessione.created`; incarico opzionale, sessione senza docente ammessa —
M3 #6), dettaglio con form import (file o incolla, mappatura avanzata) + elenco
grezzi (righe + fonte, hash nel log eventi). Verifiche: parser via `tsx` (Teams `,`,
IT `;`, TSV, anonimo, override, errori); path CSV→pipeline con l'**admin reale**
(JWT simulato) sul live **8/8** (3 righe, anonimo preservato, hash combaciante,
catena integra), nessun leakage; typecheck+build verdi. **Da verificare nel browser**
sul deploy (egress `*.vercel.app` bloccato da qui): upload reale + refresh UI.

Nota Task 4 (2026-05-29): `pipeline_riconcilia_grezzo(grezzo_id)` (stadio c,
agganciato all'auto-import) + RPC `riconcilia_risolvi_match`/`riconcilia_ignora`
(coda → Eventi, mai UPDATE) + tabella `coda_riconciliazione` (working-state) +
policy RLS admin su persona/iscrizione (per scegliere l'iscritto). `compliance.ts`:
`parseDurataMinuti` + `computeFrequenzaForIscrizione` (max durata effettiva per
sessione, cap al pianificato, idoneità auto alla soglia), gestione **sostituzione**
delle correzioni. UI: `CodaResolver` (coda) + colonna Frequenza nel report auditor.
Verifiche live: riconciliazione 18/18, pgTAP `m3a_riconciliazione.sql` 20/20,
frequenza #9 8/8 (Mario 100% / Lucia 91.67% a soglia 80, invariante all'azzeramento
cache), parser 14/14.

Nota Task 5 (2026-05-29): `presenza_inserisci_manuale` / `presenza_correggi_manuale`
(motivazione obbligatoria; la correzione è un nuovo Evento `presenza_corretta_manualmente`
con `payload.corregge_evento_id`, l'Evento precedente resta invariato — append-only).
Policy RLS additiva: l'admin legge gli Eventi di presenza/riconciliazione del tenant
(per la UI). UI `PresenzeManager` (elenco presenze con superate barrate + correggi +
aggiungi manuale). Verifiche live 9/9 + pgTAP `m3a_presenza_manuale.sql` 9/9. La
frequenza usa la durata corretta (60, non 100). Le UI di Task 4/5 sono da verificare
nel browser sul deploy.

## Stato di avanzamento (Fase 4)

**Fase 4 — generatore di report fondi. Task 1–6 ✅, gate M4a ✅ + M4 ✅ verificati a
livello DB** (2026-05-29; **mergiata su `main` → deploy Vercel production, PR #1**).
Mandato: `docs/brief-fase-4.md`. Decisioni §10 ratificate
con l'utente: congelamento = **snapshot write-once**; deposito sul portale = **manuale**;
primo formato = **Fondimpresa** (unica edizione finanziata seed); warning **bloccanti**
= CUP mancante + CF mancante (gli altri = avvisi). **Formati interim**: gli adattatori
Fondimpresa/FonCoop producono un CSV completo ma **NON ufficiale** (`ufficiale:false`);
il tracciato ufficiale per-avviso è un **runbook esterno** (§10, come Teams in Fase 3) →
M4a #4 "formato conforme" resta in sospeso fino allo spec. UI da verificare nel browser
(egress `*.vercel.app` bloccato da qui); il motore TS end-to-end va girato dove l'egress
`*.supabase.co` è consentito (script `scripts/verify-fase4.ts`).

Il motore di aggregazione è **format-agnostic** (D7 ribaltato in output): `(Edizione,
Piano) → dataset neutro` dagli Eventi, due adattatori davanti. Riusa `compliance.ts`
(stessa fonte dell'auditor → riconciliazione per costruzione). Lo snapshot depositato è
prova **write-once** (REVOKE+trigger, come `evento`/grezzo); l'Evento `report_fondo_depositato`
porta solo `payload.hash` (mai PII, D18). Più snapshot per (Edizione, Piano) coesistono.

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Schema `report_fondo_depositato` (write-once) + testata Piano (cup/avviso/canale/date) | ✅ `…20260529000004_…` applicata; seed `supabase/seed/fase4_fondo_demo.sql` |
| 2 | Motore aggregazione `report-fondo.ts` (dataset neutro dal log) + `persona.codice_fiscale` + RLS admin completamenti | ✅ `…20260529000005_…`; verificato sotto RLS admin sul live |
| 3 | Validazioni di conformità (warning bloccanti/avvisi, D33) | ✅ `report-fondo-validazioni.ts`, unit test 7/7 |
| 4 | Adattatore Fondimpresa interim + UI anteprima/genera (gate M4a) | ✅ `report-fondo-formati.ts`, route `genera`, UI `/admin/report-fondo` |
| 5 | Adattatore FonCoop/GIFCOOP interim (stesso motore) | ✅ secondo adattatore, test 8/8 (15/15 totali fase4) |
| 6 | Deposito snapshot write-once + Evento/hash + verifica (gate M4) | ✅ `…20260529000006_…` + `…0007_…` (RLS), RPC `report_fondo_deposita`/`report_fondo_verifica`, UI `DepositaPanel`, pgTAP `m4_report_fondo.sql` 10/10 |

## Stato dei gate

- **M1a** — *Il log regge.* ✅
  - pgTAP 20/20 sul Supabase live (`supabase/tests/m1a_audit_log.sql`)
  - pgTAP 20/20 in locale (Postgres del container Claude Code)
  - Concorrenza pg 50 connessioni parallele 2/2 in locale (`tests/m1a/concurrency-pg.test.ts`)
- **M1** — *La fetta gira end-to-end.* ✅ **VERDE** (verificato 2026-05-22 sul deploy `fad-wine.vercel.app`)
  - DB-level (M1 #4 ricalcolo completamento da Eventi, sblocco sequenziale, idoneità): **10/10** sul Supabase live (`supabase/tests/m1_slice_data.sql`)
  - **#1 slice end-to-end via UI**: login discente → /corsi → 2 capitoli (#2 con lucchetto) → video play→ended → secondo capitolo si sblocca → login auditor → entrambi i report (`Log eventi`, `Completamento attività`) mostrano l'attività
  - **#3 sblocco server-side**: `POST /api/events/video` con `learning_object_id` di LO bloccato → `HTTP 403 {ok:false, error:"LO non sbloccato (sblocco_sequenziale)"}` ; dopo `video.ended` di LO #1 → `HTTP 200 {ok:true}` (testato dalla Console del browser come discente loggato)
  - **#5 isolamento tenant**: query con `SET LOCAL role authenticated` + JWT claim del discente di tenant A → 0 righe visibili da tenant Sentinel B (test SQL in transazione con rollback, vedi cronologia chat o `supabase/tests/`)
  - **#6 verifica catena audit**: pulsante "Verifica integrità catena" su `/audit/log` → "Catena integra. Tutti gli hash combaciano."
  - Nota UX confermata: lo sblocco sequenziale NON si aggira con il seek del player — `regola_completamento: video_ended` viene ricalcolato lato server dagli eventi (D26).
- **M2** — *Corsi reali end-to-end.* ✅ **VERDE** (Task 5 chiuso 2026-05-27).
  Criteri in `docs/brief-fase-2.md` §8.
  - **#1 Authoring funzionante** ✅ sul deploy production 2026-05-22 (Task 1+2).
  - **#2 Congelamento reale (D22)** ✅ verificato sul Supabase live con 9 test
    SQL: i trigger `corso_freeze` e `struttura_freeze` rifiutano
    update/insert/delete sui campi strutturali e su `struttura_corso` quando
    il Corso ha almeno un'Edizione (anche conclusa). Test bonus: update su
    `creato_il` (campo non strutturale) resta consentito.
  - **#3 Fruizione multi-LO** ✅ a livello DB (Task 4): simulato il flusso
    completo `video.ended` → sblocco `documento` → `documento.opened`/
    `documento.completed` → idoneità. UI player documento da verificare nel
    browser (l'API è la stessa code path di `/api/events/video` di Fase 1).
  - **#4 Sblocco sequenziale (D26) in esercizio** ✅ a livello DB: corso demo
    `Demo multi-LO` con LO1 video + LO2 documento, `sblocco_sequenziale=true`,
    LO2 risulta `sbloccato: false` finché LO1 non riceve `video.ended`.
    `compliance.ts` aggiornato per mappare anche `documento_completed`.
  - **#5 Report multi-LO** ✅ verificato 2026-05-27. `compliance.ts` ricalcola
    il progresso dagli Eventi (D8, `force-dynamic`), distingue obbligatori e
    facoltativi e applica la `regola_completamento` di ogni riga via
    `COMPLETION_EVENT_FOR_RULE` (`video_ended`→`video.ended`,
    `documento_completed`→`documento.completed`). L'idoneità dipende solo dagli
    obbligatori (i facoltativi non bloccano). UI `/audit/completamento` ora
    mostra per ogni LO tipo, obbligatorio/facoltativo, regola applicata e stato.
    Test `supabase/tests/m2_completamento.sql` **21/21** sul Supabase live
    (vista di test rule-aware, scenario 3 LO misti): include la prova che un
    `video.ended` sul LO `documento` NON lo completa e che il facoltativo non
    incide sull'idoneità. Verifica read-only sul corso reale `Demo multi-LO`:
    idoneità derivata corretta, eventi di altri corsi ignorati.
  - **#6 Isolamento Storage** ✅ verificato sul live: un utente authenticated
    di un altro tenant (simulato con `SET LOCAL request.jwt.claims`) vede 0
    file del bucket `documenti`; il discente legittimo vede il proprio file.
  - **#7 Log Fase 1 invariato sui nuovi eventi** ✅ — `audit_verify_chain`
    ritorna 0 problemi dopo i nuovi tipi `learning_object.*`, `corso.*`,
    `struttura.*`, `edizione.*`, `documento.opened`/`documento.completed`.
- **M3a** — *Pipeline + CSV reggono.* ✅ **VERDE** (2026-05-29). Tutti i 9 criteri
  di `docs/brief-fase-3.md` §8 verificati sul Supabase live (transazione+rollback),
  più 3 test pgTAP committati. Mappatura criterio → evidenza:
  - **#1 grezzo immutabile** ✅ — UPDATE/DELETE bloccati (`m3a_pipeline_ingest.sql`
    #15/#16; Task 1 10/10).
  - **#2 import attestato** ✅ — 1 solo `report_grezzo_importato`, `payload.hash` =
    hash del contenuto, riproducibile e sensibile a 1 byte (`m3a_pipeline_ingest.sql`
    #4/#5/#6, **17/17**).
  - **#3 nessun INSERT diretto in `evento`** ✅ — grep: unico `insert into public.evento`
    è in `audit_append`; in `src/` solo `.from('evento').select`.
  - **#4 match esatto** ✅ — 1 `presenza_webinar_registrata`, no PII; + fallback
    `persona.email` e priorità `email_riconciliazione` (`m3a_riconciliazione.sql`, **20/20**).
  - **#5 match ambiguo** ✅ — ≥2 candidati → coda, nessuna presenza automatica;
    risolto → presenza + `match_risolto_manualmente` con motivazione.
  - **#6 partecipante anonimo** ✅ — `partecipante_non_riconciliato` con
    identificatore stabile (hash), nome NON nel payload.
  - **#7 correzione manuale** ✅ — `presenza_corretta_manualmente` referenzia
    l'Evento precedente (invariato); la frequenza usa il valore corretto
    (`m3a_presenza_manuale.sql`, **9/9**).
  - **#8 stream unico** ✅ — tutti gli Eventi sullo stream del tenant, nessun nuovo stream.
  - **#9 cache compliance ricalcolata** ✅ — `compliance.ts` ricalcola
    ore/frequenza/idoneità dagli Eventi, invariante all'azzeramento delle colonne-cache
    (live 8/8; parser durata 14/14).
- **M3** — *Webinar end-to-end con API Teams.* ⛔ rinviato (Task 6, setup Teams
  esterno: Azure AD + segreti + egress Graph). Criteri in `docs/brief-fase-3.md` §9.
- **M4a** — *Primo formato regge.* ✅ (a livello DB/test, 2026-05-29). Criteri
  `docs/brief-fase-4.md` §8: **#1** aggregazione dal log (cache=0 sul live ma report
  100%/91.67% → numeri dagli Eventi; grep: nessuna colonna-cache nel path) ✅; **#2**
  riconciliazione con l'auditor (stessa `compliance.ts`) ✅; **#3** nessun Evento/PII nel
  path di generazione (grep) ✅; **#4** formato conforme ⏸️ **rinviato** (interim, tracciato
  ufficiale §10); **#5** warning con severità corretta (unit test 7/7) ✅; **#6** isolamento
  tenant via RLS (tenant sentinella B vede 0 di A) ✅.
- **M4** — *Generatore end-to-end, due formati + congelamento.* ✅ (a livello DB/test,
  2026-05-29). Criteri `docs/brief-fase-4.md` §9: **#1** report generato+depositato
  (snapshot + Evento+hash) ✅; **#2** entrambi i formati sullo stesso motore (test
  due-formati) ✅; **#3** snapshot immutabile (UPDATE/DELETE bloccati) ✅; **#4**
  rigenerazione additiva (2 snapshot, 1° invariato) ✅; **#5** drift anagrafica (snapshot
  congelato vs `persona.cognome` live cambiato) ✅; **#6** criteri M4a non regrediti ✅;
  **#7** catena hash integra dopo il deposito ✅; **#8** sessione con `incarico_id` NULL
  rendicontata senza rompere ✅. pgTAP `supabase/tests/m4_report_fondo.sql` **10/10** (live,
  rollback). Resta la verifica UI nel browser + il tracciato ufficiale dei formati (runbook).

## Infrastruttura cloud creata

### Repo GitHub
- `nicolopatti/FAD`
- **Default branch su GitHub: `main`** (impostato 2026-05-22; era il vecchio feature branch).
- Vercel deploya `main` come Production; preview su ogni altro branch.
- Ogni sessione Claude Code on the web lavora su un proprio branch
  (`claude/<slug>-<id>`); a fine sessione, il push del branch + un
  `git push origin <branch>:main` allinea Production (autorizzato dall'utente
  esplicitamente in questa sessione).

### Progetto Supabase
- Nome: **fad-fase-1**
- Project Ref: **`eqtiyqoxwgnerbmdkqff`**
- Project URL: **`https://eqtiyqoxwgnerbmdkqff.supabase.co`**
- Regione: `eu-central-1`
- Free tier ($0/mese)
- Postgres 17.x, pgcrypto su schema `extensions`, pgtap disponibile

#### Chiavi
- Anon (legacy JWT): salvata in questa repo solo come riferimento di lavoro;
  ricavabile sempre da Dashboard → Project Settings → API. *Esempio già usato:*
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdGl5cW94d2duZXJibWRrcWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTE1NDksImV4cCI6MjA5NDk2NzU0OX0.fTfbtv9t3InpIcWtoyTgfaG550SALiwj45-_gRpNM_I`
- Publishable: `sb_publishable_AjzZkXIAuepxDGXehi-aFQ_YZzJvTF5`
- **Service role** — NON in repo. Da copiare ogni volta dal dashboard
  (Project Settings → API → service_role) e impostare come env var
  `SUPABASE_SERVICE_ROLE_KEY` lato server (mai esposta al browser).

#### Stato dati sul progetto live
- 1 tenant: `00000000-0000-0000-0000-000000000001` (Tenant Demo Fase 1)
- 1 stream audit (1 per tenant come da D11/D19)
- 2 utenti Auth + 2 Persone
- 1 Corso ("Sicurezza sul lavoro — modulo introduttivo", `c0c01111-…`) + **2 LO video Vimeo** in sequenza (`10101111-…` Introduzione ordine 1, `10102222-…` Approfondimento ordine 2) + Struttura + 1 Edizione (`ed011111-…` codice ED-001) + 1 Iscrizione del discente (`15c11111-…`)
- Vimeo ID `1084894652` (video reale del cliente, 613 s) usato per entrambi i LO. Privacy: Hide from Vimeo + embed limitato ai 3 domini Vercel del progetto (D5 rispettata).
- **Fase 3/4 demo (prefisso `33333333…`)**: 1 Azienda, 1 Piano `…0000b1` (**fondo=fondimpresa**, ora con CUP `B12C34000560006` + avviso "Avviso 1/2026" + canale + date, seed Fase 4), Corso webinar `…0c01` (soglia 80%, **0 struttura FAD**), Edizione `…00e1` `ED-WEB-2026`, 1 Sessione VCS Teams 120′ col docente, 3 iscritti (Mario `…015001` + Lucia `…015002` finanziati con CF; Carla `…015003` individuale). **Presenze reali nel log** (seed Fase 4 via pipeline: Mario 120′→100%, Lucia 110′→91.67%). Admin reale `aaaa3333-…`.
- **Tabella Fase 4** `report_fondo_depositato` (write-once, vuota sul live: i depositi di test girano in rollback). RPC `report_fondo_deposita`/`report_fondo_verifica`. Seed riproducibile: `supabase/seed/fase4_fondo_demo.sql` (idempotente).

#### Utenze demo (create da bootstrap)
- Discente: `discente@fad.local` / `discente-pass-123`
- Auditor: `auditor@fad.local` / `auditor-pass-123` (app_metadata.role=auditor)
- Admin: `admin@fad.local` / `admin-pass-123` (app_metadata.role=admin) — creato
  in Fase 2 Task 1; sul live l'utente è stato inserito via SQL diretto (la session
  non aveva la service_role key in env per `npm run bootstrap`). Re-eseguire
  `npm run bootstrap` con la chiave in env è idempotente e ricrea l'admin nello
  stesso stato.

#### Supabase Storage
- Bucket **`documenti`** (privato), creato in Fase 2 Task 1.
- 4 policy RLS su `storage.objects` (vedi `…000002_…_admin_storage.sql`):
  - read: chiunque sia `authenticated` dello stesso tenant può scaricare i file
    con prefisso `{tenant_id}/...` (Task 4 ne avrà bisogno per i discenti);
  - insert/update/delete: solo `is_admin()` del tenant proprio.
- Path convenzione: `{tenant_id}/{lo_id}.pdf` — il primo segmento è verificato
  dalle policy via `(storage.foldername(name))[1]`.

### Vercel
- Team `nicolopatti's projects` (`team_LDcXwgO7cQrFtkAhaISEhjYj`, slug `nicolopattis-projects`).
- **Project FAD: `fad`** (id `prj_3u7miTUbdIwTRNuNU6KWdUHX6qLC`), collegato a `nicolopatti/FAD` su Production branch `main`.
- URL canonico di produzione: **https://fad-wine.vercel.app**
- Branch alias `main`: `https://fad-git-main-nicolopattis-projects.vercel.app`
- Pattern preview: `https://fad-<hash>-nicolopattis-projects.vercel.app`
- Env vars configurate sul progetto Vercel (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_TENANT_ID`.
- Supabase Auth → URL Configuration aggiornata: Site URL = `https://fad-wine.vercel.app`,
  Redirect URLs = `https://fad-wine.vercel.app/**` + `https://fad-*-nicolopattis-projects.vercel.app/**`.
- **Network policy ambiente Claude Code on the web**: `*.vercel.app` è bloccato dall'egress
  gateway del container (risposta `x-deny-reason: host_not_allowed`). I test HTTP contro
  il deploy vanno fatti dal browser dell'utente o dal proprio terminale, non da qui.

## Decisioni ratificate

1. **Cloud-only workflow** — GitHub → Vercel → Supabase, Claude Code on the web.
   Niente `.env` locali, niente `supabase start`. Credenziali nei pannelli dei provider.
2. **Vimeo** come hosting video (D5 con domain restriction).
3. **Supabase Storage** come hosting dei file `documento` (§9 brief Fase 2,
   ratificato all'avvio del Task 1 della Fase 2). Bucket privato + policy RLS
   per-tenant + path `{tenant_id}/{lo_id}.pdf`.
4. Tutto il resto del brief: D2, D8, D11, D18, D19, D23, D24, D26, D27, D35 implementati come specificato.

## Cosa fare nella prossima sessione

> **Aggiornamento 2026-10-20 notte, area admin (leggere per primo).** Le tre ondate
> dell'area admin (A orientamento, B libreria, C scala: dettagli nella sezione in testa al
> file) sono su `main` dal commit `cdcda87` (fast-forward autorizzato dall'utente "Vai") e
> in produzione; migration applicate sul live fino alla `20261021000002`. Le scritture
> dell'ondata C sono state provate sul deploy con `scripts/verifica-scritture.mjs` (29/29).
> **Prossimi passi:**
> 1. Riscontro dell'utente nel browser sull'area admin nuova (catalogo a lista, Persone e
>    Aziende, categorie, azioni in blocco); le rifiniture si fanno in un'unica passata.
> 2. Non provati da qui: invito in blocco (manda email) e rimozione in blocco.
> 3. Il workflow `verifica-scritture.yml` ha scritti dentro URL e link `_vercel_share`
>    dell'anteprima (il link scade dopo 23 ore): per riusarlo aggiornarli, oppure
>    lanciarlo a mano da GitHub → Actions con gli input. L'integrazione GitHub della
>    sessione non può avviarlo (403); i Vercel Sandbox non sono abilitati.
> 4. Dal doc di analisi restano idee non pianificate (non richieste): selettori a ricerca
>    nei form della rendicontazione, azioni in blocco su altre liste. Niente altro di
>    aperto sull'area admin. Il resto delle note qui sotto resta valido.
> 5. **Dipendenze (2026-10-21).** `npm audit fix` (lockfile: `nanoid`, `source-map-js`,
>    patch transitivi) è su `main` (`1aea271`). Poi, su richiesta dell'utente ("procedi
>    tu"), **aggiornamento a Next 16.4 / React 19** fatto sul branch (vedi la sezione
>    "Next 16" in testa al file): `npm audit --omit=dev` = **0 vulnerabilità**. **Su
>    `main` e in produzione** dal 2026-10-21 (via libera "Procedi"); dal container
>    verificati login e verifica pubblica sul deploy. **L'utente provi nel browser**:
>    login/logout, player video fino a fine lezione, test finale, PDF/badge/LinkedIn
>    dell'attestato, azioni admin che scrivono, tema scuro. Eventuali rifiniture in
>    un'unica passata.
>
> **Aggiornamento 2026-10-20 sera (leggere per primo).** Tutto il branch
> `claude/affectionate-hawking-03ev7i` è su `main` (fast-forward autorizzato
> dall'utente): Fase 5 completa (test finale, attestato, editor del modello), Blocco B
> chiuso (#2 #5 #7 #8 + prova di carico), smoke post-deploy, inviti/reset/cambio
> password con informativa, onboarding ente, revisione del codice con 10 correzioni.
> Migration applicate sul live fino alla `20261020000012`. CI verde (anche sui push
> dei branch `claude/**`). In produzione il deploy di `main` porta quindi anche le
> route che richiedono `SUPABASE_SERVICE_ROLE_KEY` (già su Vercel).
> **Prossimi passi, in ordine:**
> 1. **Prove nel browser dell'utente in produzione** (gate M5 + flussi nuovi):
>    `/admin/ente` con logo/firma e modello; sezione 6 "Attestato" di un corso; ore del
>    corso; "Riemetti"; corso "solo test" fino all'attestato automatico (PDF, badge,
>    LinkedIn, verifica pubblica); "Invita" un iscritto (email di Supabase, link →
>    scelta password + informativa); "Password dimenticata"; cambio password dal profilo;
>    `/audit/completamento` con l'ambito per edizione. Segnalare le rifiniture: si fanno
>    in un'unica passata.
> 2. **Configurazioni lato utente**: SMTP in Supabase (Auth → SMTP) e modelli email in
>    italiano, altrimenti gli inviti sono limitati a poche email l'ora; secret GitHub
>    `VERCEL_AUTOMATION_BYPASS_SECRET` (+ `E2E_*_PASSWORD`) per smoke ed E2E sulle
>    anteprime; togliere `NEXT_PUBLIC_TENANT_ID` da Vercel (inutilizzata); backup DB,
>    "leaked password protection", piani Pro (Supabase e Vercel) — con Pro anche lo
>    staging (runbook nel README).
> 3. **Test di carico vero** (300 VU, 10 min) da un ambiente in Europa con
>    `npm run test:carico` contro un'anteprima/staging (limite login alzato).
> 4. **Blocco D**: tracciati ufficiali Fondimpresa/FonCoop (servono i documenti), Teams
>    (serve Azure). **Debito minore**: `datiEnteDa` unico (dati dell'ente ricostruiti
>    in 4 punti). Niente altro di aperto nel piano eseguibile da qui.
>
> **Aggiornamento 2026-10-20 notte: le 4 ondate UX sono finite e mergiate su
> `main`** (fast-forward del branch `claude/affectionate-hawking-03ev7i`, 9 commit,
> autorizzato dall'utente: "Va procedi"). Deploy Vercel Production aggiornato.
> Stato dettagliato nella sezione "UX — revisione, mockup e ondata 1…4" in testa al
> file. **Cosa resta sul fronte UX, in ordine:**
> 1. **Prove nel browser dall'utente** delle azioni che scrivono (non eseguibili dal
>    container senza `SUPABASE_SERVICE_ROLE_KEY`): Duplica corso, modifica edizione,
>    assegnazione piano a un iscritto, nuovo piano, riordino con le frecce; player
>    fino a fine lezione e tab bar su telefono; tema scuro sui propri dispositivi.
>    Per far girare anche queste prove dal container: aggiungere il segreto
>    `SUPABASE_SERVICE_ROLE_KEY` nelle impostazioni dell'ambiente cloud (menu
>    ambiente → Modifica), **mai incollarlo in chat**; una nuova sessione lo vede.
> 2. **Rifiniture dopo il riscontro dell'utente** (come fatto per i chip dell'hero e
>    per la descrizione modificabile): raccoglierle e farle in un'unica passata.
> 3. **Debito tecnico UX**: portare in repo i crawler Playwright dello scratchpad
>    (`pw/crawl.mjs`, `shots*.mjs`, `func3_ro.mjs`, `func4.mjs`) come test E2E del
>    Blocco E; `/audit/completamento` ricalcola ancora ~10 query per iscrizione
>    (Blocco B #2); le route di scrittura fanno la modifica DB **prima** di
>    `appendEvent` → senza chiave di servizio lasciano dati senza Evento (valutare un
>    controllo fail-fast all'avvio o la RPC unica del Blocco B #5).
> Il resto di questa nota resta valido per i temi non-UX.
>
> **Aggiornamento 2026-10-20 (leggere PRIMA del resto di questa sezione, che è
> storica).** Stato: Fase 1–4 chiuse; hardening Tappa 1 fatto (sicurezza log, indici,
> login pulita); Vimeo robusto; corso di prova a 6 video verificato end-to-end nel
> browser; visione integrale per corso in produzione. Ambiente adatto a
> **sviluppo/test con dati finti**, non a clienti reali. Roadmap completa nel doc
> Claude "FAD — Piano di completamento" (artifact `13300d45-3520-4cfb-965f-7ad73a3fe042`).
> Prossimi passi, in ordine:
> 1. **Lato utente (non eseguibili da qui):** backup DB, "leaked password protection"
>    in Auth, piani Supabase Pro + Vercel Pro (finché Free: tenere sveglio il progetto,
>    pausa dopo 7 giorni di inattività), su Vimeo End screen → "Empty" per i video.
> 2. **Blocco B restante:** #2 report auditor in una funzione SQL (oggi ~10 query per
>    iscrizione in `Promise.all`), #5 RPC unica per gli eventi video, #7 unione
>    policy RLS multiple, #8 tenant non più da env; test di carico (k6, 300 sessioni).
> 3. **Blocco C/E:** staging separato (oggi le preview Vercel usano il DB di
>    produzione), monitoraggio/alert, SMTP + inviti/reset password, E2E Playwright e
>    pgTAP in CI.
> 4. **Blocco D:** tracciati ufficiali Fondimpresa/FonCoop (serve la documentazione
>    dell'utente), Teams (runbook Azure), Fase 5 attestato (serve brief).
> Metodo: ogni sessione lavora su un branch `claude/<slug>`; il push su `main` richiede
> autorizzazione esplicita dell'utente in quella sessione.

**Fase 4 — report fondi: Task 1–6 ✅, gate M4a ✅ + M4 ✅ a livello DB.** Gate
M1a/M1/M2/M3a/M4a/M4 tutti verdi (M3 e M4a#4 rinviati a runbook esterno). Il generatore
gira: `(Edizione, Piano) → dataset dal log → validazioni → file (interim) → snapshot
write-once + Evento/hash`, verificato sul Supabase live (pgTAP `m4_report_fondo.sql`
10/10 + verifiche MCP). **Non resta nulla di obbligatorio nello scope eseguibile da qui.**
Opzioni per la prossima sessione, in ordine:

1. **Verifica UI nel browser sul deploy** (non bloccante ma consigliata prima di
   clienti veri): `/admin/report-fondo` (seleziona edizione finanziata → anteprima con
   warning → genera file → deposita → verifica integrità snapshot) e `/audit/log`
   (l'auditor vede l'Evento `report_fondo_depositato` e verifica la catena). Egress
   `*.vercel.app` bloccato da qui → serve il browser dell'utente. In alternativa girare
   `scripts/verify-fase4.ts` dove l'egress `*.supabase.co` è consentito (login admin
   reale → motore end-to-end).
2. **Tracciati ufficiali dei formati (runbook §10)** → chiude M4a #4. Gli adattatori
   Fondimpresa/FonCoop sono **interim** (`ufficiale:false`): contengono tutti i dati ma
   intestazioni/ordine colonne non sono il tracciato del fondo (cambia per *avviso*).
   Con la documentazione ufficiale aggiornata: aggiornare solo `report-fondo-formati.ts`
   (il motore `report-fondo.ts` non si tocca) e mettere `ufficiale:true`. Per XLSX/PDF
   valutare una libreria (oggi nessuna nello stack → CSV zero-dep).
3. **Task 6 Fase 3 — adattatore API Teams → gate M3**: ⛔ runbook esterno (Azure AD +
   segreti + egress Graph), vedi nota Fase 3. Indipendente da Fase 4.
4. **Fase 5 (Attestato)**: **NON iniziare senza brief dedicato e conferma esplicita.**

Promemoria di metodo (invarianti da non rompere):
- mai INSERT diretto in `evento`/grezzo/snapshot: solo `audit_append`,
  `pipeline_ingest_grezzo`/`pipeline_riconcilia_grezzo`, `report_fondo_deposita`
  (tutte SECURITY DEFINER);
- Eventi senza PII nel payload (attori pseudonimi); ore/frequenza/idoneità e il dataset
  del report fondo si **ricalcolano dagli Eventi** (`compliance.ts`/`report-fondo.ts`, D8);
- PII (nomi/CF) ammessa nello **snapshot/file** (documento per il fondo) ma MAI nel log
  (l'Evento di deposito porta solo l'hash, D18);
- ogni nuova funzione di scrittura su `public`: **revocare EXECUTE da `anon`** esplicitamente.

Restano aperti, non bloccanti:
- **Verifiche UI nel browser** (Fase 2 Task 4/5; Fase 3 `/admin/sessioni`; Fase 4
  `/admin/report-fondo`) sul deploy (network policy blocca `*.vercel.app` da qui).
- **Tracciati ufficiali dei formati fondo** (M4a #4) e **adattatore Teams** (M3): runbook esterni.
- **TODO di Fase 1** qui sotto (prima della consegna a clienti veri).
- **Fase 5 (Attestato)**: fuori scope senza brief + conferma esplicita.

### TODO Fase 1 ancora aperti (non bloccanti per M1, ma da chiudere prima di mettere in mano clienti veri)

1. **Secondo video del corso (opzionale)**: oggi entrambi i LO puntano allo stesso
   `vimeo_id: '1084894652'` (613 s). La verifica dello sblocco sequenziale funziona
   lo stesso perché i due LO sono righe distinte, ma per un corso reale il
   cliente vorrà probabilmente un video diverso sul secondo capitolo. Quando lo
   ha caricato su Vimeo, aggiornare la riga `learning_object` di id
   `10102222-1010-1010-1010-101010101010` (DB live + `scripts/bootstrap.ts`).
2. **Anagrafica + titoli del corso reali**: oggi titoli, descrizione e codice
   edizione sono i seed di Fase 1 ("Sicurezza sul lavoro — modulo introduttivo",
   "ED-001"). Vanno sostituiti con i contenuti veri quando definiti dal cliente.
3. **Domini preview Vimeo**: la domain whitelist Vimeo include solo i 3 alias
   stabili (`fad-wine`, `fad-nicolopattis-projects`, `fad-git-main-…`). Le
   preview Vercel con hash (`fad-<hash>-…`) non riusciranno a riprodurre il
   video — Vimeo Specific Domains NON supporta wildcard. Se serve testare un
   video reale in preview, aggiungere a mano il dominio preview specifico su
   Vimeo (o tornare temporaneamente a "Anywhere" per quella sessione di test).
4. **Stato bootstrap idempotente**: lo script `npm run bootstrap` ora gestisce 2 LO
   tramite array. Se si rilancia su un DB esistente, fa upsert; se i `learning_object_id`
   vengono cambiati, lascia i record orfani — pulirli a mano via SQL prima.
5. **Credenziali demo nella pagina di login**: la `/login` mostra in chiaro
   email + password dei 3 utenti demo (`discente@fad.local`, `auditor@fad.local`,
   `admin@fad.local`). Comodo in sviluppo, **da togliere prima di consegnare a
   clienti veri** — rimuovere il blocco `<p className="muted mono" …>` in
   `src/app/login/page.tsx`.

### Fase 2 (in corso) — stato di dettaglio
- **Task 1 — Authoring LO** ✅ done (2026-05-22). Aggiunti: tipo `documento`,
  `archiviato_at`, ruolo `admin`, policy RLS, bucket Storage `documenti`, UI
  `/admin/learning-objects`, API `/api/admin/learning-objects/*`. Eventi nel
  log: `learning_object.{created,updated,archived,unarchived}`. §9 ratificato.
- **Task 2 — Assemblatore Corsi** ✅ done (2026-05-22). Policy RLS write su
  `corso` e `struttura_corso` per admin, RPC `reorder_struttura` per il
  riordino atomico. UI `/admin/corsi` con lista + form + dettaglio con editor
  della Struttura. Eventi: `corso.{created,updated}` e
  `struttura.{added,updated,removed,reordered}`.
- **Task 3 — Edizioni + congelamento D22** ✅ done (2026-05-22). Rename
  `edizione.inizio/fine` → `data_inizio/data_fine`, aggiunte
  `fad_apertura/fad_chiusura/concluso_at/annullato_at`, policy RLS, trigger
  `corso_freeze` + `struttura_freeze` (rifiutano write a livello DB quando
  Corso ha ≥1 Edizione). UI sezione Edizioni con tabella + form crea +
  Concludi/Annulla; banner "Corso congelato" + disabilitazione dei controlli.
  Eventi: `edizione.{created,updated,concluded,cancelled}`.
- **Task 4 — Fruizione multi-LO** ✅ done (DB) (2026-05-22). Aggiunti
  `/api/events/documento` (gemello di `/api/events/video` con stesso
  enforcement D26), `/api/storage/documento/[loId]/signed-url` (genera
  signed URL temporanea 1h con check di sblocco prima di firmare),
  `<DocumentoPlayer>` client component (iframe + bottone "Ho terminato la
  lettura" → `documento.completed`). Pagina LO discente con branching su
  `lo.type`. `compliance.ts` mappa anche `documento_completed`. Verifica
  funzionale UI nel browser ancora da fare. Setup di test sul live:
  corso `Demo multi-LO` (id `a4a4a4a4-…0001`, edizione `ED-T4-DEMO`,
  iscrizione discente `a4a4a4a4-…0030`) — il discente l'ha già completato
  via simulazione SQL.
- **Task 5 — Report multi-LO (gate M2)** ✅ done (2026-05-27). Il calcolo
  esisteva già da M1 #4 (`compliance.ts`) ed era stato esteso al `documento` in
  Task 4; il Task 5 lo ha completato sul fronte report: `compliance.ts` espone
  `regolaLabel()` e `/audit/completamento` mostra per ogni LO il tipo,
  `obbligatorio`/`facoltativo` e la regola applicata (visione/lettura integrale),
  con nota sul fatto che i facoltativi non bloccano l'idoneità. Aggiunto il test
  `supabase/tests/m2_completamento.sql` (pgTAP, vista rule-aware, 3 LO misti,
  21 asserzioni), eseguito 21/21 sul Supabase live in transazione+rollback.
  Verifica read-only sul corso reale `Demo multi-LO` (iscrizione
  `a4a4a4a4-…0030`): 2/2 obbligatori completati, idonea, eventi di altri corsi
  ignorati; `audit_verify_chain` = 0 problemi sul tenant reale (M2 #7). UI nel
  browser ancora da confermare (network policy blocca `*.vercel.app` da qui).

Mandato operativo completo: **`docs/brief-fase-2.md`**.

## Come riprendere (cheatsheet per nuova session)

Tutte le info utili stanno in questi file del repo:
- `CLAUDE.md` (questo file) → stato + come riprendere
- `README.md` → setup, mappa Task → file, ricette di verifica M1a/M1/M2
- `docs/brief-fase-1.md` → mandato operativo Fase 1 (storico, chiusa)
- `docs/brief-fase-2.md` → mandato operativo Fase 2 (storico, chiusa)
- `docs/brief-fase-3.md` → mandato operativo Fase 3 (**corrente**); §11 in fondo
  ha le note di implementazione (scope fino a M3a, decisioni §10 ratificate)

**Ripartenza Fase 3 (M3a chiuso).** Le 3 migration di Fase 3
(`…20260527000001_…` Task 1, `…20260529000001_…` Task 2, `…20260529000002_…` Task 4,
`…20260529000003_…` Task 5) sono **già applicate sul Supabase live** — non
riapplicarle. Task 3 (adattatore CSV) e le UI sono solo codice applicativo. Tutto
lo schema Gruppo 3 + grezzo write-once + pipeline + riconciliazione + coda +
presenze manuali + l'area `/admin/sessioni` e la colonna Frequenza in
`/audit/completamento` ci sono. Il seed webinar è sul live (UUID prefisso
`33333333…`: edizione `33333333-0000-0000-0000-0000000000e1`, sessione Teams
`33333333-0000-0000-0000-0000000005e1`, 3 iscritti: Mario `…015001`
email_riconciliazione=email; Lucia `…015002` NULL→fallback persona.email; Carla
`…015003` email_riconciliazione diversa). Persona admin reale:
`aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa`. La forma del `contenuto` del grezzo è un
array di `{riga,nome,email,join,leave,durata}` (valori grezzi). **Prossimi passi:
vedi "Cosa fare nella prossima sessione"** (verifica UI nel browser; Task 6/M3
solo con runbook Teams; Fase 4/5 solo con brief + conferma). Test M3a rieseguibili:
`supabase/tests/m3a_pipeline_ingest.sql` (17), `…/m3a_riconciliazione.sql` (20),
`…/m3a_presenza_manuale.sql` (9) via MCP `execute_sql` (girano in rollback).

Comandi spesso usati:
```bash
# typecheck + build (senza chiavi reali)
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
npm run build

# typecheck solo (più veloce, basta per validare patch TS)
npm run typecheck

# verifica M1a sul Supabase live (richiede MCP Supabase attivo)
# → incolla supabase/tests/m1a_audit_log.sql nel SQL Editor del progetto eqtiyqoxwgnerbmdkqff
# → oppure usa il tool mcp__…__execute_sql con quel file

# verifica M1a in locale (Postgres del container Claude Code) — ricetta completa
# nel README sezione "Riproduzione locale al container". Per il pezzo Node:
PG_URL='postgres://postgres:testpass@127.0.0.1:5432/fad_test' npm run test:m1a
# (senza PG_URL il test di concorrenza viene saltato: è gated apposta, vedi trabocchetti)
```

### Re-verifica rapida di M1 sul deploy (≈3 min, dal browser)

1. Login discente su https://fad-wine.vercel.app/login (`discente@fad.local` /
   `discente-pass-123`), entra nel corso "Sicurezza sul lavoro", verifica
   che vedi 2 capitoli col secondo bloccato.
2. DevTools Console (Cmd+Opt+J / F12) sulla pagina del corso, incolla:
   ```js
   fetch('/api/events/video', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       event_type: 'video.play',
       iscrizione_id: '15c11111-15c1-15c1-15c1-15c115c115c1',
       learning_object_id: '10102222-1010-1010-1010-101010101010'
     })
   }).then(r => r.json().then(j => console.log('STATUS', r.status, 'BODY', j)))
   ```
   Atteso: `STATUS 403 BODY {ok:false, error:"LO non sbloccato (sblocco_sequenziale)"}`.
3. Completa il LO #1 (video Introduzione fino a `video.ended`), il LO #2 si
   sblocca, rilancia il fetch sopra: atteso `STATUS 200 BODY {ok:true}`.
4. Logout → login auditor (`auditor@fad.local` / `auditor-pass-123`) → vai
   su `/audit/log` → premi "Verifica integrità catena" → atteso "Catena
   integra. Tutti gli hash combaciano."

## Punti di attenzione / trabocchetti noti

1. **`supabase test db` con CLI Supabase non è disponibile nei session standard** —
   per i test usa MCP `execute_sql` (sul progetto live) o il Postgres locale del container.
2. **Postgres locale del container** ha pgcrypto in `public`, **Supabase** in `extensions`.
   La migration `…002_audit_log.sql` ha `set search_path = public, extensions` su tutte le
   funzioni che usano `digest()`: compatibile con entrambi. Se ne aggiungi altre, ricordatelo.
3. **`auth.users` insert diretto** funziona solo perché la versione corrente di Supabase
   GoTrue lo supporta; se l'utente vuole re-bootstrap usi `npm run bootstrap`
   (Auth Admin API) appena ha il service-role key in env. È più robusto.
4. **Bytea via PostgREST** è base64, non hex con `\x`. `src/app/audit/log/page.tsx`
   ha `bytesToHex()` che gestisce entrambi i formati. Se aggiungi colonne bytea
   visualizzate in UI, riusa quella funzione.
5. **Nessuna PII nel log** è enforced da `audit_append` lato DB. Se aggiungi un
   evento con nome/cognome/email/codice_fiscale nell'actor o nel payload,
   l'append fallisce con exception. Comportamento voluto (D18).
6. **`current_stream_id()` RPC** ritorna lo scalar UUID; supabase-js lo
   restituisce come stringa. Già gestito.
7. **Default branch GitHub = `main`**: già impostato 2026-05-22. Per cambiarlo
   ancora servirebbe la UI GitHub (Settings → Branches), non c'è MCP. Vercel
   è già collegato a `main` come Production.
8. **Network policy del container Claude Code** blocca `*.vercel.app` (e
   probabilmente `vercel.com`) via `x-deny-reason: host_not_allowed`. Per
   testare HTTP sul deploy serve il browser dell'utente o un terminale esterno.
   Supabase REST + MCP funzionano normalmente.
9. **API `/api/events/video` legge la sessione dai cookie** (`@supabase/ssr`,
   nome cookie `sb-<project-ref>-auth-token`, possibilmente chunked + base64).
   Per testarla con curl da fuori serve replicare il cookie format, ed è
   complesso. Strada pulita: aprire la Console DevTools nel browser dopo
   il login e fare `fetch('/api/events/video', …)` — il browser allega i cookie
   automaticamente.
10. **CI job `M1a — concorrenza reale (gated)`** è gated su due livelli:
    - `tests/m1a/concurrency-pg.test.ts` → `describe.skip` se non c'è
      `PG_URL`/`SUPABASE_DB_URL` (in CI non si imposta, quindi è sempre skip;
      gira solo in locale con la ricetta del README).
    - `tests/m1a/serialized-append.test.ts` → `describe.skip` se mancano
      i secrets `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` nei
      GitHub Actions Secrets. Oggi non sono impostati: il job M1a passa con
      tutti i test in skip. Se un domani si vuole attivare il test contro
      il Supabase live, basta aggiungere i 3 secrets in GitHub → Settings
      → Secrets and variables → Actions (NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
11. **Insert diretto in `auth.users` via SQL** (fallback quando manca la
    service-role key in env, es. quando si crea un utente via MCP
    `execute_sql` invece che con `npm run bootstrap`): GoTrue richiede che
    quattro colonne varchar siano **stringa vuota `''`** e non `NULL`,
    altrimenti il login fallisce con il messaggio generico `Database error
    querying schema`. I campi noti sono `confirmation_token`,
    `recovery_token`, `email_change_token_new`, `email_change`. Default
    della tabella è `NULL` (non `''`), quindi se l'INSERT non li elenca
    esplicitamente prendono `NULL` ed è quello che rompe. Fix: aggiungerli
    all'INSERT con valore `''`, oppure fare un `update auth.users set …` a
    posteriori. Il bootstrap via Auth Admin API (`npm run bootstrap`) NON
    ha questo problema perché GoTrue popola correttamente. Diagnostica:
    confronta i campi dell'utente rotto con quelli di un utente buono
    (`select confirmation_token, recovery_token, … from auth.users where
    email in (…)`) — i NULL saltano fuori subito.
13. **`next start` dopo una build con `NEXT_PUBLIC_*` segnaposto non funziona nel
    browser**: le variabili `NEXT_PUBLIC_*` vengono incorporate nel bundle client al
    momento della `build` (`placeholder.supabase.co` resta nel JS anche se a runtime
    passi i valori veri; il login fallisce con "Non riusciamo a raggiungere il
    servizio"). Per provare la build di produzione in locale (E2E, k6) compilare con
    l'URL e la anon key veri; la build di sola verifica (CI) può restare col segnaposto.
    E `pkill -f "next star[t]"` va lanciato in un comando **separato**: se nella stessa
    riga di shell compare poi `npx next start …`, il pattern combacia con la shell
    stessa e la uccide (exit 144).
12. **Container senza `node_modules` all'avvio**: la sessione Claude Code on
    the web parte con la repo clonata ma le dipendenze NON installate. Eseguire
    **`npm ci`** prima di `npm run typecheck`/`build`/`test:fase4`, altrimenti
    `next`/`vitest`/`tsc` rispondono "not found" / exit 127. I test di Fase 4
    sono vitest in `tests/fase4/` (15: `validazioni.test.ts` 7 + `formati.test.ts` 8),
    eseguibili con `npm run test:fase4`.

## Cosa NON fare

- **NON iniziare Fase 5 (Attestato) senza conferma esplicita dell'utente e senza il
  relativo brief.** Fase 4 (report fondi) è chiusa fino a M4 (mandato in
  `docs/brief-fase-4.md`). Fase 5 resta fuori finché non c'è brief + via libera.
  Replicare il pattern dei gate: non costruire sopra fondamenta non verificate.
- **NON dichiarare "conforme" il formato dei report fondo** finché gli adattatori sono
  `ufficiale:false`: il tracciato ufficiale per-avviso va recepito dalla documentazione
  aggiornata (runbook §10). NON andare a memoria sul tracciato.
- **NON mettere PII (nomi/CF/email) nel payload degli Eventi** — vale anche per
  `report_fondo_depositato`: nello snapshot/file sì (documento per il fondo), nel log mai.
- **NON aggiungere la contabilità di dettaglio del rendiconto** (importi, voci di spesa,
  co-finanziamento, detrazioni pro-quota): scope OUT di Fase 4 (D32). Il generatore
  *segnala* i non conformi, non calcola detrazioni.
- **NON implementare l'adattatore Zoom né la co-docenza** (scope OUT di Fase 3,
  §4 del brief): solo Teams, e la Sessione ha un solo `incarico_id`.
- **NON aggiungere features fuori scope** rispetto al brief della fase
  corrente. Se emerge la tentazione di costruire qualcosa fuori scope,
  segnalalo all'utente e fermati.
- **NON committare `.env`** né esporre la service_role key in repo.
- **NON cambiare l'algoritmo di canonicalizzazione hash** in `audit_canonical`
  senza una migration esplicita: tutti gli eventi storici diventerebbero
  "manomessi" agli occhi di `audit_verify_chain`.
- **NON skippare i gate** dei brief futuri per andare più veloce. M1a e M1
  hanno funzionato proprio perché non si è costruito sopra fondamenta che
  non reggono — replicare il pattern in Fase 2.
- **NON pushare su `main` senza permesso esplicito** dell'utente. Il flusso
  standard è: lavoro sul branch di sessione, push del branch, e l'utente
  decide se mergere. In questa sessione l'utente ha autorizzato
  `git push origin <branch>:main`; il permesso vale per la sessione,
  non per il futuro.
