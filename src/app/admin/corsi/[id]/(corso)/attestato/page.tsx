import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CorsoRow } from '@/lib/db-types';
import { datiEnteDa, ENTE_SELECT, normalizzaParziale, risolviModello, type EnteTenantRow } from '@/lib/attestato-modello';
import { ModelloEditor } from '@/components/admin/ModelloEditor';
import { FormAttestato } from '../../_components/FormAttestato';

export const dynamic = 'force-dynamic';

/** Scheda "Attestato" del corso: dati (ore, riferimento, rilascio) e modello grafico. */
export default async function CorsoAttestatoPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, ore_totali, riferimento_normativo, politica_attestato, attestato_modello, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();

  const [{ count }, { data: ente }] = await Promise.all([
    supabase.from('edizione').select('id', { count: 'exact', head: true }).eq('corso_id', corso.id),
    supabase.from('tenant').select(ENTE_SELECT).eq('id', corso.tenant_id).maybeSingle<EnteTenantRow>(),
  ]);
  const frozen = (count ?? 0) > 0;
  const modelloEnte = risolviModello(datiEnteDa(ente), ente?.attestato_modello ?? null, null);
  const modelloCorso = corso.attestato_modello ? normalizzaParziale(corso.attestato_modello) : null;

  return (
    <>
      <FormAttestato corso={corso} frozen={frozen} />
      {(corso.politica_attestato ?? 'manuale') !== 'nessuna' && (
        <div className="card">
          <div className="card__head"><div><h3>Modello grafico</h3><div className="sub">Come appare l&apos;attestato di questo corso: layout, testi, loghi e firme. Si può cambiare anche a corso attivo; vale per gli attestati emessi da quel momento. Senza modello specifico si usa quello dell&apos;ente (Impostazioni).</div></div></div>
          <div className="card__body">
            <ModelloEditor ambito="corso" tenantId={corso.tenant_id} corsoId={corso.id} valore={modelloCorso} ereditato={modelloEnte} />
          </div>
        </div>
      )}
    </>
  );
}
