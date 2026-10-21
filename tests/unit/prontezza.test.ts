import { describe, it, expect } from 'vitest';
import { valutaProntezza, type ItemProntezza, type DomandaProntezza } from '../../src/lib/prontezza-corso';

const video = (o: Partial<ItemProntezza> = {}): ItemProntezza => ({ ordine: 1, obbligatorio: true, titolo: 'Video', tipo: 'video', config: { vimeo_id: '123', durata_secondi: 60 }, learning_object_id: 'v', ...o });
const test = (o: Partial<ItemProntezza> = {}): ItemProntezza => ({ ordine: 2, obbligatorio: true, titolo: 'Test', tipo: 'quiz', config: { soglia_percentuale: 70 }, learning_object_id: 'q', ...o });
const buona: DomandaProntezza = { testo: 'Domanda?', tipo: 'scelta_singola', risposte: [{ testo: 'Sì', corretta: true }, { testo: 'No', corretta: false }] };

describe('valutaProntezza (A3)', () => {
  it('test obbligatorio senza domande → bloccante', () => {
    const p = valutaProntezza([video(), test()], new Map());
    expect(p.bloccanti).toHaveLength(1);
    expect(p.bloccanti[0]).toContain('"Test"');
    expect(p.domandePerTest.q).toBe(0);
  });
  it('domande non valide (vuota, una sola risposta, nessuna giusta) non contano', () => {
    const cattive: DomandaProntezza[] = [
      { testo: '', tipo: 'scelta_singola', risposte: [{ testo: 'a', corretta: true }, { testo: 'b', corretta: false }] },
      { testo: 'X', tipo: 'scelta_singola', risposte: [{ testo: 'a', corretta: true }] },
      { testo: 'Y', tipo: 'scelta_multipla', risposte: [{ testo: 'a', corretta: false }, { testo: 'b', corretta: false }] },
    ];
    expect(valutaProntezza([test()], new Map([['q', cattive]])).bloccanti).toHaveLength(1);
    const ok = valutaProntezza([test()], new Map([['q', [...cattive, buona]]]));
    expect(ok.bloccanti).toHaveLength(0);
    expect(ok.domandePerTest.q).toBe(1);
  });
  it('test facoltativo senza domande → solo avviso', () => {
    const p = valutaProntezza([test({ obbligatorio: false })], new Map());
    expect(p.bloccanti).toHaveLength(0);
    expect(p.avvisi).toHaveLength(1);
  });
  it('video senza ID o durata e PDF senza file → avvisi, non blocchi', () => {
    const p = valutaProntezza([
      video({ config: { vimeo_id: '', durata_secondi: 0 } }),
      { ordine: 3, obbligatorio: true, titolo: 'PDF', tipo: 'documento', config: {}, learning_object_id: 'd' },
    ], new Map());
    expect(p.bloccanti).toHaveLength(0);
    expect(p.avvisi).toHaveLength(3);
  });
});
