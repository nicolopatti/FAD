import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { appendEvent } from '@/lib/audit';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { configQuizDa, correggi, type RisposteDate } from '@/lib/quiz';
import type { QuizDomandaRow } from '@/lib/db-types';
import { provaEmissioneAutomatica } from '@/lib/attestati';
import { ErroreRegistrazione, registraEventoPlayer } from '@/lib/eventi-player';

// Test finale (Fase 5). Due eventi:
//  - quiz.started   → apertura di un tentativo (payload: tentativo)
//  - quiz.submitted → consegna: il SERVER corregge (le risposte giuste non
//    raggiungono mai il browser), scrive un solo Evento con punteggio,
//    percentuale e superato (D26: l'esito dichiarato dal client è ignorato).
// Niente PII: solo UUID, indici di risposta e numeri.
const ALLOWED = new Set(['quiz.started', 'quiz.submitted']);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const {
    event_type: eventType,
    iscrizione_id: iscrizioneId,
    learning_object_id: learningObjectId,
    risposte,
  } = body as { event_type?: string; iscrizione_id?: string; learning_object_id?: string; risposte?: RisposteDate };

  if (!eventType || !iscrizioneId || !learningObjectId) {
    return NextResponse.json({ ok: false, error: 'parametri mancanti' }, { status: 400 });
  }
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ ok: false, error: 'event_type non ammesso' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: persona } = await supabase.from('persona').select('id, tenant_id').eq('auth_user_id', user.id).single();
  if (!persona) return NextResponse.json({ ok: false }, { status: 403 });

  const { data: iscrizione } = await supabase.from('iscrizione').select('id, persona_id').eq('id', iscrizioneId).maybeSingle();
  if (!iscrizione || iscrizione.persona_id !== persona.id) {
    return NextResponse.json({ ok: false, error: 'iscrizione non valida' }, { status: 403 });
  }

  // D26: il test si apre solo se sbloccato nel percorso.
  const progresso = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!progresso) return NextResponse.json({ ok: false }, { status: 403 });
  const item = progresso.items.find((i) => i.learning_object_id === learningObjectId);
  if (!item || item.lo_type !== 'quiz') {
    return NextResponse.json({ ok: false, error: 'test non in corso' }, { status: 403 });
  }
  if (!item.sbloccato) {
    return NextResponse.json({ ok: false, error: 'LO non sbloccato (sblocco_sequenziale)' }, { status: 403 });
  }
  const cfg = configQuizDa(item.lo_config);
  const tentativiFatti = item.quiz?.tentativi ?? 0;
  if (cfg.tentativi_max != null && tentativiFatti >= cfg.tentativi_max) {
    return NextResponse.json({ ok: false, error: `Hai esaurito i ${cfg.tentativi_max} tentativi disponibili.` }, { status: 409 });
  }
  const tentativo = tentativiFatti + 1;

  if (eventType === 'quiz.started') {
    // Avvio: RPC unica con il client dell'utente (nessuna service role).
    try {
      await registraEventoPlayer(supabase, { iscrizioneId: iscrizione.id, learningObjectId, eventType, payload: { tentativo } });
    } catch (err) {
      if (err instanceof ErroreRegistrazione) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      throw err;
    }
    return NextResponse.json({ ok: true, tentativo });
  }

  // Consegna: domande con le risposte giuste lette con la service role (il
  // discente non ha SELECT sulla tabella), correzione qui.
  if (!risposte || typeof risposte !== 'object') {
    return NextResponse.json({ ok: false, error: 'risposte mancanti' }, { status: 400 });
  }
  const service = createSupabaseServiceClient();
  const { data: domande, error: errDom } = await service
    .from('quiz_domanda')
    .select('id, learning_object_id, ordine, testo, tipo, risposte')
    .eq('learning_object_id', learningObjectId)
    .order('ordine', { ascending: true })
    .returns<QuizDomandaRow[]>();
  if (errDom) return NextResponse.json({ ok: false, error: errDom.message }, { status: 500 });
  if (!domande || domande.length === 0) {
    return NextResponse.json({ ok: false, error: 'Il test non ha ancora domande.' }, { status: 409 });
  }

  const esito = correggi(domande, risposte, cfg.soglia_percentuale);
  await appendEvent({
    tenantId: persona.tenant_id,
    eventType: 'quiz.submitted',
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: learningObjectId,
    payload: {
      iscrizione_id: iscrizione.id,
      tentativo,
      punteggio: esito.punteggio,
      totale: esito.totale,
      percentuale: esito.percentuale,
      soglia_percentuale: cfg.soglia_percentuale,
      superato: esito.superato,
      risposte: Object.fromEntries(esito.dettaglio.map((d) => [d.domanda_id, d.scelte])),
    },
  });

  // Fase 5: con il test superato il percorso può essere completo → attestato
  // automatico (politica `automatica`). Mai un errore verso il player.
  const attestato = esito.superato ? await provaEmissioneAutomatica(iscrizione.id, persona.id) : null;

  return NextResponse.json({
    ok: true,
    attestato: attestato ? { numero: attestato.numero } : null,
    tentativo,
    punteggio: esito.punteggio,
    totale: esito.totale,
    percentuale: esito.percentuale,
    soglia: cfg.soglia_percentuale,
    superato: esito.superato,
    // Correzione per domanda solo se prevista e superato (altrimenti si potrebbe
    // ricostruire il set delle risposte giuste tentativo dopo tentativo).
    correzione: cfg.mostra_correzione && esito.superato
      ? esito.dettaglio.map((d) => ({ domanda_id: d.domanda_id, corretta: d.corretta, giuste: d.giuste }))
      : esito.dettaglio.map((d) => ({ domanda_id: d.domanda_id, corretta: d.corretta })),
    tentativi_max: cfg.tentativi_max,
  });
}
