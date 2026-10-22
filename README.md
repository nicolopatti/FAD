# FAD — Fase 1 (fetta verticale)

Mandato operativo: [`docs/brief-fase-1.md`](docs/brief-fase-1.md).
Decisioni di riferimento: `piattaforma-elearning-stato-progetto-v8.md` (D1–D37).

> **Cosa contiene questa fase.** Substrato dati con `tenant_id` + RLS attiva,
> log eventi append-only con catena hash (gate **M1a**), autenticazione, player
> Vimeo tracciato, due report di audit (gate **M1**).
>
> Tutto il resto (assemblatore corsi, quiz, attestati, webinar, report fondi…)
> resta **fuori** dalla Fase 1.

## Area admin (ondate A–C, 2026-10-21): il corso è l'unità di lavoro

Menu a sei voci: **Dashboard** (edizioni in corso con prontezza, sessioni della
settimana, code di riconciliazione aperte), **Corsi** (catalogo a lista filtrato e
paginato sul server — `?q=&stato=&categoria=&ordine=&pagina=` — con stati Bozza/Attivo/
Concluso/Archiviato, archiviazione anche in blocco, + scheda "Libreria dei contenuti"),
**Persone** (anagrafica con ricerca e paginazione sul server, scheda persona, invito in
blocco; scheda **Aziende** con partita IVA unica e unione dei doppioni), **Agenda** (tutte
le sessioni, sola lettura), **Rendicontazione** (report fondi + attestati), **Impostazioni**
(ente e modello attestato; **Categorie dei corsi**). Le liste leggono le viste
`corso_riepilogo`, `edizione_riepilogo`, `persona_riepilogo`, `azienda_riepilogo`
(`security_invoker`: valgono le RLS). Tra gli iscritti di un'edizione: selezione e azioni in
blocco (invita, assegna piano, emetti attestati agli idonei, rimuovi).
Pagina del corso a schede con un indirizzo per scheda: `/admin/corsi/<id>` (Panoramica),
`/lezioni`, `/edizioni`, `/attestato`, `/impostazioni`. **Pagina dell'edizione**
`/admin/corsi/<id>/edizioni/<edId>` con schede Iscritti (indice), `/sessioni`
(+ `/sessioni/<sid>` per import presenze, coda, correzioni), `/docenti` (incarichi),
`/fondo` (piano per tutta l'edizione), `/stato` (avanzamento ricalcolato dal registro,
codice e date, concludi/annulla). Gli indirizzi vecchi (`/admin/sessioni`,
`/admin/report-fondo`, `/admin/attestati`, `/admin/ente`) reindirizzano; `/admin/sessioni/<id>`
reindirizza alla sessione sotto la sua edizione.

## Vendita dei corsi (Fase 6): come si accende

Mandato: [`docs/brief-fase-6-vendita.md`](docs/brief-fase-6-vendita.md). Il catalogo
pubblico (`/catalogo`) mostra le offerte pubblicate dell'ente a cui appartiene
l'indirizzo della richiesta (tabella `tenant_dominio`, jolly `*` ammesso). Si mette in
vendita un'edizione dalla scheda **Vendita** della sua pagina; ordini, rimborsi ed export
per il gestionale stanno in **Vendite**.

1. **Indirizzo → ente**: una riga in `tenant_dominio` per ogni dominio dell'ente (per il
   demo: `supabase/seed/fase6_vendita_demo.sql`). Senza, il catalogo risponde "nessun ente".
2. **Stripe** (prima in modalità test): su Vercel `STRIPE_SECRET_KEY` e
   `STRIPE_WEBHOOK_SECRET` (mai in repo né in chat); in Stripe → Developers → Webhooks un
   endpoint `https://<indirizzo>/api/stripe/webhook` con `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`. Senza chiavi l'acquisto risponde 503.
