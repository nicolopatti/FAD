/**
 * Icone lineari a tratto singolo (stroke 1.8), condivise dalla shell
 * (AppShell, SidebarNav) e dalle pagine discente/auditor. Prima erano
 * definite due volte (AppShell e SidebarNav) con path diversi.
 * Le icone dell'area admin (multi-elemento) restano in `admin/Atlante.tsx`.
 */
export const ICON_PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21H3z',
  courses: 'M4 5h16M4 12h16M4 19h10',
  play: 'M6 4l14 8L6 20z',
  audit: 'M4 4h16v4H4zM4 12h16v8H4z',
  log: 'M4 6h16M4 12h16M4 18h10',
  check: 'M5 12.5l4 4 10-11',
  lock: 'M8 11V7a4 4 0 0 1 8 0v4M6 11h12v10H6z',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  report: 'M4 4h16v4H4zM4 12h16v8H4z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  doc2: 'M6 3h9l4 4v14H6zM9 12h6M9 16h6',
  cap: 'M12 3l9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5',
  quiz: 'M8 3h8v2H8zM6 5h12v16H6zM9 12l2 2 4-4M9 17h6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  users: 'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM4 20c0-3.5 3.5-6 8-6s8 2.5 8 6M18 8a2.5 2.5 0 1 0 0-5',
  // voci dell'area admin (stile lineare coerente)
  dashboard: 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z',
  corsi: 'M5 4h13v16H6a2 2 0 0 1-2-2V5z',
  libreria: 'M4 5v14M9 5v14M14 6l5 1-2 13-5-1z',
  sessioni: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  vendite: 'M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  themeAuto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 1 1 0 18',
};
