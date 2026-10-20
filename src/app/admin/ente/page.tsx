import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EnteRow } from '@/lib/db-types';
import { EnteForm } from './EnteForm';

export const dynamic = 'force-dynamic';

// Dati dell'ente emittente: intestazione, firmatario, logo e firma degli attestati.
export default async function EntePage() {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: ente } = await supabase
    .from('tenant')
    .select('id, nome, ragione_sociale, logo_path, firmatario_nome, firmatario_ruolo, firma_path, citta, linkedin_organization_id')
    .eq('id', session.tenantId)
    .maybeSingle<EnteRow>();

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Amministrazione</span>
          <h1>Ente</h1>
          <p>Intestazione, firmatario e logo che compaiono sugli attestati. Valgono per gli attestati emessi da qui in poi: quelli già emessi restano come sono.</p>
        </div>
      </div>
      {ente ? <EnteForm ente={ente} /> : <div className="banner banner--err"><div className="banner__body">Dati dell&apos;ente non leggibili.</div></div>}
    </>
  );
}
