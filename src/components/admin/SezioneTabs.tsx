import { Tabs } from './Tabs';

/** Schede della voce Corsi: catalogo e libreria dei contenuti. */
export function CorsiTabs({ nLibreria }: { nLibreria?: number }) {
  return <Tabs items={[{ label: 'Catalogo', href: '/admin/corsi', exact: true }, { label: 'Libreria dei contenuti', href: '/admin/learning-objects', count: nLibreria }]} label="Corsi" />;
}

/** Schede della voce Rendicontazione: report fondi e attestati. */
export function RendicontazioneTabs({ nAttestati }: { nAttestati?: number }) {
  return <Tabs items={[{ label: 'Report fondi', href: '/admin/rendicontazione', exact: true }, { label: 'Attestati', href: '/admin/rendicontazione/attestati', count: nAttestati }]} label="Rendicontazione" />;
}
