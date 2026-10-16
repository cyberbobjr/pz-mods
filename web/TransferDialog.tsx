import { Tooltip } from './ui/Tooltip';
import type { TransferWarning, TransferResult as TransferPreview } from '../src/domain/transfers';
import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { useI18n } from './i18n';
import { translateError } from './messages';

type Props = {
  save?: { id: string; name: string; revision: string };
  onClose: () => void;
};
type Failure = { id: string; error: string };
type ActionResult = { succeeded: string[]; existing: string[]; failed: Failure[] };
type Confirmation = 'subscribe' | 'collection';

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(translateError(result.error || 'Erreur de connexion'));
  return result as T;
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TransferDialog({ save, onClose }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'export' | 'import'>(save ? 'export' : 'import');
  const [exportPreview, setExportPreview] = useState<TransferPreview>();
  const [importPreview, setImportPreview] = useState<TransferPreview>();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [steam, setSteam] = useState({ available: false, connected: false });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [result, setResult] = useState<ActionResult>();
  const [title, setTitle] = useState(save?.name || 'Project Zomboid');
  const [collectionPending, setCollectionPending] = useState(false);
  const [collectionId, setCollectionId] = useState<string>();
  const preview = tab === 'export' ? exportPreview : importPreview;
  const ids = preview?.manifest.workshopIds || [];
  const saveId = save?.id;
  const revision = save?.revision;

  useEffect(() => {
    let cancelled = false;
    request<{ available: boolean; connected: boolean }>('/api/steam/status')
      .then((status) => {
        if (!cancelled) setSteam(status);
      })
      .catch(() => {
        if (!cancelled) setSteam({ available: false, connected: false });
      })
      .finally(() => {
        if (!cancelled) setStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!saveId || !revision) return;
    let cancelled = false;
    setLoading(true);
    request<TransferPreview>('/api/transfers/export', { saveId, revision })
      .then((value) => {
        if (!cancelled) setExportPreview(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(translateError(String(reason instanceof Error ? reason.message : reason)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saveId, revision]);

  function resetActions() {
    setConfirmation(undefined);
    setResult(undefined);
    setCollectionPending(false);
    setCollectionId(undefined);
    setNotice('');
    setError('');
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(translateError(reason instanceof Error ? reason.message : String(reason)));
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    resetActions();
    setImportPreview(undefined);
    await perform(async () => {
      setImportPreview(await request<TransferPreview>('/api/transfers/import', { text }));
    });
  }

  async function refreshSteam() {
    await perform(async () => {
      setSteam(await request('/api/steam/status'));
      setStatusLoaded(true);
    });
  }

  async function runBatches(action: Confirmation) {
    const targetIds = [...ids];
    const targetCollection = collectionId;
    if (!targetIds.length || (action === 'collection' && !targetCollection)) return;
    setConfirmation(undefined);
    setResult({ succeeded: [], existing: [], failed: [] });
    await perform(async () => {
      const outcome: ActionResult = { succeeded: [], existing: [], failed: [] };
      for (let offset = 0; offset < targetIds.length; offset += 10) {
        const batch = targetIds.slice(offset, offset + 10);
        try {
          if (action === 'subscribe') {
            const value = await request<{
              subscribed: string[];
              alreadySubscribed: string[];
              failed: Failure[];
            }>('/api/steam/subscribe', { ids: batch });
            outcome.succeeded.push(...value.subscribed);
            outcome.existing.push(...value.alreadySubscribed);
            outcome.failed.push(...value.failed);
          } else {
            const value = await request<{ added: string[]; failed: Failure[] }>(
              '/api/steam/collections/add',
              { collectionId: targetCollection, ids: batch },
            );
            outcome.succeeded.push(...value.added);
            outcome.failed.push(...value.failed);
          }
        } catch (reason) {
          outcome.failed.push(
            ...targetIds.slice(offset).map((id) => ({
              id,
              error: translateError(reason instanceof Error ? reason.message : String(reason)),
            })),
          );
          setResult({ ...outcome });
          break;
        }
        setResult({ ...outcome });
      }
    });
  }

  const warningLabel = (warning: TransferWarning) => {
    switch (warning.kind) {
      case 'local':
        return t('Mod local : exclu des actions Steam.');
      case 'missing':
        return t('Fichiers manquants : vérifier ce mod avant utilisation.');
      case 'ambiguous':
        return t('Association ambiguë : aucun parent Workshop choisi automatiquement.');
      case 'workshop-not-listed':
        return t('Parent absent de WorkshopItems : aucun ajout automatique à cette liste.');
    }
  };

  return (
    <Dialog
      label={t('Importer et exporter des mods')}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="transfer-dialog"
    >
      <div className="transfer-heading">
        <div>
          <span className="eyebrow">{t('SAUVEGARDES ET SERVEURS')}</span>
          <h2>{t('Importer et exporter des mods')}</h2>
        </div>
        <button className="button" aria-label={t('Fermer')} onClick={onClose} disabled={busy}>
          ×
        </button>
      </div>
      <div className="detail-tabs" role="group" aria-label={t('Type de transfert')}>
        <button
          aria-pressed={tab === 'export'}
          disabled={!save || busy}
          onClick={() => {
            setTab('export');
            resetActions();
          }}
        >
          {t('Exporter la sauvegarde')}
        </button>
        <button
          aria-pressed={tab === 'import'}
          disabled={busy}
          onClick={() => {
            setTab('import');
            resetActions();
          }}
        >
          {t('Importer un serveur')}
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {t(notice)}
        </div>
      )}
      {tab === 'export' ? (
        <p>
          {t(
            'Préparez les listes de la sauvegarde {{name}} pour un serveur ou une collection Steam.',
            { name: save?.name || '' },
          )}
        </p>
      ) : (
        <div className="transfer-import">
          <label htmlFor="transfer-file">{t('Ouvrir un fichier serveur .ini')}</label>
          <input
            id="transfer-file"
            type="file"
            accept=".ini,text/plain"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              resetActions();
              setImportPreview(undefined);
              void perform(async () => {
                if (file.size > 1024 * 1024) throw new Error(t('Le fichier dépasse 1 Mo.'));
                setText(await file.text());
              });
              event.target.value = '';
            }}
          />
          <label htmlFor="transfer-text">{t('Contenu du serveur : Mods= et WorkshopItems=')}</label>
          <textarea
            id="transfer-text"
            rows={8}
            value={text}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              setImportPreview(undefined);
              resetActions();
            }}
            placeholder={t('Collez le fichier .ini complet ou les deux lignes de configuration.')}
          />
          <button
            className="button primary"
            disabled={busy || !text.trim()}
            onClick={() => void analyze()}
          >
            {t('Analyser le contenu')}
          </button>
          <p className="hint">
            {t('L’analyse ne modifie aucune sauvegarde, aucun serveur et aucun abonnement.')}{' '}
            {t(
              'Les autres paramètres du fichier sont ignorés. Configurez Map= séparément pour les cartes du serveur.',
            )}
          </p>
        </div>
      )}
      {loading && tab === 'export' && <p role="status">{t('Préparation de l’export…')}</p>}
      {preview && (
        <>
          <div className="transfer-stats">
            <strong>{t('{{count}} ID(s) de mods', { count: preview.manifest.mods.length })}</strong>
            <strong>{t('{{count}} parent(s) Workshop', { count: ids.length })}</strong>
          </div>
          <p className="hint">
            {t(
              'Mods contient les identifiants des sous-mods. WorkshopItems contient les identifiants numériques des parents Steam. Ces listes ne se correspondent pas par position.',
            )}
          </p>
          {preview.manifest.warnings.length > 0 && (
            <div className="detail-alert">
              <h3>{t('Points à vérifier')}</h3>
              <ul>
                {preview.manifest.warnings.map((warning, index) => (
                  <li key={index}>
                    <code>{warning.modId}</code> — {warningLabel(warning)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="technical-details">
            <summary>{t('Voir les mods et leurs associations')}</summary>
            <ul>
              {preview.manifest.mods.map((mod, index) => (
                <li key={index}>
                  <strong>{mod.name}</strong> <code>{mod.rawId}</code>{' '}
                  {mod.workshopId ? `→ ${mod.workshopId}` : ''}
                </li>
              ))}
            </ul>
          </details>
          <label htmlFor="transfer-preview">{t('Fragment de configuration serveur')}</label>
          <textarea id="transfer-preview" readOnly rows={5} value={preview.serverText} />
          <p className="hint">
            {t(
              'Ce fragment contient uniquement les listes de mods. Il ne remplace pas un fichier serveur complet.',
            )}
          </p>
          <details className="technical-details">
            <summary>{t('Aperçu du manifeste JSON')}</summary>
            <textarea
              aria-label={t('Manifeste JSON')}
              readOnly
              rows={8}
              value={JSON.stringify(preview.manifest, null, 2)}
            />
          </details>
          <div className="transfer-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                download(preview.serverText, 'pz-mods-server.ini', 'text/plain;charset=utf-8')
              }
            >
              {t('Télécharger le fragment .ini')}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                download(
                  JSON.stringify(preview.manifest, null, 2),
                  'pz-mods-manifest.json',
                  'application/json;charset=utf-8',
                )
              }
            >
              {t('Télécharger le manifeste .json')}
            </button>
            <Tooltip
              content={t(
                'Copie uniquement Mods= et WorkshopItems=. Les autres paramètres du serveur restent à configurer.',
              )}
            >
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await navigator.clipboard.writeText(preview.serverText);
                    setNotice('Configuration copiée.');
                  })
                }
              >
                {t('Copier la configuration')}
              </button>
            </Tooltip>
          </div>
          <section className="transfer-steam">
            <h3>{t('Actions Steam sur les parents Workshop')}</h3>
            <p>
              {t(
                'Seuls les {{count}} identifiants Workshop de cet aperçu seront envoyés à Steam. Les mods locaux sont exclus.',
                { count: ids.length },
              )}
            </p>
            {!statusLoaded ? (
              <p role="status">{t('Vérification de la connexion Steam…')}</p>
            ) : !steam.available ? (
              <p className="detail-alert">
                {t('L’intégration Steam est indisponible. Les exports restent utilisables.')}
              </p>
            ) : !steam.connected ? (
              <div>
                <p>
                  {t(
                    'Connectez-vous manuellement dans la fenêtre Steam dédiée, puis vérifiez la connexion ici.',
                  )}
                </p>
                <div className="transfer-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await request('/api/steam/connect', {});
                        setNotice(
                          'Terminez la connexion dans Steam, puis cliquez sur Vérifier la connexion.',
                        );
                      })
                    }
                  >
                    {t('Ouvrir la connexion Steam')}
                  </button>
                  <button className="button" disabled={busy} onClick={() => void refreshSteam()}>
                    {t('Vérifier la connexion')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="tag">{t('SESSION STEAM CONNECTÉE')}</p>
                <button
                  className="button primary"
                  disabled={busy || !ids.length}
                  onClick={() => {
                    setConfirmation('subscribe');
                    setResult(undefined);
                  }}
                >
                  {t('S’abonner aux parents Workshop')}
                </button>
                <h4>{t('Créer une collection Steam')}</h4>
                <p className="hint">
                  {t(
                    'Une collection regroupe les parents Workshop. Elle ne conserve ni l’ordre de chargement ni l’activation des sous-mods.',
                  )}
                </p>
                <label htmlFor="collection-title">{t('Titre de la collection')}</label>
                <input
                  id="collection-title"
                  value={title}
                  disabled={busy || collectionPending}
                  maxLength={128}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <p className="hint">
                  {t(
                    'La création se termine dans le formulaire officiel Steam. Vérifiez le titre, les paramètres et la visibilité avant de valider.',
                  )}
                </p>
                {!collectionPending ? (
                  <button
                    className="button"
                    disabled={busy || !ids.length || !title.trim()}
                    onClick={() =>
                      void perform(async () => {
                        await request('/api/steam/collections/begin', { title: title.trim() });
                        setCollectionPending(true);
                        setCollectionId(undefined);
                      })
                    }
                  >
                    {t('1. Ouvrir le formulaire Steam')}
                  </button>
                ) : (
                  <div className="transfer-collection-step">
                    <p>
                      {t(
                        'Terminez la création sur Steam, puis revenez ici. Aucun mod n’a encore été ajouté.',
                      )}
                    </p>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const detected = await request<{ id?: string }>(
                            '/api/steam/collections/detect',
                          );
                          setCollectionId(detected.id);
                          if (!detected.id)
                            setNotice(
                              'Aucune nouvelle collection détectée. Terminez le formulaire Steam et réessayez.',
                            );
                        })
                      }
                    >
                      {t('2. Retrouver la collection créée')}
                    </button>
                    {collectionId && (
                      <>
                        <p>{t('Collection détectée : {{id}}', { id: collectionId })}</p>
                        <a
                          href={
                            'https://steamcommunity.com/sharedfiles/filedetails/?id=' +
                            encodeURIComponent(collectionId)
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('Vérifier la collection sur Steam ↗')}
                        </a>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => {
                            setConfirmation('collection');
                            setResult(undefined);
                          }}
                        >
                          {t('3. Terminer : ajouter les parents Workshop')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            {confirmation && (
              <div
                className="transfer-confirm"
                role="group"
                aria-label={t('Confirmation de l’action Steam')}
              >
                <h4>{t('Confirmer l’action Steam')}</h4>
                <p>
                  {confirmation === 'subscribe'
                    ? t(
                        'Confirmez l’abonnement à {{count}} parent(s) Workshop. Cela concerne tous leurs sous-mods et votre compte Steam.',
                        { count: ids.length },
                      )
                    : t('Confirmez l’ajout de {{count}} parent(s) à la collection {{id}}.', {
                        count: ids.length,
                        id: collectionId || '',
                      })}
                </p>
                <details>
                  <summary>{t('Voir les identifiants envoyés')}</summary>
                  <code>{ids.join(';')}</code>
                </details>
                <div className="transfer-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => setConfirmation(undefined)}
                  >
                    {t('Annuler')}
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void runBatches(confirmation)}
                  >
                    {t('Confirmer et lancer')}
                  </button>
                </div>
              </div>
            )}
            {busy && <p role="status">{t('Opération en cours…')}</p>}
            {result && (
              <div className="transfer-result" role="status">
                <h4>{t('Résultat des opérations Steam')}</h4>
                <p>
                  {t(
                    '{{success}} opération(s) réussie(s), {{existing}} abonnement(s) déjà actif(s), {{failed}} échec(s).',
                    {
                      success: result.succeeded.length,
                      existing: result.existing.length,
                      failed: result.failed.length,
                    },
                  )}
                </p>
                {result.failed.length > 0 && (
                  <ul>
                    {result.failed.map((failure, index) => (
                      <li key={index}>
                        <code>{failure.id}</code> — {translateError(failure.error)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </Dialog>
  );
}
