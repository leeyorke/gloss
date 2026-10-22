"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

/** Before the first words arrive: three lines of the pen's wash, shimmering. */
export function Writing({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`writing ${className}`} role="status" aria-label={t("reader.writing")}>
      <span style={{ width: "94%" }} />
      <span style={{ width: "82%" }} />
      <span style={{ width: "58%" }} />
    </div>
  );
}
