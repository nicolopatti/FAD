'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { Field, focusPrimoErrore } from '@/components/admin/Form';
import { useCall, ErroreCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { useFeedback } from '@/components/ui/Feedback';
import type { Errori } from '@/lib/validazione';
import { giornoRoma } from '@/lib/finestra';
import {
  fmtPrezzo, parsePrezzo, prezzoPerCampo, scorporoIva, slugDa, validaOfferta,
  type OffertaInput, type OffertaRow,
} from '@/lib/vendita';

export type RiepilogoOrdini = { pagati: number; in_attesa: number; rimborsati: number; incasso_centesimi: number };

type Props = {
  edizioneId: string;
  attiva: boolean;
  edizione: { data_inizio: string | null; data_fine: string | null; fad_chiusura: string | null };
  corso: { titolo: string; descrizione: string | null; politica_attestato: string | null; ore_totali: number | null };
  offerta: OffertaRow | null;
  riepilogo: RiepilogoOrdini;
  hostCollegato: boolean;
  host: string;
};

const STATO_CHIP: Record<OffertaRow['stato'], { cls: string; label: string }> = {
  bozza: { cls: 'chip--muted', label: 'bozza' },
  pubblicata: { cls: 'chip--ok', label: 'in vendita' },
  ritirata: { cls: 'chip--err', label: 'ritirata' },
};

function iniziale(o: OffertaRow | null, titolo: string): OffertaInput {
  if (!o) return { slug: slugDa(titolo), prezzo: '', aliquota_iva: '22', natura_iva: '', posti_max: '', accesso_giorni: '365', tipo: 'online', vendita_dal: '', vendita_al: '', codici_sconto: false, titolo_pubblico: '', descrizione_pubblica: '' };
  return {
    slug: o.slug,
    prezzo: prezzoPerCampo(o.prezzo_centesimi),
    aliquota_iva: String(o.aliquota_iva),
    natura_iva: o.natura_iva ?? '',
    posti_max: o.posti_max != null ? String(o.posti_max) : '',
    accesso_giorni: o.accesso_giorni != null ? String(o.accesso_giorni) : '365',
    tipo: o.accesso_giorni == null ? 'date' : 'online',
    vendita_dal: o.vendita_dal ?? '',
    vendita_al: o.vendita_al ?? '',
    codici_sconto: o.codici_sconto,
    titolo_pubblico: o.titolo_pubblico ?? '',
    descrizione_pubblica: o.descrizione_pubblica ?? '',
  };
}

/**
 * Offerta dell'edizione: cosa si vende, a che prezzo, per quanto tempo. Si salva
 * in bozza, poi si pubblica nel catalogo; ritirarla chiude la vendita (gli
 * ordini già pagati restano).
 */
export function VenditaPanel({ edizioneId, attiva, edizione, corso, offerta, riepilogo, hostCollegato, host }: Props) {
  const { call, busy, error, setError } = useCall();
  const { confirm } = useFeedback();
  const [v, setV] = useState<OffertaInput>(() => iniziale(offerta, corso.titolo));
  const [errs, setErrs] = useState<Errori>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [oggi] = useState(() => giornoRoma());

  const set = <K extends keyof OffertaInput>(k: K, val: OffertaInput[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    if (errs[k as string]) setErrs((e) => ({ ...e, [k as string]: '' }));
  };

  const prezzo = parsePrezzo(v.prezzo);
  const aliquota = Number(String(v.aliquota_iva ?? '22').replace(',', '.')) || 0;
  const iva = prezzo != null ? scorporoIva(prezzo, aliquota) : null;

  // Corso online: chi compra a ridosso della fine dell'edizione ha meno giorni di accesso.
  const avvisoChiusura = useMemo(() => {
    const chiude = edizione.fad_chiusura ?? edizione.data_fine;
    const giorni = Number(v.accesso_giorni);
    if (v.tipo !== 'online' || !chiude || !Number.isInteger(giorni) || giorni < 1) return null;
    const limite = new Date(`${String(chiude).slice(0, 10)}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() - giorni);
    return limite.toISOString().slice(0, 10) < oggi
      ? `L’edizione chiude il ${fmtData(chiude)}: chi compra oggi avrà meno di ${giorni} giorni. Prolunga l’edizione (scheda Stato) o riduci la durata.`
      : `L’edizione chiude il ${fmtData(chiude)}: dopo il ${fmtData(limite.toISOString().slice(0, 10))} chi compra avrà meno di ${giorni} giorni.`;
  }, [v.tipo, v.accesso_giorni, edizione.fad_chiusura, edizione.data_fine, oggi]);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const { errori } = validaOfferta(v);
    setErrs(errori);
    if (Object.keys(errori).length) { focusPrimoErrore(formRef.current); return; }
    try {
      if (offerta) await call('PATCH', `/api/admin/offerte/${offerta.id}`, v, { successo: 'Offerta salvata.', quiet: true });
      else await call('POST', `/api/admin/edizioni/${edizioneId}/offerta`, v, { successo: 'Offerta creata in bozza: pubblicala quando è pronta.', quiet: true });
    } catch (err) {
      if (err instanceof ErroreCall) {
        const campo = typeof err.dati?.campo === 'string' ? err.dati.campo : null;
        const errori = (err.dati?.errori as Errori | undefined) ?? (campo ? { [campo]: err.message } : null);
        if (errori) { setErrs(errori); focusPrimoErrore(formRef.current); }
        else setError(err.message);
      }
    }
  }

  async function azione(a: 'pubblica' | 'ritira') {
    if (!offerta) return;
    if (a === 'ritira') {
      const ok = await confirm({
        titolo: 'Ritirare l’offerta dal catalogo?',
        messaggio: 'Il corso sparisce dal catalogo e non si può più acquistare. Chi ha già pagato resta iscritto. Puoi ripubblicarla quando vuoi.',
        conferma: 'Ritira',
        pericolosa: true,
      });
      if (!ok) return;
    }
    await call('PATCH', `/api/admin/offerte/${offerta.id}`, { azione: a }, { successo: a === 'pubblica' ? 'Offerta pubblicata nel catalogo.' : 'Offerta ritirata.' }).catch(() => {});
  }

  const chip = offerta ? STATO_CHIP[offerta.stato] : null;
  const errId = (k: string) => (errs[k] ? true : undefined);

  return (
    <div className="grid-2-380">
      <form ref={formRef} className="card" onSubmit={salva} noValidate>
        <div className="card__head">
          <div>
            <h3>{offerta ? 'Offerta' : 'Metti in vendita questa edizione'}</h3>
            <div className="sub">Prezzo finale IVA inclusa. L’iscrizione nasce solo quando il pagamento è confermato.</div>
          </div>
          {chip && <span className={`chip ${chip.cls}`}>{offerta?.stato === 'pubblicata' && <span className="dot" />}{chip.label}</span>}
        </div>
        <div className="card__body">
          <ErrorBanner error={error} />
          {!attiva && <div className="banner banner--ocra"><Icon name="alert" className="banner__icon" /><div className="banner__body">L’edizione non è attiva: l’offerta non si può pubblicare.</div></div>}

          <div className="field">
            <label>Cosa si vende</label>
            <div className="seg seg--mono" role="group" aria-label="Tipo di vendita">
              <button type="button" className={v.tipo === 'online' ? 'is-active' : ''} onClick={() => set('tipo', 'online')} disabled={busy}>Corso online, accesso a tempo</button>
              <button type="button" className={v.tipo === 'date' ? 'is-active' : ''} onClick={() => set('tipo', 'date')} disabled={busy}>Edizione a date</button>
            </div>
            <div className="field__hint">
              {v.tipo === 'online'
                ? 'Ognuno ha il suo accesso dal giorno dell’acquisto, entro le date dell’edizione.'
                : `Valgono le date dell’edizione (${edizione.data_inizio || edizione.data_fine ? `${fmtData(edizione.data_inizio)} → ${fmtData(edizione.data_fine)}` : 'senza date'}); la vendita chiude dopo il giorno di inizio.`}
            </div>
          </div>

          <div className="grid-2">
            <Field id="of-prezzo" label="Prezzo (€, IVA inclusa)" required error={errs.prezzo}
              hint={prezzo != null && iva ? (aliquota > 0 ? `Imponibile ${fmtPrezzo(iva.imponibile)} + IVA ${fmtPrezzo(iva.iva)}` : 'Senza IVA') : 'es. 49 o 49,90'}>
              <input id="of-prezzo" className="input" inputMode="decimal" value={v.prezzo} onChange={(e) => set('prezzo', e.target.value)} disabled={busy} aria-invalid={errId('prezzo')} placeholder="49,00" />
            </Field>
            {v.tipo === 'online' ? (
              <Field id="of-giorni" label="Giorni di accesso" required error={errs.accesso_giorni} hint="Dal giorno dell’acquisto (es. 365).">
                <input id="of-giorni" className="input" type="number" min={1} max={3650} value={v.accesso_giorni} onChange={(e) => set('accesso_giorni', e.target.value)} disabled={busy} aria-invalid={errId('accesso_giorni')} />
              </Field>
            ) : (
              <Field id="of-posti" label="Posti in vendita" error={errs.posti_max} hint="Vuoto = senza limite.">
                <input id="of-posti" className="input" type="number" min={1} value={v.posti_max} onChange={(e) => set('posti_max', e.target.value)} disabled={busy} aria-invalid={errId('posti_max')} />
              </Field>
            )}
          </div>
          {avvisoChiusura && <div className="field__hint" style={{ marginTop: -6, marginBottom: 12 }}>{avvisoChiusura}</div>}
          {v.tipo === 'online' && (
            <Field id="of-posti" label="Posti in vendita" error={errs.posti_max} hint="Vuoto = senza limite.">
              <input id="of-posti" className="input" type="number" min={1} value={v.posti_max} onChange={(e) => set('posti_max', e.target.value)} disabled={busy} aria-invalid={errId('posti_max')} style={{ maxWidth: 200 }} />
            </Field>
          )}

          <div className="grid-2">
            <Field id="of-iva" label="Aliquota IVA (%)" error={errs.aliquota_iva} hint="Da concordare col commercialista.">
              <select id="of-iva" className="select" value={String(v.aliquota_iva)} onChange={(e) => set('aliquota_iva', e.target.value)} disabled={busy}>
                <option value="22">22%</option>
                <option value="0">0% (esente / non imponibile)</option>
              </select>
            </Field>
            {aliquota === 0 && (
              <Field id="of-natura" label="Motivo dell’esenzione" required error={errs.natura_iva}>
                <input id="of-natura" className="input" value={v.natura_iva} onChange={(e) => set('natura_iva', e.target.value)} disabled={busy} aria-invalid={errId('natura_iva')} placeholder="Esente art. 10 c.1 n.20 DPR 633/72" />
              </Field>
            )}
          </div>

          <div className="grid-2">
            <Field id="of-dal" label="Vendita dal" hint="Vuoto = subito.">
              <input id="of-dal" className="input" type="date" value={v.vendita_dal} onChange={(e) => set('vendita_dal', e.target.value)} disabled={busy} />
            </Field>
            <Field id="of-al" label="Vendita fino al" error={errs.vendita_al} hint="Vuoto = finché l’edizione è aperta.">
              <input id="of-al" className="input" type="date" value={v.vendita_al} onChange={(e) => set('vendita_al', e.target.value)} disabled={busy} aria-invalid={errId('vendita_al')} />
            </Field>
          </div>

          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Codici sconto</div>
              <div className="muted" style={{ fontSize: 12 }}>Al pagamento compare il campo per un codice promozionale. I codici si creano nel pannello di Stripe.</div>
            </div>
            <label className="switch" aria-label="Codici sconto">
              <input type="checkbox" checked={Boolean(v.codici_sconto)} onChange={(e) => set('codici_sconto', e.target.checked)} disabled={busy} />
              <span className="switch__track" />
            </label>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Scheda pubblica</h4>
          <Field id="of-slug" label="Indirizzo della scheda" required error={errs.slug} hint={<>Sarà <span className="mono">/catalogo/{v.slug || '…'}</span></>}>
            <input id="of-slug" className="input mono" value={v.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} disabled={busy} aria-invalid={errId('slug')} />
          </Field>
          <Field id="of-titolo" label="Titolo nel catalogo" error={errs.titolo_pubblico} hint="Vuoto = il titolo del corso.">
            <input id="of-titolo" className="input" value={v.titolo_pubblico} onChange={(e) => set('titolo_pubblico', e.target.value)} disabled={busy} placeholder={corso.titolo} aria-invalid={errId('titolo_pubblico')} />
          </Field>
          <Field id="of-descr" label="Descrizione nel catalogo" error={errs.descrizione_pubblica} hint="Vuoto = la descrizione del corso. A capo = nuovo paragrafo.">
            <textarea id="of-descr" className="textarea" rows={6} value={v.descrizione_pubblica} onChange={(e) => set('descrizione_pubblica', e.target.value)} disabled={busy} placeholder={corso.descrizione ?? ''} />
          </Field>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className={offerta ? 'btn btn--secondary' : 'btn'} disabled={busy}>{offerta ? 'Salva le modifiche' : 'Crea l’offerta in bozza'}</button>
            {offerta && offerta.stato !== 'pubblicata' && (
              <button type="button" className="btn" onClick={() => azione('pubblica')} disabled={busy || !attiva}>Pubblica nel catalogo</button>
            )}
            {offerta?.stato === 'pubblicata' && (
              <button type="button" className="btn btn--ghost" onClick={() => azione('ritira')} disabled={busy}>Ritira dal catalogo</button>
            )}
          </div>
        </div>
      </form>

      <div className="stack">
        <div className="card">
          <div className="card__head"><h3>Ordini</h3>{offerta && <Link className="btn btn--ghost btn--sm" href={`/admin/vendite?offerta=${offerta.id}`}>Apri in Vendite</Link>}</div>
          <div className="card__body">
            {offerta ? (
              <dl className="sintesi">
                <dt>Pagati</dt><dd>{riepilogo.pagati}</dd>
                <dt>In attesa di pagamento</dt><dd>{riepilogo.in_attesa}</dd>
                <dt>Rimborsati</dt><dd>{riepilogo.rimborsati}</dd>
                <dt>Incassato</dt><dd>{fmtPrezzo(riepilogo.incasso_centesimi)}</dd>
                {offerta.posti_max != null && <><dt>Posti</dt><dd>{Math.max(offerta.posti_max - riepilogo.pagati - riepilogo.in_attesa, 0)} liberi su {offerta.posti_max}</dd></>}
              </dl>
            ) : <p className="muted" style={{ margin: 0 }}>Nessuna offerta: compila il modulo per mettere in vendita l’edizione.</p>}
          </div>
        </div>
        <div className="card">
          <div className="card__head"><h3>Prima di pubblicare</h3></div>
          <div className="card__body">
            <ul className="ready" style={{ marginBottom: 12 }}>
              <li className={corso.ore_totali ? 'is-ok' : ''}>
                <span className="ready__dot"><Icon name={corso.ore_totali ? 'check' : 'clock'} /></span>
                <span>Ore del corso {corso.ore_totali ? `indicate (${corso.ore_totali} h)` : 'non indicate: compaiono nella scheda e nell’attestato'}</span>
              </li>
              <li className={corso.politica_attestato === 'automatica' ? 'is-ok' : ''}>
                <span className="ready__dot"><Icon name={corso.politica_attestato === 'automatica' ? 'check' : 'shield'} /></span>
                <span>Attestato: {corso.politica_attestato === 'automatica' ? 'automatico al completamento' : corso.politica_attestato === 'nessuna' ? 'nessuno' : 'rilascio manuale (chi compra lo aspetta da voi)'}</span>
              </li>
              <li className={hostCollegato ? 'is-ok' : ''}>
                <span className="ready__dot"><Icon name={hostCollegato ? 'check' : 'alert'} /></span>
                <span>
                  {hostCollegato
                    ? <>Il catalogo risponde su <span className="mono">{host}</span>.</>
                    : <>L’indirizzo <span className="mono">{host || '—'}</span> non è collegato al catalogo dell’ente: va collegato una volta per indirizzo.</>}
                </span>
              </li>
            </ul>
            {offerta?.stato === 'pubblicata' && (
              <Link className="btn btn--ghost btn--sm" href={`/catalogo/${offerta.slug}`} target="_blank">Vedi la scheda pubblica <Icon name="arrowRight" /></Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
