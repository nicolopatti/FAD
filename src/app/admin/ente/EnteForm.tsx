'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { EnteRow } from '@/lib/db-types';

export function logoUrl(path?: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/loghi/${path}` : null;
}

export function EnteForm({ ente }: { ente: EnteRow }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [f, setF] = useState({
    ragione_sociale: ente.ragione_sociale ?? ente.nome ?? '',
    citta: ente.citta ?? '',
    firmatario_nome: ente.firmatario_nome ?? '',
    firmatario_ruolo: ente.firmatario_ruolo ?? '',
    linkedin_organization_id: ente.linkedin_organization_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const firmaRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function patch(body: Record<string, string | null>, successo: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/admin/ente', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(successo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!f.ragione_sociale.trim()) { setError('La ragione sociale è obbligatoria: è l’intestazione dell’attestato.'); return; }
    await patch({ ...f, linkedin_organization_id: f.linkedin_organization_id.trim() || null }, 'Dati dell’ente salvati.');
  }

  async function carica(file: File, cosa: 'logo' | 'firma') {
    if (!file.type.startsWith('image/')) { setError('Serve un’immagine (PNG o JPG).'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('L’immagine supera i 2 MB.'); return; }
    setBusy(true); setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${ente.id}/${cosa}-${Date.now()}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage.from('loghi').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      await patch({ [cosa === 'logo' ? 'logo_path' : 'firma_path']: path }, cosa === 'logo' ? 'Logo aggiornato.' : 'Firma aggiornata.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const logo = logoUrl(ente.logo_path);
  const firma = logoUrl(ente.firma_path);

  return (
    <form className="card" onSubmit={salva} noValidate style={{ maxWidth: 820 }}>
      <div className="card__head"><div><h3>Dati dell&apos;ente</h3><div className="sub">Compaiono nell&apos;intestazione e in calce all&apos;attestato, e nella pagina pubblica di verifica.</div></div></div>
      <div className="card__body">
        {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}
        <div className="grid-2-380">
          <div>
            <Field id="en-rs" label="Ragione sociale" required>
              <input id="en-rs" className="input" value={f.ragione_sociale} onChange={set('ragione_sociale')} disabled={busy} placeholder="es. Eurita Formazione S.r.l." />
            </Field>
            <Field id="en-citta" label="Città" hint="Luogo di emissione in calce all’attestato.">
              <input id="en-citta" className="input" value={f.citta} onChange={set('citta')} disabled={busy} placeholder="es. Milano" />
            </Field>
            <Field id="en-fn" label="Firmatario" hint="Chi firma l’attestato.">
              <input id="en-fn" className="input" value={f.firmatario_nome} onChange={set('firmatario_nome')} disabled={busy} placeholder="es. Carla Bianchi" />
            </Field>
            <Field id="en-fr" label="Ruolo del firmatario">
              <input id="en-fr" className="input" value={f.firmatario_ruolo} onChange={set('firmatario_ruolo')} disabled={busy} placeholder="es. Responsabile del progetto formativo" />
            </Field>
            <Field id="en-li" label="ID pagina LinkedIn" hint="Facoltativo: il numero nell’indirizzo della pagina aziendale (linkedin.com/company/12345). Con l’ID, la certificazione sul profilo del discente risulta collegata alla vostra pagina.">
              <input id="en-li" className="input mono" value={f.linkedin_organization_id} onChange={set('linkedin_organization_id')} disabled={busy} placeholder="es. 12345678" inputMode="numeric" />
            </Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Logo</label>
              <div className="dropzone dropzone--filled" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="Logo dell'ente" style={{ maxHeight: 96, maxWidth: '90%', objectFit: 'contain' }} /> : <span className="muted">Nessun logo</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => logoRef.current?.click()}><Icon name="upload" /> {logo ? 'Sostituisci' : 'Carica logo'}</button>
                {logo && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => patch({ logo_path: null }, 'Logo rimosso.')}>Rimuovi</button>}
              </div>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) carica(file, 'logo'); e.target.value = ''; }} />
              <div className="field__hint">PNG o JPG, sfondo bianco o trasparente, max 2 MB.</div>
            </div>
            <div className="field">
              <label>Firma (immagine)</label>
              <div className="dropzone dropzone--filled" style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {firma ? <img src={firma} alt="Firma" style={{ maxHeight: 70, maxWidth: '90%', objectFit: 'contain' }} /> : <span className="muted">Nessuna firma: resta la riga con nome e ruolo</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => firmaRef.current?.click()}><Icon name="upload" /> {firma ? 'Sostituisci' : 'Carica firma'}</button>
                {firma && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => patch({ firma_path: null }, 'Firma rimossa.')}>Rimuovi</button>}
              </div>
              <input ref={firmaRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) carica(file, 'firma'); e.target.value = ''; }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}><button type="submit" className="btn" disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button></div>
      </div>
    </form>
  );
}
