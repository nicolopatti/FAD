# Stato del progetto FAD — Fase 1 (handoff session-to-session)

> Questo file è il primo da leggere all'inizio di ogni nuova sessione.
> Riassume cosa è stato fatto, cosa resta, e come riprendere senza dover
> rispiegare nulla. Fonte autoritativa per *cosa* costruire: `docs/brief-fase-1.md`
> (mandato operativo) e — in caso di conflitto — `piattaforma-elearning-stato-progetto-v7.md`
> con le decisioni D1–D35.

## Stato di avanzamento (Fase 1)

**Fase 1 chiusa.** Tutti i task ✅, gate M1a e M1 ✅ verdi.

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Substrato dati + RLS | ✅ done — `supabase/migrations/20260521000001_schema.sql` |
| 2 | Log append-only (gate M1a) | ✅ done — `…002_audit_log.sql`, gate M1a **verde** |
| 3 | Auth + login | ✅ verificato sul deploy (login discente + auditor) |
| 4 | Seed corso FAD | ✅ done — eseguito sul progetto Supabase live, esteso a 2 LO |
| 5 | Player Vimeo tracciato | ✅ sblocco sequenziale enforced lato API + UI |
| 6 | I due report di audit (gate M1) | ✅ verificati su `/audit/log` (Log eventi + Completamento attività) |

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

## Infrastruttura cloud creata

### Repo GitHub
- `nicolopatti/FAD`
- **Default branch su GitHub: `main`** (impostato 2026-05-22; era il vecchio feature branch).
- Branch di sessione corrente: `claude/resume-previous-work-fOZWz`
- Vercel deploya `main` come Production; preview su ogni altro branch.

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
- Vimeo ID `76979871` è placeholder pubblico (Big Buck Bunny) usato per entrambi i LO. Va sostituito con i video reali del corso una volta caricati sull'account Vimeo del cliente — vedi TODO Vimeo sotto.

#### Utenze demo (create da bootstrap)
- Discente: `discente@fad.local` / `discente-pass-123`
- Auditor: `auditor@fad.local` / `auditor-pass-123` (app_metadata.role=auditor)

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
3. Tutto il resto del brief: D2, D8, D11, D18, D19, D23, D24, D26, D27, D35 implementati come specificato.

## Cosa fare nella prossima sessione

Fase 1 è chiusa. Prima di iniziare Fase 2, leggere `docs/brief-fase-1.md` e — se
esiste — il brief di Fase 2; in mancanza, partire dai TODO di Fase 1 ancora aperti
qui sotto.

### TODO Fase 1 ancora aperti (non bloccanti per M1, ma da chiudere prima di mettere in mano clienti veri)

1. **Vimeo — sostituzione placeholder + domain restriction (D5)**
   - Oggi i due LO usano `vimeo_id: '76979871'` (Big Buck Bunny pubblico).
   - Quando il cliente carica i video reali del corso sul proprio account Vimeo:
     - Aggiornare le righe `learning_object` con i nuovi `vimeo_id` e `durata_secondi`
       (sia su DB live sia in `scripts/bootstrap.ts`).
     - Su Vimeo: video → Settings → Privacy → "Where can this be embedded?" →
       **Specific domains** → aggiungere `fad-wine.vercel.app` e i domini preview/staging.
     - Vimeo Specific Domains NON supporta wildcard: serve una entry per ogni dominio.
2. **Stato bootstrap idempotente**: lo script `npm run bootstrap` ora gestisce 2 LO
   tramite array. Se si rilancia su un DB esistente, fa upsert; se i `learning_object_id`
   vengono cambiati, lascia i record orfani — pulirli a mano via SQL prima.

### Fase 2 (quando partirà)
Fase 2 = assemblatore corsi, LO documento, Supabase Storage. **Non iniziare nulla di
Fase 2 senza un brief operativo equivalente a `docs/brief-fase-1.md`.** Se il brief
manca, segnalarlo all'utente e fermarsi.

## Come riprendere (cheatsheet per nuova session)

Tutte le info utili stanno in 3 file in questo repo:
- `CLAUDE.md` (questo file) → stato
- `README.md` → setup, mappa Task → file, ricette di verifica M1a/M1
- `docs/brief-fase-1.md` → mandato operativo Fase 1

Comandi spesso usati:
```bash
# typecheck + build (senza chiavi reali)
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
npm run build

# verifica M1a sul Supabase live (richiede MCP Supabase attivo)
# → incolla supabase/tests/m1a_audit_log.sql nel SQL Editor del progetto eqtiyqoxwgnerbmdkqff
# → oppure usa il tool mcp__…__execute_sql con quel file

# verifica M1a in locale (Postgres del container Claude Code)
service postgresql start
# poi segui la ricetta esatta nel README sezione "Riproduzione locale al container"
```

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

## Cosa NON fare

- **NON iniziare Fase 2** prima che M1 sia certificato verde.
- **NON aggiungere features fuori scope** rispetto a `docs/brief-fase-1.md` §4.
  Se emerge la tentazione di costruire qualcosa fuori scope, segnalalo e fermati.
- **NON committare `.env`** né esporre la service_role key in repo.
- **NON cambiare l'algoritmo di canonicalizzazione hash** in `audit_canonical`
  senza una migration esplicita: tutti gli eventi storici diventerebbero
  "manomessi" agli occhi di `audit_verify_chain`.
- **NON skippare i gate** del brief per andare più veloce. M1a e M1 esistono
  proprio per evitare di costruire sopra fondamenta che non reggono.
