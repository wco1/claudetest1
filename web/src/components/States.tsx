import { t } from '../i18n';
import { Button } from './Button';

export function Loading({ label }: { label?: string }) {
  return (
    <div className="centre-state">
      <div className="spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}

interface ErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorProps) {
  return (
    <div className="centre-state">
      <h2>{title || t('error.generic')}</h2>
      {message && <p>{message}</p>}
      {onRetry && (
        <Button variant="primary" onSelect={onRetry} autoFocus group="error">
          {t('action.retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="centre-state">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
