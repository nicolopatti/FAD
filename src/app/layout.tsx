import './globals.css';
import { Plus_Jakarta_Sans, Bricolage_Grotesque, IBM_Plex_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bricolage',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata = {
  title: 'FAD — Formazione a distanza',
  description: 'Piattaforma e-learning — formazione verificabile e a prova di audit',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${GeistSans.variable} ${jakarta.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
