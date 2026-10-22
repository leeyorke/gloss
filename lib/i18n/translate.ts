import type en from "./dictionaries/en.json";
import type { Locale } from "./config";
import { formatNumber, pluralCategory } from "./format";

/**
 * A string with one form per plural category. "other" is required; the rest
 * are used when the language has them.
 */
export type Plural = {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

/** The shape of a dictionary: the same keys everywhere, with plain strings in them. */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

/** A dictionary, in any language. */
export type Dictionary = Widen<typeof en>;

/** A leaf of the dictionary: one string, or a set of plural forms. */
type Leaf = string | Plural;

type Paths<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/** Every key in the dictionary, written the way it is looked up: "landing.hero.ask". */
export type TranslationKey = Paths<typeof en>;

/** The words a string is given: the pieces of {braces} in it. */
export type Vars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Put the words into the string: "{title}, glossed" with title "Walden". */
function interpolate(locale: Locale, template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = vars[name];
    // A word that was not given is left as it is: a missing word is a mistake
    // worth seeing, not something to paper over with an empty string.
    if (value === undefined) return match;
    // Numbers are written the way this language writes numbers.
    return typeof value === "number" ? formatNumber(locale, value) : String(value);
  });
}

/** Walk a dotted path into a dictionary. */
function lookup(dict: Dictionary, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Is there anything at this key? */
export function hasTranslation(dict: Dictionary, key: string): boolean {
  return lookup(dict, key) !== undefined;
}

/**
 * The string at this key, in this language.
 *
 * A key that is not in the dictionary gives back the key itself, so a missing
 * translation shows up on the page instead of quietly reading as an empty
 * space.
 */
export function translate(locale: Locale, dict: Dictionary, key: string, vars?: Vars): string {
  const found = lookup(dict, key);
  if (found === undefined) return key;
  if (typeof found === "string") return interpolate(locale, found, vars);
  const count = Number(vars?.count ?? 0);
  const category = pluralCategory(locale, count);
  const forms = found as Plural;
  return interpolate(locale, forms[category] ?? forms.other, vars);
}
