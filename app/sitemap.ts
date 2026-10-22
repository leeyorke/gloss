import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";
import { SAMPLES } from "@/lib/samples";
import { LOCALES, LOCALE_TAGS } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/paths";

/** The pages anyone can open, in every language: imported texts live in each reader's browser, so only the samples are listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l], `${SITE_URL}${localePath(l, "/")}`]));
  return LOCALES.flatMap((lang) => [
    { url: `${SITE_URL}${localePath(lang, "/")}`, changeFrequency: "weekly" as const, priority: 1, alternates: { languages } },
    { url: `${SITE_URL}${localePath(lang, "/library")}`, changeFrequency: "weekly" as const, priority: 0.6 },
    ...SAMPLES.map((a) => ({ url: `${SITE_URL}${localePath(lang, `/read/${a.id}`)}`, changeFrequency: "yearly" as const, priority: 0.8 })),
  ]);
}
