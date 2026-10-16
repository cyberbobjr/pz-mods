import { Tooltip } from './ui/Tooltip';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Mod, WorkshopDetail, LoadOrderViolation } from '../src/domain/mods';
import { normalize } from '../src/domain/mods';
import { Dialog } from './Dialog';
import { loadPosition } from './load-order';
import { orderDraftReducer } from './order-draft';
import { useI18n } from './i18n';
import { translateOrderViolation, translateError } from './messages';

export type OrderValidation = {
  violations: LoadOrderViolation[];
  newViolations: LoadOrderViolation[];
};
type Props = {
  ids: string[];
  saveName: string;
  mods: Mod[];
  steam: Record<string, WorkshopDetail>;
  onValidate: (ids: string[]) => Promise<OrderValidation>;
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
};

function PositionField({
  position,
  total,
  disabled,
  name,
  onMove,
}: {
  position: number;
  total: number;
  disabled: boolean;
  name: string;
  onMove: (position: number) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(position));
  useEffect(() => setValue(String(position)), [position]);
  function commit() {
    const next = Number(value);
    if (Number.isInteger(next) && next >= 1 && next <= total) onMove(next);
    else setValue(String(position));
  }
  return (
    <input
      className="order-position-input"
      type="number"
      min={1}
      max={total}
      value={value}
      disabled={disabled}
      aria-label={t('Position de {{name}}', { name })}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function OrderEditor(props: Props) {
  const { t, language } = useI18n();
  const [draft, dispatch] = useReducer(orderDraftReducer, {
    past: [],
    ids: [...props.ids],
    future: [],
  });
  const [search, setSearch] = useState('');
  const [validation, setValidation] = useState<OrderValidation>();
  const [validatedIds, setValidatedIds] = useState<string[]>();
  const [validationError, setValidationError] = useState('');
  const [validating, setValidating] = useState(true);
  const [retry, setRetry] = useState(0);
  const [stage, setStage] = useState<'edit' | 'review' | 'discard'>('edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [dropTarget, setDropTarget] = useState<string>();
  const dragged = useRef<string | undefined>(undefined);
  const changed = draft.ids.filter((id, index) => props.ids[index] !== id).length;
  const blocked =
    validating ||
    validatedIds !== draft.ids ||
    !!validationError ||
    !validation ||
    validation.newViolations.length > 0;
  const { onValidate } = props;

  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    setValidationError('');
    const timer = setTimeout(() => {
      onValidate(draft.ids)
        .then((result) => {
          if (!cancelled) {
            setValidation(result);
            setValidatedIds(draft.ids);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setValidationError(
              error instanceof Error ? error.message : t('Validation indisponible.'),
            );
        })
        .finally(() => {
          if (!cancelled) setValidating(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.ids, onValidate, retry, t]);

  const resolved = useMemo(
    () =>
      new Map(
        props.ids.map((raw) => [raw, props.mods.find((mod) => loadPosition(mod, [raw]) === 1)]),
      ),
    [props.ids, props.mods],
  );
  const resolve = (raw: string) => resolved.get(raw);
  const label = (raw: string) => resolve(raw)?.name || raw;
  function move(from: number, to: number) {
    if (saving) return;
    dispatch({ type: 'move', from, to });
    setSaveError('');
    setAnnouncement(
      t('{{name}} déplacé à la position {{position}}.', {
        name: label(draft.ids[from]),
        position: to + 1,
      }),
    );
  }
  function close() {
    if (saving) return;
    if (changed) setStage('discard');
    else props.onClose();
  }
  async function save() {
    if (blocked || !changed) return;
    setSaving(true);
    setSaveError('');
    try {
      await props.onSave(draft.ids);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('Enregistrement impossible.'));
      setSaving(false);
    }
  }
  const query = search.trim().toLocaleLowerCase(language);
  const rows = draft.ids
    .map((id, index) => ({ id, index, mod: resolve(id) }))
    .filter(({ id, mod }) =>
      `${id} ${mod?.name || ''}`.toLocaleLowerCase(language).includes(query),
    );
  const validationCurrent = !validating && validatedIds === draft.ids && !validationError;
  function rowFeedback(raw: string) {
    if (!validationCurrent || !validation) return undefined;
    const id = normalize(raw);
    const own = validation.violations.filter((issue) => issue.modId === id);
    if (own.length) {
      const hasNew = validation.newViolations.some((issue) => issue.modId === id);
      return {
        tone: hasNew ? 'invalid-new' : 'invalid-existing',
        label: hasNew ? t('À DÉPLACER · BLOQUANT') : t('À DÉPLACER · DÉJÀ PRÉSENT'),
        messages: own.map((issue) => translateOrderViolation(issue, t)),
      };
    }
    const referenced = validation.violations.filter((issue) => issue.target === id);
    if (referenced.length)
      return {
        tone: 'reference',
        label: t('REPÈRE DE CHARGEMENT'),
        messages: referenced.map((issue) => translateOrderViolation(issue, t)),
      };
    return undefined;
  }

  return (
    <Dialog label={t('Modifier l’ordre de chargement')} className="order-editor" onClose={close}>
      <header className="order-editor-header">
        <div>
          <span className="eyebrow">{t('ORDRE DE LA SAUVEGARDE')}</span>
          <h2>{t('Organisez vos mods')}</h2>
          <p>
            {props.saveName} · {t('{{count}} IDs actifs', { count: draft.ids.length })} ·{' '}
            {t('{{count}} position(s) modifiée(s)', { count: changed })}
          </p>
        </div>
        <button
          className="detail-close"
          disabled={saving}
          aria-label={t('Fermer l’éditeur')}
          onClick={close}
        >
          ×
        </button>
      </header>
      <div className="order-editor-content">
        {stage === 'discard' ? (
          <section className="order-review">
            <h3>{t('Abandonner le brouillon ?')}</h3>
            <p>
              {t(
                'Vos changements d’ordre ne sont pas enregistrés. La sauvegarde n’a pas été modifiée.',
              )}
            </p>
            <div className="modal-actions">
              <button className="button" onClick={() => setStage('edit')}>
                {t('Continuer l’édition')}
              </button>
              <button className="button destructive" onClick={props.onClose}>
                {t('Abandonner')}
              </button>
            </div>
          </section>
        ) : (
          <>
            {stage === 'review' ? (
              <section className="order-review">
                <h3>{t('Appliquer ce nouvel ordre ?')}</h3>
                <p>
                  {t(
                    'Fermez Project Zomboid avant de confirmer. Une copie de mods.txt sera créée automatiquement. Les mêmes IDs seront conservés : aucun mod ajouté, retiré ou désabonné.',
                  )}
                </p>
                <details>
                  <summary>
                    {t('Voir les {{count}} positions modifiées', { count: changed })}
                  </summary>
                  <ol>
                    {draft.ids.map(
                      (id, index) =>
                        props.ids[index] !== id && (
                          <li key={id}>
                            <strong>#{index + 1}</strong> {label(id)}{' '}
                            <small>
                              {t('(auparavant #{{position}})', {
                                position: props.ids.indexOf(id) + 1,
                              })}
                            </small>
                          </li>
                        ),
                    )}
                  </ol>
                </details>
              </section>
            ) : (
              <>
                <p className="order-instructions">
                  {t(
                    'Glissez une ligne pour la déplacer, utilisez les flèches ↑ / ↓ ou saisissez sa position. Les sous-mods restent indépendants de leur parent Workshop.',
                  )}
                </p>
                <div className="order-tools">
                  <div className="search-field">
                    <input
                      aria-label={t('Rechercher dans l’ordre des mods')}
                      placeholder={t('Rechercher un nom ou un ID…')}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                      <button
                        className="search-clear"
                        aria-label={t('Effacer le filtre de l’éditeur')}
                        onClick={() => setSearch('')}
                      >
                        {t('Effacer ×')}
                      </button>
                    )}
                  </div>
                  <Tooltip
                    content={t(
                      'Annule le dernier déplacement dans le brouillon, sans modifier la sauvegarde.',
                    )}
                  >
                    <button
                      className="button"
                      disabled={!draft.past.length}
                      onClick={() => dispatch({ type: 'undo' })}
                    >
                      {t('↶ Annuler')}
                    </button>
                  </Tooltip>
                  <Tooltip content={t('Rétablit le dernier déplacement annulé dans le brouillon.')}>
                    <button
                      className="button"
                      disabled={!draft.future.length}
                      onClick={() => dispatch({ type: 'redo' })}
                    >
                      {t('↷ Rétablir')}
                    </button>
                  </Tooltip>
                  <Tooltip
                    content={t('Restaure le brouillon à l’ordre enregistré dans la sauvegarde.')}
                  >
                    <button
                      className="button"
                      disabled={!changed}
                      onClick={() => dispatch({ type: 'reset', ids: props.ids })}
                    >
                      {t('Ordre initial')}
                    </button>
                  </Tooltip>
                </div>
                <div className="order-legend" aria-label={t('Légende des couleurs')}>
                  <span className="legend-new">{t('Rouge : nouvelle violation bloquante')}</span>
                  <span className="legend-existing">{t('Orange : problème déjà présent')}</span>
                  <span className="legend-reference">{t('Bleu : mod servant de repère')}</span>
                </div>
                {query && (
                  <p className="detail-footnote">
                    {t(
                      '{{count}} résultat(s). Les numéros sont les positions réelles dans la liste complète.',
                      { count: rows.length },
                    )}
                  </p>
                )}
                <div className="order-list" role="list" aria-label={t('Ordre proposé des mods')}>
                  {rows.map(({ id, index, mod }) => {
                    const feedback = rowFeedback(id);
                    return (
                      <div
                        role="listitem"
                        className={
                          'order-row ' +
                          (dropTarget === id ? 'drop-target' : '') +
                          (props.ids[index] !== id ? ' moved' : '') +
                          (feedback ? ' order-' + feedback.tone : '')
                        }
                        title={feedback?.messages.join('\n')}
                        key={id}
                        draggable
                        onDragStart={(event) => {
                          dragged.current = id;
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', id);
                        }}
                        onDragEnd={() => {
                          dragged.current = undefined;
                          setDropTarget(undefined);
                        }}
                        onDragOver={(event) => {
                          if (dragged.current) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDropTarget(id);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const source = dragged.current;
                          if (source) move(draft.ids.indexOf(source), index);
                          dragged.current = undefined;
                          setDropTarget(undefined);
                        }}
                      >
                        <span className="drag-grip" aria-hidden="true">
                          ⠿
                        </span>
                        <span className="order-index">#{index + 1}</span>
                        <div className="order-mod">
                          <strong>{mod?.name || id}</strong>
                          <code>{id}</code>
                          <small>
                            {mod?.workshopId
                              ? props.steam[mod.workshopId]?.title ||
                                t('Workshop #{{id}}', { id: mod.workshopId })
                              : mod
                                ? t('Mod local')
                                : t('Fichiers introuvables')}
                          </small>
                          {feedback && (
                            <div className={'order-feedback ' + feedback.tone}>
                              <span className="order-feedback-badge">{feedback.label}</span>
                              <span className="order-row-reason">
                                {feedback.messages.join(' ')}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="order-row-controls">
                          <button
                            className="button"
                            disabled={index === 0}
                            aria-label={t('Monter {{name}}', { name: label(id) })}
                            onClick={() => move(index, index - 1)}
                          >
                            ↑
                          </button>
                          <button
                            className="button"
                            disabled={index === draft.ids.length - 1}
                            aria-label={t('Descendre {{name}}', { name: label(id) })}
                            onClick={() => move(index, index + 1)}
                          >
                            ↓
                          </button>
                          <PositionField
                            position={index + 1}
                            total={draft.ids.length}
                            name={label(id)}
                            disabled={saving}
                            onMove={(position) => move(index, position - 1)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {rows.length === 0 && (
                  <p className="empty">{t('Aucun mod ne correspond à cette recherche.')}</p>
                )}
              </>
            )}
            <div
              className={
                'order-validation ' +
                (validationCurrent && validation?.newViolations.length
                  ? 'validation-blocked'
                  : validationCurrent && validation?.violations.length
                    ? 'validation-warning'
                    : '')
              }
              aria-live="polite"
            >
              {validating ? (
                <p>{t('Vérification des prérequis et contraintes de chargement…')}</p>
              ) : validationError ? (
                <div role="alert">
                  <p>{translateError(validationError)}</p>
                  <button className="button" onClick={() => setRetry((value) => value + 1)}>
                    {t('Réessayer')}
                  </button>
                </div>
              ) : (
                validation && (
                  <>
                    <strong>
                      {validation.newViolations.length
                        ? t(
                            '{{count}} nouvelle(s) contrainte(s) non respectée(s) — application bloquée',
                            { count: validation.newViolations.length },
                          )
                        : t('Aucune nouvelle contrainte d’ordre enfreinte')}
                    </strong>
                    {validation.violations.length > 0 && (
                      <details open={validation.newViolations.length > 0}>
                        <summary>
                          {t('{{count}} contrainte(s) à vérifier au total', {
                            count: validation.violations.length,
                          })}
                        </summary>
                        <ul>
                          {validation.violations.map((issue, index) => (
                            <li key={index}>{translateOrderViolation(issue, t)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <p>
                      {t(
                        'Seules les contraintes déclarées sont vérifiées. Les problèmes déjà présents n’empêchent pas une correction progressive ; les nouvelles violations sont bloquées.',
                      )}
                    </p>
                  </>
                )
              )}
            </div>
            {saveError && (
              <div className="alert error" role="alert">
                {translateError(saveError)}
              </div>
            )}
          </>
        )}
      </div>
      <div className="sr-only" role="status">
        {announcement}
      </div>
      {stage !== 'discard' && (
        <footer className="order-editor-footer">
          <button
            className="button"
            disabled={saving}
            onClick={stage === 'review' ? () => setStage('edit') : close}
          >
            {stage === 'review' ? t('← Revenir au brouillon') : t('Fermer')}
          </button>
          <button
            className="button primary"
            disabled={!changed || blocked || saving}
            onClick={stage === 'review' ? save : () => setStage('review')}
          >
            {saving
              ? t('Enregistrement…')
              : stage === 'review'
                ? t('Confirmer et enregistrer')
                : t('Vérifier et appliquer')}
          </button>
        </footer>
      )}
    </Dialog>
  );
}
