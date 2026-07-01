import { describe, expect, it } from "vitest";
import { createNarrativePlanArtifacts } from "./narrativePlanning.js";
import type { DeckMessageMap } from "./schema.js";

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
});