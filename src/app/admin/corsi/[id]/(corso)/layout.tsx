import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { STATO_CORSO_CHIP, STATO_CORSO_LABEL, type CorsoRiepilogo } from '@/lib/db-types';
import { Crumb } from '@/components/AppShell';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { Tabs } from '@/components/admin/Tabs';
import { CorsoAzioni } from '../_components/CorsoAzioni';

export const dynamic = 'force-dynamic';

/**
 * Testata del corso + schede. Ogni scheda è una pagina figlia: Panoramica,
 * Lezioni, Edizioni, Attestato, Impostazioni. L'edizione ha una pagina propria
 * sotto Edizioni, con le sue schede. I numeri vengono dalla vista di riepilogo.
 */
export default async function CorsoLayout(props: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const params = await props.params;

  const {
    children
  } = props;

  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso_riepilogo')
    .select('id, titolo, politica_attestato, archiviato_at, n_lezioni, n_edizioni, n_edizioni_attive, stato')
    .eq('id', params.id)
    .maybeSingle<Pick<CorsoRiepilogo, 'id' | 'titolo' | 'politica_attestato' | 'archiviato_at' | 'n_lezioni' | 'n_edizioni' | 'n_edizioni_attive' | 'stato'>>();
  if (!corso) notFound();

  const stato = corso.stato;
  const base = `/admin/corsi/${corso.id}` as const;
  const tabs = [
    { label: 'Panoramica', href: base, exact: true },
    { label: 'Lezioni', href: `${base}/lezioni`, count: corso.n_lezioni },
    { label: 'Edizioni', href: `${base}/edizioni`, count: corso.n_edizioni },
    ...((corso.politica_attestato ?? 'automatica') !== 'nessuna' ? [{ label: 'Attestato', href: `${base}/attestato` }] : []),
    { label: 'Impostazioni', href: `${base}/impostazioni` },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Corsi', href: '/admin/corsi' }, { label: corso.titolo }]} />
          <h1>{corso.titolo}</h1>
          <div className="head-chips">
            <span className={`chip ${STATO_CORSO_CHIP[stato]}`}>{stato === 'attivo' && <span className="dot" />}{STATO_CORSO_LABEL[stato]}</span>
            <span>{corso.n_edizioni === 0 ? 'nessuna edizione' : `${corso.n_edizioni} ${corso.n_edizioni === 1 ? 'edizione' : 'edizioni'}`}</span>
          </div>
        </div>
        <div className="page-head__actions">
          <CorsoAzioni corsoId={corso.id} stato={stato} nEdizioniAttive={corso.n_edizioni_attive} />
        </div>
      </div>
      {corso.archiviato_at && (
        <div className="banner banner--ocra">
          <Icon name="archive" className="banner__icon" />
          <div className="banner__body">Corso <strong>archiviato</strong> il {fmtData(corso.archiviato_at)}: non compare nel catalogo né nei selettori e non si aprono nuove edizioni. Tutto il resto è consultabile. Per riusarlo, ripristinalo o duplicalo.</div>
        </div>
      )}
      <Tabs items={tabs} label="Sezioni del corso" />
      {children}
    </>
  );
}
