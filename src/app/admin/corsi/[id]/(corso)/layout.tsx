import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { corsoStato, STATO_CORSO_CHIP, STATO_CORSO_LABEL, type PoliticaAttestato } from '@/lib/db-types';
import { Crumb } from '@/components/AppShell';
import { Tabs } from '@/components/admin/Tabs';
import { CorsoAzioni } from '../_components/CorsoAzioni';

export const dynamic = 'force-dynamic';

type CorsoTesta = { id: string; titolo: string; politica_attestato: PoliticaAttestato | null };

/**
 * Testata del corso + schede. Ogni scheda è una pagina figlia: Panoramica,
 * Lezioni, Edizioni, Attestato, Impostazioni. L'edizione ha una pagina propria
 * sotto Edizioni, con le sue schede.
 */
export default async function CorsoLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, titolo, politica_attestato')
    .eq('id', params.id)
    .maybeSingle<CorsoTesta>();
  if (!corso) notFound();

  const [edizioni, lezioni] = await Promise.all([
    supabase.from('edizione').select('id, concluso_at, annullato_at').eq('corso_id', corso.id).then((r) => unwrap(r, 'le edizioni')),
    supabase.from('struttura_corso').select('id', { count: 'exact', head: true }).eq('corso_id', corso.id),
  ]);
  const stato = corsoStato(edizioni);
  const base = `/admin/corsi/${corso.id}` as const;
  const tabs = [
    { label: 'Panoramica', href: base, exact: true },
    { label: 'Lezioni', href: `${base}/lezioni`, count: lezioni.count ?? 0 },
    { label: 'Edizioni', href: `${base}/edizioni`, count: edizioni.length },
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
            <span>{edizioni.length === 0 ? 'nessuna edizione' : `${edizioni.length} ${edizioni.length === 1 ? 'edizione' : 'edizioni'}`}</span>
          </div>
        </div>
        <div className="page-head__actions">
          <CorsoAzioni corsoId={corso.id} />
        </div>
      </div>
      <Tabs items={tabs} label="Sezioni del corso" />
      {children}
    </>
  );
}
