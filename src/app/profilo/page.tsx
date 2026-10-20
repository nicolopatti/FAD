import { requireSession } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { LogoutButton } from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

// Pagina minima del profilo: chi sei, con quale email entri, come uscire.
// Esiste perché la barra in basso del telefono ha una voce "Profilo".
export default async function ProfiloPage() {
  const session = await requireSession();
  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="discente">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Il tuo profilo</h1>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="page-lead">Nome</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{session.nome || '—'}</div>
          </div>
          <div>
            <div className="page-lead">Email di accesso</div>
            <div style={{ fontSize: 16, color: 'var(--ink)' }}>{session.email}</div>
          </div>
          <p className="page-lead" style={{ margin: 0 }}>
            Per cambiare nome, email o password rivolgiti al referente della formazione della tua azienda.
          </p>
          <div><LogoutButton /></div>
        </div>
      </div>
    </AppShell>
  );
}
