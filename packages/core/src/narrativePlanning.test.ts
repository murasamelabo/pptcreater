import { describe, expect, it } from "vitest";
import { createDeckFromMessageMap } from "./messageDeck.js";
import { createNarrativePlanArtifacts } from "./narrativePlanning.js";
import type { DeckMessageMap } from "./schema.js";
import { reviewVisualQuality } from "./visualQuality.js";

const MESSAGE_MAP: DeckMessageMap = {
  objective: "意思決定者が導入判断に必要な論点を理解する",
  audience: "CIO、CISO、情報システム部門長",
  desiredAction: "次回会議でPoC開始を承認する",
  intents: [
    {
      slideId: "summary",
      title: "結論",
      message: "PoCは重要資産から段階的に始める。",
      evidence: ["重要ID", "端末", "検知運用"],
      quietInfo: ["初期範囲を限定する"],
      visualType: "summary",
      emphasis: "段階導入"
    },
    {
      slideId: "roi",
      title: "ROI",
      message: "検知と復旧の短縮で投資効果を説明する。",
      evidence: ["MTTD 30%短縮", "復旧工数20%削減"],
      quietInfo: [],
      visualType: "table",
      emphasis: "30%短縮"
    },
    {
      slideId: "roadmap",
      title: "導入ステップ",
      message: "初期診断から全社展開までゲートを置く。",
      evidence: ["診断", "PoC", "検知運用", "展開"],
      quietInfo: [],
      visualType: "flow",
      emphasis: "ゲート"
    }
  ]
};

