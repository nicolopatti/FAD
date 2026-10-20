import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { AppShell, Ico } from '@/components/AppShell';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { DocumentoPlayer } from '@/components/DocumentoPlayer';

export const dynamic = 'force-dynamic';

function durataLabel(config: Record<string, unknown>): string | null {
  const s = Number(config?.durata_secondi);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m} min${sec ? ` ${sec} s` : ''}`;
}

export default async function LearningObjectPage({ params }: { params: { edizioneId: string; loId: string } }) {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  const idx = prog.items.findIndex((i) => i.learning_object_id === params.loId);
  if (idx < 0) notFound();
  const item = prog.items[idx];
  const indice = idx + 1;
  const prev = idx > 0 ? prog.items[idx - 1] : null;
  const nextItem = idx < prog.items.length - 1 ? prog.items[idx + 1] : null;
  const corsoHref = `/corsi/${params.edizioneId}` as Route;
  const hrefDi = (loId: string) => `/corsi/${params.edizioneId}/lo/${loId}` as Route;
  const durata = durataLabel(item.lo_config as Record<string, unknown>);

  // D26: enforcement server-side. Se non sbloccato, l'accesso è negato.
  if (!item.sbloccato) {
    const daFare = prog.items.find((i) => i.sbloccato && !i.completato);
    return (
      <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
        <Link href={corsoHref} className="back-link" style={{ marginBottom: 16 }}><Ico name="chevL" size={16} /> {prog.corso_titolo}</Link>
        <div className="panel" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>Questa lezione non è ancora aperta</h1>
          <p className="page-lead" style={{ margin: 0, fontSize: 15 }}>Le lezioni si aprono una dopo l&apos;altra: completa prima quelle precedenti.</p>
          {daFare && (
            <div><Link className="btn" href={hrefDi(daFare.learning_object_id)}>Vai alla lezione {daFare.ordine} <Ico name="arrowR" size={14} /></Link></div>
          )}
        </div>
      </AppShell>
    );
  }

  const nextHref = nextItem ? hrefDi(nextItem.learning_object_id) : undefined;
  const nextLabel = nextItem ? (nextItem.sbloccato || item.completato ? `Lezione ${nextItem.ordine}` : `Lezione ${nextItem.ordine}`) : undefined;

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente" wide>
      <div className="player-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Link href={corsoHref} className="back-link"><Ico name="chevL" size={16} /> {prog.corso_titolo}</Link>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lesson-meta">
              Lezione {indice} di {prog.totale}{durata ? ` · ${durata}` : ''}{!item.obbligatorio ? ' · facoltativa' : ''}
              {item.completato && <span className="status-ok"> · completata</span>}
            </div>
            <h1 className="lesson-title">{item.lo_titolo}</h1>
          </div>

          {item.lo_type === 'video' ? (
            <VimeoPlayer
              vimeoId={String((item.lo_config as { vimeo_id?: string }).vimeo_id ?? '')}
              vimeoHash={(item.lo_config as { vimeo_hash?: string }).vimeo_hash}
              visioneIntegrale={prog.visione_integrale}
              trattiIniziali={item.segmenti_visti}
              coperturaIniziale={item.copertura_percentuale}
              corsoHref={corsoHref}
              nextHref={nextHref}
              nextLabel={nextLabel}
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
            />
          ) : item.lo_type === 'documento' ? (
            <DocumentoPlayer
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
              filename={(item.lo_config as { filename?: string }).filename}
              alreadyCompleted={item.completato}
              nextHref={nextHref}
              nextLabel={nextLabel}
            />
          ) : (
            <div className="alert">Questo tipo di contenuto non è supportato.</div>
          )}

          <div className="lesson-nav">
            {prev ? (
              <Link className="btn btn--secondary btn--sm" href={hrefDi(prev.learning_object_id)}><Ico name="chevL" size={14} /> Lezione {prev.ordine}</Link>
            ) : <span />}
            {nextItem && (nextItem.sbloccato || item.completato) ? (
              <Link className="btn btn--sm" href={hrefDi(nextItem.learning_object_id)}>Lezione {nextItem.ordine} <Ico name="chevR" size={14} /></Link>
            ) : nextItem ? (
              <span className="page-lead" style={{ alignSelf: 'center' }}>La lezione {nextItem.ordine} si apre al completamento di questa</span>
            ) : null}
          </div>

          <p className="page-lead" style={{ margin: 0, lineHeight: 1.55, maxWidth: '62ch' }}>
            {item.lo_type === 'video'
              ? prog.visione_integrale
                ? 'Questo corso richiede la visione integrale: il video si guarda per intero a velocità normale, senza salti in avanti. Conta il tempo reale di riproduzione.'
                : 'La lezione risulta completata quando il video arriva alla fine.'
              : 'Quando hai finito di leggere, conferma con il pulsante: la lezione viene registrata come completata.'}
          </p>
        </div>

        <aside className="player-sidebar">
          <div className="panel panel--program">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 18 }}>Programma</h2>
              <span className="page-lead">{prog.completati} di {prog.totale}</span>
            </div>
            <div className="progress" style={{ marginBottom: 14 }}>
              <div className={`progress__bar ${prog.idonea ? 'is-ok' : ''}`} style={{ width: `${prog.totale > 0 ? Math.round((prog.completati / prog.totale) * 100) : 0}%` }} />
            </div>
            <ol className="outline-list">
              {prog.items.map((lo, i) => {
                const active = lo.learning_object_id === params.loId;
                const cls = lo.completato ? 'is-ok' : active ? 'is-current' : !lo.sbloccato ? 'is-locked' : '';
                const inner = (
                  <>
                    <span className="outline-row__icon">
                      {lo.completato ? <Ico name="check" size={16} /> : !lo.sbloccato ? <Ico name="lock" size={14} /> : <span style={{ fontSize: 12, fontWeight: 600 }}>{i + 1}</span>}
                    </span>
                    <span className="outline-row__title">{lo.lo_titolo}</span>
                    <span className="outline-row__num">{active ? 'ora' : ''}</span>
                  </>
                );
                return (
                  <li key={lo.struttura_id} className={`outline-row ${cls}`}>
                    {lo.sbloccato && !active ? (
                      <Link href={hrefDi(lo.learning_object_id)} style={{ display: 'contents', color: 'inherit' }}>{inner}</Link>
                    ) : inner}
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
