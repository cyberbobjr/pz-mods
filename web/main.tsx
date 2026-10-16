import { translateIssue, translateError } from './messages';
import { useI18n, I18nProvider } from './i18n';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Mod, Save, Issue, WorkshopDetail } from '../src/domain/mods';
import './style.css';
import { Dialog } from './Dialog';
import { ModDetail } from './ModDetail';
import { OrderEditor, type OrderValidation } from './OrderEditor';
import { ParentLibrary } from './ParentLibrary';
import { groupMods } from './parent-groups';
import { orderParentGroups } from './load-order';
type Overview = {
  saves: Save[];
  selected?: string;
  mods: Mod[];
  active: string[];
  revision: string;
  version: string;
  issues: Issue[];
  status: { analysis: string; gameVersion: string };
};
type Details = Record<string, WorkshopDetail>;
async function api(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || 'Erreur de connexion');
  return data;
}
function matchesActive(mod: Mod, ids: string[]) {
  return ids.some((raw) => {
    const qualified = raw.trim().replace(/^\\+/, '');
    const provider = qualified.match(/^(\d+)\//)?.[1];
    const id = qualified.replace(/^\d+\//, '');
    return id === mod.id && (!provider || mod.workshopId === provider);
  });
}
function App() {
  const { t, language, setLanguage } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('pz-mods-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem('pz-mods-sidebar-collapsed', String(next));
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ key: string; values: Record<string, string> }>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('active');
  const [view, setView] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem('pz-mods-view') === 'list' ? 'list' : 'cards';
    } catch {
      return 'cards';
    }
  });
  function changeView(next: 'cards' | 'list') {
    setView(next);
    try {
      localStorage.setItem('pz-mods-view', next);
    } catch {
      // The view remains usable when browser storage is unavailable.
    }
  }
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Mod>();
  const [steam, setSteam] = useState<Details>({});
  const [workshopError, setWorkshopError] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderEditor, setOrderEditor] = useState<{
    saveId: string;
    revision: string;
    ids: string[];
    name: string;
  }>();
  const validateOrder = useCallback(
    (ids: string[]): Promise<OrderValidation> => {
      if (!orderEditor) return Promise.reject(new Error(t('Aucune sauvegarde sélectionnée.')));
      return api('/api/reorder/validate', {
        saveId: orderEditor.saveId,
        revision: orderEditor.revision,
        ids,
      });
    },
    [orderEditor, t],
  );
  async function load(id?: string) {
    setLoading(true);
    setError('');
    try {
      setData(await api('/api/overview' + (id ? '?save=' + encodeURIComponent(id) : '')));
      setChecked(new Set());
      setPage(1);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const active = useMemo(
    () => new Set(data?.active.map((i) => i.replace(/^\\+/, '').replace(/^\d+\//, '')) || []),
    [data],
  );
  const isActive = useCallback((mod: Mod) => matchesActive(mod, data?.active || []), [data]);
  const issueIds = useMemo(() => new Set(data?.issues.map((i) => i.modId) || []), [data]);
  const all = useMemo(() => {
    if (!data) return [];
    return [
      ...data.mods,
      ...[...active]
        .filter((id) => !data.mods.some((m) => m.id === id && matchesActive(m, data.active)))
        .map(
          (id) =>
            ({
              id,
              workshopId: data.active
                .find((raw) => raw.replace(/^\\+/, '').replace(/^\d+\//, '') === id)
                ?.replace(/^\\+/, '')
                .match(/^(\d+)\//)?.[1],
              name: id,
              description: t(
                'Ce mod est référencé par la sauvegarde mais ses fichiers sont introuvables.',
              ),
              requires: [],
              incompatible: [],
              source: '',
              variants: [],
            }) as Mod,
        ),
    ];
  }, [data, active, t]);
  const filtered = useMemo(
    () =>
      all
        .filter(
          (m) =>
            (tab === 'all' ||
              (tab === 'active' && isActive(m)) ||
              (tab === 'unused' && !isActive(m)) ||
              (tab === 'issues' && issueIds.has(m.id)) ||
              (tab === 'missing' && isActive(m) && !m.source)) &&
            `${m.name} ${m.id} ${m.workshopId || ''}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, tab, search, isActive, issueIds],
  );
  const filteredKeys = new Set(filtered);
  const matchedGroups = groupMods(all).filter((group) =>
    group.members.some((mod) => filteredKeys.has(mod)),
  );
  const parentGroups =
    tab === 'active' ? orderParentGroups(matchedGroups, data?.active || []) : matchedGroups;
  const shownGroups = parentGroups.slice((page - 1) * 36, page * 36);
  const shown = shownGroups.flatMap((group) => group.members);
  const keys = shown
    .map((m) => m.workshopId)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(keys.split(',').filter(Boolean))];
    if (ids.length)
      api('/api/workshop', { ids })
        .then((d) => {
          if (!cancelled) {
            setSteam((s) => ({ ...s, ...d }));
            setWorkshopError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setWorkshopError(true);
        });
    return () => {
      cancelled = true;
    };
  }, [keys]);
  const name = (id: string) => all.find((m) => m.id === id)?.name || id;
  async function remove() {
    if (!data?.selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/remove', {
        saveId: data.selected,
        ids: [...checked],
        revision: data.revision,
      });
      setConfirm(false);
      setDetail(undefined);
      await load(data.selected);
      setNotice({
        key: 'Mods retirés de la sauvegarde. Copie de sécurité : {{backup}}',
        values: { backup: result.backup },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const errors = data?.issues.filter((i) => i.severity === 'error').length || 0;
  return (
    <div className={'shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <aside className="sidebar" id="primary-navigation">
        <a className="brand" href="/" aria-label="PZ Mods" title="PZ Mods">
          <span className="brand-icon" aria-hidden="true">
            {'\u25c8'}
          </span>
          <span className="brand-wordmark">
            {t('PZ')}
            <span className="mint">{t('MODS')}</span>
            <small>{t('WORKSHOP MANAGER')}</small>
          </span>
        </a>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-controls="primary-navigation"
          aria-label={sidebarCollapsed ? t('Déplier la navigation') : t('Réduire la navigation')}
          title={sidebarCollapsed ? t('Déplier la navigation') : t('Réduire la navigation')}
        >
          <span aria-hidden="true">{sidebarCollapsed ? '\u00bb' : '\u00ab'}</span>
        </button>
        <div className="nav-label">{t('VOTRE ESPACE')}</div>
        {[
          ['active', '\u25c8', t('Dans la sauvegarde'), active.size],
          ['all', '\u25a6', t('Tous les mods'), all.length],
          ['unused', '\u25cb', t('Hors sauvegarde'), all.filter((m) => !isActive(m)).length],
          [
            'missing',
            '!',
            t('Mods manquants'),
            [...active].filter((id) => !data?.mods.some((mod) => mod.id === id && isActive(mod)))
              .length,
          ],
          ['issues', '\u25c7', t('Diagnostic'), data?.issues.length || 0],
        ].map(([id, icon, label, count]) => (
          <button
            aria-label={`${label} (${count})`}
            title={String(label)}
            aria-current={tab === id ? 'page' : undefined}
            className={'nav ' + (tab === id ? 'selected' : '')}
            key={id}
            onClick={() => {
              setTab(String(id));
              setPage(1);
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="nav-text">{label}</span>
            <b aria-hidden="true">{count}</b>
          </button>
        ))}
        <div className="side-bottom">
          <span className="dot" /> {t('CONNEXION LOCALE')}
          <small>
            {t('Project Zomboid ·')}
            {data?.version || '…'}
            <br />
            {t('Vos fichiers restent sur cet ordinateur.')}
          </small>
        </div>
      </aside>
      <main>
        <header>
          <label className="language-select">
            {t('Langue')}
            <select
              aria-label={t('Langue de l’interface')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'fr' | 'en')}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="breadcrumb">
            {t('BIBLIOTHÈQUE')}
            <span>/</span> {t('GESTION DES MODS')}
          </div>
          <button className="button" disabled={loading} onClick={() => load(data?.selected)}>
            {'\u21bb'} {t('Actualiser')}
          </button>
        </header>
        <section className="hero">
          <div>
            <div className="eyebrow">{t('MOINS DE CONFLITS. PLUS DE SURVIE.')}</div>
            <h1>
              {t('Votre arsenal,')}
              <br />
              <em>{t('sous contrôle.')}</em>
            </h1>
            <p>
              {t('Explorez vos mods, vérifiez leurs prérequis et faites')}
              <br className="desktop" /> {t('le tri dans votre prochaine apocalypse.')}
            </p>
          </div>
          <div className="save-panel">
            <label htmlFor="save">{t('SAUVEGARDE SOLO')}</label>
            <select
              id="save"
              value={data?.selected || ''}
              disabled={loading}
              onChange={(e) => load(e.target.value)}
            >
              {data?.saves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.mode} / {s.name}
                </option>
              ))}
            </select>
            <div>
              <span className="dot" /> {active.size} {t('mods actifs')}{' '}
              <span className="save-version">
                {t('Build locale')} {data?.version || '—'}
              </span>
            </div>
            <small>{t('Version locale utilisée pour choisir les variantes des mods.')}</small>
          </div>
        </section>
        {error && (
          <div role="alert" className="alert error">
            {translateError(error)}
            <button aria-label={t('Masquer l’erreur')} onClick={() => setError('')}>
              {t('×')}
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="alert">
            {t(notice.key, notice.values)}
            <button aria-label={t('Masquer la notification')} onClick={() => setNotice(undefined)}>
              {t('×')}
            </button>
          </div>
        )}
        <section className="stats">
          <button
            onClick={() => {
              setTab('active');
              setPage(1);
            }}
          >
            <span>{t('MODS ACTIFS')}</span>
            <strong>
              {active.size}
              <small>{t('dans cette sauvegarde')}</small>
            </strong>
          </button>
          <button
            onClick={() => {
              setTab('unused');
              setPage(1);
            }}
          >
            <span>{t('À EXPLORER')}</span>
            <strong>
              {all.filter((m) => !isActive(m)).length}
              <small>{t('installés, hors sauvegarde')}</small>
            </strong>
          </button>
          <button
            className={errors ? 'stat-warning' : ''}
            onClick={() => {
              setTab('issues');
              setPage(1);
            }}
          >
            <span>{t('DIAGNOSTIC')}</span>
            <strong>
              {errors}
              <small>{t('anomalies de métadonnées')}</small>
            </strong>
          </button>
        </section>
        {tab === 'issues' && (
          <section className="diagnostic">
            <h2>{t('État de la sauvegarde')}</h2>
            <p>
              {t('Analyse des prérequis, incompatibilités déclarées et fichiers installés.')}{' '}
              {t('L’absence d’alerte ne garantit pas l’absence de conflits en jeu.')}
            </p>
            {data?.issues.length === 0 ? (
              <div className="empty">{t('Aucune anomalie déclarée détectée.')}</div>
            ) : (
              data?.issues.map((i, n) => (
                <button
                  className="issue"
                  key={n}
                  onClick={() => setDetail(all.find((m) => m.id === i.modId))}
                >
                  <span className={'tag ' + (i.severity === 'error' ? 'danger' : '')}>
                    {
                      {
                        missing: t('MANQUANT'),
                        dependency: t('PRÉREQUIS'),
                        incompatible: t('INCOMPATIBLE'),
                        version: t('VERSION'),
                        duplicate: t('DOUBLON'),
                      }[i.kind]
                    }
                  </span>
                  <div>
                    <b>
                      {name(i.modId)}
                      {i.target ? ' \u2192 ' + name(i.target) : ''}
                    </b>
                    <p>{translateIssue(i, t)}</p>
                  </div>
                  <span>{'\u2197'}</span>
                </button>
              ))
            )}
          </section>
        )}
        {workshopError && (
          <p className="workshop-notice" role="status">
            {t(
              'Steam Workshop est momentanément indisponible. Les informations locales restent accessibles.',
            )}
          </p>
        )}
        <section className="library">
          <div className="section-head">
            <h2>
              {tab === 'active'
                ? t('Dans votre sauvegarde')
                : tab === 'unused'
                  ? t('À côté de votre partie')
                  : tab === 'missing'
                    ? t('Mods manquants')
                    : tab === 'issues'
                      ? t('Mods à examiner')
                      : t('Tous vos mods')}{' '}
              <span>{filtered.length}</span>
            </h2>
            <div className="search-field">
              <input
                ref={searchRef}
                aria-label={t('Rechercher un mod')}
                placeholder={t('Rechercher un nom, un ID…')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label={t('Effacer la recherche')}
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                    searchRef.current?.focus();
                  }}
                >
                  {t('Effacer ×')}
                </button>
              )}
            </div>
          </div>
          <div className="toolbar">
            <span>
              {loading
                ? t('Analyse des fichiers locaux…')
                : t('{{parents}} éléments parents · {{ids}} IDs correspondant au filtre', {
                    parents: parentGroups.length,
                    ids: filtered.length,
                  })}
            </span>
            <div className="view-switch" role="group" aria-label={t('Mode d’affichage')}>
              <button
                type="button"
                aria-pressed={view === 'cards'}
                onClick={() => changeView('cards')}
              >
                {t('▦ Cartes')}
              </button>
              <button
                type="button"
                aria-pressed={view === 'list'}
                onClick={() => changeView('list')}
              >
                {t('☰ Liste')}
              </button>
            </div>
            {tab === 'active' && (
              <button
                className="button"
                disabled={loading || !data?.selected || data.active.length < 2}
                onClick={() => {
                  if (!data?.selected) return;
                  setOrderEditor({
                    saveId: data.selected,
                    revision: data.revision,
                    ids: [...data.active],
                    name:
                      data.saves.find((save) => save.id === data.selected)?.name || data.selected,
                  });
                }}
              >
                {t('↕ Modifier l’ordre')}
              </button>
            )}
            {checked.size > 0 && (
              <button className="button destructive" onClick={() => setConfirm(true)}>
                {t('Retirer {{count}} ID(s) de la sauvegarde', { count: checked.size })}
              </button>
            )}
          </div>
          {loading && !data && (
            <div className="loading-state" role="status">
              <span className="loading-dot" />{' '}
              {t('Lecture de vos sauvegardes et de votre bibliothèque locale…')}
            </div>
          )}
          <p className="grouping-note">
            {tab === 'active'
              ? t(
                  'Un Workshop ID par ligne ou carte, avec tous ses sous-mods. Les tags affichent leur état et leur position dans la sauvegarde. Les parents sont triés par leur premier sous-mod actif ; consultez l’éditeur pour la séquence complète.',
                )
              : t(
                  'Un parent par ligne ou carte. Tous ses sous-mods installés restent visibles, même désactivés. Cliquez sur un tag pour ouvrir sa fiche.',
                )}
          </p>
          <ParentLibrary
            groups={shownGroups}
            view={view}
            steam={steam}
            checked={checked}
            issueIds={issueIds}
            loading={loading}
            activeIds={data?.active || []}
            isActive={isActive}
            onDetail={setDetail}
            onToggle={toggle}
          />
          {!loading && filtered.length === 0 && (
            <div className="empty">{t('Aucun mod ne correspond à ce filtre.')}</div>
          )}
          <div className="pagination">
            <button className="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {'\u2190'} {t('Précédent')}
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil(parentGroups.length / 36))}
            </span>
            <button
              className="button"
              disabled={page * 36 >= parentGroups.length}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('Suivant')}
              {'\u2192'}
            </button>
          </div>
        </section>
        <footer>
          {t('Fait pour survivre à votre liste de mods.')}
          <span>{t('LOCAL · PRIVÉ · PROJECT ZOMBOID')}</span>
        </footer>
      </main>
      {orderEditor && (
        <OrderEditor
          ids={orderEditor.ids}
          saveName={orderEditor.name}
          mods={data?.mods || []}
          steam={steam}
          onValidate={validateOrder}
          onClose={() => setOrderEditor(undefined)}
          onSave={async (ids) => {
            const result = await api('/api/reorder', {
              saveId: orderEditor.saveId,
              revision: orderEditor.revision,
              ids,
            });
            const selected = orderEditor.saveId;
            setOrderEditor(undefined);
            await load(selected);
            setNotice({
              key: 'Ordre enregistré. Copie de sécurité : {{backup}}',
              values: { backup: result.backup },
            });
          }}
        />
      )}
      {detail && !confirm && !orderEditor && (
        <ModDetail
          mod={detail}
          members={
            groupMods(all).find((group) => group.members.includes(detail))?.members || [detail]
          }
          workshop={detail.workshopId ? steam[detail.workshopId] : undefined}
          all={all}
          issues={data?.issues || []}
          isActive={isActive}
          onSelect={setDetail}
          onRemove={(mod) => {
            setChecked(new Set([mod.id]));
            setConfirm(true);
          }}
          onClose={() => setDetail(undefined)}
        />
      )}
      {confirm && (
        <Dialog
          compact
          label={t('Confirmer le retrait')}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <h2>{t('Retirer {{count}} ID(s) de la sauvegarde ?', { count: checked.size })}</h2>
          <p>
            {t(
              'Seuls les IDs sélectionnés seront retirés. Les autres sous-mods du même élément Workshop et l’abonnement Steam sont conservés.',
            )}
          </p>
          <p>
            {t(
              'Fermez Project Zomboid. Une copie de mods.txt sera créée avant modification. Retirer des mods de cartes, véhicules ou objets peut rendre la partie inutilisable : conservez aussi une copie complète de votre sauvegarde.',
            )}
          </p>
          <ul>
            {[...checked].map((id) => (
              <li key={id}>{name(id)}</li>
            ))}
          </ul>
          {error && (
            <div role="alert" className="alert error">
              {translateError(error)}
            </div>
          )}
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={() => setConfirm(false)}>
              {t('Annuler')}
            </button>
            <button className="button destructive" disabled={busy} onClick={remove}>
              {busy ? t('Modification…') : t('Confirmer le retrait')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
