import { translateIssue, contentFallback } from './messages';
import { useI18n } from './i18n';
import { useState } from 'react';
import type { Mod, Issue } from '../src/domain/mods';
import { Dialog } from './Dialog';

type Detail = { title: string; description: string; preview_url: string; time_updated?: number };
type Props = {
  mod: Mod;
  members: Mod[];
  workshop?: Detail;
  all: Mod[];
  issues: Issue[];
  isActive: (mod: Mod) => boolean;
  onSelect: (mod: Mod) => void;
  onRemove: (mod: Mod) => void;
  onClose: () => void;
};
const plain = (text: string) => text.replace(/\[\/?[^\]]+\]/g, '').replace(/<[^>]*>/g, '');
function dateLabel(
  value: string | number | undefined,
  language: string,
  t: (key: string) => string,
) {
  if (!value) return t('Non disponible');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('Non disponible');
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function ModDetail({
  mod,
  members,
  workshop,
  all,
  issues,
  isActive,
  onSelect,
  onRemove,
  onClose,
}: Props) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<'description' | 'compatibility'>('description');
  const title =
    workshop?.title || (members.length > 1 ? t('Projet local · ') + members[0].name : mod.name);
  const poster = workshop?.preview_url || (mod.image ? '/api/image/' + mod.image : undefined);
  const activeCount = members.filter(isActive).length;
  const alerts = issues.filter((issue) => issue.modId === mod.id || issue.target === mod.id);
  const related = (id: string) =>
    all.find((item) => item.id === id && isActive(item)) || all.find((item) => item.id === id);
  const active = isActive(mod);
  return (
    <Dialog label={title} onClose={onClose} className="mod-detail">
      <header className="detail-header">
        {poster ? (
          <img className="detail-poster" src={poster} alt="" />
        ) : (
          <div className="detail-poster detail-no-image">{t('PZ')}</div>
        )}
        <div className="detail-heading">
          <span className="eyebrow">
            {mod.workshopId ? t('ÉLÉMENT WORKSHOP') : t('PROJET LOCAL')}
          </span>
          <h2>{title}</h2>
          <span className="detail-count">
            {activeCount} / {members.length} {t('sous-mod(s) activé(s) dans cette sauvegarde')}
          </span>
        </div>
        <button className="detail-close" aria-label={t('Fermer')} onClick={onClose}>
          {t('×')}
        </button>
      </header>
      <div className="detail-meta">
        <div>
          <span>
            {mod.workshopId ? t('Dernière mise à jour Steam') : t('Métadonnées locales modifiées')}
          </span>
          <strong>
            {dateLabel(
              mod.workshopId
                ? workshop?.time_updated
                  ? workshop.time_updated * 1000
                  : undefined
                : mod.metadataModifiedAt,
              language,
              t,
            )}
          </strong>
        </div>
        <div>
          <span>{t('Source')}</span>
          <strong>
            {mod.workshopId ? t('Workshop #') + mod.workshopId : t('Fichiers de développement')}
          </strong>
        </div>
      </div>
      <div className="detail-layout">
        <nav className="detail-submods" aria-label={t('Sous-mods de cet élément')}>
          <h3>
            {t('Sous-mods')}
            <span>{members.length}</span>
          </h3>
          <p>{t('Choisissez un sous-mod pour consulter sa fiche.')}</p>
          {members.map((item) => (
            <button
              className={
                'detail-submod ' +
                (item.source === mod.source && item.id === mod.id ? 'current' : '')
              }
              key={item.source || item.id}
              aria-current={item.source === mod.source && item.id === mod.id ? 'true' : undefined}
              onClick={() => onSelect(item)}
            >
              <span className={'submod-light ' + (isActive(item) ? '' : 'off')} />
              <span>
                {item.name}
                <small>{isActive(item) ? t('Activé') : t('Désactivé')}</small>
              </span>
            </button>
          ))}
        </nav>
        <section className="detail-content">
          <div className="selected-mod-heading">
            <div>
              <span className="origin-label">{t('SOUS-MOD SÉLECTIONNÉ')}</span>
              <h3>{mod.name}</h3>
              <code>{mod.id}</code>
            </div>
            <span className={'tag ' + (active ? '' : 'neutral')}>
              {active ? t('ACTIVÉ') : t('DÉSACTIVÉ')}
            </span>
          </div>
          {alerts.length > 0 && (
            <div className="detail-alert" role="status">
              <strong>
                {alerts.length} {t('point(s) à vérifier')}
              </strong>
              <ul>
                {alerts.map((issue, index) => (
                  <li key={index}>
                    {issue.target ? (related(issue.target)?.name || issue.target) + ' : ' : ''}
                    {translateIssue(issue, t)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="detail-tabs" role="group" aria-label={t('Contenu de la fiche')}>
            <button aria-pressed={tab === 'description'} onClick={() => setTab('description')}>
              {t('Présentation')}
            </button>
            <button aria-pressed={tab === 'compatibility'} onClick={() => setTab('compatibility')}>
              {t('Prérequis et compatibilité')}{' '}
              {mod.requires.length + mod.incompatible.length > 0 && (
                <span>{mod.requires.length + mod.incompatible.length}</span>
              )}
            </button>
          </div>
          {tab === 'description' ? (
            <div className="detail-section">
              <h4>{t('À propos de ce sous-mod')}</h4>
              <p className="detail-description">
                {plain(contentFallback(mod.description || t('Aucune description disponible.'), t))}
              </p>
              {workshop?.description && (
                <details className="technical-details">
                  <summary>{t('Description complète du parent Workshop')}</summary>
                  <p className="detail-description">{plain(workshop.description)}</p>
                </details>
              )}
            </div>
          ) : (
            <div className="detail-section">
              <h4>
                {t('Prérequis')}
                <span>{mod.requires.length}</span>
              </h4>
              {mod.requires.length ? (
                mod.requires.map((id) => {
                  const item = related(id);
                  return (
                    <div className="compatibility-row" key={id}>
                      <span>
                        {item?.name || id}
                        <code>{id}</code>
                      </span>
                      <span className={'tag ' + (item && isActive(item) ? '' : 'danger')}>
                        {item && isActive(item)
                          ? t('ACTIVÉ')
                          : item?.source
                            ? t('À ACTIVER')
                            : t('MANQUANT')}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="detail-muted">{t('Aucun prérequis déclaré.')}</p>
              )}
              <h4>
                {t('Incompatibilités')}
                <span>{mod.incompatible.length}</span>
              </h4>
              {mod.incompatible.length ? (
                mod.incompatible.map((id) => {
                  const item = related(id);
                  return (
                    <div className="compatibility-row" key={id}>
                      <span>
                        {item?.name || id}
                        <code>{id}</code>
                      </span>
                      <span className={'tag ' + (item && isActive(item) ? 'danger' : 'neutral')}>
                        {item && isActive(item) ? t('CONFLIT ACTIF') : t('NON ACTIVÉ')}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="detail-muted">{t('Aucune incompatibilité déclarée.')}</p>
              )}
              <p className="detail-footnote">
                {t(
                  'Ces informations viennent des métadonnées des mods. Les conflits non déclarés peuvent ne pas être détectés.',
                )}
              </p>
            </div>
          )}
          <details className="technical-details">
            <summary>{t('Informations techniques')}</summary>
            <dl>
              <dt>{t('Versions disponibles')}</dt>
              <dd>{mod.variants.join(', ') || t('Racine')}</dd>
              <dt>{t('Plage détectée')}</dt>
              <dd>
                {mod.versionMin || t('Non précisée')} → {mod.versionMax || t('Non précisée')}
              </dd>
              <dt>{t('Métadonnées locales modifiées')}</dt>
              <dd>{dateLabel(mod.metadataModifiedAt, language, t)}</dd>
              <dt>{t('Fichier source')}</dt>
              <dd>
                <code>{mod.source || t('Introuvable')}</code>
              </dd>
            </dl>
            <p className="detail-footnote">
              {t(
                'La date locale correspond à mod.info, pas à la dernière modification de tous les fichiers du mod.',
              )}
            </p>
          </details>
        </section>
      </div>
      <footer className="detail-footer">
        <div>
          <strong>{t('Actions sur le sous-mod sélectionné')}</strong>
          <small>{t('Le retrait conserve les fichiers et l’abonnement Steam.')}</small>
        </div>
        <div className="detail-footer-actions">
          {active && (
            <button className="button destructive" onClick={() => onRemove(mod)}>
              {t('Retirer ce sous-mod')}
            </button>
          )}
          {mod.workshopId && (
            <a
              className="button"
              href={'https://steamcommunity.com/sharedfiles/filedetails/?id=' + mod.workshopId}
              target="_blank"
              rel="noreferrer"
            >
              {t('Abonnement du parent ↗')}
            </a>
          )}
        </div>
      </footer>
    </Dialog>
  );
}
