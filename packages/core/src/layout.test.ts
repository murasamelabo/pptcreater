import { describe, expect, it } from "vitest";
import { normalizeDeckLayout, normalizeReadingOrder, normalizeSlideLayout } from "./layout.js";
import type { Slide } from "./schema.js";
import { createSampleDeck } from "./samples.js";

describe("layout polish", () => {
  it("keeps elements inside slide bounds", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements[0].x = 20;

    const polished = normalizeDeckLayout(deck);

    expect(polished.slides[0].elements[0].x).toBeLessThan(13.333);
  });

  it("preserves valid edge-aligned full-slide elements", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements.push({
      id: "full-bleed-bg",
      type: "shape",
      shape: "rect",
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 999
    });

    const polished = normalizeDeckLayout(deck);
    const fullBleed = polished.slides[0].elements.find((element) => element.id === "full-bleed-bg");

    expect(fullBleed).toMatchObject({ x: 0, y: 0, w: 13.333, h: 7.5 });
  });

  it("adjusts long text boxes", () => {
    const deck = createSampleDeck("en-US");
    const text = deck.slides[0].elements.find((element) => element.type === "text");
    if (text?.type === "text") {
      text.text = "Long text ".repeat(80);
      text.w = 2;
      text.h = 0.2;
      text.fontSize = 24;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedText = polished.slides[0].elements.find((element) => element.type === "text");

    expect(polishedText?.h).toBeGreaterThanOrEqual(0.2);
  });

  it("wraps Japanese title text into balanced lines", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "守る対象はアカウント単体ではなくエンドツーエンドの経路";
      title.w = 6.2;
      title.h = 1.4;
      title.fontSize = 34;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedTitle = polished.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    const lines = polishedTitle?.type === "text" ? polishedTitle.text.split("\n") : [];

    expect(polishedTitle?.type === "text" ? polishedTitle.text : "").toContain("\n");
    expect(lines.at(-1)?.length ?? 0).toBeGreaterThan(4);
    expect(lines.at(-1)).not.toBe("る");
  });

  it("reflows ragged manual breaks for normal body text", () => {
    const slide: Slide = {
      id: "ragged",
      title: "Ragged",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Microsoft Entra認証、\n条件付きアクセス、Azure Bastion\n、\nApp Proxyへ寄せる。",
          x: 1,
          y: 1,
          w: 4,
          h: 1.8,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").not.toContain("\n、");
  });

  it("preserves acceptable latin title manual breaks", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Zero Trust\nArchitecture";
      title.w = 7;
      title.h = 1.3;
      title.fontSize = 32;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedTitle = polished.slides[0].elements.find((element) => element.type === "text" && element.role === "title");

    expect(polishedTitle?.type === "text" ? polishedTitle.text : "").toBe("Zero Trust\nArchitecture");
  });

  it("preserves acceptable manual title breaks", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Roadmap\nQ4";
      title.w = 7;
      title.h = 1.4;
      title.fontSize = 30;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedTitle = polished.slides[0].elements.find((element) => element.type === "text" && element.role === "title");

    expect(polishedTitle?.type === "text" ? polishedTitle.text : "").toBe("Roadmap\nQ4");
  });

  it("preserves compact latin manual line breaks", () => {
    const slide: Slide = {
      id: "latin-ragged",
      title: "Latin ragged",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Zero Trust\nArchitecture",
          x: 1,
          y: 1,
          w: 5,
          h: 1.2,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("Zero Trust\nArchitecture");
  });

  it("preserves compact hyphenated or slash continuation lines", () => {
    const slide: Slide = {
      id: "continuation",
      title: "Continuation",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Cost-\neffective and risk/\nreward",
          x: 1,
          y: 1,
          w: 6,
          h: 1.2,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];
    const value = normalizedText.type === "text" ? normalizedText.text : "";

    expect(value).toContain("Cost-\neffective");
    expect(value).toContain("risk/\nreward");
  });

  it("preserves compact lowercase manual line breaks", () => {
    const slide: Slide = {
      id: "lowercase-prose",
      title: "Lowercase prose",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "cloud\nsecurity",
          x: 1,
          y: 1,
          w: 5,
          h: 1,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("cloud\nsecurity");
  });

  it("preserves compact manual breaks before short common English words", () => {
    const slide: Slide = {
      id: "short-word-prose",
      title: "Short word prose",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "security\nis important",
          x: 1,
          y: 1,
          w: 5,
          h: 1,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("security\nis important");
  });

  it("preserves intentional multiline bullet lists", () => {
    const slide: Slide = {
      id: "bullets",
      title: "Bullets",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "• One\n• Two\n• Three",
          x: 1,
          y: 1,
          w: 4,
          h: 1.5,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("• One\n• Two\n• Three");
  });

  it("preserves mixed heading and bullet lists", () => {
    const slide: Slide = {
      id: "mixed-list",
      title: "Mixed list",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Risks:\n• A\n• B",
          x: 1,
          y: 1,
          w: 4,
          h: 1.5,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("Risks:\n• A\n• B");
  });

  it("preserves compact structured manual line breaks", () => {
    const slide: Slide = {
      id: "metric-value",
      title: "Metric value",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Metric\nValue",
          x: 1,
          y: 1,
          w: 4,
          h: 1.2,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("Metric\nValue");
  });

  it("uses deck typography tokens when fitting text without explicit font size", () => {
    const deck = createSampleDeck("ja-JP", { styleProfile: "presentation", slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      delete title.fontSize;
      title.text = "短いタイトル";
      title.w = 8;
      title.h = 1.4;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedTitle = polished.slides[0].elements.find((element) => element.type === "text" && element.role === "title");

    expect(polishedTitle?.type === "text" ? polishedTitle.fontSize : undefined).toBe(deck.tokens?.typography.titleSize);
  });

  it("does not increase valid smaller typography tokens during fitting", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    if (deck.tokens) {
      deck.tokens.typography = {
        ...deck.tokens.typography,
        titleSize: 24,
        bodySize: 16,
        captionSize: 10
      };
    }
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      delete title.fontSize;
      title.text = "Small token title";
      title.w = 6;
      title.h = 1.2;
    }

    const polished = normalizeDeckLayout(deck);
    const polishedTitle = polished.slides[0].elements.find((element) => element.type === "text" && element.role === "title");

    expect(polishedTitle?.type === "text" ? polishedTitle.fontSize : undefined).toBe(24);
  });

  it("does not silently truncate copy that cannot fit", () => {
    const slide: Slide = {
      id: "overflow",
      title: "Overflow",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "これは非常に長い本文です。".repeat(20),
          x: 1,
          y: 1,
          w: 2.5,
          h: 0.45,
          fontSize: 22,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").not.toContain("…");
  });

  it("preserves intentional blank lines in non-title text", () => {
    const slide: Slide = {
      id: "paragraphs",
      title: "Paragraphs",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "First paragraph\n\nSecond paragraph",
          x: 1,
          y: 1,
          w: 6,
          h: 2,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toContain("\n\n");
  });

  it("does not duplicate already wrapped multiline body text", () => {
    const slide: Slide = {
      id: "multiline",
      title: "Multiline",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "function x() {\n  return 1;\n}",
          x: 1,
          y: 1,
          w: 6,
          h: 1.4,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text : "").toBe("function x() {\n  return 1;\n}");
  });

  it("preserves indentation on long preformatted lines", () => {
    const slide: Slide = {
      id: "long-code",
      title: "Long code",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "function x() {\n  const value = someVeryLongExpressionThatNeedsWrappingButMustKeepIndentation();\n}",
          x: 1,
          y: 1,
          w: 3,
          h: 1.4,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];
    const lines = normalizedText.type === "text" ? normalizedText.text.split("\n") : [];

    expect(lines[1].startsWith("  ")).toBe(true);
  });

  it("preserves indentation on single-line preformatted text", () => {
    const slide: Slide = {
      id: "single-code",
      title: "Single code",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "  const value = someVeryLongExpressionThatNeedsWrappingButMustKeepIndentation();",
          x: 1,
          y: 1,
          w: 3,
          h: 0.6,
          fontSize: 20,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const normalizedText = normalized.elements[0];

    expect(normalizedText.type === "text" ? normalizedText.text.startsWith("  ") : false).toBe(true);
  });

  it("restacks opaque decorative shapes below overlapping text", () => {
    const slide: Slide = {
      id: "s1",
      title: "Z-order",
      layout: "title-content",
      elements: [
        {
          id: "body-text",
          type: "text",
          role: "body",
          text: "Visible message",
          x: 1,
          y: 1,
          w: 4,
          h: 1,
          fontSize: 24,
          bold: false,
          decorative: false,
          readingOrder: 1
        },
        {
          id: "cover-card",
          type: "shape",
          shape: "rect",
          x: 1,
          y: 1,
          w: 4,
          h: 1,
          fill: "#000000",
          decorative: true,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeReadingOrder(slide);
    const text = normalized.elements.find((element) => element.id === "body-text");
    const card = normalized.elements.find((element) => element.id === "cover-card");

    expect(card?.readingOrder ?? 0).toBeLessThan(text?.readingOrder ?? 0);
  });

  it("keeps full-bleed backgrounds at the very bottom", () => {
    const slide: Slide = {
      id: "s2",
      title: "Background",
      layout: "title-content",
      elements: [
        {
          id: "title-text",
          type: "text",
          role: "title",
          text: "Title",
          x: 1,
          y: 1,
          w: 6,
          h: 1.5,
          fontSize: 36,
          bold: true,
          decorative: false,
          readingOrder: 5
        },
        {
          id: "atmosphere",
          type: "svg",
          svg: '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" /></svg>',
          x: 0,
          y: 0,
          w: 13.333,
          h: 7.5,
          decorative: true,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeReadingOrder(slide);
    const atmosphere = normalized.elements.find((element) => element.id === "atmosphere");
    const title = normalized.elements.find((element) => element.id === "title-text");

    expect(atmosphere?.readingOrder ?? 99).toBeLessThan(title?.readingOrder ?? 0);
    expect(atmosphere?.readingOrder).toBe(1);
  });
});
