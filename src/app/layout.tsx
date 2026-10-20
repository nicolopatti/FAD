import './globals.css';
import { Red_Hat_Display, Red_Hat_Text, IBM_Plex_Mono } from 'next/font/google';
import { FeedbackProvider } from '@/components/ui/Feedback';

const display = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-src',
  display: 'swap',
});
const text = Red_Hat_Text({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-text-src',
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

// Applica il tema salvato prima del primo disegno (niente lampo chiaro/scuro).
// Senza scelta esplicita vale `prefers-color-scheme` via CSS.
const TEMA_SCRIPT = `try{var t=localStorage.getItem('fad-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${display.variable} ${text.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SCRIPT }} />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
