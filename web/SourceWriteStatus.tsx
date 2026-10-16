import { useSourceI18n } from './source-context';
import { translateError } from './messages';
import type { SourceWrite } from './write-state';
import './source-write.css';

export function SourceWriteStatus({
  entry,
  toast = false,
  onDismiss,
}: {
  entry?: SourceWrite;
  toast?: boolean;
  onDismiss?: () => void;
}) {
  const { t, language } = useSourceI18n('collection');
  const label = !entry
    ? t('Collection chargée')
    : entry.phase === 'saving'
      ? t('Enregistrement…')
      : entry.phase === 'saved'
        ? t('Modifications enregistrées')
        : t('Échec de l’enregistrement');
  return (
    <div
      className={
        'source-write-status ' + (toast ? 'source-write-toast ' : '') + (entry?.phase || 'idle')
      }
      role={toast ? 'status' : undefined}
      aria-live={toast ? 'polite' : 'off'}
      aria-atomic={toast ? true : undefined}
    >
      <div className="source-write-top">
        <span className="source-write-symbol" aria-hidden="true">
          {entry?.phase === 'saved'
            ? '✓'
            : entry?.phase === 'error'
              ? '!'
              : entry?.phase === 'saving'
                ? '↻'
                : '○'}
        </span>
        <div>
          <strong>{label}</strong>
          {toast && entry && (
            <span className="source-write-name">
              {t('Collection : {{name}}', { name: entry.name })}
            </span>
          )}
        </div>
        {entry?.savedAt && (
          <time dateTime={new Date(entry.savedAt).toISOString()}>
            {new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(entry.savedAt)}
          </time>
        )}
        {toast && onDismiss && (
          <button
            type="button"
            className="source-write-dismiss"
            aria-label={t('Masquer l’état d’enregistrement')}
            onClick={onDismiss}
          >
            ×
          </button>
        )}
      </div>
      {entry?.phase === 'error' && entry.message && (
        <p className="source-write-error">{translateError(entry.message, t)}</p>
      )}
      {entry?.phase === 'saved' && entry.backup && (
        <details>
          <summary>{t('Copie de sécurité')}</summary>
          <code>{entry.backup}</code>
        </details>
      )}
    </div>
  );
}
