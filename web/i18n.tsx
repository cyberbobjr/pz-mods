import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { selectLanguage, translate, type Language, type Translator } from './localization';

const STORAGE_KEY = 'pz-mods-language';
function initialLanguage(): Language {
  const browser = typeof navigator === 'undefined' ? 'fr' : navigator.language;
  try {
    return selectLanguage(localStorage.getItem(STORAGE_KEY), browser);
  } catch {
    return selectLanguage(null, browser);
  }
}
let activeLanguage = initialLanguage();
export const getCurrentLanguage = () => activeLanguage;
export const translateCurrent: Translator = (key, values) => translate(activeLanguage, key, values);

type Context = { language: Language; setLanguage: (language: Language) => void; t: Translator };
const LanguageContext = createContext<Context | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(activeLanguage);
  const setLanguage = useCallback((next: Language) => {
    activeLanguage = next;
    updateLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Language changes still work without storage. */
    }
  }, []);
  const t = useCallback<Translator>((key, values) => translate(language, key, values), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('PZ Mods — Votre arsenal, sous contrôle');
  }, [language, t]);
  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || (event.newValue !== 'fr' && event.newValue !== 'en')) return;
      activeLanguage = event.newValue;
      updateLanguage(event.newValue);
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);
  const context = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('I18nProvider is required.');
  return context;
}
