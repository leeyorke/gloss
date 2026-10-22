import { LOCALE_TAGS, type Locale } from "./config";

/** The Intl tag of a locale: "en" or "zh-Hans". */
export function intlTag(locale: Locale): string {
  return LOCALE_TAGS[locale] ?? locale;
}

/** A date, written the way this language writes dates. */
export function formatDate(
  locale: Locale,
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlTag(locale), options).format(date);
}

/** A number, written the way this language writes numbers. */
export function formatNumber(locale: Locale, value: number, options: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/** The plural category a number falls into in this language: "one", "other". */
export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(intlTag(locale)).select(count);
}

const UNITS: { limit: number; unit: Intl.RelativeTimeFormatUnit; divisor: number }[] = [
  { limit: 60, unit: "second", divisor: 1 },
  { limit: 3600, unit: "minute", divisor: 60 },
  { limit: 86400, unit: "hour", divisor: 3600 },
  { limit: 604800, unit: "day", divisor: 86400 },
  { limit: 2629800, unit: "week", divisor: 604800 },
  { limit: 31557600, unit: "month", divisor: 2629800 },
];

/**
 * How long ago, or how far ahead, in words this language uses.
 *
 * "3 days ago" in English, "3 天前" in Chinese: the unit and the wording both
 * come from Intl, so a language with different rules reads right.
 */
export function formatRelativeTime(
  locale: Locale,
  value: Date | number | string,
  now: Date | number = Date.now(),
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const nowTime = now instanceof Date ? now.getTime() : now;
  const seconds = (date.getTime() - nowTime) / 1000;
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" }).format(Math.round(seconds), "second");
  for (const { limit, unit, divisor } of UNITS) {
    if (magnitude < limit) {
      return new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
    }
  }
  return new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" }).format(Math.round(seconds / 31557600), "year");
}
