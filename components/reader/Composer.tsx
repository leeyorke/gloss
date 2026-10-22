"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { startGloss } from "@/lib/ask";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useReader } from "./context";
import { WebSwitch } from "./WebSwitch";

export type ComposerHandle = { focus: () => void };

/**
 * Ask about the whole text. The answer is written in the margin beside the
 * paragraph you were reading when you asked, so it stays where your head was.
 */
export const Composer = forwardRef<ComposerHandle, { currentBlock: () => string | null; suggestions?: string[] }>(function Composer(
  { currentBlock, suggestions },
  ref
) {
  const { ix } = useReader();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // The questions offered while the box is empty: the ones for this text, or the general ones.
  const starters = suggestions?.length ? suggestions : [t("reader.questions.one"), t("reader.questions.two"), t("reader.questions.three")];

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    startGloss(ix, { at: currentBlock() ?? undefined, action: "ask", question: text });
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div className="composer focus-hide pointer-events-none sticky bottom-4 z-30 mt-20 sm:bottom-6">
      {focused && !q && (
        <div className="pointer-events-auto mb-2 flex flex-wrap justify-center gap-1.5" style={{ animation: "rise 0.3s var(--ease-out) both" }}>
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ask(s)}
              className="rounded-full border border-rule bg-raised/95 px-3 py-1.5 text-[12.5px] text-ink-2 shadow-card backdrop-blur transition-colors hover:border-rule-strong hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className={`pointer-events-auto mx-auto flex max-w-[34rem] items-center gap-2 rounded-[16px] border bg-raised/92 py-1.5 pl-4 pr-1.5 shadow-pop backdrop-blur-md transition-[border-color,max-width] duration-300 ease-[var(--ease-out)] ${
          focused ? "max-w-[38rem] border-rule-strong" : "border-rule"
        }`}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              inputRef.current?.blur();
            }
          }}
          placeholder={t("reader.composer.placeholder")}
          aria-label={t("reader.composer.label")}
          className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-3"
        />
        {!focused && !q && <kbd className="hidden sm:inline">/</kbd>}
        <WebSwitch />
        <button
          type="submit"
          disabled={!q.trim()}
          aria-label={t("reader.composer.ask")}
          data-tip={t("reader.composer.ask")}
          data-tip-kbd={"\u21b5"}
          className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-ink text-bg transition-opacity disabled:opacity-25"
        >
          <ArrowUp size={17} strokeWidth={2.3} />
        </button>
      </form>
    </div>
  );
});
