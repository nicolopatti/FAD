import { describe, expect, it } from 'vitest';
import { MODELLO_PREDEFINITO, compilaTesto, datiEnteMancanti, normalizzaParziale, risolviModello } from '../../src/lib/attestato-modello';
import { contenutoEsempio, generaAttestatoPdf, oreLabel, nascitaLabel } from '../../src/lib/attestato-pdf';

const ente = { ragione_sociale: 'Ente Demo', citta: 'Milano', firmatario_nome: 'Carla Bianchi', firmatario_ruolo: 'Direttrice', logo_path: null, firma_path: null };

describe('attestato-modello', () => {
  it('normalizza l\'input scartando ciò che non è valido', () => {
    const p = normalizzaParziale({
      layout: 'strano', titolo: '  Attestato  ', loghi_secondari: ['a/b.png', 'no-path', '12345678-1234-1234-1234-123456789abc/logo.png', 'x', 'y', 'z'],
      firmatari: [{ nome: 'A', ruolo: 'R' }, { nome: '' }, { nome: 'B' }, { nome: 'C' }], mostra: { qr: false, altro: true }, logo_path: '../etc/passwd',
    });
    expect(p.layout).toBeUndefined();
    expect(p.titolo).toBe('Attestato');
    expect(p.loghi_secondari).toEqual(['12345678-1234-1234-1234-123456789abc/logo.png']);
    expect(p.firmatari?.map((f) => f.nome)).toEqual(['A', 'B']);
    expect(p.mostra).toEqual({ qr: false });
    expect(p.logo_path).toBeNull();
  });

  it('risolve predefinito ← ente ← corso e riempie i vuoti con i dati dell\'ente', () => {
    const m = risolviModello(ente, { layout: 'essenziale', titolo: 'Titolo ente', mostra: { lezioni: true } }, { titolo: 'Titolo corso', mostra: { qr: false } });
    expect(m.layout).toBe('essenziale');
    expect(m.titolo).toBe('Titolo corso');
    expect(m.intro).toBe(MODELLO_PREDEFINITO.intro);
    expect(m.mostra.lezioni).toBe(true);
    expect(m.mostra.qr).toBe(false);
    expect(m.intestazione).toBe('Ente Demo');
    expect(m.citta).toBe('Milano');
    expect(m.firmatari).toEqual([{ nome: 'Carla Bianchi', ruolo: 'Direttrice', firma_path: null }]);
  });

  it('un corso può azzerare i firmatari dell\'ente dichiarandone di propri', () => {
    const m = risolviModello(ente, null, { firmatari: [{ nome: 'Luca Verdi', ruolo: 'Docente', firma_path: null }] });
    expect(m.firmatari.map((f) => f.nome)).toEqual(['Luca Verdi']);
  });

  it('sostituisce i segnaposto nei testi', () => {
    expect(compilaTesto('ha completato il corso {corso} di {ore} presso {ente}', { corso: 'Sicurezza', ore: '8 ore', ente: 'Ente Demo' })).toBe('ha completato il corso Sicurezza di 8 ore presso Ente Demo');
    expect(compilaTesto('{ignoto} resta vuoto {nome}', { nome: 'Mario' })).toBe('{ignoto} resta vuoto Mario');
  });
});

describe('attestato-pdf', () => {
  it('etichette di ore e nascita', () => {
    expect(oreLabel(8)).toBe('8 ore');
    expect(oreLabel(1)).toBe('1 ora');
    expect(oreLabel(2.5)).toBe('2,5 ore');
    expect(oreLabel(null)).toBe('');
    const c = contenutoEsempio({ ente: { ...ente, linkedin_organization_id: null } }, risolviModello(ente, null, null));
    expect(nascitaLabel(c)).toBe('nato/a a Bergamo il 12 aprile 1985');
  });

  it('genera un PDF valido per ciascun layout, anche senza immagini', async () => {
    for (const layout of ['classico', 'essenziale', 'elegante'] as const) {
      const m = risolviModello(ente, null, { layout, mostra: { lezioni: true }, testo_aggiuntivo: 'Programma del corso.\nNote.' });
      const c = contenutoEsempio({ ente: { ...ente, linkedin_organization_id: null } }, m);
      const bytes = await generaAttestatoPdf(c, { 'manca/logo.png': null });
      expect(bytes.length).toBeGreaterThan(3000);
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    }
  });

  it('un attestato emesso prima dell\'editor (senza modello) si rende con il classico', async () => {
    const c = contenutoEsempio({ ente: { ...ente, linkedin_organization_id: null } }, risolviModello(ente, null, null));
    delete (c as { modello?: unknown }).modello;
    const bytes = await generaAttestatoPdf(c);
    expect(bytes.length).toBeGreaterThan(3000);
  });
});

describe('datiEnteMancanti (A5)', () => {
  const enteT = { nome: 'Tenant', ragione_sociale: 'Ente Srl', citta: 'Milano', firmatario_nome: 'Anna Neri', firmatario_ruolo: 'Direttrice', logo_path: null, firma_path: null };
  it('ente completo: si può emettere', () => {
    expect(datiEnteMancanti(enteT)).toEqual([]);
  });
  it('senza ragione sociale (il nome del tenant non basta) o senza firmatario: bloccato', () => {
    expect(datiEnteMancanti({ ...enteT, ragione_sociale: '  ' })).toEqual(['ragione sociale']);
    expect(datiEnteMancanti({ ...enteT, firmatario_nome: null })).toEqual(['firmatario']);
    expect(datiEnteMancanti(null)).toEqual(['ragione sociale', 'firmatario']);
  });
  it('vale il firmatario del modello risolto, se c’è', () => {
    expect(datiEnteMancanti({ ...enteT, firmatario_nome: null }, { firmatari: [{ nome: 'Luca Bianchi', ruolo: '', firma_path: null }] })).toEqual([]);
    expect(datiEnteMancanti(enteT, { firmatari: [] })).toEqual(['firmatario']);
  });
});
