import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useI18n } from './i18n';
import type { Translator } from './localization';
import { sourceLabel, type SourceKind } from './source-labels';
const SourceContext = createContext<SourceKind>('save');
export function SourceProvider({ kind, children }: { kind: SourceKind; children: ReactNode }) {
  return <SourceContext.Provider value={kind}>{children}</SourceContext.Provider>;
}
/** Only explicit, source-specific labels change; global instructions remain untouched. */
export function useSourceI18n(kind?: SourceKind) {
  const contextKind = useContext(SourceContext);
  const sourceKind = kind || contextKind;
  const i18n = useI18n();
  const translate = i18n.t;
  const t = useCallback<Translator>(
    (key, values) => translate(sourceLabel(key, sourceKind), values),
    [sourceKind, translate],
  );
  return { ...i18n, t, sourceKind };
}
