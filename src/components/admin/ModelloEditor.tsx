'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LAYOUT_LABEL, type Firmatario, type LayoutAttestato, type ModelloAttestato, type ModelloParziale } from '@/lib/attestato-modello';
import { urlLogo } from '@/lib/url';

export function loghiUrl(path?: string | null): string | null {
  return urlLogo(path);
}

const MOSTRA_LABEL: Record<keyof ModelloAttestato['mostra'], string> = {
  nascita: 'Data e luogo di nascita',
  ore: 'Ore totali',
  riferimento: 'Riferimento normativo',
  edizione: 'Edizione e date',
  esito_test: 'Esito del test finale',
  lezioni: 'Elenco delle lezioni',
  qr: 'Codice QR di verifica',
};

type Props = {
  ambito: 'ente' | 'corso';
  tenantId: string;
  corsoId?: string;
  /** Modello salvato (parziale) per questo ambito; null = nessuna personalizzazione. */
  valore: ModelloParziale | null;
  /** Modello risolto che vale se non si personalizza (per il corso: quello dell'ente). */
  ereditato: ModelloAttestato;
};

/**
 * Editor del modello dell'attestato: layout, testi, loghi, firmatari, campi.
 * Per l'ente definisce il predefinito; per il corso una versione specifica che
 * sostituisce il predefinito. Anteprima PDF dal server con dati d'esempio.
 */
