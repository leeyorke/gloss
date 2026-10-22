/**
 * The languages Gloss speaks, and the rules for choosing between them.
 *
 * Nothing in this folder touches Next.js, the browser or the filesystem, so
 * the same module runs in the proxy, on the server, in the browser and in the
 * unit tests.
 */

/** Every locale the app ships a dictionary for. Add one here, then add its dictionary file. */
export const LOCALES = ["en", "zh"] as const;

/** A language Gloss can be read in. */
export type Locale = (typeof LOCALES)[number];

/** The locale used when nothing else says otherwise. */
export const DEFAULT_LOCALE: Locale = "en";

/** Where the reader's own choice of language is remembered, between visits. */
export const LOCALE_COOKIE = "gloss_locale";

/**
 * The header the language of a request is written into, so the pages that
 * are drawn outside the [lang] tree can still know it.
 */
export const LOCALE_HEADER = "x-gloss-locale";

/** The BCP 47 tag of each locale: what <html lang> and hreflang say. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  zh: "zh-Hans",
};

/** The name of each language, in that language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

/** The name of each language, in English: for logs and for the test names. */
export const LOCALE_NAMES_EN: Record<Locale, string> = {
  en: "English",
  zh: "Chinese",
};

/** Which way the writing goes. Every language here is left to right. */
export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  zh: "ltr",
};

/** Is this string one of the languages we speak? */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The first part of a language tag: "zh-Hans" and "zh-CN" are both "zh".
 * Used to match a browser's "zh-CN" against the "zh" we ship.
 */
export function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}
