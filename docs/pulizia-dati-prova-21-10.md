# Piano di pulizia dei dati di prova (stress test 21/10/2026) — PROPOSTA, non eseguita

Da eseguire **dopo** le correzioni (branch `claude/new-session-qr4kff`) e solo con
il via libera dell'utente. Regole: niente DELETE nel registro, nessuna modifica a
Eventi esistenti (append-only); ogni passo passa dalle API dell'area admin (che
scrivono il loro Evento) o, se serve SQL, scrive l'Evento con `audit_append`
(`origine: 'pulizia_verifica'`). Nessun invito email, nessun deposito di report.

| # | Cosa | Stato oggi | Azione proposta | Evento |
|---|------|-----------|-----------------|--------|
| 1 | Edizione **TEST-STRESS-01** (`8fe0efdf-…`) | attiva, FAD dal 01/03/2027 oltre la fine 31/01/2027 (date incoerenti), Mario Rossi iscritto con piano Fondimpresa | a) togliere `fad_apertura` (Stato → Codice e date: il risultato rispetta B1); b) **Annulla edizione** | `edizione.updated`, `edizione.cancelled` |
| 2 | Corso **TEST stress 21-10** (`84fd63f6-…`) | attivo, test "TEST verifica finale" con 0 domande | dopo 1: **Archivia** dalla testata del corso (si può: nessuna edizione attiva) | `corso.archived` |
| 3 | Iscrizione di Mario a TEST-STRESS-01 | presente | facoltativo: **Rimuovi** dalla scheda Iscritti (nessun attestato collegato). Altrimenti resta come storia, con l'edizione "annullata" | `iscrizione.removed` |
| 4 | Attestato **2026/000003** (Mario, ED-QUIZ-PROVA-02, senza firmatario/città/ore) e i 2 tentativi del test | write-once / append-only | si lasciano. Dopo aver completato i dati dell'ente (Impostazioni) e le ore del corso: **Riemetti** con motivazione "dati dell'ente completati" → nuovo numero, il 000003 risulta "sostituito" nella verifica pubblica | `attestato.emesso`, `attestato.sostituito` |
| 5 | 7 persone **"Verifica automatica"** con CF `VRFATM80A01A794X` | 0 iscrizioni, 0 incarichi, 0 attestati, nessun accesso | togliere il codice fiscale a tutte e 7 (scheda persona, campo vuoto). Poi applicare `supabase/pending/persona_codice_fiscale_unico.sql` (indice unico R3) e spostarlo in `supabase/migrations/` | `persona.updated {campi:[codice_fiscale]}` ×7 |
| 6 | Persona **"Y X"** con email `non-una-email` (`bbf00549-…`) | 1 iscrizione (giro di verifica), nessun accesso | correggere l'email in `verifica-email-non-valida@fad.local` dalla scheda persona (nessun utente Auth da aggiornare) | `persona.updated {campi:[email]}` |
| 7 | 7 sessioni annullate in agenda | storia | nessuna azione: ora l'agenda le nasconde ("Mostra anche N annullate") | — |
| 8 | Edizioni demo scadute **ED-001**, **ED-T4-DEMO**, **ED-WEB-2026** | ora "terminata — da concludere" e chiuse per il discente (R2) | scegliere: **prolungare** `data_fine`/`fad_chiusura` (es. 31/07/2027) di ED-001 ed ED-T4-DEMO, che servono alle ricette di verifica M1/M2 e alle prove del player e del PDF; **concludere** ED-WEB-2026 | `edizione.updated` / `edizione.concluded` |
| 9 | CHECK sulle date dell'edizione nel DB (B1) | rinviato | dopo 1 e 8: migration con `check` coerente con `erroriDateEdizione` (`NOT VALID` + `VALIDATE` se nessuna riga lo viola) | — |

Note:
- Il passo 4 e la completezza dei dati dell'ente fanno partire anche gli attestati
  automatici in attesa (es. Lucia Verdi, ED-WEB-2026) appena si salva l'ente
  completo (B11): è il comportamento voluto della politica "automatica".
- Dopo la pulizia: rilanciare `verifica-giro-completo` (workflow
  `verifica-scritture.yml`) e controllare la catena (`/audit/log` → Verifica).
