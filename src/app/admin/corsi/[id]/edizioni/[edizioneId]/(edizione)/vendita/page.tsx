import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { edizioneStato, type EdizioneRow } from '@/lib/db-types';
import { OFFERTA_SELECT } from '@/lib/offerte';
import { motivoOfferta, type OffertaRow } from '@/lib/vendita';
import { finestraEdizione, giornoRoma } from '@/lib/finestra';
import { riepilogoOrdini } from '@/lib/vendite-admin';
import { VenditaPanel, type RiepilogoOrdini } from '../../_components/VenditaPanel';

export const dynamic = 'force-dynamic';

type EdVendita = EdizioneRow & {
  corso: { id: string; titolo: string; descrizione: string | null; politica_attestato: string | null; ore_totali: number | null } | null;
};

/**
 * Scheda "Vendita" dell'edizione (Fase 6): l'offerta pubblica (prezzo, posti,
 * durata dell'accesso, finestra di vendita, testi della scheda) e il riepilogo
 * degli ordini. Gli ordini si gestiscono in Vendite.
 */
export default async function EdizioneVenditaPage(props: { params: Promise<{ id: string; edizioneId: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: ed } = await supabase
    .from('edizione')
    .select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il, corso:corso_id ( id, titolo, descrizione, politica_attestato, ore_totali )')
    .eq('id', params.edizioneId).eq('corso_id', params.id)
    .maybeSingle<EdVendita>();
  if (!ed || !ed.corso) notFound();

  const offerte = await supabase.from('offerta').select(OFFERTA_SELECT).eq('edizione_id', ed.id).order('creato_il').limit(1)
    .returns<OffertaRow[]>().then((r) => unwrap(r, 'l’offerta'));
  const offerta = offerte[0] ?? null;

  let riepilogo: RiepilogoOrdini = { pagati: 0, in_attesa: 0, rimborsati: 0, incasso_centesimi: 0 };
  if (offerta) {
    const ordini = await supabase.from('ordine').select('stato, importo_centesimi, scade_il').eq('offerta_id', offerta.id)
      .returns<{ stato: string; importo_centesimi: number; scade_il: string }[]>().then((r) => unwrap(r, 'gli ordini'));
    riepilogo = riepilogoOrdini(ordini);
  }

  // Stato dell'offerta oggi (stessa regola del catalogo): serve a dire se è
  // acquistabile, in arrivo o chiusa, e quindi se compare nell'elenco.
  const oggi = giornoRoma();
  const motivo = offerta
    ? motivoOfferta(offerta, finestraEdizione(ed, oggi).stato, ed.data_inizio, riepilogo.pagati + riepilogo.in_attesa, oggi)
    : null;

  // Il catalogo risponde solo agli indirizzi collegati all'ente (tabella tenant_dominio).
  const host = (await headers()).get('host') ?? '';
  const { data: tenantHost } = await supabase.rpc('tenant_da_host', { p_host: host });
  const hostCollegato = tenantHost === session.tenantId;

  return (
    <VenditaPanel
      edizioneId={ed.id}
      attiva={edizioneStato(ed) === 'attiva'}
      edizione={{ data_inizio: ed.data_inizio, data_fine: ed.data_fine, fad_chiusura: ed.fad_chiusura }}
      corso={{ titolo: ed.corso.titolo, descrizione: ed.corso.descrizione, politica_attestato: ed.corso.politica_attestato, ore_totali: ed.corso.ore_totali }}
      offerta={offerta}
      riepilogo={riepilogo}
      motivo={motivo}
      hostCollegato={hostCollegato}
      host={host}
    />
  );
}
