import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, type Locale } from "./config";

/** A pathname, taken apart: the language it is in, if any, and the rest of it. */
export type SplitPath = { locale: Locale | null; rest: string };

/**
 * Take a pathname apart into its language and the rest of it.
 *
 * Only a whole first segment counts as a language, so "/english/notes" is a
 * path in no language rather than a path in English.
 */
export function splitLocale(pathname: string): SplitPath {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const [head, ...tail] = path.slice(1).split("/");
  const locale = (LOCALES as readonly string[]).includes(head) ? (head as Locale) : null;
  if (!locale) return { locale: null, rest: path || "/" };
  const rest = tail.length ? `/${tail.join("/")}` : "/";
  return { locale, rest: rest === "/" ? "/" : rest.replace(/\/+$/, "") || "/" };
}

/** Is this path already in a language? */
export function hasLocale(pathname: string): boolean {
  return splitLocale(pathname).locale !== null;
}

/**
 * The path of a page in a given language: "/zh/library".
 *
 * The language is only written once, so a path that already carries one is
 * rewritten rather than stacked.
 */
export function localePath(locale: Locale, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const withoutLocale = splitLocale(clean).rest;
  if (withoutLocale === "/") return `/${locale}`;
  return `/${locale}${withoutLocale}`;
}

/** The same page in another language, keeping the query string and the anchor. */
export function switchLocale(pathname: string, locale: Locale): string {
  return localePath(locale, splitLocale(pathname).rest);
}

/**
 * The language of a path, when it has one. Falls back to the default for
 * paths that were never given a language.
 */
export function localeOf(pathname: string): Locale {
  return splitLocale(pathname).locale ?? DEFAULT_LOCALE;
}

/**
 * The links between the languages, for the pages that say which language they
 * are: each language's own address for this page, and the default for those
 * who have no preference.
 */
export function languageAlternates(path = "/"): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l], localePath(l, path)])),
    "x-default": localePath(DEFAULT_LOCALE, path),
  };
}
