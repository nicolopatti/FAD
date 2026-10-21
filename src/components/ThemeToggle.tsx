'use client';

import { useEffect, useState } from 'react';
import { ICON_PATHS } from './icons';

type Tema = 'auto' | 'light' | 'dark';
const KEY = 'fad-theme';
const CICLO: Tema[] = ['auto', 'light', 'dark'];
const LABEL: Record<Tema, string> = { auto: 'Tema: come il sistema', light: 'Tema: chiaro', dark: 'Tema: scuro' };
const ICON: Record<Tema, string> = { auto: 'themeAuto', light: 'sun', dark: 'moon' };

function leggi(): Tema {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applicaTema(t: Tema) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
}

// Tre stati: come il sistema → chiaro → scuro. La scelta resta nel browser
// (localStorage) e viene applicata prima del primo disegno dallo script
// inline nel layout radice, così non c'è lampo chiaro/scuro.
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [tema, setTema] = useState<Tema>('auto');
  // Il tema vive in localStorage: si legge dopo il montaggio per non divergere dal server.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTema(leggi()); }, []);

  function cicla() {
    const next = CICLO[(CICLO.indexOf(tema) + 1) % CICLO.length];
    setTema(next);
    try { if (next === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* privato */ }
    applicaTema(next);
  }

  return (
    <button type="button" className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}`} onClick={cicla} title={LABEL[tema]} aria-label={`${LABEL[tema]}. Premi per cambiare`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICON_PATHS[ICON[tema]] ?? ''} />
      </svg>
      {!compact && <span>{tema === 'auto' ? 'Automatico' : tema === 'light' ? 'Chiaro' : 'Scuro'}</span>}
    </button>
  );
}
