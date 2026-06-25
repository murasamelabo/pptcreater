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

  it("never splits numbers, Latin words, or identifiers across lines", () => {
    const make = (text: string, w: number): Slide => ({
      id: "atomic",
      title: "Atomic",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text,
          x: 1,
          y: 1,
          w,
          h: 1.6,
          fontSize: 12,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    });

    const numberText = normalizeSlideLayout(make("1 AD ドメインあたり 150,000 オブジェクト未満か。", 2.5)).elements[0];
    const latinText = normalizeSlideLayout(make("Provisioning Service を確認する", 1.6)).elements[0];
    const identifierText = normalizeSlideLayout(make("dirSyncEnabled / onPremisesDistinguishedName を比較。", 2.7)).elements[0];

    expect(numberText.type === "text" ? numberText.text : "").not.toMatch(/150,\n/);
    expect(numberText.type === "text" ? numberText.text : "").toContain("150,000");
    expect(latinText.type === "text" ? latinText.text : "").not.toMatch(/Provisioni\n/);
    expect(identifierText.type === "text" ? identifierText.text : "").toContain("onPremisesDistinguishedName");
  });

  it("never splits katakana loanwords or kanji compounds across lines", () => {
    const make = (text: string, w: number): Slide => ({
      id: "jp-words",
      title: "JP words",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text,
          x: 1,
          y: 1,
          w,
          h: 1.6,
          fontSize: 11,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    });

    const katakana = normalizeSlideLayout(make("1 AD ドメインあたり 150,000 オブジェクト未満か。", 2.4)).elements[0];
    const member = normalizeSlideLayout(make("同期対象グループが 50,000 メンバー未満か。", 2.4)).elements[0];
    const kanji = normalizeSlideLayout(make("AD と Entra ID の対象件数、dirSyncEnabled、削除予定数を比較。", 2.6)).elements[0];

    const katakanaText = katakana.type === "text" ? katakana.text : "";
    const memberText = member.type === "text" ? member.text : "";
    const kanjiText = kanji.type === "text" ? kanji.text : "";

    // Katakana loanwords stay intact on a single line.
    for (const line of katakanaText.split("\n")) {
      expect(line.includes("オ") ? line.includes("オブジェクト") : true).toBe(true);
    }
    expect(katakanaText).toContain("オブジェクト");
    expect(memberText).toContain("メンバー");
    for (const line of memberText.split("\n")) {
      expect(line.includes("メ") ? line.includes("メンバー") : true).toBe(true);
    }
    // Two-character kanji compounds are never split between lines.
    expect(kanjiText).toContain("削除");
    expect(kanjiText).not.toMatch(/削\n/);
    expect(kanjiText).not.toMatch(/\n除/);
  });

  it("does not orphan trailing punctuation when wrapping body text", () => {
    const slide: Slide = {
      id: "natural-end",
      title: "Natural end",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Hybrid Join / device writeback を利用していないか。",
          x: 1,
          y: 1,
          w: 2.6,
          h: 1.6,
          fontSize: 11,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const text = normalized.elements[0].type === "text" ? normalized.elements[0].text : "";

    expect(text).not.toMatch(/\n。$/);
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

  it("raises very small body and callout text to practical readable floors when it fits", () => {
    const slide: Slide = {
      id: "small-text",
      title: "Small text",
      layout: "title-content",
      elements: [
        {
          id: "body",
          type: "text",
          role: "body",
          text: "Short body",
          x: 1,
          y: 1,
          w: 4,
          h: 0.8,
          fontSize: 9,
          bold: false,
          decorative: false,
          readingOrder: 1
        },
        {
          id: "callout",
          type: "text",
          role: "callout",
          text: "Key",
          x: 1,
          y: 2,
          w: 4,
          h: 0.8,
          fontSize: 10,
          bold: true,
          decorative: false,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const body = normalized.elements.find((element) => element.id === "body");
    const callout = normalized.elements.find((element) => element.id === "callout");

    expect(body?.type === "text" ? body.fontSize : undefined).toBe(12);
    expect(callout?.type === "text" ? callout.fontSize : undefined).toBe(14);
  });

  it("keeps dense caption labels readable by shortening instead of shrinking below 12pt", () => {
    const slide: Slide = {
      id: "dense-caption",
      title: "Dense caption",
      layout: "title-content",
      elements: [
        {
          id: "caption",
          type: "text",
          role: "caption",
          text: "出産費用助成 母子訪問 赤ちゃん訪問 申請期限と口座",
          x: 12.1,
          y: 7.02,
          w: 0.55,
          h: 0.44,
          fontSize: 9,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const caption = normalized.elements[0];

    expect(caption.type === "text" ? caption.fontSize : undefined).toBeGreaterThanOrEqual(12);
    expect(caption.type === "text" ? caption.text : "").toContain("…");
  });

  it("uses a verified ellipsis fallback for extremely narrow captions", () => {
    const slide: Slide = {
      id: "narrow-caption",
      title: "Narrow caption",
      layout: "title-content",
      elements: [
        {
          id: "caption",
          type: "text",
          role: "caption",
          text: "abcdef",
          x: 13.1,
          y: 7.12,
          w: 0.12,
          h: 0.2,
          fontSize: 9,
          bold: false,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const caption = normalized.elements[0];

    expect(caption.type === "text" ? caption.text : "").toBe("…");
  });

  it("preserves generated Diagram Intent caption sizing during polish", () => {
    const slide: Slide = {
      id: "intent-caption",
      title: "Intent caption",
      layout: "title-content",
      elements: [
        {
          id: "diagram-intent-step-label",
          type: "text",
          role: "caption",
          text: "PIM\nJIT / approval",
          x: 6,
          y: 3,
          w: 1.0,
          h: 0.42,
          fontSize: 8.5,
          bold: false,
          decorative: false,
          altText: "generated diagram intent text",
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const caption = normalized.elements[0];

    expect(caption.type === "text" ? caption.fontSize : undefined).toBe(8.5);
    expect(caption.type === "text" ? caption.text : "").toBe("PIM\nJIT / approval");
  });

  it("does not silently truncate callout text during polish", () => {
    const slide: Slide = {
      id: "callout-overflow",
      title: "Callout overflow",
      layout: "title-content",
      elements: [
        {
          id: "callout",
          type: "text",
          role: "callout",
          text: "Important callout text that should remain available to the author",
          x: 12.1,
          y: 7.0,
          w: 0.55,
          h: 0.4,
          fontSize: 10,
          bold: true,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const callout = normalized.elements[0];

    expect(callout.type === "text" ? callout.text : "").not.toContain("…");
  });

  it("insets square accent bars that are flush with rounded card edges", () => {
    const slide: Slide = {
      id: "accent-bars",
      title: "Accent bars",
      layout: "title-content",
      elements: [
        {
          id: "sample-card-box",
          type: "shape",
          shape: "roundRect",
          x: 1,
          y: 1,
          w: 4,
          h: 2,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "sample-card-bar",
          type: "shape",
          shape: "rect",
          x: 1,
          y: 1,
          w: 0.12,
          h: 2,
          fill: "#8f3d35",
          decorative: true,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const bar = normalized.elements.find((element) => element.id === "sample-card-bar");

    expect(bar?.type === "shape" ? bar.shape : undefined).toBe("roundRect");
    expect(bar?.x ?? 0).toBeGreaterThan(1);
    expect(bar?.y ?? 0).toBeGreaterThan(1);
    expect(bar?.h ?? 99).toBeLessThan(2);
  });

  it("expands card backgrounds to contain associated text and bullet marks", () => {
    const slide: Slide = {
      id: "card-content",
      title: "Card content",
      layout: "title-content",
      elements: [
        {
          id: "sample-card-box",
          type: "shape",
          shape: "roundRect",
          x: 1,
          y: 1,
          w: 3.5,
          h: 1,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "sample-card-bar",
          type: "shape",
          shape: "roundRect",
          x: 1,
          y: 1,
          w: 0.12,
          h: 1,
          fill: "#315f9f",
          decorative: true,
          readingOrder: 2
        },
        {
          id: "sample-card-dot",
          type: "shape",
          shape: "ellipse",
          x: 1.28,
          y: 2.02,
          w: 0.12,
          h: 0.09,
          fill: "#315f9f",
          decorative: true,
          readingOrder: 3
        },
        {
          id: "sample-card-label",
          type: "text",
          role: "caption",
          text: "Card label",
          x: 1.5,
          y: 1.95,
          w: 2.6,
          h: 0.3,
          fontSize: 12,
          bold: false,
          decorative: false,
          readingOrder: 4
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const card = normalized.elements.find((element) => element.id === "sample-card-box");
    const bar = normalized.elements.find((element) => element.id === "sample-card-bar");

    expect(card?.h ?? 0).toBeGreaterThan(1.1);
    expect(bar?.h ?? 0).toBeGreaterThan(1.0);
  });

  it("keeps card rows uniform without expanding into following table blocks", () => {
    const slide: Slide = {
      id: "card-table-spacing",
      title: "Card table spacing",
      layout: "title-content",
      elements: [
        {
          id: "card-a-box",
          type: "shape",
          shape: "roundRect",
          x: 1,
          y: 1,
          w: 3,
          h: 1,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "card-b-box",
          type: "shape",
          shape: "roundRect",
          x: 4.4,
          y: 1,
          w: 3,
          h: 1,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 2
        },
        {
          id: "card-a-label",
          type: "text",
          role: "caption",
          text: "First row",
          x: 1.3,
          y: 1.92,
          w: 2.3,
          h: 0.3,
          fontSize: 12,
          bold: false,
          decorative: false,
          readingOrder: 3
        },
        {
          id: "table-cell",
          type: "shape",
          shape: "rect",
          x: 1,
          y: 2.42,
          w: 6.4,
          h: 0.5,
          fill: "#f1f5f9",
          decorative: true,
          readingOrder: 4
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const cardA = normalized.elements.find((element) => element.id === "card-a-box");
    const cardB = normalized.elements.find((element) => element.id === "card-b-box");
    const table = normalized.elements.find((element) => element.id === "table-cell");

    expect(cardA?.h).toBe(cardB?.h);
    expect((cardA?.y ?? 0) + (cardA?.h ?? 0)).toBeLessThan((table?.y ?? 0) - 0.02);
  });

  it("does not grow a card over a tightly-stacked sibling below it", () => {
    // Reproduces a real deck where a phase column stacked three cards with an exact 0.12in gap.
    // The text-fit growth used to expand the upper cards straight over the next card because the
    // blocker check ignored siblings within 0.12in below the card bottom.
    const card = (id: string, y: number, h: number) =>
      ({ id, type: "shape", shape: "roundRect", x: 5.22, y, w: 3.36, h, fill: "#ffffff", decorative: true, readingOrder: 1 }) as const;
    const label = (id: string, y: number, text: string) =>
      ({ id, type: "text", role: "caption", text, x: 6.05, y, w: 2.37, h: 0.92, fontSize: 16, bold: false, decorative: false, readingOrder: 2 }) as const;
    const slide: Slide = {
      id: "stacked-phase-cards",
      title: "Stacked phase cards",
      layout: "title-content",
      elements: [
        card("step-3-box", 3.13, 0.92),
        card("step-4-box", 4.17, 0.92),
        card("step-5-box", 5.21, 0.92),
        label("step-3-label", 3.13, "Cloud Discovery有効化"),
        label("step-4-label", 4.17, "アプリ接続（Connector）"),
        label("step-5-label", 5.21, "CAAC構成")
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const boxes = ["step-3-box", "step-4-box", "step-5-box"].map((id) =>
      normalized.elements.find((element) => element.id === id)
    );
    // No box may extend into the next box below it.
    for (let i = 0; i < boxes.length - 1; i++) {
      const bottom = (boxes[i]?.y ?? 0) + (boxes[i]?.h ?? 0);
      expect(bottom).toBeLessThanOrEqual((boxes[i + 1]?.y ?? 0) + 0.001);
    }
  });

  it("shrinks oversized cards in a row back to the needed uniform height", () => {
    const slide: Slide = {
      id: "oversized-card-row",
      title: "Oversized card row",
      layout: "title-content",
      elements: [
        {
          id: "flow-0-box",
          type: "shape",
          shape: "roundRect",
          x: 1,
          y: 1,
          w: 2,
          h: 2.2,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "flow-1-box",
          type: "shape",
          shape: "roundRect",
          x: 3.4,
          y: 1,
          w: 2,
          h: 1.5,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 2
        },
        {
          id: "flow-0-label",
          type: "text",
          role: "caption",
          text: "Short label",
          x: 1.2,
          y: 1.85,
          w: 1.5,
          h: 0.3,
          fontSize: 12,
          bold: false,
          decorative: false,
          readingOrder: 3
        },
        {
          id: "flow-1-label",
          type: "text",
          role: "caption",
          text: "Short label",
          x: 3.6,
          y: 1.85,
          w: 1.5,
          h: 0.3,
          fontSize: 12,
          bold: false,
          decorative: false,
          readingOrder: 4
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const cardA = normalized.elements.find((element) => element.id === "flow-0-box");
    const cardB = normalized.elements.find((element) => element.id === "flow-1-box");

    expect(cardA?.h).toBe(cardB?.h);
    expect(cardA?.h ?? 99).toBeLessThan(2.2);
  });

  it("expands short two-line labels instead of shrinking below readable floors", () => {
    const slide: Slide = {
      id: "short-label",
      title: "Short label",
      layout: "title-content",
      elements: [
        {
          id: "label",
          type: "text",
          role: "callout",
          text: "Evidence\ncollection",
          x: 1,
          y: 1,
          w: 1.63,
          h: 0.42,
          fontSize: 12,
          bold: true,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const label = normalized.elements[0];

    expect(label.type === "text" ? label.fontSize : undefined).toBe(14);
    expect(label.type === "text" ? label.text : "").toBe("Evidence\ncollection");
    expect(label.h).toBeGreaterThanOrEqual(0.42);
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

  it("pushes card text clear of a left accent bar while preserving bullet size", () => {
    const slide: Slide = {
      id: "left-bar-clearance",
      title: "Left bar clearance",
      layout: "title-content",
      elements: [
        {
          id: "cat-box",
          type: "shape",
          shape: "roundRect",
          x: 0.7,
          y: 3.2,
          w: 3.9,
          h: 2.4,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "cat-bar",
          type: "shape",
          shape: "rect",
          x: 0.7,
          y: 3.2,
          w: 0.16,
          h: 2.4,
          fill: "#8f3d35",
          decorative: true,
          readingOrder: 2
        },
        {
          id: "cat-dot",
          type: "shape",
          shape: "ellipse",
          x: 0.82,
          y: 3.9,
          w: 0.12,
          h: 0.1,
          fill: "#8f3d35",
          decorative: true,
          readingOrder: 3
        },
        {
          id: "cat-title",
          type: "text",
          role: "subtitle",
          text: "カテゴリ見出し",
          x: 0.78,
          y: 3.3,
          w: 3.6,
          h: 0.4,
          fontSize: 16,
          bold: true,
          decorative: false,
          readingOrder: 4
        },
        {
          id: "cat-body",
          type: "text",
          role: "body",
          text: "説明テキストが色付きのバーと重ならないようにします。",
          x: 1.0,
          y: 3.8,
          w: 3.4,
          h: 1.6,
          fontSize: 13,
          bold: false,
          decorative: false,
          readingOrder: 5
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const bar = normalized.elements.find((element) => element.id === "cat-bar");
    const dot = normalized.elements.find((element) => element.id === "cat-dot");
    const title = normalized.elements.find((element) => element.id === "cat-title");
    const body = normalized.elements.find((element) => element.id === "cat-body");

    const barRight = (bar?.x ?? 0) + (bar?.w ?? 0);
    expect(title?.x ?? 0).toBeGreaterThan(barRight + 0.05);
    expect(dot?.x ?? 0).toBeGreaterThan(barRight + 0.05);
    expect(body?.x ?? 0).toBeGreaterThan(barRight + 0.05);
    // The bullet dot must not balloon to a text-width floor.
    expect(dot?.w ?? 0).toBeCloseTo(0.12, 5);
  });

  it("is idempotent: re-running the polish keeps card text positions stable", () => {
    const slide: Slide = {
      id: "left-bar-idempotent",
      title: "Idempotent",
      layout: "title-content",
      elements: [
        {
          id: "cat-box",
          type: "shape",
          shape: "roundRect",
          x: 0.7,
          y: 3.2,
          w: 3.9,
          h: 2.4,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "cat-bar",
          type: "shape",
          shape: "rect",
          x: 0.7,
          y: 3.2,
          w: 0.16,
          h: 2.4,
          fill: "#8f3d35",
          decorative: true,
          readingOrder: 2
        },
        {
          id: "cat-title",
          type: "text",
          role: "subtitle",
          text: "カテゴリ見出し",
          x: 0.78,
          y: 3.3,
          w: 3.6,
          h: 0.4,
          fontSize: 16,
          bold: true,
          decorative: false,
          readingOrder: 3
        }
      ]
    };

    const once = normalizeSlideLayout(slide);
    const twice = normalizeSlideLayout({ ...slide, elements: once.elements });
    const titleOnce = once.elements.find((element) => element.id === "cat-title");
    const titleTwice = twice.elements.find((element) => element.id === "cat-title");

    expect(titleTwice?.x ?? 0).toBeCloseTo(titleOnce?.x ?? -1, 5);
    expect(titleTwice?.w ?? 0).toBeCloseTo(titleOnce?.w ?? -1, 5);
  });

  it("clamps card text that overflows the card right edge back inside the card", () => {
    const slide: Slide = {
      id: "overflow-clamp",
      title: "Overflow clamp",
      layout: "title-content",
      elements: [
        {
          id: "ov-box",
          type: "shape",
          shape: "roundRect",
          x: 5.0,
          y: 1.0,
          w: 3.0,
          h: 1.2,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "ov-title",
          type: "text",
          role: "subtitle",
          text: "見出し",
          x: 5.1,
          y: 1.05,
          w: 3.4,
          h: 0.4,
          fontSize: 16,
          bold: true,
          decorative: false,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const card = normalized.elements.find((element) => element.id === "ov-box");
    const title = normalized.elements.find((element) => element.id === "ov-title");
    const cardRight = (card?.x ?? 0) + (card?.w ?? 0);
    const textRight = (title?.x ?? 0) + (title?.w ?? 0);

    expect(textRight).toBeLessThanOrEqual(cardRight + 0.01);
  });

  it("does not over-indent plain cards that have no left accent bar", () => {
    const slide: Slide = {
      id: "no-bar-card",
      title: "No bar",
      layout: "title-content",
      elements: [
        {
          id: "plain-box",
          type: "shape",
          shape: "roundRect",
          x: 0.7,
          y: 1.0,
          w: 3.9,
          h: 1.4,
          fill: "#ffffff",
          decorative: true,
          readingOrder: 1
        },
        {
          id: "plain-title",
          type: "text",
          role: "subtitle",
          text: "番号付きカード",
          x: 1.05,
          y: 1.05,
          w: 3.2,
          h: 0.4,
          fontSize: 16,
          bold: true,
          decorative: false,
          readingOrder: 2
        }
      ]
    };

    const normalized = normalizeSlideLayout(slide);
    const title = normalized.elements.find((element) => element.id === "plain-title");

    expect(title?.x ?? 0).toBeCloseTo(1.05, 5);
  });
});
