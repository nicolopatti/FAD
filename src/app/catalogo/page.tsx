import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaCatalogo, durataAccesso, hostRichiesta, type OffertaCatalogo } from '@/lib/vetrina';
import { fmtPrezzo, motivoNonVendibile } from '@/lib/vendita';
import { fmtDurata, plurale } from '@/lib/formato';
import { Cover, coverUrl, fmtData } from '@/components/admin/Atlante';
import { Vetrina } from '@/components/vetrina/Vetrina';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const cat = await caricaCatalogo(supabase, await hostRichiesta()).catch(() => null);
  const ente = cat?.ente ?? 'Formazione';
  return { title: `Catalogo dei corsi — ${ente}`, description: `I corsi di ${ente}: online e in aula, con attestato.` };
}

function quando(o: OffertaCatalogo): string {
  if (o.tipo === 'online') return durataAccesso(o.accesso_giorni) ?? 'Online';
  if (o.data_inizio && o.data_fine && o.data_inizio !== o.data_fine) return `Dal ${fmtData(o.data_inizio)} al ${fmtData(o.data_fine)}`;
  if (o.data_inizio) return `Il ${fmtData(o.data_inizio)}`;
  return 'Date da definire';
}

/** Catalogo pubblico dell'ente (Fase 6): solo le offerte pubblicate. */
export default async function CatalogoPage(props: { searchParams: Promise<{ categoria?: string; q?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const catalogo = await caricaCatalogo(supabase, await hostRichiesta());

  if (!catalogo.ente) {
    return (
      <Vetrina ente={null}>
        <section className="vetrina__vuoto">
          <h1>Catalogo non disponibile</h1>
          <p className="page-lead">Questo indirizzo non ha un catalogo di corsi. Se sei iscritto a un corso, <Link href="/login">accedi</Link>.</p>
        </section>
      </Vetrina>
    );
  }

  const categorie = Array.from(new Set(catalogo.offerte.map((o) => o.categoria).filter((c): c is string => Boolean(c)))).sort();
  const q = (sp.q ?? '').trim().toLowerCase();
  const offerte = catalogo.offerte.filter((o) =>
    (!sp.categoria || o.categoria === sp.categoria) &&
    (!q || o.titolo.toLowerCase().includes(q) || o.descrizione.toLowerCase().includes(q)));

  return (
    <Vetrina ente={catalogo.ente}>
      <section className="vetrina__intro">
        <h1>I nostri corsi</h1>
        <p className="page-lead">Scegli un corso, iscriviti e seguilo quando vuoi: lezioni, test e attestato sono nella tua area personale.</p>
        <form className="vetrina__filtri" action="/catalogo" method="get" role="search">
          <input className="input" type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Cerca un corso" aria-label="Cerca un corso" />
          {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
          <button type="submit" className="btn btn--secondary">Cerca</button>
        </form>
        {categorie.length > 1 && (
          <div className="vetrina__cat" role="group" aria-label="Categorie">
            <Link href={q ? { pathname: '/catalogo', query: { q } } : '/catalogo'} className={!sp.categoria ? 'is-active' : ''}>Tutti</Link>
            {categorie.map((c) => (
              <Link key={c} href={{ pathname: '/catalogo', query: q ? { categoria: c, q } : { categoria: c } }} className={sp.categoria === c ? 'is-active' : ''}>{c}</Link>
            ))}
          </div>
        )}
      </section>

      {offerte.length === 0 ? (
        <p className="muted vetrina__nessuno">{catalogo.offerte.length ? 'Nessun corso corrisponde alla ricerca.' : 'Al momento non ci sono corsi in vendita. Torna a trovarci presto.'}</p>
      ) : (
        <ul className="vetrina__griglia">
          {offerte.map((o) => {
            const durata = fmtDurata(o.durata_secondi);
            return (
              <li key={o.slug}>
                <Link href={`/catalogo/${o.slug}`} className="offerta-card">
                  <Cover categoria={o.categoria} src={coverUrl(o.cover_path)} className="offerta-card__cover" />
                  <div className="offerta-card__body">
                    {o.categoria && <span className="offerta-card__cat">{o.categoria}</span>}
                    <h2 className="offerta-card__titolo">{o.titolo}</h2>
                    <p className="offerta-card__descr">{o.descrizione}</p>
                    <ul className="offerta-card__fatti">
                      <li>{quando(o)}</li>
                      {o.n_lezioni > 0 && <li>{plurale(o.n_lezioni, 'lezione', 'lezioni')}{durata ? ` · ${durata}` : ''}</li>}
                      {o.ore_totali ? <li>{o.ore_totali} ore</li> : null}
                      {o.attestato && <li>Attestato</li>}
                    </ul>
                  </div>
                  <div className="offerta-card__piede">
                    <strong className="offerta-card__prezzo">{fmtPrezzo(o.prezzo_centesimi, o.valuta)}</strong>
                    {o.in_vendita ? <span className="chip chip--ok">Iscrizioni aperte</span> : <span className="chip chip--muted">{motivoNonVendibile(o.motivo)}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Vetrina>
  );
}
