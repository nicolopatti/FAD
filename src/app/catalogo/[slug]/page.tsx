import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaScheda, durataAccesso, edizioneGiaIscritta, hostRichiesta, paragrafi } from '@/lib/vetrina';
import { motivoNonVendibile } from '@/lib/vendita';
import { fmtDurata, plurale } from '@/lib/formato';
import { Cover, coverUrl, fmtData, fmtDataOra } from '@/components/admin/Atlante';
import { Ico } from '@/components/AppShell';
import { PrezzoVetrina, Vetrina, testoSconto } from '@/components/vetrina/Vetrina';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const supabase = await createSupabaseServerClient();
  const s = await caricaScheda(supabase, await hostRichiesta(), slug).catch(() => null);
  if (!s) return { title: 'Corso non trovato' };
  const descr = paragrafi(s.descrizione)[0]?.slice(0, 200) ?? `Corso di ${s.ente ?? 'formazione'}`;
  const img = coverUrl(s.cover_path);
  return {
    title: `${s.titolo} — ${s.ente ?? 'Formazione'}`,
    description: descr,
    openGraph: { title: s.titolo, description: descr, ...(img ? { images: [img] } : {}) },
  };
}

const ICONA_LEZIONE: Record<string, string> = { video: 'play', documento: 'doc2', quiz: 'quiz' };

/** Scheda pubblica di un corso in vendita (Fase 6). */
export default async function SchedaCorsoPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const supabase = await createSupabaseServerClient();
  const s = await caricaScheda(supabase, await hostRichiesta(), slug);
  if (!s) notFound();
  const giaIscritto = await edizioneGiaIscritta(supabase, s.offerta_id);

  const durataVideo = s.lezioni.reduce((t, l) => t + (l.durata_secondi ?? 0), 0);
  const nTest = s.lezioni.filter((l) => l.tipo === 'quiz').length;
  const fatti: string[] = [];
  if (s.tipo === 'online') { const a = durataAccesso(s.accesso_giorni); if (a) fatti.push(a); fatti.push('Online, quando vuoi'); }
  else if (s.data_inizio) fatti.push(s.data_fine && s.data_fine !== s.data_inizio ? `Dal ${fmtData(s.data_inizio)} al ${fmtData(s.data_fine)}` : `Il ${fmtData(s.data_inizio)}`);
  if (s.lezioni.length) fatti.push(`${plurale(s.lezioni.length, 'lezione', 'lezioni')}${durataVideo ? ` · ${fmtDurata(durataVideo)} di video` : ''}`);
  if (s.sessioni.length) fatti.push(plurale(s.sessioni.length, 'incontro dal vivo', 'incontri dal vivo'));
  if (s.ore_totali) fatti.push(`${s.ore_totali} ore di formazione`);
  if (nTest) fatti.push('Test finale');
  if (s.attestato) fatti.push('Attestato con verifica online');

  const motivo = motivoNonVendibile(s.motivo);

  return (
    <Vetrina ente={s.ente}>
      <Link href="/catalogo" className="back-link"><Ico name="arrowL" size={16} /> Tutti i corsi</Link>
      <div className="scheda">
        <section className="scheda__hero">
          {s.categoria && <span className="scheda__cat">{s.categoria}</span>}
          <h1>{s.titolo}</h1>
          <ul className="scheda__fatti">{fatti.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>

        <aside className="scheda__acquisto" aria-label="Iscrizione">
          <Cover categoria={s.categoria} src={coverUrl(s.cover_path)} className="scheda__cover" />
          <PrezzoVetrina prezzo={s.prezzo_centesimi} listino={s.listino_centesimi} valuta={s.valuta} className="scheda__prezzo" />
          {s.in_vendita && testoSconto(s) && <div className="scheda__sconto">{testoSconto(s)}</div>}
          <div className="muted scheda__iva">{s.aliquota_iva > 0 ? `IVA ${s.aliquota_iva}% inclusa` : s.natura_iva ?? 'IVA non applicata'}</div>
          {giaIscritto ? (
            <Link href={`/corsi/${giaIscritto}`} className="btn btn--block">Sei iscritto: vai al corso</Link>
          ) : s.in_vendita ? (
            <Link href={`/acquista/${s.slug}`} className="btn btn--block">Iscriviti al corso</Link>
          ) : (
            <div className="banner banner--ocra"><div className="banner__body">{motivo}</div></div>
          )}
          {s.in_vendita && s.posti_rimasti != null && <div className="scheda__posti">{s.posti_rimasti <= 5 ? `Ultimi ${plurale(s.posti_rimasti, 'posto', 'posti')}` : `${s.posti_rimasti} posti disponibili`}</div>}
          <ul className="scheda__garanzie">
            <li><Ico name="lock" size={16} /> Pagamento sicuro con carta</li>
            <li><Ico name="cap" size={16} /> Accesso immediato dopo il pagamento</li>
          </ul>
        </aside>

        <div className="scheda__corpo">
          {paragrafi(s.descrizione).length > 0 && (
            <section>
              <h2>Il corso</h2>
              {paragrafi(s.descrizione).map((p, i) => <p key={i}>{p}</p>)}
            </section>
          )}
          {s.lezioni.length > 0 && (
            <section>
              <h2>Programma</h2>
              <ol className="scheda__programma">
                {s.lezioni.map((l) => (
                  <li key={l.ordine}>
                    <span className="scheda__lez-icona"><Ico name={ICONA_LEZIONE[l.tipo] ?? 'play'} size={16} /></span>
                    <span className="scheda__lez-titolo">{l.titolo}{!l.obbligatoria && <span className="muted"> · facoltativa</span>}</span>
                    <span className="muted">{l.tipo === 'quiz' ? 'test' : fmtDurata(l.durata_secondi) ?? (l.tipo === 'documento' ? 'lettura' : '')}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {s.sessioni.length > 0 && (
            <section>
              <h2>Calendario degli incontri</h2>
              <ul className="scheda__sessioni">
                {s.sessioni.map((se, i) => (
                  <li key={i}>
                    <strong>{se.data_ora ? fmtDataOra(se.data_ora) : 'Data da definire'}</strong>
                    <span>{se.titolo}{se.durata_minuti ? ` · ${se.durata_minuti} min` : ''}{se.modalita === 'vcs' ? ' · online' : se.modalita === 'aula' ? ' · in aula' : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2>Come funziona</h2>
            <ol className="scheda__passi">
              <li>Crea il tuo account (o accedi, se ce l’hai già).</li>
              <li>Paga con carta: la conferma arriva subito.</li>
              <li>Trovi il corso in “I miei corsi”: {s.tipo === 'online' ? 'lo segui quando vuoi, dal computer o dal telefono' : 'ricevi il calendario degli incontri'}.</li>
              {s.attestato && <li>Al termine scarichi l’attestato, verificabile online e da aggiungere a LinkedIn.</li>}
            </ol>
            {s.riferimento_normativo && <p className="muted">Riferimento normativo: {s.riferimento_normativo}</p>}
          </section>
        </div>
      </div>
    </Vetrina>
  );
}
