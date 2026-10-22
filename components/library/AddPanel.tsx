"use client";

import { SignInButton } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, BookmarkPlus, Check, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import { importFromUrl, keep, looksLikeUrl } from "@/lib/import";
import { normalizeUrl } from "@/lib/links";
import { useStore } from "@/lib/store";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Mark, MarkStack, type AgentMark } from "./AgentMarks";
import { Glyph } from "./Book";

export type AddTab = "links" | "agent";

/**
 * Adding to the library: paste links (one or many), or connect an agent that
 * saves to it through the Gloss MCP server.
 */
export function AddPanel({ tab, onTab, onClose, signedIn }: { tab: AddTab; onTab: (t: AddTab) => void; onClose: () => void; signedIn: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" style={{ animation: "fade 0.2s both" }} onClick={onClose} />
      <section role="dialog" aria-modal aria-label={t("library.add.label")} className="add-panel">
        <header className="flex items-center justify-between gap-3">
          <div className="lib-sort !ml-0" role="tablist" aria-label={t("library.add.label")}>
            <button type="button" role="tab" aria-selected={tab === "agent"} aria-checked={tab === "agent"} onClick={() => onTab("agent")}>
              {t("library.add.tabs.agent")}
            </button>
            <button type="button" role="tab" aria-selected={tab === "links"} aria-checked={tab === "links"} onClick={() => onTab("links")}>
              {t("library.add.tabs.links")}
            </button>
          </div>
          <button type="button" aria-label={t("common.close")} data-tip={t("common.close")} data-tip-kbd="Esc" onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <X size={17} />
          </button>
        </header>
        {tab === "links" ? <Links /> : <Agent signedIn={signedIn} />}
      </section>
    </div>,
    document.body
  );
}

/**
 * What opens the panel: plain about adding articles, with the agents that can
 * do it for you. On hover the marks fan out to the right from Grok, which
 * holds its place, and the plus turns.
 */
export function AddButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className={`lib-add${compact ? " is-compact" : ""}`}>
      <MarkStack size={compact ? 22 : 26} />
      <span className="min-w-0 text-left">
        <span className="lib-add-title">{t("library.add.title")}</span>
        {!compact && <span className="lib-add-sub">{t("library.add.sub")}</span>}
      </span>
      {!compact && (
        <span className="lib-add-plus" aria-hidden>
          <Plus size={15} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/* ---------- links ---------- */

type Row = { url: string; state: "waiting" | "reading" | "saved" | "already" | "failed"; title?: string; error?: string };

/** How many links one Save reads in. A Pocket export can hold thousands; the rest wait in the box for the next Save. */
const BATCH = 100;

/** Every web link in an export: Pocket, Instapaper and Raindrop CSVs, Pocket's HTML, or a plain list. */
function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>,]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).;\]]+$/, "")))];
}

