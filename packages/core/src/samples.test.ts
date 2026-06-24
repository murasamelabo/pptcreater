import { describe, expect, it } from "vitest";
import { lintDeckSpec } from "./lint.js";
import { parseDeckSpec } from "./schema.js";
import { createSampleDeck } from "./samples.js";

const CONTENT_MODES = ["presentation", "report", "technical", "handout", "decision"] as const;
const STYLE_PROFILES = ["minimal", "stylish", "report", "presentation", "technical"] as const;

describe("sample deck generation", () => {
  it("creates a visual sample deck", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "decision" });

    expect(deck.slides).toHaveLength(4);
    expect(deck.slides.every((slide) => slide.elements.some((element) => element.type === "shape"))).toBe(true);
  });

  it("scales beyond four slides with unique, lint-clean content slides", () => {
    for (const locale of ["ja-JP", "en-US"] as const) {
      const deck = parseDeckSpec(createSampleDeck(locale, { slideCount: 12 }));

      expect(deck.slides).toHaveLength(12);

      const ids = deck.slides.map((slide) => slide.id);
      expect(new Set(ids).size, `${locale} slide ids should be unique`).toBe(ids.length);

      const titles = deck.slides.map((slide) => slide.title);
      expect(new Set(titles).size, `${locale} slide titles should be unique`).toBe(titles.length);

      expect(deck.slides[deck.slides.length - 1].layout, `${locale} closing slide should be last`).toBe("closing");

      const report = lintDeckSpec(deck);
      expect(report.ok, `${locale} 12-slide deck should have no errors`).toBe(true);
      expect(report.issues, `${locale} 12-slide deck should have no issues`).toHaveLength(0);
    }
  });

  it("produces lint-clean decks for every content mode", () => {
    for (const contentMode of CONTENT_MODES) {
      const deck = parseDeckSpec(createSampleDeck("ja-JP", { contentMode }));
      const report = lintDeckSpec(deck);
      expect(report.ok, `${contentMode} should have no errors`).toBe(true);
      expect(report.issues, `${contentMode} should have no issues`).toHaveLength(0);
    }
  });

  it("produces lint-clean decks for every style profile in both locales", () => {
    for (const styleProfile of STYLE_PROFILES) {
      for (const locale of ["ja-JP", "en-US"] as const) {
        const deck = parseDeckSpec(createSampleDeck(locale, { styleProfile }));
        const report = lintDeckSpec(deck);
        expect(report.ok, `${styleProfile}/${locale} should have no errors`).toBe(true);
        expect(report.issues, `${styleProfile}/${locale} should have no issues`).toHaveLength(0);
      }
    }
  });

  it("adds icons and a full-bleed atmosphere background to slides", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4 });
    const svgElements = deck.slides.flatMap((slide) => slide.elements).filter((element) => element.type === "svg");

    const hasFullBleedBackground = svgElements.some(
      (element) => element.x === 0 && element.y === 0 && element.w === 13.333 && element.h === 7.5
    );
    const hasIcon = svgElements.some((element) => element.w <= 0.8 && element.h <= 0.8);

    expect(hasFullBleedBackground, "expected a full-bleed atmosphere background").toBe(true);
    expect(hasIcon, "expected at least one icon").toBe(true);
  });

  it("selects a different template and palette per content mode", () => {
    const presentation = createSampleDeck("ja-JP", { contentMode: "presentation" });
    const report = createSampleDeck("ja-JP", { contentMode: "report" });
    const technical = createSampleDeck("ja-JP", { contentMode: "technical" });

    expect(presentation.template).toBe("presentation-bold");
    expect(report.template).toBe("report-formal");
    expect(technical.template).toBe("technical-architecture");
    expect(technical.tokens?.colors.background).not.toBe(report.tokens?.colors.background);
  });

  it("forces the template and palette when a style profile is provided", () => {
    const forced = createSampleDeck("ja-JP", { contentMode: "presentation", styleProfile: "stylish" });

    expect(forced.template).toBe("stylish-editorial");
    expect(forced.metadata.keywords).toContain("stylish");
    expect(forced.tokens?.colors.background).toBe("#0b1020");
  });

  it("uses locale-appropriate fonts for English decks", () => {
    const deck = createSampleDeck("en-US", { contentMode: "report" });

    expect(deck.tokens?.typography.headingFont).not.toBe("Yu Gothic");
    expect(deck.tokens?.typography.bodyFont).toBe("Aptos");
  });

  it("rejects invalid runtime content modes", () => {
    expect(() => createSampleDeck("en-US", { contentMode: "bogus" as "presentation" })).toThrow(/contentMode/);
  });

  it("requires alt text for non-decorative native shapes", () => {
    const deck = createSampleDeck("en-US");
    const shape = deck.slides[0].elements.find((element) => element.type === "shape");
    expect(shape).toBeDefined();
    if (shape?.type === "shape") {
      shape.decorative = false;
    }

    const parsed = parseDeckSpec(deck);
    const target = parsed.slides[0].elements.find((element) => element.type === "shape");
    expect(target).toMatchObject({ decorative: false });
  });

  it("accepts common agent-generated shape aliases and zero-height lines", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "zero-height-line",
        type: "shape",
        shape: "line",
        x: 1,
        y: 1,
        w: 2,
        h: 0,
        fill: "none",
        decorative: true,
        readingOrder: 100
      },
      {
        id: "rounded-alias",
        type: "shape",
        shape: "roundedRect",
        x: 1,
        y: 1.2,
        w: 2,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 101
      }
    );

    expect(() => parseDeckSpec(deck)).not.toThrow();
  });

  it("rejects zero-height non-line shapes", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "bad-zero-height-rect",
      type: "shape",
      shape: "rect",
      x: 1,
      y: 1,
      w: 2,
      h: 0,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 102
    });

    expect(() => parseDeckSpec(deck)).toThrow(/Only line shapes/);
  });
});
