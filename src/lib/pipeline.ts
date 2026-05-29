import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportFonte } from './db-types';

// Wrapper applicativo della pipeline unica (Fase 3 Task 2). Gli adattatori
// (CSV Task 3, API Teams Task 6) chiamano SEMPRE questo punto: la funzione DB
// `pipeline_ingest_grezzo` è l'unica via di scrittura del grezzo e dell'Evento
// di import. Nessun INSERT diretto su `report_partecipazione_grezzo` né `evento`.

export type IngestGrezzoInput = {
  tenantId: string;
  sessioneId: string;
  fonte: ReportFonte;
  contenuto: unknown[]; // righe normalizzate (array)
  importatoDa: string; // Persona admin che importa (NULL/automatico = Task 6)
};

export type IngestGrezzoResult = {
  grezzo_id: string;
  evento_id: string;
  evento_seq: number;
  hash: string; // sha256 esadecimale del contenuto (attestato nell'Evento)
  righe: number;
};

export async function ingestGrezzo(
  supabase: SupabaseClient,
  input: IngestGrezzoInput,
): Promise<IngestGrezzoResult> {
  const { data, error } = await supabase.rpc('pipeline_ingest_grezzo', {
    p_tenant_id: input.tenantId,
    p_sessione_id: input.sessioneId,
    p_fonte: input.fonte,
    p_contenuto: input.contenuto,
    p_importato_da: input.importatoDa,
  });
  if (error) throw error;
  return data as IngestGrezzoResult;
}
