/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Next 16 genera un AGENTS.md all'avvio del dev server: il progetto usa CLAUDE.md.
  agentRules: false,
  // Indirizzi dell'area admin prima dell'ondata A (menu per tabella): i
  // collegamenti salvati continuano a funzionare. La query resta.
  async redirects() {
    return [
      { source: '/admin/sessioni', destination: '/admin/agenda', permanent: false },
      { source: '/admin/report-fondo', destination: '/admin/rendicontazione', permanent: false },
      { source: '/admin/attestati', destination: '/admin/rendicontazione/attestati', permanent: false },
      { source: '/admin/ente', destination: '/admin/impostazioni', permanent: false },
    ];
  },
};

module.exports = nextConfig;
