import { translateIssue, translateError } from './messages';
import { I18nProvider } from './i18n';
import { useSourceI18n, SourceProvider } from './source-context';
import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import { sourceWriteReducer, type WritePhase } from './write-state';
import { SourceWriteStatus } from './SourceWriteStatus';
import { createRoot } from 'react-dom/client';
import type { Mod, Save, Issue, WorkshopDetail } from '../src/domain/mods';
import './style.css';
import './themes.css';
import './ui/components.css';
import { Select } from './ui/Select';
import { Tooltip } from './ui/Tooltip';
import { applyTheme, initialTheme } from './theme';
import { SettingsPage } from './SettingsPage';
import { AddModDialog } from './AddModDialog';
import {
  readNavigationState,
  writeNavigationState,
  navigationContextKey,
  type NavigationTab,
} from './navigation-state';
import { Dialog } from './Dialog';
import { ModDetail } from './ModDetail';
import { OrderEditor, type OrderValidation } from './OrderEditor';
import { ParentLibrary } from './ParentLibrary';
import { TransferDialog } from './TransferDialog';
import { groupMods } from './parent-groups';
import { SORT_STORAGE_KEY, readSortMode, sortParentGroups } from './mod-sort';
import { PAGE_SIZES, PAGE_SIZE_STORAGE_KEY, readPageSize, paginate } from './pagination';
type Overview = {
  saves: Save[];
  selected?: string;
  mods: Mod[];
  active: string[];
  revision: string;
  version?: string;
  collectionWarning?: string;
  issues: Issue[];
  status: { analysis: string; gameVersion: string; collectionsError?: string };
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
  const [data, setData] = useState<Overview>();
  const sourceKind = data?.saves.find((source) => source.id === data.selected)?.kind || 'save';
  const { t, language, setLanguage } = useSourceI18n(sourceKind);
  const [writes, dispatchWrite] = useReducer(sourceWriteReducer, { byId: {} });
  function reportWrite(
    source: { id: string; name: string; kind?: Save['kind'] },
    phase: WritePhase | 'idle',
    details?: { backup?: string; message?: string; silent?: boolean },
  ) {
    if (source.kind !== 'collection') return;
    dispatchWrite(
      phase === 'idle'
        ? { type: 'idle', id: source.id }
        : { type: phase, id: source.id, name: source.name, ...details },
    );
  }
  const [theme, setTheme] = useState(initialTheme);
  const [section, setSection] = useState<'library' | 'settings'>(() => {
    try {
      return localStorage.getItem('pz-mods-section') === 'settings' ? 'settings' : 'library';
    } catch {
      return 'library';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('pz-mods-section', section);
    } catch {
      /* Navigation stays usable. */
    }
  }, [section]);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const [initialNavigation] = useState(readNavigationState);
  const contexts = useRef(initialNavigation.contexts || {});
  const [selectedSave, setSelectedSave] = useState(initialNavigation.saveId);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adding, setAdding] = useState<{
    save: { id: string; name: string; revision: string; kind?: Save['kind'] };
    initialId?: string;
  }>();
  function openAdd(mod?: Mod) {
    if (!data?.selected) return;
    setAdding({
      save: {
        id: data.selected,
        name: data.saves.find((save) => save.id === data.selected)?.name || data.selected,
        revision: data.revision,
        kind: data.saves.find((source) => source.id === data.selected)?.kind,
      },
      initialId: mod ? (mod.workshopId ? `\\${mod.workshopId}/${mod.id}` : mod.id) : undefined,
    });
    setDetail(undefined);
  }
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ key: string; values: Record<string, string> }>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialNavigation.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<NavigationTab>(initialNavigation.tab);
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
  const [page, setPage] = useState(initialNavigation.page);
  useEffect(() => {
    const key = navigationContextKey(selectedSave, tab);
    contexts.current[key] = { search, page };
    writeNavigationState({
      version: 1,
      tab,
      search,
      page,
      saveId: selectedSave,
      contexts: contexts.current,
    });
  }, [tab, search, page, selectedSave]);
  function changeContext(nextTab: NavigationTab, nextSave = selectedSave) {
    if (nextSave !== selectedSave) setNotice(undefined);
    setSection('library');
    contexts.current[navigationContextKey(selectedSave, tab)] = { search, page };
    const next = contexts.current[navigationContextKey(nextSave, nextTab)];
    setTab(nextTab);
    setSearch(next?.search || '');
    setPage(next?.page || 1);
    setSelectedSave(nextSave);
  }
  const [sortMode, setSortMode] = useState(() => {
    try {
      return readSortMode(localStorage.getItem(SORT_STORAGE_KEY));
    } catch {
      return readSortMode(null);
    }
  });
  function changeSort(value: string) {
    const next = readSortMode(value);
    setSortMode(next);
    setPage(1);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      // Sorting remains available without browser storage.
    }
  }
  const [pageSize, setPageSize] = useState(() => {
    try {
      return readPageSize(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    } catch {
      return readPageSize(null);
    }
  });
  function changePageSize(value: string) {
    const next = readPageSize(value);
    setPageSize(next);
    setPage(1);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
    } catch {
      /* Pagination stays usable when storage is unavailable. */
    }
  }
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
  const loadSequence = useRef(0);
  async function load(id?: string, restore = false, force = false) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      let overview: Overview;
      try {
        const query = new URLSearchParams();
        if (id) query.set('save', id);
        if (force) query.set('refresh', '1');
        overview = await api('/api/overview' + (query.size ? '?' + query : ''));
      } catch (reason) {
        if (!restore || !id) throw reason;
        overview = await api('/api/overview');
      }
      if (sequence !== loadSequence.current) return;
      if (restore && id && overview.selected !== id) {
        const restored = contexts.current[navigationContextKey(overview.selected, tab)];
        setSearch(restored?.search || '');
        setPage(restored?.page || 1);
      }
      setData(overview);
      setSelectedSave(overview.selected);
      setChecked(new Set());
    } catch (e) {
      if (sequence === loadSequence.current) {
        setError(String((e as Error).message));
        if (data && id && id !== data.selected) {
          const previous = contexts.current[navigationContextKey(data.selected, tab)];
          setSelectedSave(data.selected);
          setSearch(previous?.search || '');
          setPage(previous?.page || 1);
        }
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  const initialLoad = useRef(load);
  useEffect(() => {
    void initialLoad.current(initialNavigation.saveId, true);
  }, [initialNavigation.saveId]);
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
  const effectiveSort = sortMode === 'save' && tab !== 'active' ? 'name-asc' : sortMode;
  const parentGroups = sortParentGroups(
    matchedGroups,
    effectiveSort,
    steam,
    data?.active || [],
    language,
  );
  const pagination = paginate(parentGroups.length, page, pageSize);
  useEffect(() => {
    if (data && !loading && page !== pagination.page) setPage(pagination.page);
  }, [data, loading, page, pagination.page]);
  const shownGroups = parentGroups.slice(pagination.start, pagination.end);
  // Fetch metadata for the complete inventory so sorting is global, across all pages.
  const keys = all
    .map((m) => m.workshopId)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(keys.split(',').filter(Boolean))];
    if (ids.length)
      Promise.allSettled(
        Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) =>
          api('/api/workshop', { ids: ids.slice(index * 50, (index + 1) * 50) }),
        ),
      )
        .then((batches) => {
          if (!cancelled) {
            const successful = batches
              .filter((batch) => batch.status === 'fulfilled')
              .map((batch) => batch.value);
            setSteam((s) => Object.assign({}, s, ...successful));
            setWorkshopError(batches.some((batch) => batch.status === 'rejected'));
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
    const source = data.saves.find((source) => source.id === data.selected);
    if (!source) return;
    setBusy(true);
    setError('');
    reportWrite(source, 'saving');
    try {
      const result = await api('/api/remove', {
        saveId: source.id,
        ids: [...checked],
        revision: data.revision,
      });
      reportWrite(source, 'saved', { backup: result.backup });
      setConfirm(false);
      setDetail(undefined);
      await load(source.id);
      if (source.kind !== 'collection')
        setNotice({
          key: 'Mods retirés de la sauvegarde. Copie de sécurité : {{backup}}',
          values: { backup: result.backup },
        });
    } catch (e) {
      reportWrite(source, 'error', { message: (e as Error).message });
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
    <SourceProvider kind={sourceKind}>
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
            <Tooltip key={id} content={String(label)} side="right">
              <button
                aria-label={`${label} (${count})`}
                aria-current={section === 'library' && tab === id ? 'page' : undefined}
                className={'nav ' + (section === 'library' && tab === id ? 'selected' : '')}
                key={id}
                onClick={() => {
                  changeContext(id as NavigationTab);
                }}
              >
                <span className="nav-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="nav-text">{label}</span>
                <b aria-hidden="true">{count}</b>
              </button>
            </Tooltip>
          ))}
          <button
            className={'nav settings-nav ' + (section === 'settings' ? 'selected' : '')}
            aria-current={section === 'settings' ? 'page' : undefined}
            aria-label={t('Configuration')}
            onClick={() => setSection('settings')}
          >
            <span className="nav-icon" aria-hidden="true">
              ⚙
            </span>
            <span className="nav-text">{t('Configuration')}</span>
          </button>
          <div className="side-bottom">
            <span className="dot" /> {t('CONNEXION LOCALE')}
            <small>
              {t('Project Zomboid ·')}
              {data ? data.version || t('Version non définie') : '…'}
              <br />
              {t('Vos fichiers restent sur cet ordinateur.')}
            </small>
          </div>
        </aside>
        <main>
          <header className="app-header">
            <div className="breadcrumb">
              {t('BIBLIOTHÈQUE')}
              <span>/</span> {section === 'settings' ? t('Configuration') : t('GESTION DES MODS')}
            </div>
            <Tooltip
              content={t(
                'Relire les sauvegardes et les mods installés en conservant votre navigation.',
              )}
            >
              <button
                className="button"
                disabled={loading}
                onClick={() => load(data?.selected, false, true)}
              >
                {'\u21bb'} {t('Actualiser')}
              </button>
            </Tooltip>
            <button className="button" disabled={loading} onClick={() => setTransferOpen(true)}>
              {t('Importer / exporter')}
            </button>
          </header>
          {section === 'settings' && (
            <SettingsPage
              language={language}
              onLanguageChange={setLanguage}
              theme={theme}
              onThemeChange={setTheme}
              onPathsChanged={() => {
                setDetail(undefined);
                setOrderEditor(undefined);
                setAdding(undefined);
                setSearch('');
                setPage(1);
                void load();
              }}
            />
          )}
          <div hidden={section !== 'library'}>
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
                <label htmlFor="save">{t('SAUVEGARDES ET COLLECTIONS')}</label>
                <Select
                  id="save"
                  label={t('SAUVEGARDES ET COLLECTIONS')}
                  value={data?.selected || ''}
                  disabled={loading}
                  onValueChange={(value) => {
                    changeContext(tab, value);
                    void load(value);
                  }}
                  options={(data?.saves || []).map((s) => ({
                    value: s.id,
                    label: s.kind === 'collection' ? s.name : `${s.mode} / ${s.name}`,
                    group:
                      s.kind === 'collection' ? t('Collections locales') : t('Sauvegardes solo'),
                  }))}
                />
                <div>
                  <span className="dot" /> {active.size} {t('mods actifs')}{' '}
                  <span className="save-version">
                    {data?.version ? (
                      <>
                        {t('Build locale')} {data.version}
                      </>
                    ) : (
                      t('Version non définie')
                    )}
                  </span>
                </div>
                <small>
                  {sourceKind === 'collection'
                    ? t('Aucune version de partie n’est associée à cette collection.')
                    : t('Version locale utilisée pour choisir les variantes des mods.')}
                </small>
                {sourceKind === 'collection' && (
                  <SourceWriteStatus
                    entry={data?.selected ? writes.byId[data.selected] : undefined}
                  />
                )}
              </div>
            </section>
            {sourceKind === 'collection' && (
              <p className="collection-order-note">
                {t(
                  'Collection locale issue de pz_modlist_settings.cfg. Le jeu peut réordonner ses mods ; l’ordre enregistré ne garantit pas l’ordre de chargement d’une partie.',
                )}
              </p>
            )}
            {(data?.collectionWarning || data?.status.collectionsError) && (
              <div className="collection-order-note" role="status">
                <strong>{t('Collections locales indisponibles')}</strong>
                <br />
                {translateError(data.collectionWarning || data.status.collectionsError || '', t)}
              </div>
            )}
            {error && (
              <div role="alert" className="alert error">
                {translateError(error, t)}
                <button aria-label={t('Masquer l’erreur')} onClick={() => setError('')}>
                  {t('×')}
                </button>
              </div>
            )}
            {notice && (
              <div
                role={sourceKind === 'collection' ? undefined : 'status'}
                aria-live={sourceKind === 'collection' ? 'off' : undefined}
                className="alert"
              >
                {t(notice.key, notice.values)}
                <button
                  aria-label={t('Masquer la notification')}
                  onClick={() => setNotice(undefined)}
                >
                  {t('×')}
                </button>
              </div>
            )}
            <section className="stats">
              <button
                onClick={() => {
                  changeContext('active');
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
                  changeContext('unused');
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
                  changeContext('issues');
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
            <section className="library" key={tab}>
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
                <label className="page-size-control sort-control">
                  {t('Trier par')}
                  <Select
                    label={t('Trier par')}
                    value={effectiveSort}
                    onValueChange={changeSort}
                    options={[
                      {
                        value: 'save',
                        label: t('Ordre de la sauvegarde'),
                        disabled: tab !== 'active' || !data?.selected,
                      },
                      { value: 'updated-desc', label: t('Mise à jour : plus récentes') },
                      { value: 'updated-asc', label: t('Mise à jour : plus anciennes') },
                      { value: 'name-asc', label: t('Nom : A → Z') },
                      { value: 'name-desc', label: t('Nom : Z → A') },
                    ]}
                  />
                </label>
                <label className="page-size-control">
                  {t('Éléments par page')}
                  <Select
                    label={t('Éléments par page')}
                    value={String(pageSize)}
                    onValueChange={changePageSize}
                    options={PAGE_SIZES.map((size) => ({
                      value: String(size),
                      label: String(size),
                    }))}
                  />
                </label>
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
                <Tooltip
                  content={t(
                    'Activer un identifiant de mod dans la sauvegarde sélectionnée, après vérification.',
                  )}
                >
                  <button
                    className="button primary"
                    disabled={loading || !data?.selected}
                    onClick={() => openAdd()}
                  >
                    {t('＋ Ajouter un mod')}
                  </button>
                </Tooltip>
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
                          data.saves.find((save) => save.id === data.selected)?.name ||
                          data.selected,
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
                {tab === 'active' && effectiveSort === 'save'
                  ? t(
                      'Un Workshop ID par ligne ou carte, avec tous ses sous-mods. Les tags affichent leur état et leur position dans la sauvegarde. Les parents sont triés par leur premier sous-mod actif ; consultez l’éditeur pour la séquence complète.',
                    )
                  : t(
                      'Un parent par ligne ou carte. Tous ses sous-mods installés restent visibles, même désactivés. Cliquez sur un tag pour ouvrir sa fiche.',
                    )}
              </p>
              {(effectiveSort === 'updated-asc' || effectiveSort === 'updated-desc') && (
                <p className="grouping-note">
                  {t(
                    'Dates Steam pour les mods Workshop ; dernière modification de mod.info pour les projets locaux. Les dates inconnues apparaissent à la fin.',
                  )}
                </p>
              )}
              <ParentLibrary
                all={all}
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
              <div className="pagination" aria-label={t('Pagination')}>
                <span className="pagination-range">
                  {t('{{start}}–{{end}} sur {{total}} parents', {
                    start: parentGroups.length ? pagination.start + 1 : 0,
                    end: pagination.end,
                    total: parentGroups.length,
                  })}
                </span>
                <button
                  className="button"
                  disabled={pagination.page === 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  {'\u2190'} {t('Précédent')}
                </button>
                <span>
                  {pagination.page} / {pagination.pageCount}
                </span>
                <button
                  className="button"
                  disabled={pagination.page === pagination.pageCount}
                  onClick={() => setPage(pagination.page + 1)}
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
          </div>
        </main>
        {adding && (
          <AddModDialog
            save={adding.save}
            initialId={adding.initialId}
            onClose={() => setAdding(undefined)}
            onWriteState={(phase, details) => reportWrite(adding.save, phase, details)}
            onAdded={async (backup?: string) => {
              const saveId = adding.save.id;
              setAdding(undefined);
              await load(saveId);
              if (adding.save.kind !== 'collection')
                setNotice(
                  backup
                    ? {
                        key: 'Mod ajouté à la sauvegarde. Copie de sécurité : {{backup}}',
                        values: { backup },
                      }
                    : { key: 'Ce mod est déjà actif dans la sauvegarde.', values: {} },
                );
            }}
          />
        )}
        {transferOpen && (
          <TransferDialog
            save={
              data?.selected
                ? {
                    id: data.selected,
                    name:
                      data.saves.find((save) => save.id === data.selected)?.name || data.selected,
                    revision: data.revision,
                  }
                : undefined
            }
            onClose={() => setTransferOpen(false)}
            onProfileSaved={(profile) => {
              const source = data?.saves.find((source) => source.id === data.selected);
              if (source?.kind === 'collection' && source.name === profile.name && profile.replaced)
                reportWrite(source, 'saved', { backup: profile.backup, silent: true });
              void load(source?.id);
            }}
          />
        )}
        {orderEditor && (
          <OrderEditor
            ids={orderEditor.ids}
            saveName={orderEditor.name}
            mods={data?.mods || []}
            steam={steam}
            onValidate={validateOrder}
            onClose={() => setOrderEditor(undefined)}
            onSave={async (ids) => {
              const source = data?.saves.find((source) => source.id === orderEditor.saveId);
              if (source) reportWrite(source, 'saving');
              let result: { backup: string };
              try {
                result = await api('/api/reorder', {
                  saveId: orderEditor.saveId,
                  revision: orderEditor.revision,
                  ids,
                });
              } catch (reason) {
                if (source)
                  reportWrite(source, 'error', {
                    message: reason instanceof Error ? reason.message : String(reason),
                  });
                throw reason;
              }
              if (source) reportWrite(source, 'saved', { backup: result.backup });
              const selected = orderEditor.saveId;
              setOrderEditor(undefined);
              await load(selected);
              if (source?.kind !== 'collection')
                setNotice({
                  key: 'Ordre enregistré. Copie de sécurité : {{backup}}',
                  values: { backup: result.backup },
                });
            }}
          />
        )}
        {detail && !confirm && !orderEditor && !adding && (
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
            onAdd={data?.selected ? openAdd : undefined}
            onOpenFolder={async (mod) => {
              if (!mod.folderKey)
                throw Error(t('Dossier du mod indisponible. Actualisez la bibliothèque.'));
              await api('/api/mods/open-folder', { key: mod.folderKey });
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
                {translateError(error, t)}
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
        {writes.toastId &&
          writes.byId[writes.toastId] &&
          !adding &&
          !orderEditor &&
          !confirm &&
          !transferOpen &&
          !detail && (
            <SourceWriteStatus
              toast
              entry={writes.byId[writes.toastId]}
              onDismiss={() => dispatchWrite({ type: 'dismiss' })}
            />
          )}
      </div>
    </SourceProvider>
  );
}
createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
