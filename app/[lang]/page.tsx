import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Landing } from "@/components/landing/Landing";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { localePath, languageAlternates } from "@/lib/i18n/paths";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  return { title: "Gloss", alternates: { canonical: localePath(locale, "/"), languages: languageAlternates("/") } };
}

export default async function Home({ params }: Props) {
  const { lang } = await params;
  // A first segment that is not a language is not a page.
  if (!isLocale(lang)) notFound();
  const { userId } = await auth();
  return <Landing signedIn={Boolean(userId)} />;
}
