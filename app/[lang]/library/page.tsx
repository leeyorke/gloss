import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Library } from "@/components/library/Library";
import "./library.css";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { localePath, languageAlternates } from "@/lib/i18n/paths";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  // The language is a root parameter, so the dictionary is found without being handed it.
  const dict = await getTranslations();
  return { title: dict.meta.libraryTitle, alternates: { canonical: localePath(locale, "/library"), languages: languageAlternates("/library") } };
}

export default async function LibraryPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <Library />;
}
