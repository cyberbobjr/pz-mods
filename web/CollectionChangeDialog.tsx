import { useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { useSourceI18n } from './source-context';
import { translateError } from './messages';
import { validateProfileName } from '../src/domain/profiles';
import './collection-change.css';

export type CollectionAction = 'rename' | 'duplicate';
export type CollectionChangeResult = {
  action: CollectionAction;
  from: string;
  name: string;
  backup: string;
};
type Source = { id: string; name: string; revision: string; kind: 'collection' };
type Props = {
  action: CollectionAction;
  source: Source;
  existingNames: string[];
  onClose: () => void;
  onCompleted: (result: { backup: string; name: string; sourceId: string }) => Promise<void> | void;
};

export function CollectionChangeDialog({
  action,
  source,
  existingNames,
  onClose,
  onCompleted,
}: Props) {
  const { t } = useSourceI18n('collection');
  const [name, setName] = useState(() => {
    if (action === 'rename') return source.name;
    const suffix = t(' — copie');
    return [...source.name].slice(0, 128 - [...suffix].length).join('') + suffix;
  });
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const trimmed = name.trim();
  const unchanged = action === 'rename' && trimmed === source.name;
  const exists = !unchanged && existingNames.includes(trimmed);
  let invalid = '';
  try {
    validateProfileName(name);
  } catch (reason) {
    invalid = reason instanceof Error ? reason.message : String(reason);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      completed ||
      !closed ||
      invalid ||
      unchanged ||
      exists ||
      source.kind !== 'collection'
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/profiles/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveId: source.id, revision: source.revision, name: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur de connexion');
      setCompleted(true);
      try {
        await onCompleted(result as { backup: string; name: string; sourceId: string });
      } catch {
        setError(
          'La modification est enregistrée. Actualisez les sources pour afficher le résultat.',
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
      label={action === 'rename' ? t('Renommer une collection') : t('Dupliquer une collection')}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="collection-change-dialog"
    >
      <span className="eyebrow">{t('COLLECTION LOCALE')}</span>
      <h2>
        {action === 'rename'
          ? t('Renommer « {{name}} »', { name: source.name })
          : t('Dupliquer « {{name}} »', { name: source.name })}
      </h2>
      <p>
        {action === 'rename'
          ? t(
              'Le nom change, les identifiants de mods et leur ordre enregistré restent identiques.',
            )
          : t(
              'Une nouvelle collection sera créée avec les mêmes identifiants de mods et le même ordre enregistré. La collection d’origine sera conservée.',
            )}
      </p>
      <p className="collection-change-scope">
        {t(
          'Les autres collections, les favoris, les sauvegardes et les abonnements Steam restent inchangés. Une copie de sécurité sera créée automatiquement.',
        )}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {translateError(error, t)}
        </div>
      )}
      {completed ? (
        <div className="modal-actions">
          <button className="button" disabled={busy} onClick={onClose}>
            {t('Fermer')}
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="collection-new-name">{t('Nouveau nom de collection')}</label>
          <input
            id="collection-new-name"
            maxLength={128}
            value={name}
            disabled={busy}
            autoComplete="off"
            aria-describedby="collection-name-hint"
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
          <p className="collection-change-hint" id="collection-name-hint">
            {invalid
              ? translateError(invalid, t)
              : exists
                ? t('Une collection porte déjà ce nom. Choisissez un autre nom.')
                : unchanged
                  ? t('Choisissez un nom différent du nom actuel.')
                  : t('Le nom doit être unique parmi les collections locales.')}
          </p>
          <label className="collection-change-check">
            <input
              type="checkbox"
              checked={closed}
              disabled={busy}
              onChange={(event) => setClosed(event.target.checked)}
            />
            <span>
              {t(
                'Project Zomboid est fermé. Je confirme cette modification des collections locales.',
              )}
            </span>
          </label>
          <div className="modal-actions">
            <button type="button" className="button" disabled={busy} onClick={onClose}>
              {t('Annuler')}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !closed || Boolean(invalid) || unchanged || exists}
            >
              {busy
                ? t('Enregistrement…')
                : action === 'rename'
                  ? t('Renommer la collection')
                  : t('Dupliquer la collection')}
            </button>
          </div>
        </form>
      )}
      {busy && (
        <span className="sr-only" role="status">
          {t('Modification de la collection en cours.')}
        </span>
      )}
    </Dialog>
  );
}

export function CollectionChangeNotice({
  entry,
  onDismiss,
}: {
  entry: CollectionChangeResult;
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
          <strong>
            {entry.action === 'rename' ? t('Collection renommée') : t('Collection dupliquée')}
          </strong>
          <span className="source-write-name">
            {entry.from} → {entry.name}
          </span>
        </div>
        <button
          type="button"
          className="source-write-dismiss"
          aria-label={t('Masquer la confirmation de modification')}
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
