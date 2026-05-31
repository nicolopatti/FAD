import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Icon, Cover, coverUrl, fmtData, fmtTempoRelativo } from '@/components/admin/Atlante';

export const dynamic = 'force-dynamic';

type EventoMini = {
  seq: number;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

function activityView(ev: EventoMini): { ico: string; node: React.ReactNode } | null {
  const p = ev.payload ?? {};
  const titolo = typeof p.titolo === 'string' ? p.titolo : null;
  const codice = typeof p.codice === 'string' ? p.codice : null;
  const loTitolo = typeof p.lo_titolo === 'string' ? p.lo_titolo : null;
  const n = typeof p.aggiunti === 'number' ? p.aggiunti : typeof p.righe === 'number' ? p.righe : null;
  const strong = (s: string | null) => (s ? <strong>{s}</strong> : null);

  switch (ev.event_type) {
    case 'corso.created':
      return { ico: 'plus', node: <>Creato il corso {strong(titolo)}</> };
    case 'corso.updated':
      return { ico: 'corsi', node: <>Aggiornato il corso {strong(titolo)}</> };
    case 'corso.cover_updated':
      return { ico: 'image', node: <>Aggiornata la copertina del corso</> };
    case 'learning_object.created':
      return { ico: 'upload', node: <>Nuovo contenuto in libreria: {strong(titolo)}</> };
    case 'learning_object.archived':
      return { ico: 'archive', node: <>Archiviato il contenuto {strong(titolo)}</> };
    case 'learning_object.unarchived':
      return { ico: 'archive', node: <>Ripristinato il contenuto {strong(titolo)}</> };
    case 'struttura.added':
      return { ico: 'plus', node: <>Aggiunto {strong(loTitolo)} alla struttura di un corso</> };
    case 'struttura.removed':
      return { ico: 'x', node: <>Rimosso un oggetto dalla struttura di un corso</> };
    case 'struttura.reordered':
      return { ico: 'grip', node: <>Riordinata la struttura di un corso</> };
    case 'struttura.imported':
      return { ico: 'upload', node: <>Importati {n ?? 'più'} oggetti nella struttura</> };
    case 'edizione.created':
      return { ico: 'snowflake', node: <>Creata l&apos;edizione <span className="mono">{codice}</span></> };
    case 'edizione.concluded':
      return { ico: 'check', node: <>Conclusa l&apos;edizione <span className="mono">{codice}</span></> };
    case 'edizione.cancelled':
      return { ico: 'x', node: <>Annullata l&apos;edizione <span className="mono">{codice}</span></> };
    case 'iscrizione.created':
      return { ico: 'users', node: <>Nuovo iscritto a un&apos;edizione</> };
    case 'iscrizione.removed':
      return { ico: 'x', node: <>Rimosso un iscritto da un&apos;edizione</> };
    case 'iscrizione.imported':
      return { ico: 'users', node: <>Importati {n ?? 'più'} iscritti</> };
    case 'sessione.created':
      return { ico: 'calendar', node: <>Pianificata la sessione {strong(titolo)}</> };
    case 'report_grezzo_importato':
      return { ico: 'upload', node: <>Importato un report di partecipazione</> };
    case 'report_fondo_depositato':
      return { ico: 'report', node: <>Depositato un report di rendicontazione fondo</> };
    default:
      return null;
  }
}

export default async function AdminDashboard() {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [corsiR, edizioniR, strutturaR, iscrizioniR, sessioniR, eventiR] = await Promise.all([
    supabase
      .from('corso')
      .select('id, titolo, descrizione, categoria, cover_path, creato_il')
      .order('creato_il', { ascending: false }),
    supabase.from('edizione').select('id, corso_id, codice, concluso_at, annullato_at'),
    supabase.from('struttura_corso').select('corso_id'),
    supabase.from('iscrizione').select('persona_id'),
    supabase.from('sessione').select('id, data_ora, annullato_at'),
    supabase
      .from('evento')
      .select('seq, event_type, occurred_at, payload')
      .order('seq', { ascending: false })
      .limit(20),
  ]);

  const corsi = corsiR.data ?? [];
  const edizioni = edizioniR.data ?? [];
  const struttura = strutturaR.data ?? [];
  const iscrizioni = iscrizioniR.data ?? [];
  const sessioni = sessioniR.data ?? [];

  const edizioniAttive = edizioni.filter((e) => !e.concluso_at && !e.annullato_at).length;
  const personeIscritte = new Set(iscrizioni.map((i) => i.persona_id as string)).size;

  const now = Date.now();
  const imminenti = sessioni
    .filter((s) => !s.annullato_at && s.data_ora && new Date(s.data_ora).getTime() >= now)
    .sort((a, b) => new Date(a.data_ora!).getTime() - new Date(b.data_ora!).getTime());

  // conteggi per corso
  const ediCount = new Map<string, number>();
  for (const e of edizioni) {
    ediCount.set(e.corso_id, (ediCount.get(e.corso_id) ?? 0) + 1);
  }
  const strCount = new Map<string, number>();
  for (const s of struttura) {
    strCount.set(s.corso_id as string, (strCount.get(s.corso_id as string) ?? 0) + 1);
  }

  const congelati = corsi.filter((c) => (ediCount.get(c.id) ?? 0) > 0).length;
  const bozze = corsi.length - congelati;

  const recenti = corsi.slice(0, 4);
  const attivita = ((eventiR.data ?? []) as EventoMini[])
    .map((ev) => ({ ev, view: activityView(ev) }))
    .filter((x) => x.view !== null)
    .slice(0, 7);

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Area amministratore</span>
          <h1>Buongiorno, {session.nome || 'amministratore'}</h1>
          <p>Quadro generale del catalogo formativo, delle edizioni in corso e dell&apos;attività recente.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--secondary" href="/admin/learning-objects/new">
            <Icon name="upload" /> Carica contenuto
          </Link>
          <Link className="btn" href="/admin/corsi/new">
            <Icon name="plus" /> Nuovo corso
          </Link>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Corsi totali" value={corsi.length} icon="corsi"
          sub={`${bozze} in bozza · ${congelati} congelati`} />
        <Kpi label="Edizioni attive" value={edizioniAttive} icon="layers" sub="Aperte alla fruizione" />
        <Kpi label="Iscritti" value={personeIscritte} icon="users" sub="Persone iscritte sul tenant" />
        <Kpi
          label="Sessioni imminenti"
          value={imminenti.length}
          icon="calendar"
          sub={imminenti[0]?.data_ora ? `Prossima · ${fmtData(imminenti[0].data_ora)}` : 'Nessuna in programma'}
        />
      </div>

      <div className="grid-2-380">
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Corsi recenti</h3>
              <div className="sub">Ultimi corsi modificati nel catalogo</div>
            </div>
            <Link className="btn btn--secondary btn--sm" href="/admin/corsi">
              Tutti i corsi <Icon name="arrowRight" />
            </Link>
          </div>
          <div className="card__body">
            {recenti.length === 0 ? (
              <div className="muted">Nessun corso ancora creato.</div>
            ) : (
              <div className="recent">
                {recenti.map((c) => {
                  const ne = ediCount.get(c.id) ?? 0;
                  const frozen = ne > 0;
                  return (
                    <Link key={c.id} href={`/admin/corsi/${c.id}`} className="recent__row">
                      <Cover className="recent__cover" categoria={c.categoria} src={coverUrl(c.cover_path)} />
                      <div className="recent__main">
                        <div className="recent__title">{c.titolo}</div>
                        <div className="recent__meta">
                          {strCount.get(c.id) ?? 0} oggetti · {ne} edizioni
                        </div>
                      </div>
                      <span className={`chip ${frozen ? 'chip--freeze' : 'chip--ocra'}`}>
                        <span className="dot" />
                        {frozen ? 'Congelato' : 'Bozza'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h3>Attività recente</h3>
          </div>
          <div className="card__body">
            {attivita.length === 0 ? (
              <div className="muted">Nessuna attività registrata.</div>
            ) : (
              <ul className="activity">
                {attivita.map(({ ev, view }) => (
                  <li key={ev.seq}>
                    <span className="activity__dot">
                      <Icon name={view!.ico} />
                    </span>
                    <div>
                      <div className="activity__txt">{view!.node}</div>
                      <div className="activity__time">{fmtTempoRelativo(ev.occurred_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: number;
  icon: string;
  sub?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi__top">
        <span className="kpi__label">{label}</span>
        <Icon name={icon} className="kpi__icon" />
      </div>
      <div className="kpi__value">{value}</div>
      {sub && <div className="kpi__sub">{sub}</div>}
    </div>
  );
}
