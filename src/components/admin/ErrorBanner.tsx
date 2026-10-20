import { Icon } from '@/components/admin/Atlante';

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="banner banner--err" role="alert">
      <Icon name="alert" className="banner__icon" />
      <div className="banner__body">{error}</div>
    </div>
  );
}