3. **SMTP** in Supabase Auth: la registrazione manda un'email di conferma (il mittente di
   prova di Supabase ne manda pochissime l'ora). Nei Redirect URLs di Supabase Auth deve
   esserci l'indirizzo del sito (`/auth/callback`). **"Confirm email" deve restare
   attivo**: la registrazione collega l'account a una Persona già in anagrafica con la
   stessa email (es. iscritta dall'admin) solo perché l'email è confermata; senza la
   conferma chiunque potrebbe prendersi la scheda di un altro scrivendo la sua email.
4. **Testi legali**: `/termini` e `/privacy` sono segnaposto da sostituire con i testi
   dell'ente; le versioni accettate stanno in `src/lib/vendita.ts` (`VERSIONE_TERMINI`,
   `VERSIONE_RECESSO`) e si salvano nell'ordine.
5. Prova con la carta `4242 4242 4242 4242` su un'anteprima, poi rimborso da **Vendite**.
   Le chiavi live vanno solo su Production, dopo Supabase Pro e la decisione sull'IVA.

## Modalità di lavoro — tutto in cloud (ratificata)

Niente ambiente locale. Niente file `.env.local`.

- **Codice** → GitHub (`nicolopatti/FAD`, branch di sviluppo `claude/fetta-fad-fase-1-aJZsU`)
- **Hosting** → Vercel collegato al repo (preview a ogni PR, prod su `main`)
- **DB + Auth** → progetto Supabase (managed)
- **Sviluppo interattivo** → Claude Code on the web (session ephemera, clone fresco a ogni avvio)

Le credenziali (chiavi Supabase, Vimeo) vivono solo nei pannelli dei provider
e nei secrets dell'ambiente Claude Code. `.env.example` resta come documentazione
del set richiesto.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres 15) — Auth, RLS
- Vimeo (hosting video con domain restriction)

## Setup dell'ambiente cloud (una tantum)

1. **Crea il progetto Supabase**
   - Dashboard Supabase → New project (regione UE)
   - Annota `Project URL`, `anon key`, `service_role key` (Project Settings → API)

2. **Applica le migration**
   - Opzione A — `supabase` CLI da una session Claude Code:
     ```bash
     supabase link --project-ref <ref>
     npm run db:push          # applica supabase/migrations/*
     ```
   - Opzione B — SQL Editor: incolla nell'ordine i tre file:
     1. `supabase/migrations/20260521000001_schema.sql`
     2. `supabase/migrations/20260521000002_audit_log.sql`
     3. `supabase/migrations/20260521000003_tenant_stream_bootstrap.sql`

3. **Bootstrap dati demo** (utenti + corso FAD del Task 4)
   ```bash
   # Da una session Claude Code on the web con gli env impostati
   npm ci   # il container Claude Code on the web parte SENZA node_modules
   npm run bootstrap
   ```
   Lo script `scripts/bootstrap.ts` è **idempotente** (upsert): crea/aggiorna i
   due utenti Auth (`discente@fad.local`, `auditor@fad.local`), mappa le
   Persone e popola Corso + LO video + Struttura + Edizione + Iscrizione.

4. **Collega Vercel al repo**
   - Vercel → Import GitHub repo → seleziona `nicolopatti/FAD`
   - Environment Variables (Production + Preview):
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
     - `NEXT_PUBLIC_APP_URL` (URL pubblico, per QR e LinkedIn degli attestati)
     - nessun tenant da env: l'app lo deriva dalla persona autenticata
   - Aggiungi l'URL di Vercel all'allowlist di Supabase Auth (`Site URL` +
     `Redirect URLs`).
   - Configura il **domain restriction su Vimeo** (Settings → Privacy del video)
     aggiungendo il dominio Vercel di produzione e quelli di preview.

5. **Deploy** — push su `main` → Vercel deploya automaticamente.

6. **Nuovo ente (tenant)** — ogni ente nasce con la RPC `tenant_crea` (solo
   service role) tramite lo script, da un ambiente che ha
   `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`:
   ```bash
   npm run nuovo-ente -- --nome "Ente Alfa" --ragione-sociale "Ente Alfa S.r.l." \
     --citta Bergamo --admin-email admin@entealfa.it --admin-nome Giulia --admin-cognome Neri
   ```
   Crea l'utente Auth dell'admin (ruolo `admin`), poi in una transazione tenant,
   stream del registro, Persona e gli Eventi `tenant.created`/`persona.created`.
   La password, se non passata con `--admin-password`, è generata e stampata una
   volta. Logo, firma e modello dell'attestato si completano da `/admin/impostazioni`.

