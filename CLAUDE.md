# Stato del progetto FAD — Fase 2 in corso (handoff session-to-session)

> Questo file è il primo da leggere all'inizio di ogni nuova sessione.
> Riassume cosa è stato fatto, cosa resta, e come riprendere senza dover
> rispiegare nulla. Fonte autoritativa per *cosa* costruire: `docs/brief-fase-1.md`
> (Fase 1, chiusa) e `docs/brief-fase-2.md` (Fase 2, in corso) — e in caso di
> conflitto `piattaforma-elearning-stato-progetto-v7.md` con le decisioni D1–D35.

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

**Task 1 chiuso.** Verifica funzionale 2026-05-22 sul deploy production: admin
loggato, creato LO `video` e LO `documento` (PDF caricato su bucket Storage
`documenti`), eventi `learning_object.created` visibili sul log dell'auditor,
verifica catena hash integra.

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Authoring LO (video + documento + admin + Storage) | ✅ done — `supabase/migrations/20260522000001_…sql` + `…000002_…_admin_storage.sql`, UI `/admin/learning-objects` |
| 2 | Assemblatore Corsi (CRUD `corso` + Struttura) | ⬜ da iniziare |
| 3 | Authoring Edizioni + congelamento D22 | ⬜ da iniziare |
| 4 | Fruizione discente multi-LO (player documento) | ⬜ da iniziare |
| 5 | Report completamento multi-LO (gate M2) | ⬜ da iniziare |

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
- **M2** — *Corsi reali end-to-end.* ⬜ aperto. Criteri in `docs/brief-fase-2.md` §8.
  - Verifica funzionale Task 1 (authoring LO) ✅ sul preview deploy 2026-05-22:
    admin crea LO `video` e LO `documento` (PDF su Storage), li archivia/ripristina,
    gli eventi `learning_object.*` compaiono nel log dell'auditor con catena
    integra. È *una* delle 7 condizioni di M2 (#1 parziale, manca il pezzo
    "compone la Struttura del Corso" che è del Task 2).

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

Fase 1 chiusa, Fase 2 in corso: **Task 1 ✅** (authoring LO), Task 2-5 aperti.
Il prossimo da affrontare è il **Task 2 — Assemblatore di Corsi**
(`docs/brief-fase-2.md` §5 Task 2): CRUD `corso` dalla UI, composizione della
Struttura del corso (aggiungere LO esistenti, riordinare, marcare obbligatorio
e regola di completamento), unicità `(corso_id, learning_object_id)`, sequenza
piatta (D25). Avviarlo solo dopo conferma esplicita dell'utente — il brief è
il mandato e va riletto per restare nello scope.

I TODO di Fase 1 ancora aperti restano qui sotto: non sono bloccanti, ma vanno
chiusi prima di consegnare a clienti veri.

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

### Fase 2 (in corso) — stato di dettaglio
- **Task 1 — Authoring LO** ✅ done (2026-05-22). Aggiunti: tipo `documento`,
  `archiviato_at`, ruolo `admin`, policy RLS, bucket Storage `documenti`, UI
  `/admin/learning-objects`, API `/api/admin/learning-objects/*`. Eventi nel
  log: `learning_object.{created,updated,archived,unarchived}`. §9 ratificato.
- **Task 2 — Assemblatore Corsi** ⬜ da iniziare. CRUD `corso` + composizione
  Struttura (`struttura_corso`) dalla UI. Sequenza piatta (D25), unicità
  `(corso_id, LO_id)`. Finché il Corso non ha Edizioni, struttura libera.
- **Task 3 — Edizioni + congelamento D22** ⬜ da iniziare. UI per `edizione`;
  la creazione della prima Edizione di un Corso **congela** lato DB i campi
  strutturali del Corso e la Struttura.
- **Task 4 — Fruizione multi-LO** ⬜ da iniziare. Visualizzatore PDF per
  `documento` con eventi server-side; sblocco sequenziale esercitato su corsi
  multi-LO reali.
- **Task 5 — Report multi-LO (gate M2)** ⬜ da iniziare.

Mandato operativo completo: **`docs/brief-fase-2.md`**.

## Come riprendere (cheatsheet per nuova session)

Tutte le info utili stanno in 4 file in questo repo:
- `CLAUDE.md` (questo file) → stato
- `README.md` → setup, mappa Task → file, ricette di verifica M1a/M1
- `docs/brief-fase-1.md` → mandato operativo Fase 1 (storico, chiusa)
- `docs/brief-fase-2.md` → mandato operativo Fase 2 (corrente)

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

## Cosa NON fare

- **NON iniziare il Task 2 di Fase 2 (assemblatore Corsi) senza conferma
  esplicita dell'utente.** Il brief `docs/brief-fase-2.md` §5 Task 2 fissa lo
  scope; costruire a istinto fuori da quel perimetro riapre lo scope creep che
  la Fase 1 ha chiuso con precisione. Stesso vincolo per i Task 3-5.
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
