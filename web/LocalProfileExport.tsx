import { useEffect, useState, type FormEvent } from 'react';
import { useSourceI18n } from './source-context';
import { translateError } from './messages';
import { Tooltip } from './ui/Tooltip';
import './local-profile.css';

type Props = {
  save: { id: string; name: string; revision: string };
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};
type Preview = {
  name: string;
  ids: string[];
  count: number;
  profileText: string;
  downloadText: string;
  profileRevision: string;
  exists: boolean;
};
type ExportResult = { backup?: string; created: boolean; replaced: boolean };

async function request<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(translateError(data.error || 'Erreur de connexion'));
  return data as T;
}

export function LocalProfileExport({ save, disabled = false, onBusyChange }: Props) {
  const { t } = useSourceI18n();
  const [name, setName] = useState(save.name.slice(0, 128));
  const [preview, setPreview] = useState<Preview>();
  const [phase, setPhase] = useState<'idle' | 'preview' | 'export'>('idle');
  const [gameClosed, setGameClosed] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ExportResult>();
  const busy = phase !== 'idle' || disabled;
  useEffect(() => {
    onBusyChange?.(phase !== 'idle');
    return () => onBusyChange?.(false);
  }, [phase, onBusyChange]);
  const payload = { saveId: save.id, revision: save.revision, name: name.trim() };

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setPhase('preview');
    setError('');
    setPreview(undefined);
    setResult(undefined);
    setGameClosed(false);
    setOverwrite(false);
    setCopied(false);
    try {
      setPreview(await request<Preview>('/api/profiles/preview', payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPhase('idle');
    }
  }

  async function writeProfile() {
    if (!preview || busy || !gameClosed || (preview.exists && !overwrite) || result) return;
    setPhase('export');
    setError('');
    try {
      const exported = await request<ExportResult>('/api/profiles/export', {
        ...payload,
        profileRevision: preview.profileRevision,
        overwrite: preview.exists && overwrite,
      });
      setResult(exported);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPreview(undefined);
      setGameClosed(false);
      setOverwrite(false);
    } finally {
      setPhase('idle');
    }
  }

  async function copyProfile() {
    if (!preview) return;
    setError('');
    try {
      await navigator.clipboard.writeText(preview.profileText);
      setCopied(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function downloadProfile() {
    if (!preview) return;
    const url = URL.createObjectURL(
      new Blob([preview.downloadText], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download =
      Array.from(preview.name, (character) => (character.charCodeAt(0) < 32 ? '_' : character))
        .join('')
        .replace(/[<>:"/\\|?*]/g, '_')
        .slice(0, 100) + '.cfg';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="local-profile" aria-labelledby="local-profile-title">
      <div className="local-profile-heading">
        <div>
          <span className="eyebrow">{t('COLLECTION LOCALE DU JEU')}</span>
          <h3 id="local-profile-title">{t('Exporter un profil de mods')}</h3>
        </div>
        <span className="tag neutral">{t('SANS STEAM')}</span>
      </div>
      <p>
        {t(
          'Créez un profil réutilisable à partir des mods de cette sauvegarde, y compris les mods locaux et les identifiants qualifiés 123/Mod.',
        )}
      </p>
      <form onSubmit={(event) => void prepare(event)} className="local-profile-form">
        <label htmlFor="local-profile-name">{t('Nom du profil')}</label>
        <div className="local-profile-name-row">
          <input
            id="local-profile-name"
            value={name}
            maxLength={128}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              setPreview(undefined);
              setResult(undefined);
              setGameClosed(false);
              setOverwrite(false);
              setCopied(false);
              setError('');
            }}
          />
          <Tooltip
            content={t(
              'La prévisualisation lit les informations nécessaires, sans créer ni remplacer de profil.',
            )}
          >
            <button className="button" type="submit" disabled={busy || !name.trim()}>
              {phase === 'preview' ? t('Préparation…') : t('Prévisualiser le profil')}
            </button>
          </Tooltip>
        </div>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {translateError(error, t)}
        </div>
      )}
      {preview && (
        <div className="local-profile-preview">
          <div className="local-profile-summary">
            <strong>{preview.name}</strong>
            <span className="tag">{t('{{count}} ID(s)', { count: preview.count })}</span>
            {preview.exists && <span className="tag neutral">{t('PROFIL EXISTANT')}</span>}
          </div>
          <label htmlFor="local-profile-text">{t('Texte du profil à partager')}</label>
          <textarea id="local-profile-text" readOnly rows={4} value={preview.profileText} />
          <div className="local-profile-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void copyProfile()}
            >
              {t('Copier le texte du profil')}
            </button>
            <button type="button" className="button" disabled={busy} onClick={downloadProfile}>
              {t('Télécharger ce profil .cfg')}
            </button>
          </div>
          {copied && (
            <p className="local-profile-notice" role="status">
              {t('Texte du profil copié.')}
            </p>
          )}
          <p className="local-profile-note">
            {t(
              'Le fichier téléchargé contient uniquement ce profil. Ne remplacez pas votre fichier de profils existant avec ce téléchargement : collez le texte dans la fonction Ajouter du jeu, ou utilisez la création directe ci-dessous.',
            )}
          </p>
          <p className="local-profile-note">
            {t(
              'Le jeu peut réordonner les profils et leurs mods. Ce profil ne garantit pas l’ordre de chargement de la sauvegarde.',
            )}
          </p>
          <div className="local-profile-direct">
            <h4>{t('Enregistrer directement dans le jeu')}</h4>
            <p>
              {t(
                'Le profil sera enregistré dans <Zomboid>/Lua/pz_modlist_settings.cfg. Les favoris et les autres profils seront conservés. Une copie de sécurité sera créée avant toute modification du fichier existant.',
              )}
            </p>
            {result ? (
              <div className="local-profile-result" role="status">
                <strong>
                  {result.replaced
                    ? t('Profil local remplacé.')
                    : result.created
                      ? t('Profil local créé.')
                      : t('Profil local enregistré.')}
                </strong>
                {result.backup && (
                  <p>{t('Copie de sécurité : {{backup}}', { backup: result.backup })}</p>
                )}
              </div>
            ) : (
              <>
                {preview.exists && (
                  <p className="local-profile-overwrite">
                    {t(
                      'Un profil porte déjà ce nom. Seul ce profil sera remplacé si vous le confirmez.',
                    )}
                  </p>
                )}
                <label className="local-profile-check">
                  <input
                    type="checkbox"
                    checked={gameClosed}
                    disabled={busy}
                    onChange={(event) => setGameClosed(event.target.checked)}
                  />
                  <span>
                    {t(
                      'Project Zomboid est fermé. Je confirme l’enregistrement de ce profil local.',
                    )}
                  </span>
                </label>
                {preview.exists && (
                  <label className="local-profile-check">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      disabled={busy}
                      onChange={(event) => setOverwrite(event.target.checked)}
                    />
                    <span>
                      {t('Je confirme le remplacement du profil existant « {{name}} ».', {
                        name: preview.name,
                      })}
                    </span>
                  </label>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || !gameClosed || (preview.exists && !overwrite)}
                  onClick={() => void writeProfile()}
                >
                  {phase === 'export'
                    ? t('Enregistrement…')
                    : preview.exists
                      ? t('Remplacer le profil local')
                      : t('Créer le profil local')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {phase !== 'idle' && (
        <span className="sr-only" role="status">
          {phase === 'preview'
            ? t('Prévisualisation du profil en cours.')
            : t('Enregistrement du profil en cours.')}
        </span>
      )}
    </section>
  );
}
