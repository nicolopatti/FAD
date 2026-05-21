# FAD — Fase 1 (fetta verticale)

Mandato operativo: il documento [`docs/brief-fase-1.md`](docs/brief-fase-1.md).
Decisioni di riferimento: `piattaforma-elearning-stato-progetto-v7.md` (D1–D35).

> **Cosa contiene questa fase.** Substrato dati con `tenant_id` + RLS attiva,
> log eventi append-only con catena hash (gate **M1a**), autenticazione, player
> Vimeo tracciato, due report di audit (gate **M1**).
>
> Tutto il resto (assemblatore corsi, quiz, attestati, webinar, report fondi…)
> resta **fuori** dalla Fase 1.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres 15) — Auth, RLS, Storage non usato in Fase 1
- Vimeo Player.js per hosting video

> **Vimeo da ratificare (brief §10).** L'implementazione del Task 5 assume Vimeo
> come da orientamento. Se la decisione formale dovesse cambiare, l'impatto è
> circoscritto a `src/components/VimeoPlayer.tsx` (embed) e al campo `config`
> del Learning Object (`vimeo_id` → `<altro_id>`): il resto della slice non si
> tocca.

## Avvio

```bash
# 1) Installa dipendenze
npm install

# 2) Avvia Supabase locale (richiede supabase CLI)
supabase start
supabase db reset      # applica le migration in supabase/migrations/* e supabase/seed.sql

# 3) Configura variabili
cp .env.example .env.local
# popola NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# (le ottieni da: supabase status)

# 4) Avvia il dev server
npm run dev
```

Utenze demo (create dal seed):
- Discente — `discente@fad.local` / `discente-pass-123`
- Auditor — `auditor@fad.local` / `auditor-pass-123`

## Mappa Task → file

| Task | Contenuto | File principali |
|---|---|---|
| 1 — Substrato + RLS | tabelle base, RLS, helper `current_tenant_id()` | `supabase/migrations/20260521000001_schema.sql` |
| 2 — Log append-only (M1a) | `stream_audit`, `evento`, `audit_append`, `audit_verify_chain`, trigger immutabilità | `supabase/migrations/20260521000002_audit_log.sql` |
| 3 — Auth + login | login/logout, mapping `auth_user_id` ↔ Persona, eventi `auth.login`/`auth.logout` | `src/app/login/page.tsx`, `src/app/api/auth/*` |
| 4 — Seed corso FAD | Corso + LO video + Struttura + Edizione + Iscrizione | `supabase/seed.sql`; pagine `src/app/corsi/*` |
| 5 — Player video tracciato | Embed Vimeo, eventi server-side, sblocco sequenziale (D26) | `src/components/VimeoPlayer.tsx`, `src/app/api/events/video/route.ts`, `src/lib/compliance.ts` |
| 6 — Report audit (M1) | due report distinti (D35), verifica catena | `src/app/audit/log/page.tsx`, `src/app/audit/completamento/page.tsx`, `src/app/api/audit/verify/route.ts` |

## Verifica gate M1a (alla fine del Task 2, prima di proseguire)

I sei criteri del brief si verificano così.

### A — Suite SQL (pgTAP)

```bash
supabase test db --file supabase/tests/m1a_audit_log.sql
```

Copre:
1. **Immutabilità fisica** — `UPDATE`/`DELETE`/`TRUNCATE` su `evento` falliscono (trigger);
   `anon`/`authenticated` non hanno UPDATE/DELETE diretti (REVOKE).
2. **Append in serie** — 30 append consecutivi danno seq monotoni contigui (1..30).
3. **Catena verificabile** — `audit_verify_chain` ritorna 0 problemi su catena integra
   e rileva una manomissione simulata del payload del primo evento.
4. **Genesi** — `prev_hash` = `audit_genesis_hash(stream_id)`, non `NULL`; deterministica.
5. **No PII** — `audit_append` rifiuta `actor`/`payload` con `nome`/`email`/`codice_fiscale`.
6. **Timestamp server-side** — `occurred_at` viene assegnato dentro `audit_append`.

