# Stato del progetto FAD — Fase 3 in corso (handoff session-to-session)

> Questo file è il primo da leggere all'inizio di ogni nuova sessione.
> Riassume cosa è stato fatto, cosa resta, e come riprendere senza dover
> rispiegare nulla. Fonte autoritativa per *cosa* costruire: `docs/brief-fase-1.md`
> (Fase 1, chiusa), `docs/brief-fase-2.md` (Fase 2, chiusa) e
> `docs/brief-fase-3.md` (Fase 3, **in corso** — è il mandato corrente) — e in
> caso di conflitto `piattaforma-elearning-stato-progetto-v7.md` (non in repo)
> con le decisioni D1–D35.

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

**Fase 3 in corso — fetta webinar (pipeline presenze + adattatori).** Mandato:
`docs/brief-fase-3.md`. Scope di lavoro corrente: **Task 1–5 fino al gate M3a**
verificati sul Supabase live; **Task 6 (adattatore API Teams) + M3 rinviati**
(richiedono setup Azure AD/segreti/egress Graph non eseguibile da Claude Code on
the web — è un runbook lato utente).

Decisioni §10 ratificate (2026-05-27): Teams unica piattaforma VCS implementata;
match ambigui → **blocco + risoluzione manuale**; riconciliazione → **automatica
all'import + ri-esecuzione manuale**; idoneità corsi di presenza → **automatica
alla soglia** (`corso.soglia_frequenza_percentuale`).

| Task | Descrizione | Stato |
|---|---|---|
| 1 | Schema Gruppo 3 (azienda/piano/incarico/sessione) + grezzo write-once + estensioni iscrizione/corso | ✅ done — `…20260527000001_fase3_gruppo3_grezzo.sql` applicata sul live; seed `supabase/seed/fase3_webinar_demo.sql` |
| 2 | Pipeline unica (ingest grezzo → evento import → riconciliazione) | ✅ done — `…20260529000001_fase3_pipeline_ingest.sql` applicata sul live; pgTAP `m3a_pipeline_ingest.sql` 17/17. Stadi (a)+(b); stadio (c) = seam del Task 4 |
| 3 | Adattatore CSV (upload + parser + mappatura colonne) | ⬜ da iniziare (prossimo) |
| 4 | Riconciliazione + coda risoluzione ambigui (gate M3a) | ⬜ da iniziare |
| 5 | Inserimento/correzione manuale presenze | ⬜ da iniziare |
| 6 | Setup Teams + adattatore API (gate M3) | ⛔ rinviato (runbook esterno) |

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
- **M3a** — *Pipeline + CSV reggono.* ⬜ in corso (checkpoint dopo Task 4).
  Criteri in `docs/brief-fase-3.md` §8. Fondamenta del Task 1 verificate sul live
  (grezzo write-once, hash contenuto, D30, RLS): 10/10 check hermetici. **Task 2
  (ingestione)** copre già la porzione di M3a verificabile a livello pipeline:
  #1 grezzo immutabile, #2 import attestato (hash riproducibile e sensibile), #4
  (parziale) payload import senza PII, #8 stream unico — pgTAP `m3a_pipeline_ingest.sql`
  17/17 sul live. Restano per il Task 4: #4 completo (match), #5 ambiguo, #6
  anonimo, #9 cache di compliance ricalcolata.
- **M3** — *Webinar end-to-end con API Teams.* ⛔ rinviato (Task 6, setup Teams
  esterno: Azure AD + segreti + egress Graph). Criteri in `docs/brief-fase-3.md` §9.

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

**Fase 3 in corso (fetta webinar).** Gate M1a/M1/M2 verdi; Fase 3 Task 1 ✅ (schema
Gruppo 3 + grezzo write-once) e Task 2 ✅ (pipeline `pipeline_ingest_grezzo`, stadi
a+b) applicati sul live. **Il prossimo è il Task 3 — Adattatore CSV**
(`docs/brief-fase-3.md` §5 Task 3): endpoint admin di upload + parser CSV +
mappatura colonne configurabile (chiavi attese: nome partecipante, email,
join/leave, durata), che normalizza in **un array JSON di righe** e chiama
`pipeline_ingest_grezzo` con `fonte='csv'` e `importato_da` = persona admin. Se
una colonna chiave manca → errore esplicito **prima** di toccare il grezzo
(niente default fragili). Poi Task 4 (riconciliazione + coda ambigui → **gate
M3a**), Task 5 (inserimento/correzione manuale). Scope di questa tornata: fino a
M3a; Task 6/M3 (Teams) rinviati al runbook utente.

Aggancio per il Task 4: in `pipeline_ingest_grezzo` lo stadio (c) è marcato come
seam — lì si innesterà `pipeline_riconcilia_grezzo(grezzo_id)` (auto all'import,
decisione §10) + la ri-esecuzione manuale; e `compliance.ts` andrà esteso per
contare gli Eventi di presenza webinar verso `ore_frequentate`/`frequenza_percentuale`
con idoneità auto alla soglia (M3a #9).

Promemoria di metodo:
- pipeline = un'unica funzione SECURITY DEFINER che inserisce nel grezzo e appende
  l'Evento di import nella stessa transazione (niente righe orfane, §11 brief);
- mai INSERT diretto in `evento` né nel grezzo da PostgREST: la write del grezzo
  passa solo per la funzione di ingestione (la tabella ha REVOKE + trigger);
- presenze come Eventi senza PII nel payload (attori pseudonimi); idoneità auto
  alla soglia `corso.soglia_frequenza_percentuale` nel ricalcolo della cache.

Restano aperti, non bloccanti:
- **Verifiche UI nel browser** di Fase 2 Task 4/5 sul deploy (network policy
  blocca `*.vercel.app` da qui).
- **TODO di Fase 1** qui sotto (prima della consegna a clienti veri).
- **Fase 4 (report fondi) e Fase 5 (Attestato)**: fuori scope finché Fase 3 non
  chiude e senza il relativo brief. **Non iniziarle senza conferma esplicita.**

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

**Ripartenza Fase 3 (Task 3):** le migration `…20260527000001_…` (Task 1) e
`…20260529000001_fase3_pipeline_ingest.sql` (Task 2) sono **già applicate sul
Supabase live** — non riapplicarle. Lo schema Gruppo 3, il grezzo write-once e la
funzione `pipeline_ingest_grezzo` ci sono. Il seed webinar è sul live (UUID
prefisso `33333333…`: edizione `33333333-0000-0000-0000-0000000000e1`, sessione
Teams `33333333-0000-0000-0000-0000000005e1`, 3 iscritti di cui uno senza
`email_riconciliazione`). Persona admin reale (attore degli import via CSV):
`aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa`. Partire dal Task 3 (adattatore CSV): la
route admin chiama `supabase.rpc('pipeline_ingest_grezzo', {p_tenant_id,
p_sessione_id, p_fonte:'csv', p_contenuto:<array di righe>, p_importato_da:<persona
admin>})` dopo `requireAdmin()`. Vedi `docs/brief-fase-3.md` §5 Task 3.

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

- **NON iniziare Fase 4+ senza conferma esplicita dell'utente e senza il relativo
  brief.** Fase 3 è in corso (mandato in `docs/brief-fase-3.md`), scope fino a M3a.
  Fase 4 (report fondi) e Fase 5 (Attestato) restano fuori finché Fase 3 non chiude.
  Replicare il pattern dei gate: non costruire sopra fondamenta non verificate.
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
