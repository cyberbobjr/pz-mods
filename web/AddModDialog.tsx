import { useState, type FormEvent } from 'react';
import type { Issue, LoadOrderViolation } from '../src/domain/mods';
import { Dialog } from './Dialog';
import { useSourceI18n } from './source-context';
import { translateError, translateIssue, translateOrderViolation } from './messages';
import { Tooltip } from './ui/Tooltip';
import './add-mod.css';

type Props = {
  save: { id: string; name: string; revision: string };
  initialId?: string;
  onClose: () => void;
  onAdded: (backup?: string) => Promise<void> | void;
};
type Preview = {
  id: string;
  ids: string[];
  issues: Issue[];
  orderViolations: LoadOrderViolation[];
  alreadyActive: boolean;
  missing: boolean;
};
async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(translateError(result.error || 'Erreur de connexion'));
  return result as T;
}

export function AddModDialog({ save, initialId = '', onClose, onAdded }: Props) {
  const { t } = useSourceI18n();
  const [id, setId] = useState(initialId);
  const [preview, setPreview] = useState<Preview>();
  const [phase, setPhase] = useState<'idle' | 'checking' | 'adding'>('idle');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [completion, setCompletion] = useState<{ backup?: string; alreadyActive: boolean }>();
  const busy = phase !== 'idle';
  const payload = { saveId: save.id, revision: save.revision, id: id.trim() };
  const normalize = (value: string) => value.replace(/^\\+/, '').replace(/^\d+\//, '');
  const relatedIssues =
    preview?.issues.filter(
      (issue) => issue.modId === normalize(preview.id) || issue.target === normalize(preview.id),
    ) || [];
  const otherIssues = preview?.issues.filter((issue) => !relatedIssues.includes(issue)) || [];

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id.trim() || busy || completion) return;
    setPhase('checking');
    setError('');
    setPreview(undefined);
    setConfirmed(false);
    try {
      setPreview(await post<Preview>('/api/add/validate', payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPhase('idle');
    }
  }

  async function add() {
    if (!preview || preview.alreadyActive || !confirmed || busy || completion) return;
    setPhase('adding');
    setError('');
    try {
      const result = await post<{ backup?: string; alreadyActive: boolean; id: string }>(
        '/api/add',
        payload,
      );
      setCompletion(result);
      try {
        await onAdded(result.backup);
        onClose();
      } catch {
        // The write succeeded even if refreshing the parent view failed.
        setError('L’ajout est enregistré. Actualisez la bibliothèque pour voir le résultat.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPhase('idle');
    }
  }

  function issueList(issues: Issue[]) {
    return (
      <ul className="add-mod-issues">
        {issues.map((issue, index) => (
          <li key={index}>
            <span className={'tag ' + (issue.severity === 'error' ? 'danger' : 'neutral')}>
              {issue.severity === 'error' ? t('ERREUR') : t('AVERTISSEMENT')}
            </span>
            <div>
              <code>
                {issue.modId}
                {issue.target ? ' → ' + issue.target : ''}
              </code>
              <p>{translateIssue(issue, t)}</p>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Dialog
      label={t('Ajouter un mod à la sauvegarde')}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="add-mod-dialog"
    >
      <div className="add-mod-heading">
        <div>
          <span className="eyebrow">{t('COMPLÉTER VOTRE PARTIE')}</span>
          <h2>{t('Ajouter un mod')}</h2>
          <p>{t('Sauvegarde : {{name}}', { name: save.name })}</p>
        </div>
        <button className="button" aria-label={t('Fermer')} disabled={busy} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="add-mod-intro">
        {t(
          'Ajoutez un identifiant de mod à la fin de la liste active. Aucun téléchargement ni abonnement Steam n’est effectué.',
        )}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {translateError(error, t)}
        </div>
      )}
      {completion ? (
        <div className="add-mod-success" role="status">
          <h3>
            {completion.alreadyActive
              ? t('Ce mod est déjà actif. Aucune modification nécessaire.')
              : t('Mod ajouté à la sauvegarde')}
          </h3>
          {completion.backup && (
            <p>{t('Copie de sécurité : {{backup}}', { backup: completion.backup })}</p>
          )}
          <button className="button" onClick={onClose}>
            {t('Fermer')}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={(event) => void check(event)} className="add-mod-form">
            <div className="add-mod-label">
              <label htmlFor="add-mod-id">{t('Identifiant du mod')}</label>
              <Tooltip
                content={t(
                  'Utilisez l’identifiant déclaré dans mod.info, et non le nom du mod ou l’URL Steam. Un identifiant qualifié Workshop/ModId est accepté.',
                )}
              >
                <button
                  type="button"
                  className="add-mod-help"
                  aria-label={t('Comprendre les identifiants de mods')}
                >
                  ?
                </button>
              </Tooltip>
            </div>
            <div className="add-mod-input-row">
              <input
                id="add-mod-id"
                value={id}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                placeholder={t('Exemple : MonMod ou 123456789/MonMod')}
                onChange={(event) => {
                  setId(event.target.value);
                  setPreview(undefined);
                  setConfirmed(false);
                  setError('');
                }}
              />
              <button className="button" type="submit" disabled={busy || !id.trim()}>
                {phase === 'checking' ? t('Vérification…') : t('Vérifier')}
              </button>
            </div>
          </form>
          {preview && (
            <section className="add-mod-preview" aria-label={t('Aperçu de l’ajout')}>
              <div className="add-mod-resolved">
                <div>
                  <span>{t('Identifiant résolu')}</span>
                  <code>{preview.id}</code>
                </div>
                <span className={'tag ' + (preview.alreadyActive ? 'neutral' : '')}>
                  {preview.alreadyActive
                    ? t('DÉJÀ ACTIF')
                    : t('Position {{position}} · fin de liste', { position: preview.ids.length })}
                </span>
              </div>
              {preview.alreadyActive && (
                <p className="add-mod-already" role="status">
                  {t('Ce mod est déjà actif dans cette sauvegarde. Aucun doublon ne sera ajouté.')}
                </p>
              )}
              {preview.missing && (
                <div className="add-mod-warning">
                  <strong>{t('Fichiers du mod introuvables')}</strong>
                  <p>
                    {t(
                      'L’identifiant peut être enregistré, mais vous devrez installer le mod avant de lancer cette partie.',
                    )}
                  </p>
                </div>
              )}
              {relatedIssues.length > 0 && (
                <div className="add-mod-diagnostics">
                  <h3>{t('Points concernant le mod ajouté')}</h3>
                  {issueList(relatedIssues)}
                </div>
              )}
              {otherIssues.length > 0 && (
                <details className="add-mod-global">
                  <summary>
                    {t('Autres points dans la sauvegarde : {{count}}', {
                      count: otherIssues.length,
                    })}
                  </summary>
                  {issueList(otherIssues)}
                </details>
              )}
              {preview.orderViolations.length > 0 && (
                <div className="add-mod-diagnostics">
                  <h3>{t('Contraintes de chargement à vérifier')}</h3>
                  <ul className="add-mod-order">
                    {preview.orderViolations.map((issue, index) => (
                      <li key={index}>{translateOrderViolation(issue, t)}</li>
                    ))}
                  </ul>
                  <p className="hint">
                    {t(
                      'Le mod sera ajouté en dernière position. Utilisez ensuite l’éditeur d’ordre si nécessaire.',
                    )}
                  </p>
                </div>
              )}
              {!preview.issues.length && !preview.orderViolations.length && (
                <p className="add-mod-clear">
                  {t(
                    'Aucune anomalie déclarée détectée dans cet aperçu. Les conflits non déclarés restent possibles.',
                  )}
                </p>
              )}
              {!preview.alreadyActive && (
                <div className="add-mod-confirmation">
                  <p>
                    {t(
                      'Une copie de mods.txt sera créée avant l’ajout. Conservez également une copie complète de votre sauvegarde.',
                    )}
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      {t(
                        'Project Zomboid est fermé. Je confirme l’ajout de cet identifiant à cette sauvegarde.',
                      )}
                    </span>
                  </label>
                </div>
              )}
            </section>
          )}
          <div className="add-mod-actions">
            <button className="button" disabled={busy} onClick={onClose}>
              {t('Annuler')}
            </button>
            <button
              className="button primary"
              disabled={busy || !preview || preview.alreadyActive || !confirmed}
              onClick={() => void add()}
            >
              {phase === 'adding' ? t('Ajout en cours…') : t('Ajouter à la sauvegarde')}
            </button>
          </div>
          {busy && (
            <span className="sr-only" role="status">
              {phase === 'checking'
                ? t('Vérification du mod en cours.')
                : t('Enregistrement du mod en cours.')}
            </span>
          )}
        </>
      )}
    </Dialog>
  );
}
