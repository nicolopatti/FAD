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
  // voci dell'area admin (stile lineare coerente)
  dashboard: 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z',
  corsi: 'M5 4h13v16H6a2 2 0 0 1-2-2V5z',
  libreria: 'M4 5v14M9 5v14M14 6l5 1-2 13-5-1z',
  sessioni: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
};
