"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { validateKey } from "@/lib/ask";
import { BRAND } from "@/lib/brand";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Popover, barBtn } from "./Popover";

const STORAGE_KEY = "openrouter:api-key";

/** Today's free use of the shared key, as the share still unspent (0 to 1). */
type Free = { left: number; signedIn: boolean };

/** Bring your own OpenRouter key. Stored in this browser only. A little reading a day is free without one. */
export function KeyMenu() {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [house, setHouse] = useState<boolean | null>(null);
  const [free, setFree] = useState<Free | null>(null);

  useEffect(() => {
    try {
      setKey(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {}
    fetch("/api/key")
      .then((r) => r.json())
      .then((j: { house?: boolean; free?: Free | null }) => {
        setHouse(Boolean(j.house));
        setFree(j.free ?? null);
      })
      .catch(() => setHouse(false));
    // Every answer on the shared key reports what is left.
    const onFree = (e: Event) => setFree((f) => (f ? { ...f, left: (e as CustomEvent<number>).detail } : f));
    window.addEventListener("gloss:free", onFree);
    return () => window.removeEventListener("gloss:free", onFree);
  }, []);

  const spent = house === false || free?.left === 0;
  const status = key ? t("key.yourKey") : spent ? t("key.addKey") : free && free.left <= 0.25 ? t("key.lowOnFreeUse") : null;

  return (
    <Popover
      label={t("key.label")}
      tip={key ? t("key.usingYours") : t("key.addYours")}
      width={320}
      triggerClass={barBtn}
      openOn="gloss:key"
      trigger={
        <>
          {key ? <span aria-hidden className="size-1.5 rounded-full bg-good" /> : <KeyRound size={15} aria-hidden />}
          {status && <span className="hidden sm:inline">{status}</span>}
        </>
      }
    >
      {(close) => <KeyPanel current={key} house={house} free={free} onSave={(v) => setKey(v)} close={close} />}
    </Popover>
  );
}

function KeyPanel({ current, house, free, onSave, close }: { current: string; house: boolean | null; free: Free | null; onSave: (v: string) => void; close: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(current);
  const [state, setState] = useState<"idle" | "checking" | "bad">("idle");

  const save = async () => {
    const v = draft.trim();
    if (!v) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      onSave("");
      close();
      return;
    }
    setState("checking");
    const ok = await validateKey(v);
    if (!ok) {
      setState("bad");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {}
    onSave(v);
    close();
  };

  return (
    <div>
      <p className="text-[13.5px] font-medium text-ink">{t("key.yourKeyTitle")}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
        {current
          ? t("key.withYourKey")
          : house && free
            ? t("key.freeUse", { signedIn: free.signedIn ? t("key.signedInDoubles") : "" })
            : t("key.addToStart")}
      </p>
      {!current && house && free && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[11.5px] text-ink-3">
            <span>{t("key.freeToday")}</span>
            <span className="tabular-nums">{free.left > 0 ? t("key.percentLeft", { percent: Math.max(1, Math.round(free.left * 100)) }) : t("key.usedUp")}</span>
          </div>
          <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-rule" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--rubric)] transition-[width] duration-500" style={{ width: `${Math.round(free.left * 100)}%` }} />
          </span>
        </div>
      )}
      <input
        autoFocus
        type="password"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setState("idle");
        }}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="sk-or-v1-..."
        autoComplete="off"
        spellCheck={false}
        aria-label={t("key.label")}
        className="mt-3 h-9 w-full rounded-lg border border-rule bg-bg px-3 text-[13px] tracking-wide text-ink outline-none focus-visible:outline-none placeholder:text-ink-4 focus:border-rule-strong"
      />
      {state === "bad" && <p className="mt-2 text-[12.5px] text-rubric-text">{t("key.rejected")}</p>}
      <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t("key.stored")}</p>
      <div className="mt-3 flex items-center justify-between">
        <a href={BRAND.keysUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-rubric-text underline decoration-rule-strong underline-offset-4">
          {t("key.getOne")}
        </a>
        <div className="flex gap-1.5">
          {current && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {}
                onSave("");
              }}
              className="h-8 rounded-lg px-3 text-[12.5px] font-medium text-ink-2 hover:bg-sunk"
            >
              {t("key.clear")}
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={state === "checking"}
            className="h-8 rounded-lg bg-ink px-3.5 text-[12.5px] font-medium text-bg disabled:opacity-60"
          >
            {state === "checking" ? t("key.checking") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
