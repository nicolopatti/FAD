import Link from 'next/link';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell, Ico } from '@/components/AppShell';
import { LogoutButton } from '@/components/LogoutButton';
import { fmtData } from '@/components/admin/Atlante';
import { linkedInAddToProfileUrl } from '@/lib/attestati';
import { appBaseUrl } from '@/lib/url';
import type { AttestatoRow } from '@/lib/db-types';
import { ProfiloForm } from './ProfiloForm';
import { PasswordForm } from './PasswordForm';

export const dynamic = 'force-dynamic';

// Profilo del discente: chi sei, dati per l'attestato, i tuoi attestati, uscita.
export default async function ProfiloPage() {
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  const [{ data: persona }, { data: attestati }] = await Promise.all([
    supabase.from('persona').select('data_nascita, luogo_nascita').eq('id', session.personaId).maybeSingle<{ data_nascita: string | null; luogo_nascita: string | null }>(),
    supabase.from('attestato').select('*').eq('persona_id', session.personaId).order('emesso_at', { ascending: false }).returns<AttestatoRow[]>(),
  ]);
  const validi = (attestati ?? []).filter((a) => !a.sostituito_da);

  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Il tuo profilo</h1>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="page-lead">Nome</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{session.nome || '—'} {session.cognome}</div>
          </div>
          <div>
            <div className="page-lead">Email di accesso</div>
            <div style={{ fontSize: 16, color: 'var(--ink)' }}>{session.email}</div>
          </div>
          <p className="page-lead" style={{ margin: 0 }}>
            Per cambiare nome o email rivolgiti al referente della formazione della tua azienda.
          </p>
          <PasswordForm />
          <div><LogoutButton /></div>
        </div>

        <ProfiloForm dataNascita={persona?.data_nascita ?? null} luogoNascita={persona?.luogo_nascita ?? null} />

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="attestati">
          <h2 id="attestati" style={{ fontSize: 18, margin: 0 }}>I tuoi attestati</h2>
          {validi.length === 0 ? (
            <p className="page-lead" style={{ margin: 0 }}>Nessun attestato per ora: compare qui quando completi un corso che lo prevede.</p>
          ) : (
            <ul className="attestati-list">
              {validi.map((a) => {
                const c = a.contenuto as { corso?: { titolo?: string } };
                return (
                  <li key={a.id} className="attestati-list__item">
                    <div className="attestati-list__icon"><Ico name="cap" size={18} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.corso?.titolo ?? 'Corso'}</div>
                      <div className="page-lead">n. {a.numero} · {fmtData(a.emesso_at)} · <Link href={`/corsi/${a.edizione_id}`}>vai al corso</Link></div>
                    </div>
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <a className="btn btn--sm" href={`/api/attestati/${a.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                      <a className="btn btn--sm btn--ghost" href={linkedInAddToProfileUrl(a, appBaseUrl())} target="_blank" rel="noreferrer">LinkedIn</a>
                      <a className="btn btn--sm btn--ghost" href={`/api/attestati/${a.id}/badge`} target="_blank" rel="noreferrer">Badge</a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
