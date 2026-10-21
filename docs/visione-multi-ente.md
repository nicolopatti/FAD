# Piattaforma multi-ente — appunti per decidere (non è un brief)

> Scritto il 2026-10-21 su richiesta dell'utente: *"pensare questa piattaforma come uno
> strumento modulare che io possa gestire a livello centrale ma anche dare in dotazione a
> diversi enti e clienti che a loro volta potranno gestire il proprio personale in un
> ambiente loro"*. L'utente ha deciso di **partire dalla vendita dei corsi**
> (`docs/brief-fase-6-vendita.md`) e di valutare con calma questi temi, perché toccano la base
> dell'infrastruttura. Qui ci sono le scelte possibili e cosa comporta ciascuna. **Niente di
> questo è deciso né costruito.**

## 1. Cosa c'è già (e non va rifatto)

- **Separazione per ente in tutto il database.** Ogni tabella porta `tenant_id`; le regole
  di accesso (RLS) impediscono a un ente di leggere i dati di un altro, verificato con test
  dedicati. Ogni ente ha il **proprio registro eventi** con la propria catena di hash, quindi
  l'integrità si verifica ente per ente.
- **Creazione di un ente** in una transazione (`tenant_crea` + `npm run nuovo-ente`): ente,
  registro e primo amministratore.
- **Dati dell'ente** già per ente: ragione sociale, logo, firma, modello dell'attestato,
  categorie, piani dei fondi, aziende.
- **Aziende clienti** già presenti come anagrafica (con P.IVA unica per ente): manca solo un
  ruolo che permetta a una persona dell'azienda di vedere i propri dipendenti.

## 2. Cosa manca, in ordine di importanza

### 2.1 Una persona, più enti (appartenenze)

**Oggi** un account appartiene a **un solo ente** (`persona.auth_user_id` è unico) e il
ruolo (admin/auditor/discente) è scritto **nell'account** (`app_metadata.role`), quindi vale
ovunque. Va bene finché c'è un ente solo.

**Problema**: un docente che lavora per due enti, o un lavoratore che segue corsi di due
enti diversi, oggi dovrebbe avere due email diverse. E un "admin" sarebbe admin dovunque
avesse una scheda.

**Scelte possibili**

| Opzione | Come funziona | Pro | Contro |
|---|---|---|---|
| A. Un account per ente | Si resta come oggi: chi sta in due enti ha due account | Nessun lavoro | Scomodo per docenti e discenti; email doppie impossibili con Supabase Auth (un'email = un account) |
| **B. Appartenenze** (consigliata) | Tabella `appartenenza (persona, ente, ruolo)`; dopo il login si sceglie l'ente (o lo decide l'indirizzo, vedi 2.2); il ruolo vale solo in quell'ente | Una sola identità, ruoli separati per ente, modello standard dei SaaS | Tocca tutte le regole di accesso e le funzioni `current_tenant_id`/`is_admin`: è il lavoro più delicato, da fare con tutti i test di isolamento rilanciati |
| C. Account per ente con email "alias" | Si inventano email tecniche | — | Da scartare: fragile, confonde le persone |

**Cosa comporta B**: una migration che sposta il ruolo dall'account alla tabella, nuove
funzioni "ente attivo" e "ruolo nell'ente attivo", aggiornamento di tutte le policy, un
selettore dell'ente dopo il login (solo per chi ne ha più di uno). Il registro eventi non
cambia (l'attore è già una persona dell'ente).

### 2.2 Indirizzo per ente

| Opzione | Esempio | Pro | Contro |
|---|---|---|---|
| Un solo indirizzo, si sceglie l'ente dopo il login | `piattaforma.it` | Semplice | Nessun "ambiente proprio" percepito dall'ente; il catalogo pubblico di un ente non ha un indirizzo suo |
| **Sottodominio per ente** (consigliata come base) | `ente.piattaforma.it` | Ogni ente ha il suo ingresso col suo logo; un certificato jolly copre tutti | Serve un dominio vostro; Vimeo non accetta i jolly tra i domini consentiti: ogni sottodominio va inserito a mano, oppure i video vanno lasciati incorporabili ovunque |
| Dominio proprio dell'ente | `formazione.ente.it` | Massima personalizzazione | L'ente deve configurare il DNS; per ogni dominio: Vercel, Supabase Auth (redirect) e Vimeo |

