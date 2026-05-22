import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { TopBar } from '@/components/TopBar';
import { VimeoPlayer } from '@/components/VimeoPlayer';
import { DocumentoPlayer } from '@/components/DocumentoPlayer';

export const dynamic = 'force-dynamic';

export default async function LearningObjectPage({
  params,
}: {
  params: { edizioneId: string; loId: string };
}) {
  const session = await requireSession();
  const supabase = createSupabaseServerClient();

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id')
    .eq('persona_id', session.personaId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle();
  if (!iscrizione) notFound();

  const prog = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!prog) notFound();

  const item = prog.items.find((i) => i.learning_object_id === params.loId);
  if (!item) notFound();

  // D26: enforcement server-side. Se non sbloccato, l'accesso è negato — non
  // solo nascosto in UI.
  if (!item.sbloccato) {
    return (
      <>
        <TopBar email={session.email} isAuditor={session.isAuditor} />
        <main className="shell">
          <p>
            <Link href={`/corsi/${params.edizioneId}`}>← Indietro</Link>
          </p>
          <div className="alert">
            <strong>Contenuto bloccato.</strong>{' '}
            Completa prima gli oggetti didattici precedenti obbligatori.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar email={session.email} isAuditor={session.isAuditor} />
      <main className="shell">
        <p>
          <Link href={`/corsi/${params.edizioneId}`}>← {prog.corso_titolo}</Link>
        </p>
        <h1>{item.lo_titolo}</h1>
        <div className="card">
          {item.lo_type === 'video' ? (
            <VimeoPlayer
              vimeoId={String((item.lo_config as { vimeo_id?: string }).vimeo_id ?? '')}
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
            />
          ) : item.lo_type === 'documento' ? (
            <DocumentoPlayer
              iscrizioneId={iscrizione.id}
              learningObjectId={item.learning_object_id}
              filename={(item.lo_config as { filename?: string }).filename}
              alreadyCompleted={item.completato}
            />
          ) : (
            <div className="alert">Tipo di Learning Object non supportato.</div>
          )}
        </div>
        <p className="muted">
          {item.lo_type === 'video' ? (
            <>
              Gli eventi del player (play / pause / seek / ended) vengono registrati
              sul log eventi del tenant. L'oggetto risulta completato dopo l'evento{' '}
              <code>video.ended</code>.
            </>
          ) : (
            <>
              Gli eventi di apertura e completamento del documento vengono registrati
              sul log eventi del tenant. L'oggetto risulta completato dopo l'evento{' '}
              <code>documento.completed</code>.
            </>
          )}
        </p>
        {item.completato && item.lo_type === 'video' && (
          <div className="alert ok">
            Hai già completato questo oggetto. Puoi rivederlo, ma il completamento
            resta valido.
          </div>
        )}
      </main>
    </>
  );
}
