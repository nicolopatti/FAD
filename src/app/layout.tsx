import './globals.css';

export const metadata = {
  title: 'FAD — Fase 1',
  description: 'Piattaforma e-learning — fetta verticale FAD',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
