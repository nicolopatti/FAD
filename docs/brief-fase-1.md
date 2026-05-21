# Brief Fase 1 — Fetta FAD end-to-end — da consegnare a Claude Code
> **Cos'è questo documento.** È il mandato operativo per la **Fase 1** dello Step 4
> (sviluppo in Claude Code) della piattaforma e-learning. Definisce *cosa* costruire,
> *in che ordine*, e i *criteri di accettazione* delle due milestone M1a e M1.
>
> **Fonte autoritativa.** Il documento di riferimento è `piattaforma-elearning-stato-progetto-v7.md`
> (decisioni D1–D35, dettaglio campo-per-campo, diagramma ER). In caso di conflitto, **fa fede
> quello**. Questo brief non re-decide nulla: traduce in lavoro la roadmap della Sessione 9.

---

## 1. Obiettivo della Fase 1
Consegnare **la fetta verticale FAD funzionante end-to-end**:
```
login → video Vimeo tracciato → log eventi append-only → i due report di audit
```
Costruendola si tira su per forza il **substrato**: schema delle entità con `tenant_id`,
Row-Level Security attiva da subito, autenticazione, e il log eventi append-only con catena
hash. La Fase 1 non è "un pezzo di UI": è il **core immutabile del prodotto** più la prima
slice che lo esercita.

**Principio guida:** si costruisce a *fette verticali*, non a livelli orizzontali. Ogni cosa
consegnata deve funzionare end-to-end.

---

## 2. Principi non negoziabili
1. **Lo scope creep è il rischio n.1 (D3).**
2. **Tenant-ready dal giorno 1 (D2).**
3. **Il log è la fonte di verità (D8).**
4. **Il server è l'unica fonte di verità sulla fruizione (D26).**
5. **Mai PII nel log (D18).**

(Versione completa del brief consegnata via task description — vedi README.md per il mapping
task → file e per le procedure di verifica dei gate M1a e M1.)
