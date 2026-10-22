import { headers } from "next/headers";
import Link from "next/link";
import { Newsreader } from "next/font/google";
import { GlossMark } from "@/components/brand/Gloss";
import { DEFAULT_LOCALE, LOCALE_HEADER, LOCALE_TAGS, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { localePath } from "@/lib/i18n/paths";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-serif",
  display: "swap",
});

/**
 * The 404 for a URL that matches no page at all.
 *
 * This page is drawn without the layout, so it brings its own document, its
 * own styles and its own language.
 */
export default async function GlobalNotFound() {
  const h = await headers();
  const raw = h.get(LOCALE_HEADER);
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  return (
    <html lang={LOCALE_TAGS[locale]} className={serif.variable}>
      <body>
        <main className="relative z-[1] grid min-h-dvh place-items-center px-6 text-center">
          <div className="rise">
            <GlossMark className="mx-auto size-10 text-ink-4" />
            <h1 className="mt-6 font-serif text-[clamp(2rem,5vw,3rem)] font-[380] leading-tight tracking-[-0.02em] text-ink">{dict.notFound.title}</h1>
            <p className="mt-3 text-[15px] text-ink-3">{dict.notFound.body}</p>
            <Link href={localePath(locale, "/")} className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-bg transition-transform active:scale-[0.97]">
              {dict.notFound.back}
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
