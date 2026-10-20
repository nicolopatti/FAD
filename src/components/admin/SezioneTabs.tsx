import { Tabs } from './Tabs';

/** Schede della voce Corsi: catalogo e libreria dei contenuti. */
export function CorsiTabs({ nLibreria }: { nLibreria?: number }) {
  return <Tabs items={[{ label: 'Catalogo', href: '/admin/corsi', exact: true }, { label: 'Libreria dei contenuti', href: '/admin/learning-objects', count: nLibreria }]} label="Corsi" />;
}

/** Schede della voce Rendicontazione: report fondi e attestati. */
export function RendicontazioneTabs({ nAttestati }: { nAttestati?: number }) {
  return <Tabs items={[{ label: 'Report fondi', href: '/admin/rendicontazione', exact: true }, { label: 'Attestati', href: '/admin/rendicontazione/attestati', count: nAttestati }]} label="Rendicontazione" />;
}

/** Schede della voce Persone: anagrafica delle persone e delle aziende. */
export function PersoneTabs({ nPersone, nAziende }: { nPersone?: number; nAziende?: number }) {
  return <Tabs items={[{ label: 'Persone', href: '/admin/persone', exact: true, count: nPersone }, { label: 'Aziende', href: '/admin/aziende', count: nAziende }]} label="Persone" />;
}

/** Schede della voce Impostazioni: ente e categorie dei corsi. */
export function ImpostazioniTabs({ nCategorie }: { nCategorie?: number }) {
  return <Tabs items={[{ label: 'Ente e attestati', href: '/admin/impostazioni', exact: true }, { label: 'Categorie dei corsi', href: '/admin/impostazioni/categorie', count: nCategorie }]} label="Impostazioni" />;
}
