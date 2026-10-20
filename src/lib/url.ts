// Indirizzo pubblico canonico dell'app: serve per i link che finiscono fuori
// dalla piattaforma (QR e pagina di verifica dell'attestato, LinkedIn).
// Configurabile con NEXT_PUBLIC_APP_URL; in mancanza, il dominio di produzione.
export function appBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  return 'https://fad-wine.vercel.app';
}

export function urlVerifica(codice: string): string {
  return `${appBaseUrl()}/verifica/${codice}`;
}