export function ModelloEditor({ ambito, tenantId, corsoId, valore, ereditato }: Props) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [attivo, setAttivo] = useState(ambito === 'ente' || valore != null);
  const [m, setM] = useState<ModelloAttestato>(() => ({ ...ereditato, ...(valore ?? {}), mostra: { ...ereditato.mostra, ...(valore?.mostra ?? {}) }, firmatari: valore?.firmatari ?? ereditato.firmatari, loghi_secondari: valore?.loghi_secondari ?? ereditato.loghi_secondari }));
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [caricandoAnteprima, setCaricandoAnteprima] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState<{ tipo: 'logo' | 'secondario' | 'firma'; indice?: number } | null>(null);

  const set = <K extends keyof ModelloAttestato>(k: K, v: ModelloAttestato[K]) => setM((cur) => ({ ...cur, [k]: v }));
  const setMostra = (k: keyof ModelloAttestato['mostra'], v: boolean) => setM((cur) => ({ ...cur, mostra: { ...cur.mostra, [k]: v } }));

  function apriFile(s: { tipo: 'logo' | 'secondario' | 'firma'; indice?: number }) {
    setSlot(s);
    fileRef.current?.click();
  }

  async function carica(file: File) {
    if (!slot) return;
    if (!file.type.startsWith('image/')) { setErrore('Serve un’immagine (PNG o JPG).'); return; }
    if (file.size > 2 * 1024 * 1024) { setErrore('L’immagine supera i 2 MB.'); return; }
    setBusy(true); setErrore(null);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const base = ambito === 'corso' ? `corso-${corsoId}` : 'ente';
      const path = `${tenantId}/${base}-${slot.tipo}${slot.indice != null ? `-${slot.indice}` : ''}-${Date.now()}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage.from('loghi').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      if (slot.tipo === 'logo') set('logo_path', path);
      else if (slot.tipo === 'secondario') setM((cur) => { const l = [...cur.loghi_secondari]; if (slot.indice != null && slot.indice < l.length) l[slot.indice] = path; else l.push(path); return { ...cur, loghi_secondari: l.slice(0, 3) }; });
      else if (slot.tipo === 'firma' && slot.indice != null) setM((cur) => ({ ...cur, firmatari: cur.firmatari.map((f, i) => (i === slot.indice ? { ...f, firma_path: path } : f)) }));
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); setSlot(null); }
  }

  function parziale(): ModelloParziale {
    return {
      layout: m.layout, titolo: m.titolo, intro: m.intro, frase: m.frase, testo_aggiuntivo: m.testo_aggiuntivo,
      intestazione: m.intestazione, citta: m.citta, logo_path: m.logo_path, loghi_secondari: m.loghi_secondari,
      firmatari: m.firmatari.filter((f) => f.nome.trim()), mostra: m.mostra,
    };
  }

  async function salva(modello: ModelloParziale | null) {
    setBusy(true); setErrore(null);
    try {
      const url = ambito === 'ente' ? '/api/admin/ente' : `/api/admin/corsi/${corsoId}`;
      const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attestato_modello: modello }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(modello ? 'Modello dell’attestato salvato. Vale per gli attestati emessi da adesso.' : 'Il corso torna a usare il modello dell’ente.');
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function mostraAnteprima() {
    setCaricandoAnteprima(true); setErrore(null);
    try {
      const res = await fetch('/api/admin/attestati/anteprima', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modello: attivo ? parziale() : null, corso_id: corsoId ?? null, ambito }) });
      if (!res.ok) throw new Error('Anteprima non disponibile in questo momento.');
      const blob = await res.blob();
      if (anteprima) URL.revokeObjectURL(anteprima);
      setAnteprima(URL.createObjectURL(blob));
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setCaricandoAnteprima(false); }
  }

  async function tornaAlPredefinito() {
    // Mai salvato un modello del corso: si spegne e basta, non c'è niente da togliere.
    if (valore == null) { setAttivo(false); setM({ ...ereditato }); return; }
    if (!(await confirm({ titolo: 'Tornare al modello dell’ente?', messaggio: 'Le personalizzazioni di questo corso vengono tolte. Gli attestati già emessi non cambiano.', conferma: 'Torna al predefinito' }))) return;
    setAttivo(false);
    setM({ ...ereditato });
    await salva(null);
  }

  const firmatarioVuoto: Firmatario = { nome: '', ruolo: '', firma_path: null };

  return (
    <div className="modello-ed">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) carica(f); e.target.value = ''; }} />
      {errore && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{errore}</div></div>}

      {ambito === 'corso' && (
        <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Modello specifico per questo corso</div>
            <div className="muted" style={{ fontSize: 12 }}>Spento: l&apos;attestato usa il modello predefinito dell&apos;ente (pagina Ente). Acceso: layout, testi, loghi e firme sono quelli impostati qui.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={attivo} onChange={(e) => { if (e.target.checked) setAttivo(true); else tornaAlPredefinito(); }} disabled={busy} />
            <span className="switch__track" />
          </label>
        </div>
      )}

      {attivo && (
        <>
          <h4 style={{ margin: '0 0 8px' }}>Modello grafico</h4>
          <div className="layout-pick" role="radiogroup" aria-label="Modello grafico">
            {(Object.keys(LAYOUT_LABEL) as LayoutAttestato[]).map((l) => (
              <label key={l} className={`layout-pick__item${m.layout === l ? ' is-active' : ''}`}>
                <input type="radio" name={`layout-${ambito}`} value={l} checked={m.layout === l} onChange={() => set('layout', l)} disabled={busy} />
                <span className={`layout-pick__thumb layout-pick__thumb--${l}`} aria-hidden="true"><i /><i /><i /></span>
                <span className="layout-pick__name">{LAYOUT_LABEL[l].nome}</span>
                <span className="layout-pick__desc">{LAYOUT_LABEL[l].descrizione}</span>
              </label>
            ))}
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Testi</h4>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field id={`${ambito}-titolo`} label="Titolo del documento">
              <input id={`${ambito}-titolo`} className="input" value={m.titolo} onChange={(e) => set('titolo', e.target.value)} disabled={busy} maxLength={90} />
            </Field>
            <Field id={`${ambito}-intro`} label="Frase introduttiva" hint="Prima del nome del discente.">
              <input id={`${ambito}-intro`} className="input" value={m.intro} onChange={(e) => set('intro', e.target.value)} disabled={busy} maxLength={120} />
            </Field>
          </div>
          <Field id={`${ambito}-frase`} label="Frase di completamento" hint="Tra il nome e il titolo del corso. Segnaposto disponibili: {nome}, {corso}, {ore}, {ente}, {edizione}, {data}.">
            <input id={`${ambito}-frase`} className="input" value={m.frase} onChange={(e) => set('frase', e.target.value)} disabled={busy} maxLength={200} />
          </Field>
          <Field id={`${ambito}-agg`} label="Testo aggiuntivo" hint="Facoltativo: programma, riferimenti, note. Va a capo con Invio.">
            <textarea id={`${ambito}-agg`} className="textarea" rows={3} value={m.testo_aggiuntivo} onChange={(e) => set('testo_aggiuntivo', e.target.value)} disabled={busy} maxLength={900} />
          </Field>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field id={`${ambito}-int`} label="Intestazione" hint="Chi rilascia l’attestato (di norma la ragione sociale dell’ente).">
              <input id={`${ambito}-int`} className="input" value={m.intestazione} onChange={(e) => set('intestazione', e.target.value)} disabled={busy} maxLength={120} />
            </Field>
            <Field id={`${ambito}-citta`} label="Luogo di emissione">
              <input id={`${ambito}-citta`} className="input" value={m.citta} onChange={(e) => set('citta', e.target.value)} disabled={busy} maxLength={80} />
            </Field>
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Loghi</h4>
          <div className="loghi-ed">
            <div className="loghi-ed__slot">
              <div className="loghi-ed__box">{loghiUrl(m.logo_path) ?   <img src={loghiUrl(m.logo_path)!} alt="Logo principale" /> : <span className="muted">Logo principale</span>}</div>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn--secondary btn--xs" disabled={busy} onClick={() => apriFile({ tipo: 'logo' })}><Icon name="upload" /> {m.logo_path ? 'Sostituisci' : 'Carica'}</button>
                {m.logo_path && <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => set('logo_path', null)}>Togli</button>}
              </div>
              <div className="field__hint">Principale, in alto.</div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="loghi-ed__slot">
                <div className="loghi-ed__box loghi-ed__box--sm">{m.loghi_secondari[i] ?   <img src={loghiUrl(m.loghi_secondari[i])!} alt={`Logo secondario ${i + 1}`} /> : <span className="muted">Logo {i + 1}</span>}</div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn--secondary btn--xs" disabled={busy || (i > m.loghi_secondari.length)} onClick={() => apriFile({ tipo: 'secondario', indice: i })}><Icon name="upload" /> {m.loghi_secondari[i] ? 'Sostituisci' : 'Carica'}</button>
                  {m.loghi_secondari[i] && <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => set('loghi_secondari', m.loghi_secondari.filter((_, j) => j !== i))}>Togli</button>}
                </div>
                <div className="field__hint">{i === 0 ? 'Secondari, in basso (fondo, partner, accreditamento).' : ''}</div>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '18px 0 8px' }}>Firmatari</h4>
          {m.firmatari.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Nessun firmatario: l&apos;attestato esce senza riga di firma.</div>}
          {m.firmatari.map((f, i) => (
            <div key={i} className="firma-ed">
              <Field id={`${ambito}-f-nome-${i}`} label={`Firmatario ${i + 1}`}>
                <input id={`${ambito}-f-nome-${i}`} className="input" value={f.nome} onChange={(e) => set('firmatari', m.firmatari.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} disabled={busy} placeholder="Nome e cognome" maxLength={80} />
              </Field>
              <Field id={`${ambito}-f-ruolo-${i}`} label="Ruolo">
                <input id={`${ambito}-f-ruolo-${i}`} className="input" value={f.ruolo} onChange={(e) => set('firmatari', m.firmatari.map((x, j) => (j === i ? { ...x, ruolo: e.target.value } : x)))} disabled={busy} placeholder="es. Responsabile del progetto formativo" maxLength={100} />
              </Field>
              <div className="field">
                <label>Firma</label>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  {loghiUrl(f.firma_path) &&   <img src={loghiUrl(f.firma_path)!} alt="" style={{ height: 34, maxWidth: 120, objectFit: 'contain', background: '#fff', borderRadius: 6 }} />}
                  <button type="button" className="btn btn--secondary btn--xs" disabled={busy} onClick={() => apriFile({ tipo: 'firma', indice: i })}><Icon name="upload" /> {f.firma_path ? 'Sostituisci' : 'Immagine'}</button>
                  {f.firma_path && <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => set('firmatari', m.firmatari.map((x, j) => (j === i ? { ...x, firma_path: null } : x)))}>Togli</button>}
                  <button type="button" className="icon-btn" title="Rimuovi firmatario" aria-label={`Rimuovi firmatario ${i + 1}`} disabled={busy} onClick={() => set('firmatari', m.firmatari.filter((_, j) => j !== i))}><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ))}
          {m.firmatari.length < 2 && (
            <div><button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => set('firmatari', [...m.firmatari, firmatarioVuoto])}><Icon name="plus" /> Aggiungi firmatario</button></div>
          )}

          <h4 style={{ margin: '18px 0 8px' }}>Cosa mostrare</h4>
          <div className="mostra-ed">
            {(Object.keys(MOSTRA_LABEL) as (keyof ModelloAttestato['mostra'])[]).map((k) => (
              <label key={k} className="mostra-ed__item">
                <span>{MOSTRA_LABEL[k]}</span>
                <span className="switch"><input type="checkbox" checked={m.mostra[k]} onChange={(e) => setMostra(k, e.target.checked)} disabled={busy} /><span className="switch__track" /></span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="row row--wrap" style={{ marginTop: 18, gap: 8 }}>
        {attivo && <button type="button" className="btn" disabled={busy} onClick={() => salva(parziale())}>{busy ? 'Salvo…' : 'Salva modello'}</button>}
        <button type="button" className="btn btn--secondary" disabled={busy || caricandoAnteprima} onClick={mostraAnteprima}><Icon name="documento" /> {caricandoAnteprima ? 'Preparo l’anteprima…' : 'Anteprima PDF'}</button>
        {ambito === 'corso' && attivo && valore != null && <button type="button" className="btn btn--ghost" disabled={busy} onClick={tornaAlPredefinito}>Torna al modello dell&apos;ente</button>}
      </div>
      {anteprima && (
        <div className="anteprima-pdf">
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Anteprima con dati d&apos;esempio: &quot;Maria Esempio&quot;, numero e codice fittizi.</span>
            <a className="btn btn--ghost btn--xs" href={anteprima} target="_blank" rel="noreferrer">Apri in una scheda</a>
          </div>
          <iframe src={anteprima} title="Anteprima dell'attestato" />
        </div>
      )}
    </div>
  );
}
