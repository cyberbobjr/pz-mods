import { useSourceI18n } from './source-context';
import { contentFallback } from './messages';
import type { Mod } from '../src/domain/mods';
import type { ParentGroup } from './parent-groups';
import { loadPosition } from './load-order';
import { parentTitle } from './mod-sort';
import { parentDependents } from './dependents';
import { DependencyBadge } from './DependencyBadge';
import { selectionId } from './active-mods';

type Details = Record<string, { title: string; description: string; preview_url: string }>;
type Props = {
  groups: ParentGroup[];
  all: Mod[];
  view: 'cards' | 'list';
  steam: Details;
  checked: Set<string>;
  issueIds: Set<string>;
  loading: boolean;
  activeIds: string[];
  isActive: (mod: Mod) => boolean;
  onDetail: (mod: Mod) => void;
  onToggle: (id: string) => void;
};
const plain = (text: string) => text.replace(/\[\/?[^\]]+\]/g, '').replace(/<[^>]*>/g, '');

export function ParentLibrary(props: Props) {
  const { t } = useSourceI18n();
  function content(group: ParentGroup) {
    const first = group.members[0];
    const requiredBy = parentDependents(group, props.all);
    const missing = group.members.every((mod) => !mod.source);
    const remote = first.workshopId ? props.steam[first.workshopId] : undefined;
    const title = parentTitle(group, props.steam);
    const image =
      remote?.preview_url ||
      (group.members.find((m) => m.image)?.image
        ? '/api/image/' + group.members.find((m) => m.image)!.image
        : undefined);
    const activeCount = group.members.filter(props.isActive).length;
    const description = plain(contentFallback(remote?.description || first.description, t));
    const poster = (
      <button
        className={props.view === 'cards' ? 'cover' : 'table-poster'}
        onClick={() => props.onDetail(first)}
        aria-label={t('Voir {{name}}', { name: title })}
      >
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={(event) => {
              const local = group.members.find((mod) => mod.image)?.image;
              if (local && !event.currentTarget.src.endsWith('/api/image/' + local)) {
                event.currentTarget.src = '/api/image/' + local;
              } else event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="poster-placeholder">{t('PZ')}</span>
        )}
      </button>
    );
    const heading = (
      <>
        <button className="mod-title" onClick={() => props.onDetail(first)}>
          {title}
        </button>
        <div className="origin-label">
          {first.workshopId
            ? t('ÉLÉMENT WORKSHOP #') + first.workshopId
            : missing
              ? t('ORIGINE INCONNUE')
              : t('PROJET LOCAL')}{' '}
          · {group.members.length} {t('ID(s)')}
        </div>
      </>
    );
    const tags = (
      <div className="submod-tags">
        {group.members.map((mod) => {
          const active = props.isActive(mod);
          return (
            <div
              className={
                'submod-entry ' +
                (active ? 'enabled' : 'disabled') +
                (!mod.source ? ' files-missing' : '')
              }
              key={mod.source || mod.id}
            >
              {active && (
                <input
                  type="checkbox"
                  checked={props.checked.has(selectionId(mod))}
                  onChange={() => props.onToggle(selectionId(mod))}
                  aria-label={t('Sélectionner {{name}} pour retrait', { name: mod.name })}
                />
              )}
              <button onClick={() => props.onDetail(mod)} title={mod.name + ' · ' + mod.id}>
                <span className="submod-light" aria-hidden="true" />
                {active && (
                  <span className="load-position" title={t('Position dans mods.txt')}>
                    #{loadPosition(mod, props.activeIds)}
                  </span>
                )}
                <span>
                  {mod.name}
                  <small>{mod.id}</small>
                </span>
                <b>{!mod.source ? t('MANQUANT') : active ? t('ACTIVÉ') : t('DÉSACTIVÉ')}</b>
                {props.issueIds.has(mod.id) && (
                  <span className="submod-alert" aria-label={t('Anomalie à vérifier')}>
                    !
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
    const status = (
      <div className="parent-badges">
        {missing && <span className="tag danger">{t('FICHIERS MANQUANTS')}</span>}
        <DependencyBadge
          count={requiredBy.mods.length}
          activeCount={requiredBy.mods.filter(props.isActive).length}
          onClick={() => props.onDetail(requiredBy.requiredMember || first)}
        />
        <span className={'tag ' + (activeCount ? '' : 'neutral')}>
          {activeCount} / {group.members.length} {t('ACTIVÉ(S)')}
        </span>
      </div>
    );
    return { first, poster, heading, tags, status, description };
  }
  if (props.view === 'cards')
    return (
      <div className="grid parent-grid" aria-busy={props.loading}>
        {props.groups.map((group) => {
          const item = content(group);
          return (
            <article className="card" key={group.key}>
              {item.poster}
              <div className="card-body">
                {item.heading}
                <p>{item.description}</p>
                {item.status}
                {item.tags}
              </div>
            </article>
          );
        })}
      </div>
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={t('Éléments parents et sous-mods')}
      aria-busy={props.loading}
    >
      <table className="mods-table parent-table">
        <caption className="sr-only">
          {t('Un élément parent par ligne, avec tous ses sous-mods installés')}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="poster-column">
              {t('Poster')}
            </th>
            <th scope="col" className="name-column">
              {t('Mod parent')}
            </th>
            <th scope="col" className="description-column">
              {t('Description')}
            </th>
            <th scope="col" className="submods-column">
              {t('Sous-mods de la sauvegarde')}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.groups.map((group) => {
            const item = content(group);
            return (
              <tr key={group.key}>
                <td>{item.poster}</td>
                <th scope="row" className="mod-name-cell">
                  {item.heading}
                  {item.status}
                </th>
                <td>
                  <p className="table-description">{item.description}</p>
                </td>
                <td>{item.tags}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
