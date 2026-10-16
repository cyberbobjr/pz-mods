import main from './locales/main.en.json';
import order from './locales/order.en.json';
import shared from './locales/shared.en.json';
import transfers from './locales/transfers.en.json';
import ui from './locales/ui.en.json';
import settings from './locales/settings.en.json';
import addMod from './locales/add-mod.en.json';
import profiles from './locales/profiles.en.json';

export type Language = 'fr' | 'en';
export type Translator = (key: string, values?: Record<string, string | number>) => string;
export const english: Record<string, string> = {
  ...main,
  ...order,
  ...shared,
  ...transfers,
  ...ui,
  ...settings,
  ...addMod,
  ...profiles,
};

export function selectLanguage(stored: string | null, browser = 'fr'): Language {
  if (stored === 'fr' || stored === 'en') return stored;
  return browser.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function translate(
  language: Language,
  key: string,
  values: Record<string, string | number> = {},
) {
  const template = language === 'en' ? english[key] || key : key;
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
