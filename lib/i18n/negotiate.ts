import { DEFAULT_LOCALE, LOCALES, LOCALE_TAGS, primarySubtag, type Locale } from "./config";

/** One entry of an Accept-Language header: a language tag, and how much the reader wants it. */
export type LanguageRange = { tag: string; quality: number };

/**
 * Read an Accept-Language header into the ranges it names, best first.
 *
 * A range with q=0 is a refusal, not a preference, so it is dropped. The
 * wildcard "*" is kept: it means "anything will do".
 */
export function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
  if (!header) return [];
  const ranges: LanguageRange[] = [];
  for (const part of header.split(",")) {
    const segment = part.trim();
    if (!segment) continue;
    const [rawTag, ...params] = segment.split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let quality = 1;
    for (const param of params) {
      const [key, value] = param.split("=");
      if (key?.trim().toLowerCase() !== "q") continue;
      const parsed = Number.parseFloat((value ?? "").trim());
      if (Number.isFinite(parsed)) quality = Math.min(1, Math.max(0, parsed));
    }
    if (quality <= 0) continue;
    ranges.push({ tag, quality });
  }
  // Best first. The sort is stable, so ranges of equal quality keep the order they were written in.
  return ranges.sort((a, b) => b.quality - a.quality);
}

/** Does this tag name this locale, either exactly or by its first subtag alone? */
function matches(tag: string, locale: Locale): "exact" | "primary" | null {
  const wanted = tag.toLowerCase();
  const code = locale.toLowerCase();
  const full = LOCALE_TAGS[locale].toLowerCase();
  if (wanted === code || wanted === full) return "exact";
  if (primarySubtag(wanted) === primarySubtag(code) || primarySubtag(wanted) === primarySubtag(full)) return "primary";
  return null;
}

/**
 * The language a reader wants, from the Accept-Language header their browser sent.
 *
 * Each range is tried in turn, best first, and the first one we can serve wins:
 * an exact match first, then a match on the language alone, so "zh-CN" and
 * "zh-Hans" both find the "zh" we ship. A range we cannot serve is skipped
 * rather than ending the search, and the fallback is used only when nothing
 * in the header can be served at all.
 */
export function matchLocale(
  header: string | null | undefined,
  locales: readonly Locale[] = LOCALES,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === "*") return fallback;
    let partial: Locale | null = null;
    for (const locale of locales) {
      const hit = matches(tag, locale);
      if (hit === "exact") return locale;
      if (hit === "primary" && !partial) partial = locale;
    }
    if (partial) return partial;
  }
  return fallback;
}
