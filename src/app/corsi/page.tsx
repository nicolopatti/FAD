import Link from 'next/link';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Cover, StatusChip, Ico } from '@/components/AppShell';
import type { IscrizioneListaRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function MieiCorsiPage() {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizioni } = await supabase
    .from('iscrizione')
    .select(
      'id, edizione_id, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo, descrizione ) )',
    )
    .eq('persona_id', session.personaId)
    .returns<IscrizioneListaRow[]>();

  const rows = await Promise.all(
    (iscrizioni ?? []).map(async (i) => {
      const prog = await computeProgressoForIscrizione(supabase, i.id);
      return { iscrizione: i, prog };
    }),
  );

  const inCorso = rows.filter((r) => r.prog && !r.prog.idonea && r.prog.completati > 0).length;
  const idonei = rows.filter((r) => r.prog?.idonea).length;
  const daIniziare = rows.filter((r) => r.prog && r.prog.completati === 0).length;

  return (
    <AppShell
      user={{ name: session.nome, email: session.email }}
      role="discente"
      active="corsi"
    >
      <header className="page-head">
        <div className="page-head__title">
          <span className="eyebrow">{session.nome ? `Bentornato, ${session.nome}` : 'Bentornato'}</span>
          <h1>Il tuo percorso formativo.</h1>
          <p className="meta" style={{ fontSize: 16, marginTop: 4, maxWidth: '54ch' }}>
            {rows.length === 0
              ? 'Nessun corso ancora assegnato dalla tua azienda.'
              : `${rows.length} cors${rows.length === 1 ? 'o' : 'i'} assegnati. Le idoneità sono ricalcolate a ogni accesso dal log eventi append-only del tenant.`}
          </p>
        </div>
        {rows.length > 0 && (
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="kpi__label">In corso</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, color: 'var(--ink)' }}>
                {inCorso}
              </div>
            </div>
            <div style={{ width: 1, height: 44, background: 'var(--border)' }} />
            <div>
              <div className="kpi__label">Idoneità</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, color: 'var(--primary)' }}>
                {idonei}
                <small style={{ color: 'var(--muted-2)', fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
                  /{rows.length}
                </small>
              </div>
            </div>
            <div style={{ width: 1, height: 44, background: 'var(--border)' }} />
            <div>
              <div className="kpi__label">Da iniziare</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, color: 'var(--ink)' }}>
                {daIniziare}
              </div>
            </div>
          </div>
        )}
      </header>

      {rows.length === 0 && (
        <div className="panel muted">Nessun corso ancora assegnato.</div>
      )}

      <div className="stack">
        {rows.map(({ iscrizione, prog }, idx) => {
          const corsoTitolo = iscrizione.edizione?.corso?.titolo ?? '— corso non disponibile —';
          const descrizione = iscrizione.edizione?.corso?.descrizione ?? null;
          const codice = iscrizione.edizione?.codice ?? '—';
          const completati = prog?.completati ?? 0;
          const totale = prog?.totale ?? 0;
          const pct = totale > 0 ? Math.round((completati / totale) * 100) : 0;
          const idonea = prog?.idonea ?? false;

          return (
            <Link
              key={iscrizione.id}
              className="course-card"
              href={`/corsi/${iscrizione.edizione_id}`}
            >
              <Cover gradient={(idx % 4) + 1} initial={corsoTitolo.slice(0, 1).toUpperCase()} />
              <div className="course-card__body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="eyebrow">Ed. {codice}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <StatusChip idonea={idonea} completati={completati} />
                  </span>
                </div>
                <h2 className="course-card__title">{corsoTitolo}</h2>
                {descrizione && (
                  <p className="meta" style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>
                    {descrizione}
                  </p>
                )}

                {prog && (
                  <div className="course-card__progress">
                    <div className="course-card__progressRow">
                      <span className="course-card__progressLabel">
                        {completati}/{totale} oggetti · obbligatori{' '}
                        <strong style={{ color: 'var(--ink-2)' }}>
                          {prog.obbligatori_completati}/{prog.obbligatori_totale}
                        </strong>
                      </span>
                      <span className="course-card__progressValue">{pct}%</span>
                    </div>
                    <div className="progress progress--lg">
                      <div
                        className={`progress__bar ${idonea ? 'is-ok' : 'is-warn'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="row" style={{ marginTop: 4 }}>
                  <span className="btn btn--secondary btn--sm">
                    {completati === 0 ? 'Inizia il corso' : idonea ? 'Rivedi materiali' : 'Riprendi'}
                    <Ico name="chevR" size={14} />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
