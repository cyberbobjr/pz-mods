import { useEffect, useState, type FormEvent } from 'react';
import type { Theme } from './theme';
import { useI18n } from './i18n';
import { translateError } from './messages';
import { Select } from './ui/Select';
import { Tooltip } from './ui/Tooltip';
import './settings.css';

type Paths = {
  userDir: string;
  steamPath: string;
  savesDir: string;
  localModsDirs: string[];
  workshopDirs: string[];
};
type Settings = { paths: Paths; overrides: Partial<Paths> };
type Draft = Record<keyof Paths, string>;
type Props = {
  language: 'fr' | 'en';
  onLanguageChange: (language: 'fr' | 'en') => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onPathsChanged: () => void;
};
const EMPTY_DRAFT: Draft = {
  userDir: '',
  steamPath: '',
  savesDir: '',
  localModsDirs: '',
  workshopDirs: '',
};

function draftFrom(overrides: Partial<Paths>): Draft {
  return {
    userDir: overrides.userDir || '',
    steamPath: overrides.steamPath || '',
    savesDir: overrides.savesDir || '',
    localModsDirs: overrides.localModsDirs?.join('\n') || '',
    workshopDirs: overrides.workshopDirs?.join('\n') || '',
  };
}
function overridesFrom(draft: Draft): Partial<Paths> {
  const overrides: Partial<Paths> = {};
  for (const field of ['userDir', 'steamPath', 'savesDir'] as const) {
    const value = draft[field].trim();
    if (value) overrides[field] = value;
  }
  for (const field of ['localModsDirs', 'workshopDirs'] as const) {
    const values = draft[field]
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length) overrides[field] = [...new Set(values)];
  }
  return overrides;
}
async function settingsRequest(overrides?: Partial<Paths>): Promise<Settings> {
  const response = await fetch(
    '/api/settings',
    overrides === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: overrides }),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(translateError(result.error || 'Erreur de connexion'));
  return result as Settings;
}

