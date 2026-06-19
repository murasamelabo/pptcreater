import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  createSampleDeck,
  createSectionDividerSlide,
  createSectionDividerSlides,
  lintDeckSpec,
  parseDeckSpec
} from "./index.js";

describe("section divider slides", () => {
  it("builds an accessible numbered divider slide", () => {
    const slide = createSectionDividerSlide({ title: "機能詳細", subtitle: "各機能を順に解説します" }, { index: 2, total: 5 });

    expect(slide.layout).toBe("section");
    expect(slide.title).toBe("機能詳細");

    const eyebrow = slide.elements.find((element) => element.id.endsWith("-eyebrow"));
    const background = slide.elements.find((element) => element.id.endsWith("-bg"));
    expect(eyebrow?.type).toBe("text");
    expect(background?.type).toBe("shape");

    if (eyebrow?.type === "text" && background?.type === "shape" && eyebrow.color && typeof background.fill === "string") {
      expect(eyebrow.text).toBe("セクション 02 / 05");
      expect(contrastRatio(eyebrow.color, background.fill)).toBeGreaterThanOrEqual(4.5);
    }

    const title = slide.elements.find((element) => element.type === "text" && element.role === "title");
    expect(title).toBeDefined();
  });

  it("passes lint when inserted into a deck", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 3 });
    const divider = createSectionDividerSlide({ title: "概要", subtitle: "全体像と狙いを共有します" }, { index: 1, total: 2 });
    deck.slides.splice(1, 0, divider);

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("numbers a batch of dividers and keeps slide ids unique", () => {
    const slides = createSectionDividerSlides(["概要", "機能詳細", "まとめ"], { locale: "ja-JP" });

    expect(slides).toHaveLength(3);
    expect(new Set(slides.map((slide) => slide.id)).size).toBe(3);

    const secondEyebrow = slides[1].elements.find((element) => element.id.endsWith("-eyebrow"));
    if (secondEyebrow?.type === "text") {
      expect(secondEyebrow.text).toBe("セクション 02 / 03");
    }
  });

  it("supports english locale and disabling numbering", () => {
    const slide = createSectionDividerSlide("Benefits", { locale: "en-US", numbered: false });
    const eyebrow = slide.elements.find((element) => element.id.endsWith("-eyebrow"));

    if (eyebrow?.type === "text") {
      expect(eyebrow.text).toBe("SECTION");
    }
  });

  it("keeps long titles inside the slide without overflow errors", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 2 });
    const divider = createSectionDividerSlide(
      { title: "セキュリティで保護されたテナント作成と構成管理の詳細" },
      { index: 1, total: 1 }
    );
    deck.slides.splice(1, 0, divider);

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overflow = report.issues.find(
      (issue) => issue.code === "layout.text-overflow-risk" && issue.path.includes(divider.id)
    );

    expect(overflow).toBeUndefined();
  });
});
