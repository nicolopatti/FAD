import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { fuoriIntervallo, hrefPaginaUno, intervallo, parsePagina, PER_PAGINA } from '@/lib/paginazione';
import { fmtPrezzo, intestatario } from '@/lib/vendita';
import { stripeInProva } from '@/lib/stripe';
import { ORDINE_ADMIN_SELECT, corsoDi, inizioMeseRoma, parseFiltroStato, statoVisibile, type OrdineAdmin } from '@/lib/vendite-admin';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { PagerUrl, SegUrl } from '@/components/admin/Lista';

export const dynamic = 'force-dynamic';

type Params = { stato?: string; offerta?: string; pagina?: string };

/**
 * Area Vendite (Fase 6): ordini del catalogo con stato, importo e acquirente,
 * filtri nell'URL, export per la fatturazione. Il dettaglio permette il rimborso.
 */
export default async function VenditePage(props: { searchParams?: Promise<Params> }) {
  const sp = (await props.searchParams) ?? {};
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const stato = parseFiltroStato(sp.stato);
  const pagina = parsePagina(sp.pagina);
  const [da, a] = intervallo(pagina);

  let query = supabase.from('ordine').select(ORDINE_ADMIN_SELECT, { count: 'exact' }).order('creato_il', { ascending: false });
  if (stato !== 'tutti') query = query.eq('stato', stato);
  if (sp.offerta) query = query.eq('offerta_id', sp.offerta);
  const mese = inizioMeseRoma();

  const [righeR, pagatiMese, rimborsatiMese] = await Promise.all([
    query.range(da, a).returns<OrdineAdmin[]>(),
    supabase.from('ordine').select('importo_centesimi').eq('stato', 'pagato').gte('pagato_il', mese).returns<{ importo_centesimi: number }[]>(),
    supabase.from('ordine').select('id', { count: 'exact', head: true }).eq('stato', 'rimborsato').gte('rimborsato_il', mese),
  ]);
  if (fuoriIntervallo(righeR.error)) redirect(hrefPaginaUno('/admin/vendite', sp) as Route);
  const righe = unwrap(righeR, 'gli ordini');
  const incassi = unwrap(pagatiMese, 'gli incassi');
  const incassoMese = incassi.reduce((t, o) => t + o.importo_centesimi, 0);
  const exportQs = new URLSearchParams({ ...(stato !== 'tutti' ? { stato } : {}), ...(sp.offerta ? { offerta: sp.offerta } : {}) }).toString();

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Vendite</h1>
          <p>Gli ordini del catalogo. L’iscrizione nasce quando Stripe conferma il pagamento; il rimborso revoca l’accesso al corso.</p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href={`/api/admin/vendite/export${exportQs ? `?${exportQs}` : ''}`}><Icon name="download" /> Esporta per la fatturazione</a>
        </div>
      </div>
      {stripeInProva() && <div className="banner banner--info"><Icon name="alert" className="banner__icon" /><div className="banner__body">Stripe è in modalità di prova: gli ordini non sono incassi reali.</div></div>}
      <div className="kpi-strip kpi-strip--3">
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="euro" /> Incassato questo mese</span><span className="kpi-strip__value">{fmtPrezzo(incassoMese)}</span></div>
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="check" /> Ordini pagati</span><span className="kpi-strip__value">{incassi.length}</span><span className="kpi-strip__sub">questo mese</span></div>
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="arrowLeft" /> Rimborsi</span><span className="kpi-strip__value">{rimborsatiMese.count ?? 0}</span><span className="kpi-strip__sub">questo mese</span></div>
      </div>
      <div className="toolbar">
        <SegUrl param="stato" predefinito="tutti" label="Stato" opzioni={[
          { v: 'tutti', label: 'Tutti' }, { v: 'pagato', label: 'Pagati' }, { v: 'in_attesa', label: 'In attesa' },
          { v: 'rimborsato', label: 'Rimborsati' }, { v: 'annullato', label: 'Non completati' },
        ]} />
        {sp.offerta && <Link className="chip chip--accent" href={hrefPaginaUno('/admin/vendite', { stato: sp.stato }) as Route}>solo un’offerta ✕</Link>}
      </div>
      {righe.length === 0 ? (
        <div className="empty">
          <Icon name="euro" className="empty__icon" />
          <div className="empty__t">Nessun ordine</div>
          <div className="empty__s">Gli ordini compaiono qui quando qualcuno acquista un corso dal catalogo. Si mette in vendita un’edizione dalla sua scheda “Vendita”.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="tbl-wrap"><table className="tbl tbl--zebra tbl--lista">
              <thead><tr><th>Data</th><th>Acquirente</th><th>Corso</th><th>Importo</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {righe.map((o) => {
                  const st = statoVisibile(o);
                  const href = `/admin/vendite/${o.id}` as const;
                  return (
                    <tr key={o.id}>
                      <td className="muted">{fmtDataOra(o.pagato_il ?? o.creato_il)}</td>
                      <td className="t-title"><Link className="t-link" href={href}>{intestatario(o.fatturazione)}</Link><div className="muted" style={{ fontSize: 12 }}>{o.persona?.email}</div></td>
                      <td>{corsoDi(o)}<div className="muted mono" style={{ fontSize: 11 }}>{o.offerta?.edizione?.codice}</div></td>
                      <td>{fmtPrezzo(o.importo_centesimi, o.valuta)}{o.sconto_tempo_centesimi + o.sconto_centesimi > 0 && <div className="muted" style={{ fontSize: 12 }}>sconto {fmtPrezzo(o.sconto_tempo_centesimi + o.sconto_centesimi, o.valuta)}</div>}</td>
                      <td><span className={`chip ${st.cls}`}>{st.label}</span></td>
                      <td><Link className="btn btn--ghost btn--xs" href={href}>Apri <Icon name="arrowRight" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
      <PagerUrl pagina={pagina} totale={righeR.count ?? righe.length} perPagina={PER_PAGINA} cosa="ordini" />
    </>
  );
}