La tecnica è la stessa per i due ultimi casi: una tabella `tenant_dominio (host → ente)` e il
`proxy.ts` che riconosce l'ente dall'indirizzo. La vendita (Fase 6) introduce già questa
tabella in forma minima, così non è lavoro buttato.

### 2.3 Livello "azienda cliente" (referente aziendale)

Nuovo ruolo dentro un ente: il **referente aziendale** vede solo le persone della propria
azienda (iscrizioni, avanzamento, attestati) e, se lo si vuole, iscrive i propri dipendenti
alle edizioni aperte. Dipende da 2.1 (il ruolo è per ente e qui anche per azienda).

### 2.4 Console della piattaforma (voi)

Area per i gestori: elenco enti, creazione di un ente senza script, moduli attivi, uso
(utenti, spazio, video), stato dei pagamenti dell'ente verso di voi. **Accesso ai dati di
un ente solo come "supporto"**, attivato esplicitamente e scritto nel registro di quell'ente
(chi, quando, perché).

### 2.5 Moduli attivabili per ente

Corsi online, webinar e presenze, fondi interprofessionali, test e attestati, vendita. Un
campo `moduli` per ente: il menu e le API rispettano ciò che è attivo. Costo basso, si può
fare anche presto.

### 2.6 Email col marchio dell'ente

Supabase Auth ha **un solo** modello di email per progetto. Per mandare inviti e reset col
nome e il logo dell'ente serve inviare noi le email (Brevo, Resend, Postmark) con l'"hook"
di invio di Supabase Auth. Necessario appena gli enti sono più d'uno.

## 3. Isolamento: database unico o database per ente

| Modello | Pro | Contro | Quando |
|---|---|---|---|
| **Database unico con separazione per ente** (oggi) | Un aggiornamento vale per tutti; costi bassi; report di piattaforma facili | Un errore nelle regole di accesso tocca tutti (mitigato dai test di isolamento in ogni fase) | **Base consigliata** |
| Database separato per ente (stesso codice, progetto Supabase dedicato) | Isolamento fisico; backup e cancellazione per ente | Ogni migration va applicata N volte; costi per progetto; console centrale più complessa | Solo per enti che lo richiedono per contratto |
| Ibrido | Unico per i piccoli, separato per i grandi | Due modalità da mantenere | Più avanti, se un cliente lo chiede |

Il codice di oggi permette l'ibrido senza riscritture (nessun ente è cablato nel codice):
**non serve decidere adesso**.

## 4. Privacy e contratti

- Voi siete **responsabili del trattamento**, ogni ente è **titolare** dei dati dei suoi
  discenti: serve un DPA (accordo di nomina) per ente, con l'elenco dei sub-responsabili
  (Supabase, Vercel, Vimeo, Stripe, servizio email). I dati sono in UE (Francoforte).
- Per il **vostro ente che vende**: voi siete titolari dei dati degli acquirenti.
- Il registro eventi non contiene dati personali per costruzione (regola D18): resta vero
  anche con più enti.

## 5. Costi indicativi della base (da verificare sui listini)

Supabase Pro (un progetto) circa 25 $/mese più eventuale potenza di calcolo; Vercel Pro
circa 20 $/mese per persona del team; servizio email da qualche euro a qualche decina al
mese; Vimeo secondo il piano dell'account; Stripe a percentuale sulle transazioni. Con il
database unico i costi crescono poco al crescere degli enti.

## 6. Ordine suggerito quando si deciderà

1. Appartenenze (2.1) + moduli (2.5) + indirizzo per ente (2.2) + console minima (2.4).
2. Email col marchio (2.6).
3. Referente aziendale (2.3).
4. Vendita per gli altri enti (ognuno col proprio conto Stripe, Stripe Connect).
5. Database separato solo su richiesta.

Prerequisito di tutto: **ambiente di prova separato** dalla produzione (oggi le anteprime
usano il database vero), che richiede Supabase Pro.
