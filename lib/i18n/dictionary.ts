import en from "./dictionaries/en.json";
import zh from "./dictionaries/zh.json";
import { DEFAULT_LOCALE, type Locale } from "./config";
import type { Dictionary } from "./translate";

/**
 * The dictionary of every language Gloss ships.
 *
 * This module is server-side: the browser is handed the one dictionary it
 * needs, as a prop, and never carries the lot.
 */
export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  zh,
};

/** The dictionary for a language. */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
