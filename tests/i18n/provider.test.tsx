import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider, useI18n, useT } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n/dictionary";

function Probe() {
  const { locale, tag, dir, t, path, formatMinutes, formatNumber } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="tag">{tag}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="library">{t("nav.library")}</span>
      <span data-testid="title">{t("meta.glossedTitle", { title: "Walden" })}</span>
      <span data-testid="path">{path("/library")}</span>
      <span data-testid="minutes">{formatMinutes(90)}</span>
      <span data-testid="number">{formatNumber(1234)}</span>
    </div>
  );
}

function Word() {
  return <span data-testid="word">{useT()("nav.library")}</span>;
}

describe("the language of a page", () => {
  it("is the one the page was drawn in", () => {
    render(
      <I18nProvider locale="en" dict={getDictionary("en")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("tag")).toHaveTextContent("en");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
  });

  it("is the one the page was drawn in, in another language", () => {
    render(
      <I18nProvider locale="zh" dict={getDictionary("zh")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByTestId("tag")).toHaveTextContent("zh-Hans");
  });
});

describe("the words of a page", () => {
  it("are the ones of its language", () => {
    render(
      <I18nProvider locale="zh" dict={getDictionary("zh")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("library")).toHaveTextContent("书架");
  });

  it("take the words they are given", () => {
    render(
      <I18nProvider locale="en" dict={getDictionary("en")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("title")).toHaveTextContent("Walden, glossed");
  });

  it("are there for a component that only wants the words", () => {
    render(
      <I18nProvider locale="zh" dict={getDictionary("zh")}>
        <Word />
      </I18nProvider>,
    );
    expect(screen.getByTestId("word")).toHaveTextContent("书架");
  });
});

describe("the paths of a page", () => {
  it("are written in its language", () => {
    render(
      <I18nProvider locale="zh" dict={getDictionary("zh")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("path")).toHaveTextContent("/zh/library");
  });
});

describe("the numbers of a page", () => {
  it("are written the way its language writes them", () => {
    render(
      <I18nProvider locale="en" dict={getDictionary("en")}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("number")).toHaveTextContent("1,234");
    expect(screen.getByTestId("minutes")).toHaveTextContent("1 h 30 min");
  });
});

describe("a component outside the language", () => {
  it("is told plainly that it has none", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/useI18n/);
    } finally {
      console.error = quiet;
    }
  });
});
