import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { useSourceI18n } from './source-context';
import { translateError } from './messages';
import './delete-collection.css';

export type DeletedCollection = { name: string; backup: string };
type Source = { id: string; name: string; revision: string; kind: 'collection' };
type Props = {
  source: Source;
  onClose: () => void;
  onDeleted: (result: { backup: string; deletedId: string }) => Promise<void> | void;
};

export function DeleteCollectionDialog({ source, onClose, onDeleted }: Props) {
  const { t } = useSourceI18n('collection');
  const [deleted, setDeleted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || deleted || !closed || source.kind !== 'collection') return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/profiles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveId: source.id, revision: source.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur de connexion');
      setDeleted(true);
      try {
        await onDeleted(result as { backup: string; deletedId: string });
      } catch {
        setError(
          'La collection a été supprimée. Actualisez les sources pour afficher le résultat.',
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      compact
      label={t('Supprimer une collection locale')}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="delete-collection-dialog"
    >
      <span className="eyebrow">{t('COLLECTION LOCALE')}</span>
      <h2>{t('Supprimer « {{name}} » ?', { name: source.name })}</h2>
      <p>
        {t(
          'Seule cette collection sera retirée du fichier de profils du jeu. Les autres collections et les favoris seront conservés.',
        )}
      </p>
      <div className="delete-collection-scope">
        {t(
          'Vos sauvegardes, les fichiers des mods et vos abonnements Steam restent inchangés. Une copie de sécurité sera créée automatiquement avant la suppression.',
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {translateError(error, t)}
        </div>
      )}
      {deleted ? (
        <div className="modal-actions">
          <button className="button" disabled={busy} onClick={onClose}>
            {t('Fermer')}
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void remove(event)}>
          <label className="delete-collection-check">
            <input
              type="checkbox"
              checked={closed}
              disabled={busy}
              onChange={(event) => setClosed(event.target.checked)}
            />
            <span>
              {t(
                'Project Zomboid est fermé. Je confirme la suppression de cette collection locale.',
              )}
            </span>
          </label>
          <div className="modal-actions">
            <button type="button" className="button" disabled={busy} onClick={onClose}>
              {t('Annuler')}
            </button>
            <button type="submit" className="button destructive" disabled={busy || !closed}>
              {busy ? t('Suppression…') : t('Supprimer la collection')}
            </button>
          </div>
        </form>
      )}
      {busy && (
        <span className="sr-only" role="status">
          {t('Suppression de la collection en cours.')}
        </span>
      )}
    </Dialog>
  );
}

export function CollectionDeletedNotice({
  entry,
  onDismiss,
}: {
  entry: DeletedCollection;
  onDismiss: () => void;
}) {
  const { t } = useSourceI18n('collection');
  return (
    <div
      className="source-write-status source-write-toast saved"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="source-write-top">
        <span className="source-write-symbol" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>{t('Collection supprimée')}</strong>
          <span className="source-write-name">{entry.name}</span>
        </div>
        <button
          className="source-write-dismiss"
          aria-label={t('Masquer la confirmation de suppression')}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <details>
        <summary>{t('Copie de sécurité')}</summary>
        <code>{entry.backup}</code>
      </details>
    </div>
  );
}
