import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/config";
import { DICTIONARIES, getDictionary } from "@/lib/i18n/dictionary";

/** Every leaf of a dictionary, written the way it is looked up. */
function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  const entries = Object.entries(value as Record<string, unknown>);
  // A set of plural forms is one leaf, not a section.
  if (entries.some(([k]) => k === "other")) return [prefix];
  return entries.flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

/** Every set of plural forms in a dictionary, written the way it is looked up. */
function pluralSetsOf(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([k]) => k === "other")) return [prefix];
  return entries.flatMap(([k, v]) => pluralSetsOf(v, prefix ? `${prefix}.${k}` : k));
}

describe("the dictionaries", () => {
  it("has one for every language Gloss speaks", () => {
    for (const locale of LOCALES) {
      expect(DICTIONARIES[locale]).toBeDefined();
      expect(getDictionary(locale)).toBe(DICTIONARIES[locale]);
    }
  });

  it("falls back to the default language for one it does not have", () => {
    expect(getDictionary("fr" as never)).toBe(DICTIONARIES[DEFAULT_LOCALE]);
  });

  it("gives every language the same words to say", () => {
    const reference = keysOf(DICTIONARIES[DEFAULT_LOCALE]).sort();
    for (const locale of LOCALES) {
      expect(keysOf(DICTIONARIES[locale]).sort(), `${locale} has the same keys as ${DEFAULT_LOCALE}`).toEqual(reference);
    }
  });

  it("says something in every one of those words", () => {
    for (const locale of LOCALES) {
      for (const key of keysOf(DICTIONARIES[locale])) {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], DICTIONARIES[locale]);
        if (typeof value === "string") {
          expect(value.trim(), `${locale}.${key}`).not.toBe("");
          continue;
        }
        // A set of plural forms: every form says something.
        for (const [category, form] of Object.entries(value as Record<string, string>)) {
          expect(form.trim(), `${locale}.${key}.${category}`).not.toBe("");
        }
      }
    }
  });

  it("gives every set of plural forms the form that is always needed", () => {
    for (const locale of LOCALES) {
      for (const key of pluralSetsOf(DICTIONARIES[locale])) {
        const forms = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], DICTIONARIES[locale]) as Record<string, string>;
        expect(Object.keys(forms).sort(), `${locale}.${key}`).toContain("other");
        for (const [category, form] of Object.entries(forms)) {
          expect(["zero", "one", "two", "few", "many", "other"]).toContain(category);
          expect(form.trim(), `${locale}.${key}.${category}`).not.toBe("");
        }
      }
    }
  });

  it("writes the same words in the same place for every language", () => {
    const reference = pluralSetsOf(DICTIONARIES[DEFAULT_LOCALE]).sort();
    for (const locale of LOCALES) {
      expect(pluralSetsOf(DICTIONARIES[locale]).sort(), `${locale} has the same plural sets as ${DEFAULT_LOCALE}`).toEqual(reference);
    }
  });
});