function Links() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const urls = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(looksLikeUrl))];

  const fromExport = async (f: File) => {
    const found = linksIn(await f.text().catch(() => ""));
    if (!found.length) return setNote(t("library.add.noLinksInFile", { name: f.name }));
    setText((cur) => [cur.trim(), ...found].filter(Boolean).join("\n"));
    setNote(t("library.add.foundLinks", { count: found.length, name: f.name }));
  };

  const save = async () => {
    if (!urls.length || busy) return;
    setBusy(true);
    const have = new Set(useStore.getState().library.flatMap((x) => (x.sourceUrl ? [normalizeUrl(x.sourceUrl)] : [])));
    const all: Row[] = urls.map((url) => ({ url, state: have.has(normalizeUrl(url)) ? "already" : "waiting" }));
    const fresh = all.filter((r) => r.state === "waiting");
    const known = all.length - fresh.length;
    const rest = fresh.slice(BATCH).map((r) => r.url);
    // A long export lists only what is being read now; a short paste shows every link, saved before or not.
    const list = all.length > BATCH ? fresh.slice(0, BATCH) : all;
    setRows(list);
    setText(rest.join("\n"));
    setNote(
      all.length > BATCH
        ? [
            rest.length ? t("library.add.savingNow", { count: BATCH, rest: rest.length }) : t("library.add.savingN", { count: fresh.length }),
            known ? t("library.add.alreadyKnown", { count: known }) : "",
          ]
            .filter(Boolean)
            .join(" ")
        : null
    );
    const set = (i: number, r: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...r } : x)));
    const todo = list.map((r, i) => ({ r, i })).filter((x) => x.r.state === "waiting");
    const next = async () => {
      for (let x = todo.shift(); x; x = todo.shift()) {
        set(x.i, { state: "reading" });
        const r = await importFromUrl(x.r.url, (_, label) => label && set(x!.i, { title: label }));
        const err = r.ok ? await keep(r.article, r.file) : r.error;
        set(x.i, err ? { state: "failed", error: err, title: undefined } : { state: "saved", title: r.ok ? r.article.title : undefined });
      }
    };
    // A few at a time, so a slow site never holds the rest up.
    await Promise.all([next(), next(), next()]);
    setBusy(false);
  };

  return (
    <div className="mt-5">
      <p className="text-[19px] font-serif leading-tight text-ink">{t("library.add.linksTitle")}</p>
      <p className="mt-1 text-[13px] text-ink-3">
        {t("library.add.linksBody")} {" "}
        <button type="button" onClick={() => fileRef.current?.click()} className="text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink">
          {t("library.add.dropExport")}
        </button>
        .
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.html,.htm,.txt,.json,text/csv,text/html,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void fromExport(f);
          e.target.value = "";
        }}
      />
      <textarea
        ref={ref}
        value={text}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          setOver(false);
          if (!f) return;
          e.preventDefault();
          void fromExport(f);
        }}
        style={over ? { borderColor: "var(--rubric)", borderStyle: "dashed" } : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={"https://paulgraham.com/greatwork.html\nhttps://..."}
        rows={4}
        className="add-text"
        aria-label={t("library.add.linksLabel")}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink-4">{urls.length ? t("library.add.linkCount", { count: urls.length }) : text.trim() ? t("library.add.noLinksYet") : ""}</span>
        <button type="button" onClick={save} disabled={!urls.length || busy} className="add-btn">
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? t("library.add.saving") : urls.length > 1 ? t("library.add.saveN", { count: Math.min(urls.length, BATCH) }) : t("library.add.save")}
        </button>
      </div>
      {note && <p className="mt-2 text-[12.5px] text-ink-3">{note}</p>}
      {rows.length > 0 && (
        <ul className="add-rows scroll-thin">
          {rows.map((r) => (
            <li key={r.url} data-state={r.state}>
              <span className="add-dot" aria-hidden>
                {r.state === "reading" ? <Loader2 size={13} className="animate-spin" /> : r.state === "saved" || r.state === "already" ? <Check size={13} /> : r.state === "failed" ? <X size={13} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{r.title ?? r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {r.state === "saved" ? t("library.add.onTheShelf") : r.state === "already" ? t("library.add.alreadyInLibrary") : r.state === "failed" ? r.error : r.state === "reading" ? t("library.add.reading") : t("library.add.waiting")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Bookmarklets />
    </div>
  );
}

/**
 * Bookmarklets: one click on any page opens it in Gloss, in a new tab, to read now
 * or to shelve for later (`/?url=` and `/?save=` on the home page).
 */
function Bookmarklets() {
  const { t, path } = useI18n();
  const readRef = useRef<HTMLAnchorElement>(null);
  const saveRef = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState("https://usegloss.io");
  // The bookmarklet opens the home page in the reader's own language.
  const home = origin ? `${origin}${path("/")}` : path("/");
  const code = (param: "url" | "save") => `javascript:void(window.open('${home}?${param}='+encodeURIComponent(location.href)))`;
  useEffect(() => setOrigin(window.location.origin), [path]);
  // React refuses javascript: links in JSX, so they are set by hand.
  useEffect(() => {
    readRef.current?.setAttribute("href", code("url"));
    saveRef.current?.setAttribute("href", code("save"));
  });
  const pill = "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-rule-strong bg-bg px-3 py-1.5 text-[13px] font-medium text-ink shadow-[var(--shadow-card)] active:cursor-grabbing";
  return (
    <div className="mt-6 border-t border-rule pt-5">
      <p className="lib-label">{t("library.add.fromAnyPage")}</p>
      <p className="mt-1 text-[13px] text-ink-3">{t("library.add.fromAnyPageBody")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a ref={readRef} onClick={(e) => e.preventDefault()} data-tip={t("library.add.dragMe")} className={pill}>
          <BookOpen size={14} className="text-ink-3" /> {t("library.add.readInGloss")}
        </a>
        <a ref={saveRef} onClick={(e) => e.preventDefault()} data-tip={t("library.add.dragMe")} className={pill}>
          <BookmarkPlus size={14} className="text-ink-3" /> {t("library.add.saveToGloss")}
        </a>
      </div>
      <details className="mt-3 text-[12.5px] text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink-2">{t("library.add.onAPhone")}</summary>
        <div className="mt-2">
          <CopyBlock title={t("library.add.bookmarkTitle")} body={t("library.add.bookmarkBody")} text={code("save")} />
        </div>
      </details>
    </div>
  );
}

/* ---------- an agent ---------- */

type Conn = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
const LABELS: { label: string; mark?: AgentMark }[] = [
  { label: "Grok Bot", mark: "grok" },
  { label: "Claude", mark: "claude" },
  { label: "ChatGPT", mark: "chatgpt" },
  { label: "Other" },
];

function Agent({ signedIn }: { signedIn: boolean }) {
  const { t, formatDate } = useI18n();
  const [conns, setConns] = useState<Conn[] | null>(null);
  const [made, setMade] = useState<{ token: string; label: string } | null>(null);
  const [label, setLabel] = useState("Grok Bot");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://usegloss.io";

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/agent-tokens")
      .then((r) => r.json())
      .then((j: { tokens?: Conn[] }) => setConns(j.tokens ?? []))
      .catch(() => setConns([]));
  }, [signedIn]);

  if (!signedIn)
    return (
      <div className="mt-5">
        <AgentIntro />
        <p className="mt-4 text-[13.5px] text-ink-2">{t("library.add.agentNeedsYou")}</p>
        <SignInButton mode="modal">
          <button type="button" className="add-btn mt-4">
            {t("library.add.signInToConnect")}
          </button>
        </SignInButton>
      </div>
    );

  const create = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/agent-tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const j = (await res.json().catch(() => ({}))) as { id?: string; token?: string; label?: string; error?: string };
    setBusy(false);
    if (!res.ok || !j.token || !j.id) return setErr(j.error ?? t("library.add.couldNotMake"));
    setMade({ token: j.token, label: j.label ?? label });
    setConns((c) => [{ id: j.id!, label: j.label ?? label, createdAt: new Date().toISOString(), lastUsedAt: null }, ...(c ?? [])]);
  };

  const revoke = async (id: string) => {
    setConns((c) => c?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/agent-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="mt-5">
      <AgentIntro />
      {made ? (
        <Setup token={made.token} label={made.label} origin={origin} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="lib-sort !ml-0" role="radiogroup" aria-label={t("library.add.whichAgent")}>
            {LABELS.map((l) => (
              <button key={l.label} type="button" role="radio" aria-checked={label === l.label} onClick={() => setLabel(l.label)} className="inline-flex items-center gap-1.5">
                {l.mark && <Mark k={l.mark} size={14} />}
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={create} disabled={busy} className="add-btn">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t("library.add.makeConnection")}
          </button>
          {err && <p className="w-full text-[12.5px] text-rubric-text">{err}</p>}
        </div>
      )}
      {conns && conns.length > 0 && (
        <div className="mt-6">
          <p className="lib-label">{t("library.add.connected")}</p>
          <ul className="mt-2 divide-y divide-rule">
            {conns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{c.label}</span>
                  <span className="ml-2 text-ink-3">
                    {c.lastUsedAt ? t("library.add.lastUsed", { date: formatDate(c.lastUsedAt, { day: "numeric", month: "short" }) }) : t("library.add.notUsedYet")}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(c.id)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                  <Trash2 size={13} /> {t("library.add.revoke")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AgentIntro() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3.5">
      <Glyph k="agent" size={46} className="shrink-0" />
      <div>
        <p className="font-serif text-[19px] leading-tight text-ink">{t("library.add.agentTitle")}</p>
        <p className="mt-1 text-[13px] leading-[1.5] text-ink-3">{t("library.add.agentBody")}</p>
      </div>
    </div>
  );
}

const PROMPT = "Go through my X bookmarks from the last month, find the ones that link to articles, essays or papers, and save those links to my Gloss library.";

function Setup({ token, label, origin }: { token: string; label: string; origin: string }) {
  const { t } = useI18n();
  const url = `${origin}/mcp`;
  const steps: { title: string; body: string; copy: string }[] =
    label === "Grok Bot" || label === "Grok"
      ? [
          { title: t("library.add.setup.grokTitle"), body: t("library.add.setup.grokBody"), copy: `Add a custom MCP server called Gloss at ${url} with the header Authorization set to Bearer ${token}` },
        ]
      : label === "Claude"
        ? [
            { title: t("library.add.setup.claudeTitle"), body: t("library.add.setup.claudeBody"), copy: `claude mcp add --transport http gloss ${url} --header "Authorization: Bearer ${token}"` },
            { title: t("library.add.setup.claudeAiTitle"), body: t("library.add.setup.claudeAiBody"), copy: `${url}/${token}` },
          ]
        : [
            { title: t("library.add.setup.urlTitle"), body: t("library.add.setup.urlBody", { url }), copy: `Authorization: Bearer ${token}` },
            { title: t("library.add.setup.urlOnlyTitle"), body: t("library.add.setup.urlOnlyBody"), copy: `${url}/${token}` },
          ];
  return (
    <div className="mt-5 space-y-3">
      <p className="text-[13px] text-good">{t("library.add.made")}</p>
      {steps.map((s) => (
        <CopyBlock key={s.title} title={s.title} body={s.body} text={s.copy} />
      ))}
      <CopyBlock title={t("library.add.setup.thenAskTitle")} body={t("library.add.setup.thenAskBody")} text={PROMPT} />
    </div>
  );
}

function CopyBlock({ title, body, text }: { title: string; body: string; text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[14px] border border-rule bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <p className="text-[12px] text-ink-3">{body}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {}
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sunk px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {copied ? <Check size={12} className="text-good" /> : <Copy size={12} />}
          {copied ? t("library.add.copied") : t("library.add.copy")}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-sunk px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-2">{text}</pre>
    </div>
  );
}
