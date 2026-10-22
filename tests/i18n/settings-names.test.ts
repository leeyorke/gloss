import { describe, expect, it } from "vitest";
import { ACTIONS } from "@/lib/actions";
import { FACES, MARKERS, PENS, THEMES } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n/dictionary";
import { translate } from "@/lib/i18n/translate";

const en = getDictionary("en");

describe("the names in the settings panel", () => {
  it("name the themes the same in both", () => {
    for (const theme of THEMES) {
      expect(translate("en", en, `settings.themes.${theme.key}`), theme.key).toBe(theme.label);
    }
  });

  it("name the pens the same in both", () => {
    for (const pen of PENS) {
      expect(translate("en", en, `settings.pens.${pen.key}`), pen.key).toBe(pen.label);
    }
  });

  it("name the highlighters the same in both", () => {
    for (const marker of MARKERS) {
      expect(translate("en", en, `settings.markers.${marker.key}`), marker.key).toBe(marker.label);
    }
  });

  it("name the reading faces the same in both", () => {
    for (const face of FACES) {
      expect(translate("en", en, `settings.faces.${face.key}`), face.key).toBe(face.label);
    }
  });

  it("name the quick actions the same in both", () => {
    for (const action of Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]) {
      expect(translate("en", en, `reader.actions.${action}.label`), action).toBe(ACTIONS[action].label);
      expect(translate("en", en, `reader.actions.${action}.hint`), action).toBe(ACTIONS[action].hint);
    }
  });
});
