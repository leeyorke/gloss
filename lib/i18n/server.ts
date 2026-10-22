import { lang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { getDictionary } from "./dictionary";
import type { Dictionary } from "./translate";

/**
 * The language of the page being drawn.
 *
 * Read from the [lang] segment every page lives under, so a server component
 * anywhere in the tree can ask for it without being handed it.
 */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The dictionary of the language being drawn. */
export async function getTranslations(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
