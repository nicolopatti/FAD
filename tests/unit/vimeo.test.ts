import { describe, expect, it } from 'vitest';
import { parseVimeoRef, vimeoEmbedUrl } from '../../src/lib/vimeo';

describe('parseVimeoRef', () => {
  it('accetta l\'ID numerico puro', () => {
    expect(parseVimeoRef(' 1084894652 ')).toEqual({ vimeo_id: '1084894652' });
  });
  it('estrae l\'ID dal link pubblico', () => {
    expect(parseVimeoRef('https://vimeo.com/1084894652')).toEqual({ vimeo_id: '1084894652' });
    expect(parseVimeoRef('vimeo.com/1084894652')).toEqual({ vimeo_id: '1084894652' });
  });
  it('estrae ID e hash dei video non in elenco', () => {
    expect(parseVimeoRef('https://vimeo.com/1084894652/9f3a1b2c4d')).toEqual({ vimeo_id: '1084894652', vimeo_hash: '9f3a1b2c4d' });
    expect(parseVimeoRef('https://vimeo.com/1084894652?h=9F3A1B2C4D')).toEqual({ vimeo_id: '1084894652', vimeo_hash: '9f3a1b2c4d' });
    expect(parseVimeoRef('https://player.vimeo.com/video/1084894652?h=9f3a1b2c4d&badge=0')).toEqual({ vimeo_id: '1084894652', vimeo_hash: '9f3a1b2c4d' });
  });
  it('gestisce manage, channels, groups e pagine di revisione', () => {
    expect(parseVimeoRef('https://vimeo.com/manage/videos/1084894652')).toEqual({ vimeo_id: '1084894652' });
    expect(parseVimeoRef('https://vimeo.com/channels/staffpicks/1084894652')).toEqual({ vimeo_id: '1084894652' });
    expect(parseVimeoRef('https://vimeo.com/groups/abc/videos/1084894652')).toEqual({ vimeo_id: '1084894652' });
    expect(parseVimeoRef('https://vimeo.com/reviews/0512ff35-b06d-4f61-8b16-b51cecb6958e/videos/1071424134')).toEqual({ vimeo_id: '1071424134' });
  });
  it('rifiuta cartelle, altri host e input vuoti', () => {
    expect(parseVimeoRef('https://vimeo.com/reviews/88561b9d-08b0-4344-bb3f-c472537eeaaa/users/261130544/folders/30936580')).toBeNull();
    expect(parseVimeoRef('https://youtube.com/watch?v=1084894652')).toBeNull();
    expect(parseVimeoRef('')).toBeNull();
    expect(parseVimeoRef(42)).toBeNull();
    expect(parseVimeoRef('abc')).toBeNull();
  });
});

describe('vimeoEmbedUrl', () => {
  it('aggiunge h solo se presente', () => {
    expect(vimeoEmbedUrl('1084894652')).toBe('https://player.vimeo.com/video/1084894652?dnt=1&title=0&byline=0&portrait=0');
    expect(vimeoEmbedUrl('1084894652', '9f3a1b2c4d')).toBe('https://player.vimeo.com/video/1084894652?dnt=1&title=0&byline=0&portrait=0&h=9f3a1b2c4d');
  });
});

describe('messaggi e oEmbed (B3)', () => {
  it('errore umano con il campo giusto, una volta sola', async () => {
    const { validateVideoConfig, campoErroreConfig, MSG_DURATA_NON_VALIDA } = await import('../../src/lib/lo-config');
    const { MSG_VIMEO_NON_VALIDO } = await import('../../src/lib/vimeo');
    const v = validateVideoConfig({ vimeo_id: 'https://vimeo.com/user/folders/123456', durata_secondi: 60 });
    expect(v).toBe(MSG_VIMEO_NON_VALIDO);
    expect(String(v)).not.toContain('config.');
    expect(campoErroreConfig(v as string)).toBe('vimeo_id');
    expect(campoErroreConfig(validateVideoConfig({ vimeo_id: '1084894652', durata_secondi: 0 }) as string)).toBe('durata_secondi');
    expect(MSG_DURATA_NON_VALIDA).not.toContain('config.');
  });
  it('URL oEmbed con l’hash dei video non in elenco', async () => {
    const { vimeoOembedUrl } = await import('../../src/lib/vimeo');
    expect(vimeoOembedUrl({ vimeo_id: '1084894652', vimeo_hash: 'abc123' })).toBe('https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1084894652%2Fabc123');
  });
  it('fmtMmSs è l’inverso di parseMmSs', async () => {
    const { fmtMmSs, parseMmSs } = await import('../../src/lib/validazione');
    expect(fmtMmSs(519)).toBe('8:39');
    expect(parseMmSs(fmtMmSs(3345))).toBe(3345);
  });
});