### B — Concorrenza reale (vitest)

```bash
npm run test:m1a
```

Esegue 50 append in parallelo sullo stesso stream tramite il client Supabase
con service-role. Verifica: nessun duplicato di `seq`, nessun buco, `prev_hash`
sempre uguale all'`hash` del predecessore. Skippato se `.env.local` non
contiene `SUPABASE_SERVICE_ROLE_KEY`.

### Stop & verify
Se anche **uno solo** dei criteri non passa, ci si ferma. È la ragione per cui
M1a è un gate separato: il log è il pezzo portante e deve reggere prima di
costruirci sopra.

## Verifica gate M1 (alla fine del Task 6)

1. **Slice end-to-end** — login (discente) → `/corsi` → click corso → `/corsi/.../lo/...`
   → riproduzione del video → gli eventi `video.play/pause/seek/ended` appaiono
   nei due report di audit dell'auditor.
2. **Log fisicamente immutabile** — i criteri di M1a continuano a passare:
   ripetere `supabase test db --file supabase/tests/m1a_audit_log.sql` dopo aver
   prodotto eventi reali.
3. **Sblocco sequenziale server-side** — con `corso.sblocco_sequenziale = true`,
   una chiamata diretta
   ```bash
   curl -X POST $APP/api/events/video \
     -H 'cookie: <sessione discente>' \
     -d '{"event_type":"video.play","iscrizione_id":"<id>","learning_object_id":"<lo bloccato>","payload":{}}'
   ```
   risponde **HTTP 403** (`LO non sbloccato`).
4. **Completamento ricalcolato** — svuotare le colonne-cache dell'Iscrizione
   (`update iscrizione set cache_completata = false, cache_idonea = false`) e
   ricaricare `/audit/completamento`: il report mostra comunque lo stato corretto
   perché lo deriva dagli Eventi.
5. **Isolamento tenant** — tentando di leggere righe di un altro `tenant_id` con
   un token di tenant diverso la RLS blocca a livello DB. Verifica con
   ```sql
   set role authenticated; set request.jwt.claim.sub = '<altro auth_user_id>';
   select * from public.corso; -- non vede righe del tenant_id del primo
   ```
6. **Verifica della catena nell'area auditor** — pulsante "Verifica integrità
   catena" su `/audit/log` deve restituire "Catena integra" sui dati reali.

## Architettura — i 5 invarianti

1. **Tenant-ready dal giorno 1 (D2).** Ogni tabella di business ha `tenant_id`
   NOT NULL e RLS attiva nella stessa migration che la crea.
2. **Il log è la fonte di verità (D8).** Stato di compliance e completamento
   sono cache derivate dagli Eventi; il report ricalcola sempre dagli Eventi.
3. **Server unica fonte di verità sulla fruizione (D26).** Lo sblocco
   sequenziale è applicato sia nella pagina del LO sia nell'API POST eventi.
4. **Mai PII nel log (D18).** L'`actor` è un `persona_id` pseudonimo; nomi/email
   appaiono nel report solo se l'auditor risolve gli pseudonimi via anagrafica
   al momento della lettura.
5. **Append solo via funzione (D11/D19).** `evento` ha REVOKE su UPDATE/DELETE
   e trigger di blocco; l'unica scrittura passa da `audit_append`, che usa
   `FOR UPDATE` sulla riga `stream_audit` per serializzare.

## Cosa NON c'è qui (per scelta)

Niente assemblatore corsi, niente quiz, niente moduli/sezioni, niente documenti
o Storage, niente webinar/CSV, niente generatori fondi, niente attestati, niente
SCORM, niente multi-stream, niente branding multi-tenant. Tutto questo entra
nelle fasi 2–5 secondo il documento di stato del progetto.
