import en from '../i18n/en/ui.json';
import id from '../i18n/id/ui.json';

export const translations = {
  en,
  id,
};

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in translations) return lang as keyof typeof translations;
  return 'en';
}

export function useTranslations(lang: keyof typeof translations) {
  return function t(key: keyof typeof en) {
    return translations[lang][key] || translations['en'][key];
  }
}
