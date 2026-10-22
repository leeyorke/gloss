import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reader } from "@/components/reader/Reader";
import { sampleById } from "@/lib/samples";
import { OG_IMAGE } from "@/lib/brand";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { localePath, languageAlternates } from "@/lib/i18n/paths";
import { translate } from "@/lib/i18n/translate";

type Props = { params: Promise<{ id: string; lang: string }> };

/**
 * Samples ship with the app, so their links unfurl with the text's own title and dek.
 * Imported texts live in the browser: the reader renders their <title>, and crawlers,
 * who would only ever see "not on this device", are asked to pass them by.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const a = sampleById(id);
  if (!a) return { robots: { index: false } };
  const title = translate(locale, dict, "meta.glossedTitle", { title: a.title });
  const description = a.dek ?? dict.meta.description;
  const url = localePath(locale, `/read/${a.id}`);
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(`/read/${a.id}`) },
    openGraph: { title, description, url, type: "article", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

export default async function ReadPage({ params }: Props) {
  const { id, lang } = await params;
  if (!isLocale(lang)) notFound();
  return <Reader id={id} initial={sampleById(id)} />;
}