Utenze demo create da `npm run bootstrap`:
- Discente — `discente@fad.local` / `discente-pass-123`
- Auditor — `auditor@fad.local` / `auditor-pass-123`

## Mappa Task → file

| Task | Contenuto | File principali |
|---|---|---|
| 1 — Substrato + RLS | tabelle base, RLS, helper `current_tenant_id()` | `supabase/migrations/20260521000001_schema.sql` |
| 2 — Log append-only (M1a) | `stream_audit`, `evento`, `audit_append`, `audit_verify_chain`, trigger immutabilità | `supabase/migrations/20260521000002_audit_log.sql` |
| 3 — Auth + login | login/logout, mapping `auth_user_id` ↔ Persona, eventi `auth.login`/`auth.logout` | `src/app/login/page.tsx`, `src/app/api/auth/*` |
| 4 — Seed corso FAD | Corso + LO video + Struttura + Edizione + Iscrizione (via bootstrap script) | `scripts/bootstrap.ts`; pagine `src/app/corsi/*` |
| 5 — Player video Vimeo tracciato | embed Vimeo, eventi server-side, sblocco sequenziale (D26) | `src/components/VimeoPlayer.tsx`, `src/app/api/events/video/route.ts`, `src/lib/compliance.ts` |
| 6 — Report audit (M1) | due report distinti (D35), verifica catena | `src/app/audit/log/page.tsx`, `src/app/audit/completamento/page.tsx`, `src/app/api/audit/verify/route.ts` |

### Fase 2 — assemblatore e fruizione multi-LO

| Task (F2) | Contenuto | File principali |
|---|---|---|
| 1 — Authoring LO (+ `documento`) | CRUD LO video/documento, ruolo admin, bucket Storage `documenti` + policy per-tenant | `supabase/migrations/20260522000001_fase2_lo_type_documento.sql`, `…000002_fase2_lo_admin_storage.sql`, `src/app/admin/learning-objects/*` |
| 2 — Assemblatore Corsi | CRUD `corso` + composizione Struttura, RPC `reorder_struttura` | `supabase/migrations/20260522000003_fase2_corso_struttura_admin.sql`, `src/app/admin/corsi/*` |
| 3 — Edizioni + congelamento D22 | Edizioni, trigger `corso_freeze`/`struttura_freeze` (rifiuto write lato DB) | `supabase/migrations/20260522000004_fase2_edizioni_congelamento.sql` |
| 4 — Fruizione multi-LO | player documento, eventi server-side, sblocco D26 esteso al `documento` | `src/app/api/events/documento/route.ts`, `src/app/api/storage/documento/[loId]/signed-url/route.ts`, `src/components/DocumentoPlayer.tsx` |
| 5 — Report completamento multi-LO (M2) | report *rule-aware*, distinzione obbligatori/facoltativi, idoneità derivata | `src/lib/compliance.ts`, `src/app/audit/completamento/page.tsx`, `supabase/tests/m2_completamento.sql` |

### Fase 3 — fetta webinar (pipeline presenze)

Mandato: `docs/brief-fase-3.md`. **Task 1–5 ✅, gate M3a ✅ VERDE**: la fetta
webinar gira end-to-end via CSV sul Supabase live. Task 6/M3 (adattatore API
Teams) rinviati al setup Azure/segreti (runbook esterno).

