import { useI18nStore, i18nDict } from "./stores";

export function t(key: string): string {
  const locale = useI18nStore.getState().locale;
  return i18nDict[locale]?.[key] ?? i18nDict["en"]?.[key] ?? key;
}

export function useT() {
  const locale = useI18nStore((s) => s.locale);
  return (key: string) => i18nDict[locale]?.[key] ?? i18nDict["en"]?.[key] ?? key;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "bn", name: "Bangla", native: "বাংলা", flag: "🇧🇩" },
];

export function getDisplayName(categoryOrAccount: { name: string; name_bn?: string; name_alias?: string }): string {
  const locale = useI18nStore.getState().locale;
  if (locale === "bn" && categoryOrAccount.name_bn) return categoryOrAccount.name_bn;
  return categoryOrAccount.name_alias ?? categoryOrAccount.name;
}
