import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fmtPrezzo, intestatario, scorporoIva } from '@/lib/vendita';
import { stripeInProva } from '@/lib/stripe';
import { ORDINE_ADMIN_SELECT, corsoDi, statoVisibile, type OrdineAdmin } from '@/lib/vendite-admin';
import { Crumb } from '@/components/AppShell';
import { fmtDataOra } from '@/components/admin/Atlante';
import { RimborsoPanel } from './RimborsoPanel';

export const dynamic = 'force-dynamic';

/** Dettaglio di un ordine (Fase 6): fatturazione, consensi, pagamento, rimborso. */
export default async function OrdinePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: o } = await supabase.from('ordine').select(ORDINE_ADMIN_SELECT).eq('id', id).maybeSingle<OrdineAdmin>();
  if (!o) notFound();
  const { data: attestato } = o.iscrizione_id
    ? await supabase.from('attestato').select('numero').eq('iscrizione_id', o.iscrizione_id).is('sostituito_da', null).maybeSingle<{ numero: string }>()
    : { data: null };
  const st = statoVisibile(o);
  const f = o.fatturazione ?? {};
  const iva = scorporoIva(o.importo_centesimi, Number(o.aliquota_iva));
  const dashboard = `https://dashboard.stripe.com/${stripeInProva() ? 'test/' : ''}payments/${o.stripe_payment_intent ?? ''}`;
  const ed = o.offerta?.edizione;

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Vendite', href: '/admin/vendite' }, { label: intestatario(f) }]} />
          <h1>Ordine di {intestatario(f)}</h1>
          <div className="head-chips"><span className={`chip ${st.cls}`}>{st.label}</span><span>{corsoDi(o)}</span><span className="mono">{fmtPrezzo(o.importo_centesimi, o.valuta)}</span></div>
        </div>
      </div>
      <div className="grid-2-380">
        <div className="stack">
          <div className="card">
            <div className="card__head"><h3>Dati per la fattura</h3></div>
            <div className="card__body">
              <dl className="sintesi">
                <dt>Intestatario</dt><dd>{intestatario(f)} <span className="muted">({f.tipo === 'azienda' ? 'azienda' : 'privato'})</span></dd>
                {f.codice_fiscale && <><dt>Codice fiscale</dt><dd className="mono">{f.codice_fiscale}</dd></>}
                {f.partita_iva && <><dt>Partita IVA</dt><dd className="mono">{f.partita_iva}</dd></>}
                {f.codice_sdi && <><dt>Codice SDI</dt><dd className="mono">{f.codice_sdi}</dd></>}
                {f.pec && <><dt>PEC</dt><dd>{f.pec}</dd></>}
                <dt>Indirizzo</dt><dd>{[f.indirizzo, [f.cap, f.citta, f.provincia && `(${f.provincia})`].filter(Boolean).join(' '), f.nazione !== 'IT' ? f.nazione : null].filter(Boolean).join(', ')}</dd>
                <dt>Account</dt><dd>{o.persona ? <Link href={`/admin/persone/${o.persona.id}`}>{o.persona.cognome} {o.persona.nome}</Link> : '—'} <span className="muted">{o.persona?.email}</span></dd>
              </dl>
            </div>
          </div>
          <div className="card">
            <div className="card__head"><h3>Importi</h3></div>
            <div className="card__body">
              <dl className="sintesi">
                <dt>Totale pagato</dt><dd><strong>{fmtPrezzo(o.importo_centesimi, o.valuta)}</strong></dd>
                {o.sconto_centesimi > 0 && <><dt>Sconto</dt><dd>{fmtPrezzo(o.sconto_centesimi, o.valuta)}</dd></>}
                {Number(o.aliquota_iva) > 0
                  ? <><dt>Imponibile</dt><dd>{fmtPrezzo(iva.imponibile, o.valuta)}</dd><dt>IVA {Number(o.aliquota_iva)}%</dt><dd>{fmtPrezzo(iva.iva, o.valuta)}</dd></>
                  : <><dt>IVA</dt><dd>{o.natura_iva ?? 'non applicata'}</dd></>}
              </dl>
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card__head"><h3>Pagamento</h3></div>
            <div className="card__body">
              <dl className="sintesi">
                <dt>Creato</dt><dd>{fmtDataOra(o.creato_il)}</dd>
                {o.pagato_il && <><dt>Pagato</dt><dd>{fmtDataOra(o.pagato_il)}</dd></>}
                {o.rimborsato_il && <><dt>Rimborsato</dt><dd>{fmtDataOra(o.rimborsato_il)}</dd></>}
                {o.stripe_payment_intent && <><dt>Stripe</dt><dd><a href={dashboard} target="_blank" rel="noreferrer" className="mono">{o.stripe_payment_intent}</a></dd></>}
                <dt>Iscrizione</dt><dd>{ed && o.iscrizione_id ? <Link href={`/admin/corsi/${ed.corso?.id}/edizioni/${ed.id}`}>edizione {ed.codice}</Link> : '—'}</dd>
                <dt>Attestato</dt><dd>{attestato ? `n. ${attestato.numero}` : '—'}</dd>
                <dt>Consensi</dt><dd>{o.consensi ? Object.entries(o.consensi).filter(([k]) => k !== 'accettati_il').map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}{o.consensi?.accettati_il ? <div className="muted" style={{ fontSize: 12 }}>accettati il {fmtDataOra(o.consensi.accettati_il)}</div> : null}</dd>
              </dl>
            </div>
          </div>
          {o.stato === 'pagato' && <RimborsoPanel ordineId={o.id} importo={fmtPrezzo(o.importo_centesimi, o.valuta)} attestato={attestato?.numero ?? null} />}
        </div>
      </div>
    </>
  );
}
