import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EnteRow } from '@/lib/db-types';
import { normalizzaParziale, risolviModello } from '@/lib/attestato-modello';
import { ModelloEditor } from '@/components/admin/ModelloEditor';
import { EnteForm } from './EnteForm';
import { ImpostazioniTabs } from '@/components/admin/SezioneTabs';

export const dynamic = 'force-dynamic';

// Dati dell'ente emittente e modello predefinito degli attestati.
export default async function EntePage() {
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: ente } = await supabase
    .from('tenant')
    .select('id, nome, ragione_sociale, logo_path, firmatario_nome, firmatario_ruolo, firma_path, citta, linkedin_organization_id, attestato_modello')
    .eq('id', session.tenantId)
    .maybeSingle<EnteRow & { attestato_modello: unknown }>();

  if (!ente) {
    return <div className="banner banner--err"><div className="banner__body">Dati dell&apos;ente non leggibili.</div></div>;
  }
  const datiEnte = { ragione_sociale: ente.ragione_sociale?.trim() || ente.nome, citta: ente.citta, firmatario_nome: ente.firmatario_nome, firmatario_ruolo: ente.firmatario_ruolo, logo_path: ente.logo_path, firma_path: ente.firma_path };
  const salvato = ente.attestato_modello ? normalizzaParziale(ente.attestato_modello) : null;
  const { count: nCategorie } = await supabase.from('categoria').select('id', { count: 'exact', head: true });

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Impostazioni</h1>
          <p>Dati dell&apos;ente di formazione (intestazione, firmatario, logo), modello predefinito degli attestati e categorie dei corsi. Ogni corso può avere un modello suo nella sua scheda &quot;Attestato&quot;. Le modifiche valgono per gli attestati emessi da qui in poi.</p>
        </div>
      </div>
      <ImpostazioniTabs nCategorie={nCategorie ?? 0} />
      <EnteForm ente={ente} />
      <div className="card" style={{ maxWidth: 980, marginTop: 18 }}>
        <div className="card__head"><div><h3>Modello predefinito dell&apos;attestato</h3><div className="sub">Layout, testi, loghi, firme e campi che usano tutti i corsi, salvo quelli con un modello proprio. Intestazione, luogo, logo e firmatario vuoti prendono i dati dell&apos;ente qui sopra.</div></div></div>
        <div className="card__body">
          <ModelloEditor ambito="ente" tenantId={ente.id} valore={salvato} ereditato={risolviModello(datiEnte, null, null)} />
        </div>
      </div>
    </>
  );
}
