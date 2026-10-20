import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { edizioneStato, type EdizioneRow } from '@/lib/db-types';
import { Crumb } from '@/components/AppShell';
import { Tabs } from '@/components/admin/Tabs';
import { fmtData } from '@/components/admin/Atlante';

export const dynamic = 'force-dynamic';

type EdizioneTesta = EdizioneRow & { corso: { id: string; titolo: string; politica_attestato: string | null } | null };

/**
 * Pagina dell'edizione: l'unità di erogazione del corso. Raccoglie quello che
 * prima stava in tre menu: iscritti, sessioni, docenti, fondo, stato.
 */
export default async function EdizioneLayout({ children, params }: { children: React.ReactNode; params: { id: string; edizioneId: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: ed } = await supabase
    .from('edizione')
    .select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il, corso:corso_id ( id, titolo, politica_attestato )')
    .eq('id', params.edizioneId)
    .eq('corso_id', params.id)
    .maybeSingle<EdizioneTesta>();
  if (!ed || !ed.corso) notFound();

  const [iscritti, sessioni, incarichi] = await Promise.all([
    supabase.from('iscrizione').select('id', { count: 'exact', head: true }).eq('edizione_id', ed.id),
    supabase.from('sessione').select('id', { count: 'exact', head: true }).eq('edizione_id', ed.id).is('annullato_at', null),
    supabase.from('incarico').select('id', { count: 'exact', head: true }).eq('edizione_id', ed.id),
  ]);
  const stato = edizioneStato(ed);
  const base = `/admin/corsi/${ed.corso.id}/edizioni/${ed.id}` as const;
  const tabs = [
    { label: 'Iscritti', href: base, exact: true, count: iscritti.count ?? 0 },
    { label: 'Sessioni', href: `${base}/sessioni`, count: sessioni.count ?? 0 },
    { label: 'Docenti e tutor', href: `${base}/docenti`, count: incarichi.count ?? 0 },
    { label: 'Fondo', href: `${base}/fondo` },
    { label: 'Stato', href: `${base}/stato` },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Corsi', href: '/admin/corsi' }, { label: ed.corso.titolo, href: `/admin/corsi/${ed.corso.id}` }, { label: ed.codice }]} />
          <h1>Edizione <span className="mono" style={{ fontSize: "0.8em" }}>{ed.codice}</span></h1>
          <div className="head-chips">
            <span className={`chip ${stato === 'attiva' ? 'chip--ok' : stato === 'conclusa' ? 'chip--muted' : 'chip--err'}`}>{stato === 'attiva' && <span className="dot" />}{stato}</span>
            <span>{ed.data_inizio || ed.data_fine ? `${fmtData(ed.data_inizio)} → ${fmtData(ed.data_fine)}` : 'senza date'}</span>
            <span>· lezioni online {ed.fad_apertura || ed.fad_chiusura ? `${fmtData(ed.fad_apertura)} → ${fmtData(ed.fad_chiusura)}` : 'sempre aperte'}</span>
          </div>
        </div>
      </div>
      <Tabs items={tabs} label="Sezioni dell'edizione" />
      {children}
    </>
  );
}
