"use client";

import { useRouter, usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { switchLocale } from "@/lib/i18n/paths";
import { Popover, barBtn } from "@/components/ui/Popover";
import { useI18n } from "./I18nProvider";

/**
 * The language picker.
 *
 * Choosing a language writes it down in a cookie, so the next visit opens in
 * the same one, and moves the reader to the same page in that language.
 */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const choose = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // The query string is read here rather than with useSearchParams, so the
    // page stays a static one and no Suspense boundary is needed around it.
    const search = typeof window === "undefined" ? "" : window.location.search;
    router.push(`${switchLocale(pathname, next)}${search}`);
  };

  return (
    <Popover
      label={t("language.label")}
      tip={t("language.hint")}
      width={216}
      triggerClass={barBtn}
      trigger={
        <>
          <Languages size={16} strokeWidth={1.8} />
          {!compact && <span className="max-sm:hidden">{LOCALE_NAMES[locale]}</span>}
        </>
      }
    >
      {() => (
        <div>
          <p className="mb-2 text-[12.5px] text-ink-3">{t("language.hint")}</p>
          <div className="grid gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === locale}
                onClick={() => choose(l)}
                className={`flex h-9 items-center justify-between rounded-[9px] px-2.5 text-[13.5px] transition-colors ${
                  l === locale ? "bg-sunk font-medium text-ink" : "text-ink-2 hover:bg-sunk hover:text-ink"
                }`}
              >
                <span>{LOCALE_NAMES[l]}</span>
                {l === locale && <span className="text-[11px] text-ink-3">{t("common.done")}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
