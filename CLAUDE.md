# Stato del progetto FAD — Fase 1 (handoff session-to-session)

> Questo file è il primo da leggere all'inizio di ogni nuova sessione.
> Riassume cosa è stato fatto, cosa resta, e come riprendere senza dover
> rispiegare nulla. Fonte autoritativa per *cosa* costruire: `docs/brief-fase-1.md`
> (mandato operativo) e — in caso di conflitto — `piattaforma-elearning-stato-progetto-v7.md`
> con le decisioni D1–D35.

## Stato di avanzamento (Fase 1)

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Substrato dati + RLS | ✅ done — `supabase/migrations/20260521000001_schema.sql` |
| 2 | Log append-only (gate M1a) | ✅ done — `…002_audit_log.sql`, gate M1a **verde** |
| 3 | Auth + login | ✅ codice in repo; verificato a livello DB |
| 4 | Seed corso FAD | ✅ done — eseguito sul progetto Supabase live |
| 5 | Player Vimeo tracciato | ✅ codice in repo; sblocco sequenziale enforced lato API + page |
| 6 | I due report di audit (gate M1) | ✅ codice in repo; M1 slice data **verde** |

## Stato dei gate

- **M1a** — *Il log regge.* ✅
  - pgTAP 20/20 sul Supabase live (`supabase/tests/m1a_audit_log.sql`)
  - pgTAP 20/20 in locale (Postgres del container Claude Code)
  - Concorrenza pg 50 connessioni parallele 2/2 in locale (`tests/m1a/concurrency-pg.test.ts`)
- **M1** — *La fetta gira end-to-end.* ⚠️ parziale
  - DB-level (M1 #4 ricalcolo completamento da Eventi, sblocco sequenziale, idoneità): **10/10** sul Supabase live (`supabase/tests/m1_slice_data.sql`)
  - Manca: M1 #1 (slice end-to-end via UI) e #6 (verifica catena nell'area auditor) — richiedono il deploy Vercel
  - Manca: M1 #5 (isolamento tenant via sessione utente) — verifica manuale sul deploy

## Infrastruttura cloud creata

### Repo GitHub
- `nicolopatti/FAD`
- Branch principale: `main` (allineato al feature branch)
- Branch di lavoro: `claude/fetta-fad-fase-1-aJZsU`
- Ultimo commit: `3d655a4` — fix search_path extensions (Supabase)

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
- 1 Corso + 1 LO video Vimeo + Struttura + 1 Edizione + 1 Iscrizione del discente

#### Utenze demo (create da bootstrap)
- Discente: `discente@fad.local` / `discente-pass-123`
- Auditor: `auditor@fad.local` / `auditor-pass-123` (app_metadata.role=auditor)

### Vercel
- Org `nicolopatti's projects` (`team_LDcXwgO7cQrFtkAhaISEhjYj`).
- **Nessun progetto FAD ancora.** L'unico esistente è `acli-gestionale` (non collegato).
- Il deploy è il prossimo passo: import GitHub interattivo dalla UI Vercel
  (non c'è MCP per farlo automaticamente; CLI Vercel + token non disponibili
  nell'ambiente Claude Code on the web).

## Decisioni ratificate

1. **Cloud-only workflow** — GitHub → Vercel → Supabase, Claude Code on the web.
   Niente `.env` locali, niente `supabase start`. Credenziali nei pannelli dei provider.
2. **Vimeo** come hosting video (D5 con domain restriction).
3. Tutto il resto del brief: D2, D8, D11, D18, D19, D23, D24, D26, D27, D35 implementati come specificato.

## Cosa fare nella prossima sessione

Priorità in ordine. Non saltare.

### 1) Vercel — import + deploy (manuale, ~5 min)
1. https://vercel.com/new → Import Git Repository → `nicolopatti/FAD`
2. Framework: Next.js 14 (auto-detect)
3. Production Branch: `main`
4. Environment Variables (Production + Preview):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://eqtiyqoxwgnerbmdkqff.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<vedi sopra o dashboard>
   SUPABASE_SERVICE_ROLE_KEY=<copia da Supabase dashboard>
   NEXT_PUBLIC_TENANT_ID=00000000-0000-0000-0000-000000000001
   ```
5. Deploy.
6. Dopo il deploy:
   - Supabase Auth → URL Configuration → aggiungi URL Vercel (prod + preview) a
     `Site URL` e `Redirect URLs`.
   - Vimeo video `76979871` → Settings → Privacy → Specific domains → aggiungi
     domini Vercel prod + preview (D5: domain restriction).

### 2) Verifica M1 sul deploy (≈10 min)
Procedura completa nel README, sezione "Verifica gate M1". I criteri rimasti:
- **#1 slice end-to-end**: login discente → /corsi → entra corso → video → eventi → login auditor → entrambi i report mostrano l'attività
- **#3 sblocco server-side**: curl diretto su `/api/events/video` con LO bloccato → HTTP 403
- **#5 isolamento tenant**: SQL Editor con un secondo tenant fittizio, verifica RLS via JWT
- **#6 verifica catena nell'area auditor**: pulsante "Verifica integrità catena" su `/audit/log` → "Catena integra"

Se uno qualunque fallisce: stop, diagnostica, fix prima di chiudere Fase 1.

### 3) Solo dopo M1 verde — passare a Fase 2
Fase 2 = assemblatore corsi, LO documento, Supabase Storage.
**Non iniziare nulla di Fase 2 finché M1 non è certificato come verde.**

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
7. **`Set default branch a main` su GitHub** è ancora da fare via UI (no MCP).
   Va impostato prima di collegare Vercel, altrimenti Vercel potrebbe scegliere
   il branch sbagliato come Production. Settings → Branches → Default branch.

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
