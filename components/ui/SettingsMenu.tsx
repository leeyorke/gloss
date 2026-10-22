"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AlignJustify, AlignLeft, Focus, Headphones, Map as MapIcon, Minus, Pilcrow, Plus, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { applySettings, DEFAULT_SETTINGS, FACES, MARKERS, PENS, resolveTheme, THEMES, type Settings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { Popover, barBtn } from "./Popover";
import { ModelPicker } from "./ModelPicker";
import { useI18n } from "@/components/i18n/I18nProvider";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-[10px] bg-sunk p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors ${value === o.key ? "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-ink-3 hover:text-ink"}`}
        >
          {/* Optically centred: the pill's shadow weighs its bottom edge, so the label sits a pixel lower. */}
          <span className="inline-flex translate-y-px items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onChange, label, icon }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex h-9 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] font-medium transition-colors ${
        on ? "border-transparent bg-rubric-wash text-rubric-text" : "border-rule text-ink-3 hover:border-rule-strong hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** A tiny page in each theme: its paper, its ink, and the pen's underline. */
function Swatch({ theme, on }: { theme: (typeof THEMES)[number]; on: boolean }) {
  const pen = (dark: boolean) => (dark ? "var(--pen-d)" : "var(--pen-l)");
  const face = "font-serif text-[15px] leading-none [font-variation-settings:'opsz'_36]";
  return (
    <span
      className={`relative flex h-[38px] w-full overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.28)] outline-offset-2 transition-[outline-color] ${
        on ? "outline-2 outline-[var(--ink)] [outline-style:solid]" : "outline-2 outline-transparent [outline-style:solid] group-hover:outline-[var(--rule-strong)]"
      }`}
    >
      {theme.key === "auto" ? (
        <>
          <span className="flex flex-1 items-center justify-end" style={{ background: "#f6f3ec", color: "#1d1b18" }}>
            <span className={`${face} relative`}>
              A<span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(false) }} />
            </span>
          </span>
          <span className="flex flex-1 items-center justify-start" style={{ background: "#151412", color: "#e9e3d6" }}>
            <span className={`${face} relative`}>
              a<span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(true) }} />
            </span>
          </span>
        </>
      ) : (
        <span className="flex flex-1 items-center justify-center" style={{ background: theme.bg, color: theme.fg }}>
          <span className={`${face} relative`}>
            Aa
            <span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(theme.dark) }} />
          </span>
        </span>
      )}
    </span>
  );
}

let swap: { finished: Promise<void> } | null = null;

/**
 * Type, colour and answers in one small panel. Every change applies to the
 * page underneath immediately, so the page itself is the preview.
 */
export function SettingsMenu({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const focusMode = useStore((s) => s.focusMode);
  const setUI = useStore((s) => s.setUI);
  const [tab, setTab] = useState<"look" | "text" | "answers">("look");

  const set = (patch: Partial<Settings>) => {
    setSettings(patch);
    applySettings({ ...useStore.getState().settings });
  };
  const size = (v: number) => set({ size: Math.max(15, Math.min(28, v)) });
  const dark = resolveTheme(settings.theme) === "night" || resolveTheme(settings.theme) === "ink";

  // A new theme is poured in as a circle that grows out of the swatch you picked.
  const pickTheme = (key: Settings["theme"], e: MouseEvent<HTMLButtonElement>) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void } };
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || quiet || resolveTheme(key) === resolveTheme(settings.theme)) return set({ theme: key });
    // In percentages of the viewport, so the circle lands on the swatch at any zoom or pixel ratio.
    const r = e.currentTarget.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = r.left + r.width / 2;
    const y = r.top + 19;
    const at = `${((x / w) * 100).toFixed(2)}% ${((y / h) * 100).toFixed(2)}%`;
    const end = ((Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) / (Math.hypot(w, h) / Math.SQRT2)) * 100).toFixed(2);
    const root = document.documentElement;
    root.classList.add("theme-swap");
    // A new pick while one is pouring skips the old one; only the newest clears the flag.
    const vt = doc.startViewTransition(() => flushSync(() => set({ theme: key })));
    swap = vt;
    // While it pours, the browser sends every click to the root element instead of what is
    // under the pointer, so a quick second pick would be lost. Catch those clicks, end this
    // pour at once, and hand the click to the element underneath: a new pick pours in fresh.
    const passThrough = (ev: globalThis.MouseEvent) => {
      if (ev.target !== root) return;
      ev.stopPropagation();
      vt.skipTransition();
      const { clientX: x, clientY: y } = ev;
      vt.finished.finally(() => (document.elementFromPoint(x, y) as HTMLElement | null)?.click());
    };
    document.addEventListener("click", passThrough, true);
    vt.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0% at ${at})`, `circle(${end}% at ${at})`] },
          { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
        )
      )
      .catch(() => {});
    vt.finished.finally(() => {
      document.removeEventListener("click", passThrough, true);
      if (swap === vt) {
        swap = null;
        root.classList.remove("theme-swap");
      }
    });
  };

  return (
    <Popover label={t("nav.settings")} tip={t("nav.settingsTip")} width={compact ? 316 : 348} triggerClass={barBtn} trigger={<SettingsIcon size={17} strokeWidth={1.8} />}>
      {() => (
        <div>
          {!compact && (
            <div className="mb-4">
              <Seg
                label={t("settings.section")}
                value={tab}
                onChange={setTab}
                options={[
                  { key: "look", label: t("settings.tabs.look") },
                  { key: "text", label: t("settings.tabs.text") },
                  { key: "answers", label: t("settings.tabs.answers") },
                ]}
              />
            </div>
          )}

          {(compact || tab === "look") && (
            <div className="space-y-3.5">
              <div>
                <p className="mb-2.5 text-[12.5px] text-ink-3">{t("settings.theme")}</p>
                <div className="grid grid-cols-6 gap-2">
                  {THEMES.map((th) => (
                    <button
                      key={th.key}
                      type="button"
                      onClick={(e) => pickTheme(th.key, e)}
                      aria-pressed={settings.theme === th.key}
                      data-tip={th.key === "auto" ? t("settings.followsSystem") : undefined}
                      className="group flex flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-offset-4"
                    >
                      <Swatch theme={th} on={settings.theme === th.key} />
                      <span className={`text-[11px] leading-none transition-colors ${settings.theme === th.key ? "font-medium text-ink" : "text-ink-3 group-hover:text-ink-2"}`}>{t(`settings.themes.${th.key}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Row label={t("settings.pen")}>
                <div className="flex items-center gap-2">
                  {PENS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set({ pen: p.key })}
                      aria-pressed={settings.pen === p.key}
                      aria-label={t("settings.penColour", { colour: t(`settings.pens.${p.key}`) })}
                      data-tip={t(`settings.pens.${p.key}`)}
                      className={`grid size-7 place-items-center rounded-full transition-[box-shadow,transform] active:scale-90 ${settings.pen === p.key ? "shadow-[0_0_0_2px_var(--bg-raised),0_0_0_3.5px_var(--ink-3)]" : ""}`}
                    >
                      <span className="size-5 rounded-full" style={{ background: dark ? p.dark : p.light }} />
                    </button>
                  ))}
                  <span className="ml-1 text-[12px] text-ink-3">{t(`settings.pens.${settings.pen}`)}</span>
                </div>
              </Row>

              {!compact && (
                <>
                  <Row label={t("settings.highlighter")}>
                    <div className="flex items-center gap-2">
                      {MARKERS.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => set({ marker: m.key })}
                          aria-pressed={settings.marker === m.key}
                          aria-label={t("settings.highlighterColour", { colour: t(`settings.markers.${m.key}`) })}
                          data-tip={t(`settings.markers.${m.key}`)}
                          className={`grid size-7 place-items-center rounded-full transition-[box-shadow,transform] active:scale-90 ${settings.marker === m.key ? "shadow-[0_0_0_2px_var(--bg-raised),0_0_0_3.5px_var(--ink-3)]" : ""}`}
                        >
                          <span className="h-3 w-5 -rotate-12 rounded-[3px] opacity-80" style={{ background: m.color }} />
                        </button>
                      ))}
                      <span className="ml-1 text-[12px] text-ink-3">{t(`settings.markers.${settings.marker}`)}</span>
                    </div>
                  </Row>
                  <div className="grid grid-cols-2 gap-1.5 border-t border-rule pt-3.5">
                    <Chip label={t("settings.chips.numbers")} icon={<Pilcrow size={14} />} on={settings.numbers} onChange={(v) => set({ numbers: v })} />
                    <Chip label={t("settings.chips.map")} icon={<MapIcon size={14} />} on={settings.rail} onChange={(v) => set({ rail: v })} />
                    <Chip label={t("settings.chips.focus")} icon={<Focus size={14} />} on={focusMode} onChange={(v) => setUI({ focusMode: v })} />
                    <Chip label={t("settings.chips.listen")} icon={<Headphones size={14} />} on={settings.listen} onChange={(v) => set({ listen: v })} />
                  </div>
                </>
              )}
            </div>
          )}

          {!compact && tab === "text" && (
            <div className="space-y-3.5">
              <div>
                <p className="mb-2.5 text-[12.5px] text-ink-3">{t("settings.typeface")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {FACES.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => set({ face: f.key })}
                      aria-pressed={settings.face === f.key}
                      className={`group flex h-[62px] flex-col items-center justify-center gap-1 rounded-[12px] border transition-[border-color,background-color,transform] active:scale-[0.97] ${
                        settings.face === f.key ? "border-ink bg-bg" : "border-rule hover:border-rule-strong"
                      }`}
                    >
                      <span className="text-[22px] leading-none text-ink" style={{ fontFamily: f.css }}>
                        Ag
                      </span>
                      <span className={`text-[11px] leading-none ${settings.face === f.key ? "font-medium text-ink" : "text-ink-3"}`}>{t(`settings.faces.${f.key}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Row label={t("settings.size")}>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={t("settings.smallerText")} data-tip={t("settings.smaller")} onClick={() => size(settings.size - 1)} className="grid size-7 place-items-center rounded-lg text-ink-2 transition-transform hover:bg-sunk active:scale-90">
                    <Minus size={14} />
                  </button>
                  <input
                    type="range"
                    min={15}
                    max={28}
                    value={settings.size}
                    onChange={(e) => size(Number(e.target.value))}
                    aria-label={t("settings.sizeLabel")}
                    className="h-1 min-w-0 flex-1 accent-[var(--rubric)]"
                  />
                  <button type="button" aria-label={t("settings.largerText")} data-tip={t("settings.larger")} onClick={() => size(settings.size + 1)} className="grid size-7 place-items-center rounded-lg text-ink-2 transition-transform hover:bg-sunk active:scale-90">
                    <Plus size={14} />
                  </button>
                  <span className="w-6 text-right text-[12px] tabular-nums text-ink-3">{settings.size}</span>
                </div>
              </Row>
              <Row label={t("settings.spacing")}>
                <Seg
                  label={t("settings.lineSpacing")}
                  value={settings.leading}
                  onChange={(v) => set({ leading: v })}
                  options={[
                    { key: "tight", label: t("settings.leading.tight") },
                    { key: "normal", label: t("settings.leading.normal") },
                    { key: "loose", label: t("settings.leading.loose") },
                  ]}
                />
              </Row>
              <Row label={t("settings.width")}>
                <Seg
                  label={t("settings.columnWidth")}
                  value={settings.width}
                  onChange={(v) => set({ width: v })}
                  options={[
                    { key: "narrow", label: t("settings.widths.narrow") },
                    { key: "normal", label: t("settings.widths.normal") },
                    { key: "wide", label: t("settings.widths.wide") },
                  ]}
                />
              </Row>
              <Row label={t("settings.align")}>
                <Seg
                  label={t("settings.textAlignment")}
                  value={settings.align}
                  onChange={(v) => set({ align: v })}
                  options={[
                    { key: "left", label: <><AlignLeft size={13} /> {t("settings.alignLeft")}</> },
                    { key: "justify", label: <><AlignJustify size={13} /> {t("settings.alignJustified")}</> },
                  ]}
                />
              </Row>
              <Row label={t("settings.paragraphs")}>
                <Seg
                  label={t("settings.paragraphStyle")}
                  value={settings.paras}
                  onChange={(v) => set({ paras: v })}
                  options={[
                    { key: "spaced", label: t("settings.spaced") },
                    { key: "indented", label: t("settings.indented") },
                  ]}
                />
              </Row>
              {(["face", "size", "leading", "width", "align", "paras"] as const).some((k) => settings[k] !== DEFAULT_SETTINGS[k]) && (
                <button
                  type="button"
                  onClick={() =>
                    set({
                      face: DEFAULT_SETTINGS.face,
                      size: DEFAULT_SETTINGS.size,
                      leading: DEFAULT_SETTINGS.leading,
                      width: DEFAULT_SETTINGS.width,
                      align: DEFAULT_SETTINGS.align,
                      paras: DEFAULT_SETTINGS.paras,
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
                >
                  <RotateCcw size={12} /> {t("settings.resetText")}
                </button>
              )}
            </div>
          )}

          {!compact && tab === "answers" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[12.5px] text-ink-3">{t("settings.answerLength")}</p>
                <Seg
                  label={t("settings.answerLength")}
                  value={settings.length}
                  onChange={(v) => set({ length: v })}
                  options={[
                    { key: "short", label: t("settings.lengths.short") },
                    { key: "normal", label: t("settings.lengths.normal") },
                    { key: "long", label: t("settings.lengths.long") },
                  ]}
                />
                <p className="mt-2 text-[12px] leading-snug text-ink-4">{t(`settings.lengthBodies.${settings.length}`)}</p>
              </div>
              <div className="border-t border-rule pt-3.5">
                <ModelPicker />
              </div>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
