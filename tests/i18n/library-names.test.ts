import { describe, expect, it } from "vitest";
import { SORTS, TAGS, TOPICS } from "@/lib/library";
import { getDictionary } from "@/lib/i18n/dictionary";
import { translate } from "@/lib/i18n/translate";

const en = getDictionary("en");

describe("the names of the library", () => {
  it("are the same in the dictionary as in the data they come from", () => {
    for (const topic of TOPICS) {
      expect(translate("en", en, `library.topicNames.${topic.key}`), topic.key).toBe(topic.name);
    }
  });

  it("name the ways of arranging the shelf the same in both", () => {
    for (const sort of SORTS) {
      expect(translate("en", en, `library.sorts.${sort.key}`), sort.key).toBe(sort.label);
    }
  });

  it("name the filters the same in both", () => {
    for (const tag of TAGS) {
      expect(translate("en", en, `library.tags.${tag.key}`), tag.key).toBe(tag.label);
    }
  });
});