| Task (F3) | Contenuto | File principali / stato |
|---|---|---|
| 1 — Schema Gruppo 3 + grezzo write-once | azienda/piano/incarico/sessione + `report_partecipazione_grezzo` (write-once, D20), estensioni iscrizione/corso, `grezzo_content_hash` | ✅ `supabase/migrations/20260527000001_fase3_gruppo3_grezzo.sql` (applicata sul live) + seed `supabase/seed/fase3_webinar_demo.sql` |
| 2 — Pipeline unica | `pipeline_ingest_grezzo()` SECURITY DEFINER: (a) scrive il grezzo write-once + (b) Evento `report_grezzo_importato` con `payload.hash` via `audit_append`, atomici; (c) riconciliazione = seam del Task 4 | ✅ `supabase/migrations/20260529000001_fase3_pipeline_ingest.sql` (applicata sul live) + test `supabase/tests/m3a_pipeline_ingest.sql` 17/17 |
| 3 — Adattatore CSV | parser CSV/TSV senza dipendenze + alias intestazioni Teams/Zoom (IT/EN) + mappatura colonne configurabile → array normalizzato → `pipeline_ingest_grezzo(fonte='csv')`; errore esplicito se manca una colonna chiave PRIMA del grezzo | ✅ `src/lib/csv.ts`, `src/lib/pipeline.ts`, `src/app/api/admin/sessioni/[id]/import-csv/route.ts`, UI sotto l'edizione del corso `src/app/admin/corsi/[id]/edizioni/[edizioneId]/…/sessioni/*` (lista + pianifica + dettaglio/import; vista trasversale in `/admin/agenda`) |
| 4 — Riconciliazione + coda ambigui (→ M3a) | `pipeline_riconcilia_grezzo` (match `email_riconciliazione` → fallback `persona.email`; ambiguo/assente → coda; anonimo → Evento) + RPC risolvi/ignora + `compliance.ts` frequenza/idoneità a soglia (#9) | ✅ `supabase/migrations/20260529000002_fase3_riconciliazione.sql`, `src/lib/compliance.ts`, UI `CodaResolver` + `/audit/completamento`; test `m3a_riconciliazione.sql` 20/20 |
| 5 — Inserimento/correzione manuale presenze | RPC `presenza_inserisci_manuale`/`presenza_correggi_manuale` (motivazione obbligatoria; correzione = nuovo Evento che referenzia il precedente, mai UPDATE) | ✅ `supabase/migrations/20260529000003_fase3_presenza_manuale.sql`, UI `PresenzeManager`; test `m3a_presenza_manuale.sql` 9/9 |
| 6 — Adattatore API Teams (→ M3) | ⛔ rinviato: setup Azure AD + segreti + egress Graph (runbook esterno) | ⛔ rinviato |

### Fase 4 — generatore di report fondi

Mandato: `docs/brief-fase-4.md`. **Task 1–6 ✅, gate M4a ✅ + M4 ✅** (a livello DB):
`(Edizione, Piano) → dataset neutro dal log → validazioni → file (interim) → snapshot
write-once + Evento/hash`. Adattatori Fondimpresa/FonCoop **interim** (`ufficiale:false`):
il tracciato ufficiale per-avviso resta un runbook esterno (§10).

| Task (F4) | Contenuto | File principali / stato |
|---|---|---|
| 1 — Schema snapshot + testata Piano | `report_fondo_depositato` write-once (REVOKE+trigger, D20) + `Piano` (cup/avviso/canale/date) + hash canonico | ✅ `supabase/migrations/20260529000004_fase4_report_fondo_schema.sql` (applicata) + seed `supabase/seed/fase4_fondo_demo.sql` |
| 2 — Motore aggregazione | `computeReportFondoDataset` (dataset neutro dagli Eventi, riusa `compliance.ts`) + `persona.codice_fiscale` + RLS admin completamenti | ✅ `src/lib/report-fondo.ts`, `…20260529000005_…` (applicata) |
| 3 — Validazioni conformità (D33) | warning bloccanti (CUP/CF mancanti) vs avvisi | ✅ `src/lib/report-fondo-validazioni.ts`, test `tests/fase4/validazioni.test.ts` 7/7 |
| 4 — Adattatore Fondimpresa (→ M4a) | export CSV interim + UI anteprima/genera | ✅ `src/lib/report-fondo-formati.ts`, `src/app/admin/rendicontazione/*`, route `.../genera` |
| 5 — Adattatore FonCoop/GIFCOOP | secondo adattatore sullo stesso motore | ✅ `src/lib/report-fondo-formati.ts`, test `tests/fase4/formati.test.ts` 8/8 |
| 6 — Deposito write-once (→ M4) | RPC `report_fondo_deposita`/`report_fondo_verifica`, UI `DepositaPanel`, route deposita/verifica/snapshot | ✅ `…20260529000006_…` + `…0007_…` (applicate), test `supabase/tests/m4_report_fondo.sql` 10/10 |

## Verifica gate M1a (alla fine del Task 2, prima di proseguire)

I sei criteri del brief sono verificati da due suite complementari.

### A — pgTAP (`supabase/tests/m1a_audit_log.sql`) — 20/20 ✅

Copre i criteri 1/3/4/5/6 + append serializzato in-transaction (criterio 2
parziale):
1. **Immutabilità fisica** — `UPDATE`/`DELETE`/`TRUNCATE` su `evento` falliscono
   (trigger); `anon`/`authenticated` non hanno UPDATE/DELETE/INSERT diretti
   (REVOKE); `audit_append` è eseguibile dagli `authenticated` (unica via).
2. **Append in serie** — 30 append consecutivi danno seq monotoni contigui (1..30).
3. **Catena verificabile** — `audit_verify_chain` ritorna 0 problemi su catena
   integra e rileva una manomissione simulata del payload del primo evento.
4. **Genesi** — `prev_hash` = `audit_genesis_hash(stream_id)`, non `NULL`;
   deterministica.
5. **No PII** — `audit_append` rifiuta `actor`/`payload` con
   `nome`/`email`/`codice_fiscale`.
6. **Timestamp server-side** — `occurred_at` viene assegnato dentro `audit_append`.

Gira il test in una qualunque delle tre modalità:
- **Supabase SQL Editor** → incolla il contenuto del file e premi Run
  (`begin; … rollback;` ⇒ non lascia tracce).
- **CLI Supabase linkata** → `supabase test db --file supabase/tests/m1a_audit_log.sql`.
- **Postgres locale al container** → ricetta nella sezione "Riproduzione locale".

### B — Concorrenza reale (criterio 2 completo) — 2/2 ✅

La pgTAP gira tutto in una sola transazione, quindi non può testare il lock di
riga tra connessioni distinte. Per quello c'è `tests/m1a/concurrency-pg.test.ts`,
che apre **50 connessioni Postgres parallele** e lancia `audit_append` in
contemporanea sullo stesso stream. Verifica:

- 50 righe inserite, una per call;
- `seq` 1..50 senza duplicati né buchi;
- `prev_hash[i] == hash[i-1]` per ogni i;
- `audit_verify_chain` ritorna 0 problemi.

In più, `tests/m1a/serialized-append.test.ts` fa la stessa verifica passando
per il client `@supabase/supabase-js` (HTTP/PostgREST) contro un progetto
Supabase reale — gated sui secrets, gira in CI sul branch principale.

### Riproduzione locale al container Claude Code on the web

Ricetta esatta usata per certificare i 20+2 OK qui sopra:

```bash
# 1) Postgres locale al container (già installato nelle session)
service postgresql start
sudo -u postgres psql -c "alter user postgres password 'testpass';"

# 2) DB di test + stub minimale dell'auth schema di Supabase
sudo -u postgres psql <<'EOF'
drop database if exists fad_test;
create database fad_test;
\c fad_test
create extension pgcrypto;
create extension pgtap;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
EOF

# 3) Applica le 3 migration nello stesso ordine in cui le applichi in cloud
sudo -u postgres psql -d fad_test -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260521000001_schema.sql \
  -f supabase/migrations/20260521000002_audit_log.sql \
  -f supabase/migrations/20260521000003_tenant_stream_bootstrap.sql

# 4) Lancia la suite pgTAP (20 ok / 20 totali)
sudo -u postgres psql -d fad_test -f supabase/tests/m1a_audit_log.sql | grep -E "^ ok |^not ok "

# 5) Lancia il test di concorrenza pg (50 connessioni parallele)
PG_URL='postgres://postgres:testpass@127.0.0.1:5432/fad_test' npm run test:m1a
```

### Stop & verify
Se anche **uno solo** dei criteri non passa, ci si ferma. È la ragione per cui
M1a è un gate separato.

## Verifica gate M1 (alla fine del Task 6)

### Suite SQL `supabase/tests/m1_slice_data.sql` — 10/10 ✅

Esercita a livello DB le proprietà-dato della slice (Tasks 4-5-6) senza
dipendere dal browser:
- LO1 sbloccato all'inizio, LO2 bloccato (D26 con `sblocco_sequenziale=true`).
- Dopo `video.ended` su LO1 → LO1 completato + LO2 si sblocca.
- Idoneità si attiva solo quando tutti gli LO obbligatori sono completati.
- **D8 esplicito**: si azzerano `cache_completata` / `cache_idonea` e il
  ricalcolo dagli Eventi resta corretto — la cache non è consultata.
- La catena hash dei video event resta integra.
- Sblocco è per-iscritto: un secondo iscritto vede ancora LO2 bloccato.

Lo eseguo con `supabase test db --file supabase/tests/m1_slice_data.sql` o
incollando nel SQL Editor.

### Verifica manuale (UI)

Tutto contro il deployment Vercel collegato al progetto Supabase.

1. **Slice end-to-end** — login (`discente@fad.local`) → `/corsi` → click corso
   → `/corsi/.../lo/...` → riproduzione del video → gli eventi
   `video.play/pause/seek/ended` appaiono nei due report di audit
   (login con `auditor@fad.local`).
2. **Log fisicamente immutabile** — i criteri di M1a continuano a passare:
   esegui di nuovo `supabase/tests/m1a_audit_log.sql` dopo aver prodotto eventi
   reali sul progetto Supabase.
3. **Sblocco sequenziale server-side** — con `corso.sblocco_sequenziale = true`,
   una chiamata diretta
   ```bash
   curl -X POST https://<app>.vercel.app/api/events/video \
     -H 'cookie: <sessione discente>' \
     -H 'content-type: application/json' \
     -d '{"event_type":"video.play","iscrizione_id":"<id>","learning_object_id":"<lo bloccato>","payload":{}}'
   ```
   risponde **HTTP 403** (`LO non sbloccato`).
4. **Completamento ricalcolato** — dal SQL Editor:
   ```sql
   update public.iscrizione
      set cache_completata = false,
          cache_idonea = false
    where id = '15c11111-15c1-15c1-15c1-15c115c115c1';
   ```
   ricarica `/audit/completamento`: il report mostra lo stato corretto perché
   lo deriva sempre dagli Eventi (D8).
5. **Isolamento tenant** — RLS attiva su tutte le tabelle di business.
   Verifica con un secondo tenant fittizio nel SQL Editor:
   ```sql
   insert into public.tenant (nome) values ('Tenant intruso') returning id; -- T2
   -- crea una persona finta nel tenant T2, prova a SELECT come authenticated
   -- impersonando il discente del tenant 1: non vede righe del tenant T2.
   ```
6. **Verifica della catena nell'area auditor** — pulsante "Verifica integrità
   catena" su `/audit/log` deve restituire "Catena integra" sui dati reali.

## Verifica gate M2 (alla fine del Task 5 di Fase 2)

### Suite SQL `supabase/tests/m2_completamento.sql` — 21/21 ✅

Estende `m1_slice_data.sql` al report di completamento su **corso multi-LO** con
tipi misti (video + documento) e LO obbligatori + facoltativi. La vista di test
è *rule-aware*: il completamento di ogni riga di Struttura dipende dalla sua
`regola_completamento` (`video_ended` → `video.ended`, `documento_completed` →
`documento.completed`), la stessa mappa `COMPLETION_EVENT_FOR_RULE` di
`src/lib/compliance.ts`. Copre i criteri M2 #5 e #7:
- ricalcolo dagli Eventi (D8): cache `iscrizione` azzerata, idoneità invariata;
- **regola rispettata per riga**: un `video.ended` sul LO `documento` NON lo
  completa — serve `documento.completed` (e viceversa);
- obbligatori vs facoltativi: l'idoneità dipende **solo** dagli obbligatori, il
  facoltativo conta nell'avanzamento ma non blocca;
- sblocco sequenziale D26 a cascata su 3 LO misti;
- catena hash integra dopo i nuovi tipi `documento.*`.

Lo eseguo con `supabase test db --file supabase/tests/m2_completamento.sql` o
incollando nel SQL Editor (`begin; … rollback;`, non lascia tracce). Certificato
sul Supabase live (`eqtiyqoxwgnerbmdkqff`, 2026-05-27): 21/21, più una verifica
read-only sul corso reale `Demo multi-LO` (idoneità derivata corretta, eventi
estranei di altri corsi correttamente ignorati) e `audit_verify_chain` = 0
problemi sul tenant reale.

### Report nell'area auditor

`/audit/completamento` (login `auditor@fad.local`) mostra, per ogni iscrizione:
avanzamento `completati/totale` + `obbligatori X/Y`, badge idoneità, e per ogni
LO il tipo, **obbligatorio/facoltativo**, la regola applicata (visione/lettura
integrale) e lo stato (ok / da fare / bloccato). Sempre ricalcolato dagli Eventi
a ogni apertura (D8); le colonne-cache sull'Iscrizione non vengono lette.

## CI / pipeline

Stack (dal 2026-10-21): **Next 16.4** (App Router, Turbopack, `typedRoutes`),
React 19, `@supabase/ssr` 0.12, ESLint 9 con config piatta (`eslint.config.mjs`).
Conseguenze pratiche: `params`/`searchParams`/`cookies()` sono Promise (sempre
`await`, anche su `createSupabaseServerClient()`); il middleware si chiama
`src/proxy.ts` (`export function proxy`); `next-env.d.ts` è generato e non
versionato; `npm run typecheck` lancia prima `next typegen` (tipi delle route);
`npm run lint` è `eslint .` (`next lint` non esiste più). Per usare webpack al
posto di Turbopack: `next build --webpack`.

`.github/workflows/ci.yml` esegue su ogni PR:
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit` (librerie pure: Vimeo, visione integrale, test finale,
  attestato e modello PDF) e `npm run test:fase4` (validazioni e formati del
  report fondo)
- `npm run build` (con env placeholder per evitare la dipendenza dalle chiavi
  reali in build).

I test M1a contro un vero progetto Supabase si attivano solo se i secrets
`SUPABASE_*` sono presenti nel repository (consigliato per il branch `main`).

### Test E2E (Playwright, sola lettura)

`npm run test:e2e` percorre le pagine dei tre ruoli (pubblico, discente,
auditor, admin) a 1440 e 390 px contro un'app in esecuzione: controlla risposta,
assenza di scorrimento orizzontale ed errori JS, e le API di sola lettura
(export CSV, verifica catena, anteprima PDF dell'attestato). **Non scrive nulla
sul DB.** Variabili: `E2E_BASE_URL` (default `http://localhost:3100`),
`E2E_<RUOLO>_EMAIL/PASSWORD` (default utenti demo), `PLAYWRIGHT_CHROMIUM`
(percorso di un Chromium già installato), `E2E_DEV=1` se l'app gira con `next
dev`. Nel container Claude Code on the web aggiungere `E2E_PROXY_SUPABASE=1` e
lanciare con `NODE_USE_ENV_PROXY=1` (Chromium non passa dal proxy). Richiede
`playwright` (devDependency) e un browser: in CI `npx playwright install
chromium` prima di lanciarlo, con un deploy di anteprima come `E2E_BASE_URL`.

`npm run test:e2e:funzionali` (stesse variabili) aggiunge i controlli più
specifici, sempre di sola lettura: auditor (ordine e date del log, riga espansa
con copia dell'hash, filtri famiglia/evento/data, export CSV filtrato, sigillo
della catena, totali e filtri del completamento, download CSV, tema scuro
persistente), admin (tipo "Test" nel nuovo contenuto, editor del test in sola
lettura a corso attivo, libreria per corso ed elenco, pagine di video/PDF/test,
API di ricerca GET e POST, pannello "Dalla libreria" e suggerimento CSV su un
corso in bozza), discente (corso di prova del test finale, test senza risposte
corrette nel markup, PDF e badge dell'attestato). I controlli legati ai corsi
di prova del tenant demo (`supabase/seed/corso_prova_quiz.sql`) vengono
segnati come saltati se la fixture manca.

### Test di carico (k6)

`tests/carico/player.js` simula N discenti che guardano un video e mandano gli
eventi del player (play, poi un avanzamento ogni `INTERVALLO` secondi). Scrive
eventi veri: va lanciato contro uno **staging** o un'anteprima, sul tenant di
carico creato da `supabase/seed/carico_tenant.sql` (300 utenti
`carico-001@fad.local`…, password `carico-pass-123`, stream del registro
separato). Serve [k6](https://k6.io) installato.

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
BASE_URL=https://<anteprima>.vercel.app VUS=300 DURATA=10m npm run test:carico
# MODO=rpc misura il solo DB (chiamata diretta alla RPC evento_player_registra)
```

Soglie: errori < 1 %, p95 < `P95_MS` (1500 ms). Supabase Auth limita i login per
IP (30 ogni 5 minuti): per 300 utenti alzare il limite in Auth → Rate limits o
usare `UTENTI` più basso. Dopo il test, sul DB, `pg_stat_statements` dà il tempo
medio della RPC (query in testa allo script).

### Smoke dopo il deploy e controllo giornaliero

`.github/workflows/smoke-deploy.yml` gira a ogni deploy Vercel riuscito
(anteprima e produzione, evento `deployment_status`), ogni mattina sulla
produzione e a richiesta: controlla le pagine pubbliche con `curl` e, se nei
Secrets del repo ci sono `E2E_DISCENTE_PASSWORD`, `E2E_AUDITOR_PASSWORD`,
`E2E_ADMIN_PASSWORD` (più le email, opzionali), esegue anche la suite E2E dei tre
ruoli contro quell'URL. Un fallimento arriva come email di GitHub Actions: è il
monitoraggio minimo senza servizi aggiuntivi. Le **anteprime** Vercel sono
protette: per provarle serve il secret `VERCEL_AUTOMATION_BYPASS_SECRET`
(Vercel → Settings → Deployment Protection → Protection Bypass for Automation);
senza, il workflow le salta con un avviso e controlla solo la produzione.

### Inviti, password dimenticata, cambio password

- Le Persone importate come iscritti nascono **senza utente**: dalla scheda Iscritti dell'edizione,
  sezione Iscritti, colonna **Accesso** → "Invita" (o "Invita tutti"). L'admin
  crea l'utente Supabase Auth e manda l'email con il link; il discente atterra su
  `/auth/reimposta`, sceglie la password e al primo accesso accetta l'informativa
  (Evento `informativa.accettata`). Eventi `persona.invitata` senza PII.
- `/password-dimenticata` → email di Supabase → `/auth/reimposta`. Cambio password
  dal profilo (`/profilo`), Evento `auth.password_aggiornata`.
- **Email**: senza SMTP proprio Supabase usa il suo mailer con limiti molto bassi
  (adatto solo ai test). Per l'uso reale: Supabase → Auth → SMTP Settings (es.
  Resend, Postmark, Brevo), poi Auth → Email Templates per testi in italiano. I link
  dei modelli predefiniti portano la sessione nel frammento `#…` e li gestisce la
  pagina nel browser; con modelli personalizzati si può usare
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` (o
  `invite`), gestito lato server da `/auth/callback`.

### Staging separato (runbook)

Oggi le anteprime Vercel usano il DB di produzione. Per uno staging serve un
secondo progetto Supabase: con il piano Free l'organizzazione può avere **due
progetti attivi** e sono già occupati (`acli-gestionale`, `fad-fase-1`), quindi
serve il piano Pro o la pausa di un progetto. Passi, una volta disponibile:
1. creare il progetto (stessa regione), applicare le migration in ordine
   (`supabase db push --linked` o `apply_migration` via MCP), `npm run bootstrap`
   con la service role del nuovo progetto;
2. su Vercel impostare per l'ambiente **Preview** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` del nuovo progetto
   e `NEXT_PUBLIC_APP_URL` dell'anteprima;
3. nel nuovo progetto Auth → URL Configuration: redirect `https://fad-*-nicolopattis-projects.vercel.app/**`;
4. i secrets `E2E_*` di GitHub puntano alle utenze demo dello staging: da lì in poi
   il workflow di smoke prova le anteprime su dati finti, mai sulla produzione.

## Architettura — i 5 invarianti

1. **Tenant-ready dal giorno 1 (D2).**
2. **Il log è la fonte di verità (D8).**
3. **Server unica fonte di verità sulla fruizione (D26).**
4. **Mai PII nel log (D18).**
5. **Append solo via funzione (D11/D19).**

## Cosa NON c'è qui (per scelta)

Niente assemblatore corsi, niente quiz, niente moduli/sezioni, niente documenti
o Storage, niente webinar/CSV, niente generatori fondi, niente attestati, niente
SCORM, niente multi-stream, niente branding multi-tenant. Tutto questo entra
nelle fasi 2–5 secondo il documento di stato del progetto.
