# FAD — Fase 1 (fetta verticale)

Mandato operativo: [`docs/brief-fase-1.md`](docs/brief-fase-1.md).
Decisioni di riferimento: `piattaforma-elearning-stato-progetto-v7.md` (D1–D35).

> **Cosa contiene questa fase.** Substrato dati con `tenant_id` + RLS attiva,
> log eventi append-only con catena hash (gate **M1a**), autenticazione, player
> Vimeo tracciato, due report di audit (gate **M1**).
>
> Tutto il resto (assemblatore corsi, quiz, attestati, webinar, report fondi…)
> resta **fuori** dalla Fase 1.

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
   npm install
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
     - `NEXT_PUBLIC_TENANT_ID` (default `00000000-0000-0000-0000-000000000001`)
   - Aggiungi l'URL di Vercel all'allowlist di Supabase Auth (`Site URL` +
     `Redirect URLs`).
   - Configura il **domain restriction su Vimeo** (Settings → Privacy del video)
     aggiungendo il dominio Vercel di produzione e quelli di preview.

5. **Deploy** — push su `main` → Vercel deploya automaticamente.

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

## Verifica gate M1a (alla fine del Task 2, prima di proseguire)

I sei criteri del brief si verificano così, **tutti nel cloud**.

### A — Suite SQL (pgTAP) sul progetto Supabase

Apri Supabase → SQL Editor e incolla `supabase/tests/m1a_audit_log.sql`.
Esegui. Il test parte con `begin; … rollback;` ⇒ non lascia tracce.

> In alternativa, da una session Claude Code con CLI Supabase linkata:
> `supabase test db --file supabase/tests/m1a_audit_log.sql`.

Copre:
1. **Immutabilità fisica** — `UPDATE`/`DELETE`/`TRUNCATE` su `evento` falliscono
   (trigger); `anon`/`authenticated` non hanno UPDATE/DELETE/INSERT diretti
   (REVOKE); `audit_append` è eseguibile dagli authenticated.
2. **Append in serie** — 30 append consecutivi danno seq monotoni contigui (1..30).
3. **Catena verificabile** — `audit_verify_chain` ritorna 0 problemi su catena
   integra e rileva una manomissione simulata del payload del primo evento.
4. **Genesi** — `prev_hash` = `audit_genesis_hash(stream_id)`, non `NULL`;
   deterministica.
5. **No PII** — `audit_append` rifiuta `actor`/`payload` con
   `nome`/`email`/`codice_fiscale`.
6. **Timestamp server-side** — `occurred_at` viene assegnato dentro `audit_append`.

### B — Concorrenza reale (vitest contro il progetto Supabase)

Da una session Claude Code on the web (env già impostati):
```bash
npm run test:m1a
```

50 append paralleli sullo stesso stream via Admin RPC (service-role). Verifica:
nessun duplicato di `seq`, nessun buco, `prev_hash` sempre uguale all'`hash`
del predecessore, `audit_verify_chain` conferma integrità. Skippato se il
service role non è disponibile nell'ambiente.

In CI: la stessa suite gira su PR (vedi `.github/workflows/ci.yml`); le chiavi
sono in GitHub Secrets, mai nel repo.

### Stop & verify
Se anche **uno solo** dei criteri non passa, ci si ferma. È la ragione per cui
M1a è un gate separato.

## Verifica gate M1 (alla fine del Task 6)

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

## CI / pipeline

`.github/workflows/ci.yml` esegue su ogni PR:
- `npm run typecheck`
- `npm run build` (con env placeholder per evitare la dipendenza dalle chiavi
  reali in build).

I test M1a contro un vero progetto Supabase si attivano solo se i secrets
`SUPABASE_*` sono presenti nel repository (consigliato per il branch `main`).

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
