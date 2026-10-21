-- Il discente deve poter leggere le PROPRIE presenze alle sessioni: senza, la
-- frequenza calcolata con il suo client (pagine /corsi) vale sempre 0 e la pagina
-- del corso non sa se ha raggiunto la presenza minima. Gli Eventi di presenza hanno
-- come attore l'admin (o l'import), quindi la clausola "attore = io" non bastava.
-- Si aggiunge: tipi di presenza il cui payload.iscrizione_id è un'iscrizione della
-- persona corrente. Il payload porta solo UUID e durata (nessuna PII, D18).
-- ALTER POLICY (niente DROP: trabocchetto #13 dell'MCP); il resto è invariato.
alter policy evento_read on public.evento
  using (
    tenant_id = current_tenant_id()
    and (
      is_auditor()
      or ((actor ->> 'persona_id')::uuid = current_persona_id())
      or (is_admin() and event_type = any (array[
        'video.play','video.pause','video.seek','video.progress','video.ended',
        'documento.opened','documento.completed','quiz.started','quiz.submitted',
        'presenza_webinar_registrata','presenza_inserita_manualmente','presenza_corretta_manualmente',
        'partecipante_non_riconciliato','match_risolto_manualmente','report_grezzo_importato',
        'report_fondo_depositato','attestato.emesso','attestato.sostituito']))
      or (event_type = any (array['presenza_webinar_registrata','presenza_inserita_manualmente','presenza_corretta_manualmente'])
          and exists (
            select 1 from public.iscrizione i
            where i.id::text = (evento.payload ->> 'iscrizione_id')
              and i.persona_id = current_persona_id()))
    )
  );
