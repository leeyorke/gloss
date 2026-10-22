import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Atkinson_Hyperlegible_Next, Literata, Newsreader, Schibsted_Grotesk } from "next/font/google";
import { BOOT_SCRIPT } from "@/lib/settings";
import "../globals.css";
import { Tooltips } from "@/components/ui/Tooltips";
import { ClerkProvider } from "@clerk/nextjs";
import { SyncAgent } from "@/components/account/SyncAgent";
import { OG_IMAGE, SITE_URL } from "@/lib/brand";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { DEFAULT_LOCALE, LOCALES, LOCALE_DIR, LOCALE_TAGS, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { localePath, languageAlternates } from "@/lib/i18n/paths";

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-serif",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--nf-sans",
  display: "swap",
});

// Optional reading faces: declared here, fetched only when a reader picks them.
const book = Literata({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--nf-book",
  display: "swap",
  preload: false,
});

const legible = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--nf-legible",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  // Next has no metrics for this font, and looks them up even with the
  // adjustment turned off, so it warns on every build. Naming the fallback
  // skips that lookup.
  fallback: ["Arial"],
});

/** Every language this page can be read in, for the links between them. */
const LANGUAGES: Record<string, string> = languageAlternates("/");

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

/** One page for each language, drawn ahead of time. */
export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const description = dict.meta.description;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "Gloss", template: "%s" },
    description,
    applicationName: "Gloss",
    alternates: { canonical: localePath(locale, "/"), languages: LANGUAGES },
    openGraph: { type: "website", siteName: "Gloss", title: "Gloss", description, url: localePath(locale, "/"), images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: "Gloss", description, images: [OG_IMAGE.url] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
};

/** Clerk's sign-in and account screens, in the page's own ink and paper, in every theme. */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "var(--ink)",
    colorBackground: "var(--bg-raised)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--ink-3)",
    colorInput: "var(--bg)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--rule-strong)",
    colorNeutral: "var(--ink)",
    fontFamily: "var(--font-sans)",
    borderRadius: "12px",
  },
};

/**
 * The root layout, in every language.
 *
 * The [lang] segment sits above this file, so the language is a root
 * parameter: any server component in the tree can read it without being
 * handed it.
 */
export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = getDictionary(locale);

  return (
    <html lang={LOCALE_TAGS[locale]} dir={LOCALE_DIR[locale]} className={`${serif.variable} ${sans.variable} ${book.variable} ${legible.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          <ClerkProvider appearance={CLERK_APPEARANCE}>
            {children}
            <SyncAgent />
          </ClerkProvider>
        </I18nProvider>
        <Tooltips />
        {/* Plausible: cookieless page views, from the production site only, so previews and local runs never count. */}
        {process.env.VERCEL_ENV === "production" && <Script defer data-domain="usegloss.io" src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}