export function SettingsPage({
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  onPathsChanged,
}: Props) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings>();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<'saved' | 'reset'>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    settingsRequest()
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
          setDraft(draftFrom(value.overrides));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  async function savePaths(reset = false) {
    setSaving(true);
    setError('');
    setNotice(undefined);
    try {
      const value = await settingsRequest(reset ? {} : overridesFrom(draft));
      setSettings(value);
      setDraft(draftFrom(value.overrides));
      setNotice(reset ? 'reset' : 'saved');
      onPathsChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePaths();
  }
  function update(field: keyof Paths, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice(undefined);
  }
  const fields: Array<{ key: keyof Paths; label: string; help: string; multiple?: boolean }> = [
    {
      key: 'userDir',
      label: t('Dossier utilisateur Zomboid'),
      help: t('Dossier principal contenant les données utilisateur du jeu.'),
    },
    {
      key: 'steamPath',
      label: t('Installation Steam'),
      help: t('Dossier d’installation du client Steam utilisé pour détecter les bibliothèques.'),
    },
    {
      key: 'savesDir',
      label: t('Sauvegardes solo'),
      help: t('Dossier Saves contenant les modes de jeu et leurs sauvegardes.'),
    },
    {
      key: 'localModsDirs',
      label: t('Dossiers de mods locaux'),
      help: t('Un dossier par ligne. Ces dossiers contiennent les mods installés hors Workshop.'),
      multiple: true,
    },
    {
      key: 'workshopDirs',
      label: t('Dossiers Workshop de Project Zomboid'),
      help: t(
        'Un dossier par ligne. Utilisez les dossiers Workshop contenant les éléments de l’application 108600.',
      ),
      multiple: true,
    },
  ];
  const dirty =
    settings &&
    JSON.stringify(overridesFrom(draft)) !==
      JSON.stringify(overridesFrom(draftFrom(settings.overrides)));
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-intro">
        <span className="eyebrow">{t('VOTRE ESPACE DE TRAVAIL')}</span>
        <h1 id="settings-title">{t('Configuration')}</h1>
        <p>{t('Adaptez l’interface et choisissez les dossiers à analyser sur cet ordinateur.')}</p>
      </div>
      <section className="settings-section" aria-labelledby="appearance-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon" aria-hidden="true">
            ◐
          </span>
          <div>
            <h2 id="appearance-title">{t('Apparence')}</h2>
            <p>{t('Les changements de langue et de thème s’appliquent immédiatement.')}</p>
          </div>
        </div>
        <div className="settings-appearance-grid">
          <div className="settings-field">
            <label htmlFor="settings-language">{t('Langue de l’interface')}</label>
            <Select
              id="settings-language"
              label={t('Langue de l’interface')}
              value={language}
              onValueChange={(value) => onLanguageChange(value as 'fr' | 'en')}
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
          <div className="settings-field">
            <label htmlFor="settings-theme">{t('Thème de l’interface')}</label>
            <Select
              id="settings-theme"
              label={t('Thème de l’interface')}
              value={theme}
              onValueChange={(value) => onThemeChange(value as Theme)}
              options={[
                { value: 'survivor', label: t('Survivant · olive et menthe') },
                { value: 'midnight', label: t('Nocturne · bleu profond') },
                { value: 'amethyst', label: t('Améthyste · violet') },
                { value: 'copper', label: t('Cuivre · tons chauds') },
              ]}
            />
          </div>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="paths-title">
        <div className="settings-section-heading">
          <span className="settings-section-icon" aria-hidden="true">
            ⌁
          </span>
          <div>
            <h2 id="paths-title">{t('Dossiers du jeu')}</h2>
            <p>
              {t(
                'Laissez un champ vide pour utiliser la détection automatique. Les chemins indiqués en exemple sont les chemins actuellement utilisés.',
              )}
            </p>
          </div>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {translateError(error)}
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice === 'reset'
              ? t('Détection automatique rétablie. La bibliothèque est actualisée.')
              : t('Dossiers enregistrés. La bibliothèque est actualisée.')}
          </div>
        )}
        {loading ? (
          <p className="settings-loading" role="status">
            {t('Détection des dossiers…')}
          </p>
        ) : !settings ? (
          <div className="settings-retry">
            <button className="button" onClick={() => setRetry((value) => value + 1)}>
              {t('Réessayer')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={saving} className="settings-fields">
              <legend className="sr-only">{t('Chemins personnalisés')}</legend>
              {fields.map((field) => {
                const effective = settings.paths[field.key];
                const effectiveText = Array.isArray(effective)
                  ? effective.join('\n')
                  : effective || '';
                const helpId = 'settings-help-' + field.key;
                return (
                  <div
                    className={'settings-field' + (field.multiple ? ' settings-field-wide' : '')}
                    key={field.key}
                  >
                    <div className="settings-label-row">
                      <label htmlFor={'settings-' + field.key}>{field.label}</label>
                      <Tooltip content={field.help}>
                        <button
                          type="button"
                          className="settings-help"
                          aria-label={t('Aide : {{label}}', { label: field.label })}
                        >
                          ?
                        </button>
                      </Tooltip>
                      <span
                        className={
                          'settings-path-badge' + (draft[field.key].trim() ? ' custom' : '')
                        }
                      >
                        {draft[field.key].trim() ? t('PERSONNALISÉ') : t('AUTOMATIQUE')}
                      </span>
                    </div>
                    {field.multiple ? (
                      <textarea
                        id={'settings-' + field.key}
                        rows={3}
                        value={draft[field.key]}
                        placeholder={effectiveText || t('Détection automatique')}
                        aria-describedby={helpId}
                        spellCheck={false}
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        id={'settings-' + field.key}
                        type="text"
                        value={draft[field.key]}
                        placeholder={effectiveText || t('Détection automatique')}
                        aria-describedby={helpId}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    )}
                    <small id={helpId}>{field.help}</small>
                  </div>
                );
              })}
            </fieldset>
            <div className="settings-development">
              <h3>{t('Projets de développement et chargeurs locaux')}</h3>
              <p>
                {t(
                  'Les projets de mods sont recherchés dans le dossier Workshop du dossier utilisateur Zomboid. Ce chemin suit automatiquement votre réglage du dossier utilisateur.',
                )}
              </p>
              <code>{settings.paths.userDir.replace(/[\\/]$/, '') + '/Workshop'}</code>
            </div>
            <details className="settings-effective">
              <summary>{t('Voir tous les chemins actuellement utilisés')}</summary>
              <dl>
                {fields.map((field) => {
                  const value = settings.paths[field.key];
                  return (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>
                        {(Array.isArray(value) ? value.join('\n') : value) ||
                          t('Aucun dossier détecté')}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </details>
            <div className="settings-footer">
              <p>
                {t(
                  'Ces réglages changent les dossiers analysés. Aucun fichier de sauvegarde ni aucun mod n’est déplacé.',
                )}
              </p>
              <div className="settings-actions">
                <button
                  className="button"
                  type="button"
                  disabled={saving || !Object.keys(settings.overrides).length}
                  onClick={() => void savePaths(true)}
                >
                  {t('Rétablir la détection automatique')}
                </button>
                <button className="button primary" type="submit" disabled={saving || !dirty}>
                  {saving ? t('Enregistrement…') : t('Enregistrer les dossiers')}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}
