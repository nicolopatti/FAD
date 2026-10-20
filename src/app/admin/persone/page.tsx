import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { PersonaRiepilogo } from '@/lib/db-types';
import { PersoneTabs } from '@/components/admin/SezioneTabs';
import { fuoriIntervallo, hrefPaginaUno, intervallo, parsePagina, PER_PAGINA } from '@/lib/paginazione';
import { PersoneLista, type AccessoF } from './PersoneLista';

export const dynamic = 'force-dynamic';

type Params = { q?: string; accesso?: string; ruolo?: string; pagina?: string };

/**
 * Anagrafica delle persone del tenant (discenti, docenti, tutor): lista
 * filtrata e paginata sul server sulla vista `persona_riepilogo`.
 */
export default async function PersonePage({ searchParams }: { searchParams?: Params }) {
  await requireAdmin();
  const sp = searchParams ?? {};
  const q = (sp.q ?? '').trim().slice(0, 80);
  const accesso: AccessoF = sp.accesso === 'si' || sp.accesso === 'no' ? sp.accesso : 'tutti';
  const ruolo = sp.ruolo === 'docenti' ? 'docenti' : sp.ruolo === 'senza' ? 'senza' : 'tutti';
  const pagina = parsePagina(sp.pagina);
  const supabase = createSupabaseServerClient();

  let query = supabase.from('persona_riepilogo').select('*', { count: 'exact' }).order('cognome').order('nome');
  if (q) {
    const like = `%${q.replace(/[%_,]/g, ' ')}%`;
    query = query.or(`cognome.ilike.${like},nome.ilike.${like},email.ilike.${like},codice_fiscale.ilike.${like}`);
  }
  if (accesso === 'si') query = query.eq('accesso', true);
  if (accesso === 'no') query = query.eq('accesso', false);
  if (ruolo === 'docenti') query = query.gt('n_incarichi', 0);
  if (ruolo === 'senza') query = query.eq('n_iscrizioni', 0).eq('n_incarichi', 0);
  const [da, a] = intervallo(pagina);

  const [righeR, personeTot, aziendeTot, senzaAccesso] = await Promise.all([
    query.range(da, a).returns<PersonaRiepilogo[]>(),
    supabase.from('persona').select('id', { count: 'exact', head: true }),
    supabase.from('azienda').select('id', { count: 'exact', head: true }),
    supabase.from('persona').select('id', { count: 'exact', head: true }).is('auth_user_id', null),
  ]);
  if (fuoriIntervallo(righeR.error)) redirect(hrefPaginaUno('/admin/persone', sp));
  const righe = unwrap(righeR, 'le persone');

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Persone</h1>
          <p>Tutte le persone in anagrafica: chi è iscritto a un corso, chi insegna, chi non è ancora stato invitato. Le persone nascono dalle iscrizioni e dagli incarichi.</p>
        </div>
      </div>
      <PersoneTabs nPersone={personeTot.count ?? 0} nAziende={aziendeTot.count ?? 0} />
      <PersoneLista righe={righe} totale={righeR.count ?? righe.length} pagina={pagina} perPagina={PER_PAGINA} q={q} senzaAccesso={senzaAccesso.count ?? 0} totalePersone={personeTot.count ?? 0} />
    </>
  );
}