describe("narrative planning artifacts", () => {
  it("creates staged planning artifacts from an existing message map", () => {
    const artifacts = createNarrativePlanArtifacts(MESSAGE_MAP, {
      title: "Security decision deck",
      locale: "ja-JP",
      contentMode: "decision"
    });

    expect(artifacts.planningInput.purpose).toBe(MESSAGE_MAP.objective);
    expect(artifacts.deckBrief.thesis).toBe(MESSAGE_MAP.objective);
    expect(artifacts.chapters.length).toBeGreaterThan(0);
    expect(artifacts.slideBriefs).toHaveLength(MESSAGE_MAP.intents.length);
    expect(artifacts.slideTextPlans).toHaveLength(MESSAGE_MAP.intents.length);
    expect(artifacts.expressionPlans).toHaveLength(MESSAGE_MAP.intents.length);
    expect(artifacts.layoutPlans).toHaveLength(MESSAGE_MAP.intents.length);
    expect(artifacts.visualGrammars.length).toBeGreaterThan(5);
  });

  it("selects visual grammars instead of fixed visualType pattern names", () => {
    const artifacts = createNarrativePlanArtifacts(MESSAGE_MAP, { locale: "ja-JP", contentMode: "decision" });
    const fixedVisualTypes = new Set<string>(MESSAGE_MAP.intents.map((intent) => intent.visualType));

    for (const expressionPlan of artifacts.expressionPlans) {
      expect(fixedVisualTypes.has(expressionPlan.selectedGrammarId)).toBe(false);
      expect(expressionPlan.rationale).toContain("rather than directly rendering visualType");
      expect(expressionPlan.rejectedAlternatives.length).toBeGreaterThanOrEqual(2);
      expect(expressionPlan.visualRoles.length).toBeGreaterThan(0);
    }
  });

  it("marks dense slides for splitting before layout cramming", () => {
    const denseMap: DeckMessageMap = {
      objective: "情報量の多い手元資料を作る",
      audience: "実務担当者",
      desiredAction: "詳細を確認する",
      intents: [
        {
          slideId: "dense",
          title: "詳細条件",
          message: "条件をすべて同じ面で確認する。",
          evidence: ["条件1", "条件2", "条件3", "条件4", "条件5", "条件6", "条件7"],
          quietInfo: [],
          visualType: "detail",
          emphasis: "詳細"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(denseMap, { locale: "ja-JP", contentMode: "handout" });

    expect(artifacts.slideBriefs[0].densityTarget).toBe("dense");
    expect(artifacts.slideBriefs[0].splitReason).toMatch(/split|分割|summarized/u);
    expect(artifacts.layoutPlans[0].overflowPolicy).toBe("split");
  });

  it("can generate DeckSpec slides from narrative-v1 grammar layouts", () => {
    const deck = createDeckFromMessageMap(MESSAGE_MAP, {
      title: "Narrative rendering",
      locale: "ja-JP",
      contentMode: "decision",
      planningMode: "narrative-v1"
    });

    const contentSlides = deck.slides.filter((slide) => slide.id !== "cover" && slide.id !== "closing");

    expect(deck.metadata.keywords).toContain("narrative-v1");
    expect(contentSlides.every((slide) => slide.layout.startsWith("message-grammar-"))).toBe(true);
    expect(contentSlides.some((slide) => slide.layout.includes("typographic-emphasis"))).toBe(true);
    expect(JSON.stringify(deck)).not.toContain("message-flow");
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("preserves technical identifiers and hides internal grammar labels", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "ID-JAG のトークン交換を理解する",
        audience: "ID基盤/セキュリティのアーキテクト",
        desiredAction: "PoCで既存OBOとの差分を確認する",
        intents: [
          {
            slideId: "actors",
            title: "登場ロール",
            message: "三者でSSO信頼をAPI認可へ延伸する。",
            evidence: ["Client", "Resource Application", "IdP"],
            quietInfo: [],
            visualType: "native-diagram",
            emphasis: "三者信頼モデル"
          },
          {
            slideId: "flow",
            title: "全体フロー",
            message: "ID-JAG を交換し短命トークンを得る。",
            evidence: ["SSOログイン", "Token Exchange", "ID-JAG発行", "Access Token"],
            quietInfo: [],
            visualType: "flow",
            emphasis: "二段階交換"
          },
          {
            slideId: "resource",
            title: "Resource側検証",
            message: "ID-JAG を JWT Bearer として受ける。",
            evidence: ["grant_type=jwt-bearer", "assertion=ID-JAG", "typ/aud/client_id"],
            quietInfo: [],
            visualType: "table",
            emphasis: "JWT Bearer"
          }
        ]
      },
      { title: "ID-JAG deep dive", locale: "ja-JP", contentMode: "technical", planningMode: "narrative-v1" }
    );

    const serialized = JSON.stringify(deck);
    // Technical identifiers must not be mangled into spaced forms.
    expect(serialized).toContain("ID-JAG");
    expect(serialized).toContain("grant_type=jwt-bearer");
    expect(serialized).toContain("typ/aud/client_id");
    expect(serialized).not.toContain("ID JAG");
    expect(serialized).not.toContain("client id");
    // Internal grammar scaffolding labels must not reach the slide surface.
    expect(serialized).not.toContain("GRAMMAR ");
    expect(serialized).not.toContain("TABLE TEXT SYSTEM");
    expect(serialized).not.toContain("DECISION SURFACE");
    expect(serialized).not.toContain("SEQUENTIAL PATH");
    // Roles/relationships must not be forced into a decision scatter; flow keeps a sequence.
    expect(deck.slides.find((slide) => slide.id === "actors")?.layout).toBe("message-grammar-spatial-model");
    expect(deck.slides.find((slide) => slide.id === "flow")?.layout).toBe("message-grammar-sequential-path");
    expect(deck.slides.find((slide) => slide.id === "resource")?.layout).toBe("message-grammar-table-text-system");
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps calendar-year context and product-name digits from hijacking hero-metric grammar", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "XAA の広がりを理解する",
        audience: "アーキテクト",
        desiredAction: "候補を比較する",
        intents: [
          {
            slideId: "ecosystem",
            title: "エコシステム",
            message: "XAAはOkta主導で広がる。",
            evidence: [
              "IdP: Okta, Athenz",
              "Clients: Claude, VS Code",
              "Authorization servers: Stytch, Auth0",
              "Resource apps: Asana, Figma"
            ],
            quietInfo: ["2026年前半時点"],
            visualType: "table",
            emphasis: "相互運用エコシステム"
          },
          {
            slideId: "alternatives",
            title: "代替手段",
            message: "差別化は短命・IdP集中管理にある。",
            evidence: [
              "APIキー: 長命で分散",
              "標準OAuth同意: IT可視性が弱い",
              "サービスアカウント: ユーザー代理性が薄い",
              "独自OBO: 単一IdPに閉じやすい"
            ],
            quietInfo: [],
            visualType: "contrast",
            emphasis: "標準で相互運用"
          }
        ]
      },
      { title: "XAA ecosystem", locale: "ja-JP", contentMode: "technical", planningMode: "narrative-v1" }
    );

    const serialized = JSON.stringify(deck);
    // A calendar year in quiet context must not be treated as a hero metric.
    expect(deck.slides.find((slide) => slide.id === "ecosystem")?.layout).toBe("message-grammar-table-text-system");
    // A product-name digit (Auth0) must never become a focal "0".
    expect(serialized).not.toMatch(/"text"\s*:\s*"0"/);
    // Three or more distinct options read as a board, not a two-sided comparison.
    expect(deck.slides.find((slide) => slide.id === "alternatives")?.layout).toBe("message-grammar-evidence-board");
    // Adjective-ending fragment labels must not get an ungrammatical 「を確認する」 suffix.
    expect(serialized).not.toContain("弱いを確認する");
    expect(serialized).not.toContain("薄いを確認する");
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});