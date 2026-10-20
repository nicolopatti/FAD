/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
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
