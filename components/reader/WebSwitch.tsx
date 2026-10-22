"use client";

import { Globe } from "lucide-react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Whether answers may look things up on the web. On by default; the model decides when. Fact-check always searches. */
export function WebSwitch({ tone = "plain" }: { tone?: "plain" | "lens" }) {
  const on = useStore((s) => s.settings.search);
  const setSettings = useStore((s) => s.setSettings);
  const { t } = useI18n();
  const lens = tone === "lens";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t("reader.web")}
      data-tip={on ? t("reader.webOn") : t("reader.webOff")}
      data-tip-hint={on ? t("reader.webOnHint") : t("reader.webOffHint")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setSettings({ search: !on })}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-medium transition-colors ${
        on ? (lens ? "bg-lens-fg text-lens" : "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)] ring-1 ring-rule") : lens ? "text-lens-mute hover:text-lens-fg" : "text-ink-3 hover:bg-sunk hover:text-ink"
      }`}
    >
      <Globe size={13} strokeWidth={2} aria-hidden />
      {t("reader.webLabel")}
    </button>
  );
}
