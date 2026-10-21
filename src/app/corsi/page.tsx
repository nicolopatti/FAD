import Link from 'next/link';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { computeProgressoPerIscrizioni, computeFrequenzaPerIscrizioni } from '@/lib/compliance';
import { deriveIdoneita } from '@/lib/report-fondo';
import { AppShell, StatusChip, Ico } from '@/components/AppShell';
import { Cover, coverUrl, fmtData } from '@/components/admin/Atlante';
import { etichettaFinestra } from '@/lib/finestra';
import type { IscrizioneListaRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

type Filtro = 'tutti' | 'in_corso' | 'completati';

export default async function MieiCorsiPage(props: { searchParams?: Promise<{ filtro?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  const filtro: Filtro =
    searchParams?.filtro === 'in_corso' || searchParams?.filtro === 'completati' ? searchParams.filtro : 'tutti';

  const iscrizioni = unwrap(await supabase
    .from('iscrizione')
    .select(
      'id, edizione_id, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo, descrizione, categoria, cover_path ) )',
    )
    .eq('persona_id', session.personaId)
    .returns<IscrizioneListaRow[]>(), 'i tuoi corsi');

  // Progresso di tutte le iscrizioni con un numero fisso di query (Blocco B #2).
  const ids = iscrizioni.map((i) => i.id);
  const [progressi, frequenze] = await Promise.all([computeProgressoPerIscrizioni(supabase, ids), computeFrequenzaPerIscrizioni(supabase, ids)]);
  // "Completato" con la stessa regola di attestati e report: lezioni E presenza minima.
  const tutti = iscrizioni.map((i) => {
    const prog = progressi.get(i.id) ?? null;
    const freq = frequenze.get(i.id) ?? null;
    const completato = prog ? deriveIdoneita(prog.obbligatori_totale, prog.idonea, freq?.soglia ?? null, Boolean(freq?.idoneo_frequenza)).idoneo : false;
    return { iscrizione: i, prog, freq, completato };
  });

  const inCorso = tutti.filter((r) => r.prog && !r.completato).length;
  const idonei = tutti.filter((r) => r.completato).length;
  const rows = tutti.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'in_corso' ? !r.completato : r.completato,
  );

  const nome = session.nome?.trim().split(' ')[0];
  const riepilogo = [
    inCorso > 0 ? `${inCorso} in corso` : null,
    idonei > 0 ? `${idonei} completat${idonei === 1 ? 'o' : 'i'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>{nome ? `Ciao, ${nome}` : 'I tuoi corsi'}</h1>
        <p className="page-lead" style={{ margin: 0 }}>
          {tutti.length === 0 ? 'Non hai ancora corsi assegnati: quando il tuo ente te ne assegna uno, lo trovi qui.' : riepilogo || `${tutti.length} cors${tutti.length === 1 ? 'o' : 'i'}`}
        </p>
      </header>

      {filtro !== 'tutti' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
          <span className="chip chip--ghost">{filtro === 'in_corso' ? 'Solo i corsi in corso' : 'Solo i corsi completati'}</span>
          <Link href="/corsi" className="back-link">Mostra tutti</Link>
        </div>
      )}

      {rows.length === 0 && tutti.length > 0 && (
        <div className="panel page-lead">
          {filtro === 'in_corso' ? 'Nessun corso in corso: li hai completati tutti.' : 'Nessun corso completato, per ora.'}
        </div>
      )}

      <div className="stack">
        {rows.map(({ iscrizione, prog, completato }) => {
          const corsoTitolo = iscrizione.edizione?.corso?.titolo ?? 'Corso non disponibile';
          const descrizione = iscrizione.edizione?.corso?.descrizione ?? null;
          const completati = prog?.completati ?? 0;
          const totale = prog?.totale ?? 0;
          const pct = totale > 0 ? Math.round((completati / totale) * 100) : 0;
          const idonea = completato;
          const prossima = prog?.items.find((i) => i.sbloccato && !i.completato);
          const finestra = prog?.finestra ?? null;
          const chiuso = finestra ? etichettaFinestra(finestra) : null;

          return (
            <Link key={iscrizione.id} className="corso-card" href={`/corsi/${iscrizione.edizione_id}`}>
              <Cover categoria={iscrizione.edizione?.corso?.categoria} src={coverUrl(iscrizione.edizione?.corso?.cover_path)} />
              <div className="corso-card__body">
                <div className="corso-card__head">
                  <span className="page-lead">{totale} lezion{totale === 1 ? 'e' : 'i'}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {chiuso && !idonea && <span className="chip chip--ghost">{chiuso}</span>}
                    <StatusChip idonea={idonea} completati={completati} />
                  </span>
                </div>
                <h2 className="corso-card__title">{corsoTitolo}</h2>
                {descrizione && <p className="corso-card__desc">{descrizione}</p>}

                {prog && (
                  <div className="corso-card__progress">
                    <div className="corso-card__progressRow">
                      <span className="corso-card__progressLabel">
                        {idonea ? 'Completato' : `${completati} di ${totale} lezioni completate`}
                      </span>
                      <span className="corso-card__progressValue">{pct}%</span>
                    </div>
                    <div className="progress progress--lg">
                      <div className={`progress__bar ${idonea ? 'is-ok' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <div className="corso-card__cta">
                  <span className={`btn btn--sm ${idonea ? 'btn--secondary' : ''}`}>
                    {idonea
                      ? (finestra?.aperta === false ? 'Vedi il corso' : 'Rivedi le lezioni')
                      : finestra?.stato === 'non_aperta'
                        ? `Si apre il ${fmtData(finestra.apre_il)}`
                        : chiuso
                          ? 'Vedi il corso'
                          : prossima?.lo_type === 'quiz'
                        ? 'Vai al test finale'
                        : completati === 0
                          ? 'Inizia il corso'
                          : `Riprendi${prossima ? `: lezione ${prossima.ordine}` : ''}`}
                    <Ico name="arrowR" size={14} />
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
