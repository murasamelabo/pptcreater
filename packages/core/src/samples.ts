import { defaultTokens } from "./color.js";
import type { DeckSpec, Locale } from "./schema.js";

export function createSampleDeck(locale: Locale): DeckSpec {
  const isJapanese = locale === "ja-JP";

  return {
    version: "0.1",
    title: isJapanese ? "アクセシブルな提案資料" : "Accessible Proposal Deck",
    locale,
    template: isJapanese ? "minimal-consulting" : "technical-architecture",
    skillPack: isJapanese ? "consulting-ja" : "accessibility-strict",
    tokens: defaultTokens(locale),
    metadata: {
      keywords: ["accessible", "powerpoint", "deck"]
    },
    slides: [
      {
        id: "slide-1",
        title: isJapanese ? "AIで資料作成の品質を標準化する" : "AI standardizes slide quality",
        layout: "title-content",
        speakerNotes: isJapanese
          ? "このスライドは、ツールの価値を一文で伝える導入です。"
          : "This opening slide states the core value in one sentence.",
        elements: [
          {
            id: "title",
            type: "text",
            role: "title",
            text: isJapanese ? "AIで資料作成の品質を標準化する" : "AI standardizes slide quality",
            x: 0.7,
            y: 0.55,
            w: 11.0,
            h: 0.8,
            fontSize: 34,
            bold: true,
            decorative: false,
            readingOrder: 0
          },
          {
            id: "message",
            type: "text",
            role: "body",
            text: isJapanese
              ? "DeckSpec、テンプレート、lint、MCPを組み合わせ、簡潔でアクセシブルなPowerPointを再現可能に生成します。"
              : "DeckSpec, templates, linting, and MCP make concise accessible PowerPoint generation repeatable.",
            x: 0.8,
            y: 1.7,
            w: 9.6,
            h: 1.2,
            fontSize: 24,
            bold: false,
            decorative: false,
            readingOrder: 1
          }
        ]
      }
    ]
  };
}
