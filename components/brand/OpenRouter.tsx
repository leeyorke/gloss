"use client";

import { BRAND } from "@/lib/brand";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * OpenRouter, linked and recessed: the models behind the answers.
 *
 * The name is set in the reader's own type rather than drawn, so it sits in
 * the corner the way a maker's name usually does.
 */
export function OpenRouterLink({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <a
      href={BRAND.openrouterUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="OpenRouter"
      data-tip={t("nav.openrouterTip")}
      className={`flex h-9 shrink-0 items-center rounded-sm text-ink opacity-75 transition-opacity duration-200 hover:opacity-100 ${className}`}
    >
      <span className="text-[13px] font-medium tracking-[-0.012em]">OpenRouter</span>
    </a>
  );
}
