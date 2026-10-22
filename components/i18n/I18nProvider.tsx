"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LOCALE_DIR, LOCALE_TAGS, type Locale } from "@/lib/i18n/config";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/i18n/format";
import { localePath } from "@/lib/i18n/paths";
import { translate, type Dictionary, type TranslationKey, type Vars } from "@/lib/i18n/translate";

/** Everything a component can ask for about the language it is drawn in. */
export type I18n = {
  /** The language of the page. */
  locale: Locale;
  /** Which way the writing goes. */
  dir: "ltr" | "rtl";
  /** The BCP 47 tag of the language, for <html lang> and hreflang. */
  tag: string;
  /** The string at this key, with its words filled in. */
  t: (key: TranslationKey, vars?: Vars) => string;
  /** A path in this language: "/zh/library". */
  path: (path?: string) => string;
  /** A date, written the way this language writes dates. */
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  /** A number, written the way this language writes numbers. */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** How long ago, in words this language uses. */
  formatRelativeTime: (value: Date | number | string, now?: Date | number) => string;
  /** How long a text takes to read: "12 min", "1 h 30 min". */
  formatMinutes: (minutes: number) => string;
};

const I18nContext = createContext<I18n | null>(null);

/**
 * The language, and the words of it, for everything under it.
 *
 * The server hands down the one dictionary the page needs, so the browser
 * carries one language's words and no more.
 */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const t: I18n["t"] = (key, vars) => translate(locale, dict, key, vars);
    return {
      locale,
      dir: LOCALE_DIR[locale] ?? "ltr",
      tag: LOCALE_TAGS[locale] ?? locale,
      t,
      path: (path = "/") => localePath(locale, path),
      formatDate: (v, options) => formatDate(locale, v, options),
      formatNumber: (v, options) => formatNumber(locale, v, options),
      formatRelativeTime: (v, now) => formatRelativeTime(locale, v, now),
      formatMinutes: (minutes) => {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (!hours) return `${formatNumber(locale, rest)} ${t("common.min")}`;
        if (!rest) return `${formatNumber(locale, hours)} ${t("common.hour")}`;
        return `${formatNumber(locale, hours)} ${t("common.hour")} ${formatNumber(locale, rest)} ${t("common.min")}`;
      },
    };
  }, [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The language of the page, and the words of it. */
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside an I18nProvider");
  return value;
}

/** Just the words: the string at this key, in the language of the page. */
export function useT(): I18n["t"] {
  return useI18n().t;
}
