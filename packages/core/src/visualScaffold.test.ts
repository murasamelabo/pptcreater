import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  createSampleDeck,
  createVisualScaffold,
  lintDeckSpec,
  parseDeckSpec,
  type Slide
} from "./index.js";

function textOnlyContentSlide(id: string): Slide {
  return {
    id,
    title: id,
    layout: "title-content",
    elements: [
      { id: `${id}-title`, type: "text", x: 0.75, y: 0.6, w: 7.5, h: 0.9, role: "title", text: "テキストのみの本文スライド", bold: true, decorative: false, readingOrder: 0 },
      { id: `${id}-body-1`, type: "text", x: 0.75, y: 1.8, w: 7.5, h: 0.8, role: "body", text: "一つ目の説明ポイントをここに記載します。", bold: false, decorative: false, readingOrder: 1 },
      { id: `${id}-body-2`, type: "text", x: 0.75, y: 2.8, w: 7.5, h: 0.8, role: "body", text: "二つ目の説明ポイントをここに記載します。", bold: false, decorative: false, readingOrder: 2 }
    ]
  };
}

function richnessIssueAt(deckSlides: Slide[], slideId: string) {
  const deck = createSampleDeck("ja-JP", { slideCount: 3 });
  const index = deck.slides.findIndex((slide) => slide.layout === "cards");
  const insertAt = index >= 0 ? index : 1;
  deck.slides.splice(insertAt, 0, ...deckSlides);
  const report = lintDeckSpec(parseDeckSpec(deck));
  const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId);
  return report.issues.find((issue) => issue.code === "visual.richness-missing" && issue.path === `slides.${slideIndex}`);
}

describe("visual scaffold", () => {
  it("builds an editable right-rail concept visual with accessible contrast", () => {
    const result = createVisualScaffold(
      { concept: "ライフサイクル管理", caption: "参加から退出まで", points: ["アクセスレビュー", "資格パッケージ", "有効期限"] },
      { locale: "ja-JP" }
    );

    const panel = result.elements.find((element) => element.id === "scaffold-panel");
    const concept = result.elements.find((element) => element.id === "scaffold-concept");
    expect(panel?.type).toBe("shape");
    expect(concept?.type).toBe("text");

    if (concept?.type === "text" && panel?.type === "shape" && concept.color && typeof panel.fill === "string") {
      expect(concept.text).toBe("ライフサイクル管理");
      expect(contrastRatio(concept.color, panel.fill)).toBeGreaterThanOrEqual(4.5);
    }

    const chips = result.elements.filter((element) => /-chip-\d+$/.test(element.id));
    expect(chips).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it("embeds an icon svg when provided and falls back to a monogram otherwise", () => {
    const withIcon = createVisualScaffold(
      { concept: "Security", iconSvg: "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /></svg>" },
      { locale: "en-US" }
    );
    expect(withIcon.elements.some((element) => element.id === "scaffold-icon" && element.type === "svg")).toBe(true);
    expect(withIcon.elements.some((element) => element.id === "scaffold-monogram")).toBe(false);

    // The emblem holds a white graphic (icon or monogram); its fill must clear the
    // 3:1 non-text contrast floor against white so a white icon stays visible.
    const emblem = withIcon.elements.find((element) => element.id === "scaffold-emblem");
    expect(emblem?.type).toBe("shape");
    if (emblem?.type === "shape" && typeof emblem.fill === "string") {
      expect(contrastRatio("#ffffff", emblem.fill)).toBeGreaterThanOrEqual(3);
    }

    const withoutIcon = createVisualScaffold({ concept: "ガバナンス" });
    const monogram = withoutIcon.elements.find((element) => element.id === "scaffold-monogram");
    expect(monogram?.type).toBe("text");
    if (monogram?.type === "text") {
      expect(monogram.text).toBe("ガ");
    }
  });

  it("keeps the rail inside the slide even for an out-of-bounds frame request", () => {
    const result = createVisualScaffold(
      { concept: "端", points: ["観点1", "観点2"] },
      { frame: { x: 12.6, y: 6.6, w: 4, h: 3 } }
    );
    for (const element of result.elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.x + element.w).toBeLessThanOrEqual(13.333 + 0.001);
      expect(element.y + element.h).toBeLessThanOrEqual(7.5 + 0.001);
    }
  });

  it("satisfies the visual richness gate that text-only slides fail", () => {
    const before = richnessIssueAt([textOnlyContentSlide("scaffold-target")], "scaffold-target");
    expect(before).toBeDefined();

    const scaffold = createVisualScaffold(
      { concept: "テナント統制", points: ["役割分担", "監査", "自動化"] },
      { idPrefix: "scaffold-target-rail" }
    );
    const slide = textOnlyContentSlide("scaffold-target");
    slide.elements.push(...scaffold.elements);

    const after = richnessIssueAt([slide], "scaffold-target");
    expect(after).toBeUndefined();
  });

  it("drops overflowing points and keeps the rail inside the frame", () => {
    const result = createVisualScaffold(
      {
        concept: "多数の観点",
        points: ["観点1", "観点2", "観点3", "観点4", "観点5", "観点6", "観点7", "観点8"]
      },
      { locale: "ja-JP" }
    );

    const chips = result.elements.filter((element) => /-chip-\d+$/.test(element.id));
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(result.warnings.some((warning) => warning.includes("dropped"))).toBe(true);

    const frameBottom = 1.5 + 5.6;
    for (const element of result.elements) {
      expect(element.y + element.h).toBeLessThanOrEqual(frameBottom + 0.001);
      expect(element.x + element.w).toBeLessThanOrEqual(13.333 + 0.001);
    }
  });

  it("passes lint when the scaffold is inserted into a sample deck", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 3 });
    const cardsSlide = deck.slides.find((slide) => slide.layout === "cards");
    expect(cardsSlide).toBeDefined();
    if (cardsSlide) {
      const scaffold = createVisualScaffold(
        { concept: "全体像", caption: "三層で統制", points: ["特定", "保護", "検知"] },
        { idPrefix: "cards-rail", frame: { x: 9.0, y: 1.7, w: 3.6, h: 5.2 } }
      );
      cardsSlide.elements.push(...scaffold.elements);
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overflow = report.issues.find((issue) => issue.code === "layout.text-overflow-risk" && issue.path.includes("cards-rail"));
    expect(overflow).toBeUndefined();
  });
});
