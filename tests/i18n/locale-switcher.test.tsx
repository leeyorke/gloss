import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { getDictionary } from "@/lib/i18n/dictionary";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/en/library",
}));

function renderSwitcher(locale: "en" | "zh") {
  return render(
    <I18nProvider locale={locale} dict={getDictionary(locale)}>
      <LocaleSwitcher />
    </I18nProvider>,
  );
}

function openThePicker(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("the language picker", () => {
  it("says which language the page is in", () => {
    renderSwitcher("en");
    expect(screen.getByRole("button", { name: /Language/ })).toBeInTheDocument();
  });

  it("offers every language Gloss speaks", () => {
    renderSwitcher("en");
    openThePicker(/Language/);
    expect(screen.getByRole("radio", { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /中文/ })).toBeInTheDocument();
  });

  it("marks the language the page is in", () => {
    renderSwitcher("zh");
    openThePicker(/语言/);
    expect(screen.getByRole("radio", { name: /中文/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /English/ })).toHaveAttribute("aria-checked", "false");
  });

  it("takes the reader to the same page in the language they chose", () => {
    push.mockClear();
    renderSwitcher("en");
    openThePicker(/Language/);
    fireEvent.click(screen.getByRole("radio", { name: /中文/ }));
    expect(push).toHaveBeenCalledWith("/zh/library");
  });

  it("writes the choice down, so the next visit opens in it", () => {
    document.cookie = "gloss_locale=; max-age=0; path=/";
    renderSwitcher("en");
    openThePicker(/Language/);
    fireEvent.click(screen.getByRole("radio", { name: /中文/ }));
    expect(document.cookie).toContain("gloss_locale=zh");
  });
});
