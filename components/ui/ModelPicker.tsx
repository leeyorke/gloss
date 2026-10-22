"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Search } from "lucide-react";
import { useModels } from "@/lib/catalogue-client";
import type { ModelInfo } from "@/lib/models";
import { useStore } from "@/lib/store";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * The models answers come from.
 *
 * Every free model is listed, and none of them is ticked to begin with: the
 * reader ticks the ones they want and drags them into the order they want
 * them in. The first model ticked is the one that answers; the ones below it
 * are fallbacks, asked when the one before cannot (it is rate limited, or
 * gone from the list).
 */

/** How many models a chain holds: the one that answers, and a few behind it. */
const MAX_CHAIN = 8;

export function ModelPicker() {
  const { t } = useI18n();
  const chain = useStore((s) => s.settings.models);
  const setSettings = useStore((s) => s.setSettings);
  const { models: free, loading } = useModels();
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const setChain = (next: string[]) => setSettings({ models: next });

  /** A model the catalogue no longer knows: shown by its id, so it can be unticked. */
  const known = (id: string): ModelInfo =>
    free.find((m) => m.id === id) ?? { id, name: id, context: 0, tools: false, vision: false, reasoning: false, mandatoryReasoning: false, json: false, inPerM: 0, outPerM: 0 };

  const wanted = query.trim().toLowerCase();
  const matches = (m: ModelInfo) => !wanted || m.name.toLowerCase().includes(wanted) || m.id.toLowerCase().includes(wanted);

  // The chosen models, in the reader's order, then the rest of the free ones.
  const chosen = chain.map(known).filter(matches);
  const others = free.filter((m) => !chain.includes(m.id)).filter(matches);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chain.length || from === to) return;
    const next = [...chain];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setChain(next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(id);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const from = chain.indexOf(drag);
    if (from < 0) return;
    const y = e.clientY;
    for (const [rid, el] of rows.current) {
      // Only the chosen models move; the rest of the list stays where it is.
      const to = chain.indexOf(rid);
      if (to < 0) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;
      const mid = r.top + r.height / 2;
      // Past the middle of the row below: down. Past the middle of the row
      // above: up.
      if (from < to && y > mid) move(from, to);
      else if (from > to && y < mid) move(from, to);
      break;
    }
  };

  const onPointerUp = () => setDrag(null);

  const onHandleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(index, index + 1);
    }
  };

  const tick = (id: string) => {
    if (chain.includes(id)) setChain(chain.filter((m) => m !== id));
    else if (chain.length < MAX_CHAIN) setChain([...chain, id]);
  };

  const full = chain.length >= MAX_CHAIN;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">{t("settings.models")}</p>
        {chain.length > 0 && (
          <button
            type="button"
            onClick={() => setChain([])}
            className="text-[12px] text-ink-4 transition-colors hover:text-ink-2"
          >
            {t("settings.clearModels")}
          </button>
        )}
      </div>
      <p className="mb-2 text-[11.5px] leading-snug text-ink-4">{t("settings.modelsHint")}</p>

      <div className="flex items-center gap-1.5 rounded-lg bg-sunk px-2">
        <Search size={13} className="shrink-0 text-ink-4" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.searchModels")}
          aria-label={t("settings.searchModels")}
          className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4"
        />
      </div>

      {loading && !free.length ? (
        <p className="mt-2 px-1 text-[12px] text-ink-4">{t("settings.modelsLoading")}</p>
      ) : chosen.length + others.length === 0 ? (
        <p className="mt-2 px-1 text-[12px] text-ink-4">{t("settings.noModels")}</p>
      ) : (
        <ul className="mt-1.5 max-h-[260px] overflow-y-auto">
          {chosen.map((m, i) => (
            <li
              key={m.id}
              ref={(el) => {
                if (el) rows.current.set(m.id, el);
                else rows.current.delete(m.id);
              }}
              className={`flex items-center gap-1 rounded-[10px] px-1 py-1 transition-colors ${drag === m.id ? "bg-sunk" : ""}`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={true}
                onClick={() => tick(m.id)}
                aria-label={t("settings.untickModel", { name: m.name })}
                className="grid size-5 shrink-0 place-items-center rounded-md text-rubric-text transition-colors hover:bg-sunk"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onPointerDown={(e) => onPointerDown(e, m.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={(e) => onHandleKey(e, i)}
                aria-label={t("settings.moveModel", { name: m.name })}
                data-tip={t("settings.dragToReorder")}
                className="grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink-2 active:cursor-grabbing"
              >
                <GripVertical size={13} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{m.name}</span>
                <span className="block truncate text-[11px] text-ink-4">{m.id}</span>
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] ${i === 0 ? "bg-rubric-wash text-rubric-text" : "text-ink-4"}`}>
                {i === 0 ? t("settings.modelDefault") : t("settings.modelFallback")}
              </span>
            </li>
          ))}
          {others.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-[10px] px-1 py-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={false}
                disabled={full}
                onClick={() => tick(m.id)}
                aria-label={t("settings.tickModel", { name: m.name })}
                className={`grid size-5 shrink-0 place-items-center rounded-md transition-colors ${full ? "text-ink-4/50" : "text-ink-4 hover:bg-sunk hover:text-ink-2"}`}
              >
                <span className="size-3.5 rounded-[4px] border border-rule-strong" />
              </button>
              <span className="w-5 shrink-0" />
              <span className={`min-w-0 flex-1 ${full ? "opacity-50" : ""}`}>
                <span className="block truncate text-[12.5px] text-ink-2">{m.name}</span>
                <span className="block truncate text-[11px] text-ink-4">{m.id}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {chain.length === 0 && !loading ? (
        <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t("settings.modelsEmpty")}</p>
      ) : full ? (
        <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t("settings.modelsFull")}</p>
      ) : null}
    </div>
  );
}
