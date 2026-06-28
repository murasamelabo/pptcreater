import { describe, expect, it } from "vitest";
import { selectFigure, listFigureIntents, FIGURE_INTENTS } from "./figureSelector.js";

describe("selectFigure", () => {
  it("maps Japanese process wording to a curated horizontal flow", () => {
    const rec = selectFigure({ message: "導入の手順を5つの工程で示す" });
    expect(rec.intent).toBe("process-horizontal");
    expect(rec.renderer).toBe("design-pack");
    expect(rec.kind).toBe("flow-horizontal");
    expect(rec.schematicKind).toBe("flow");
  });

  it("maps English cycle wording to the cycle figure", () => {
    const rec = selectFigure({ message: "A continuous PDCA improvement loop" });
    expect(rec.intent).toBe("cycle");
    expect(rec.kind).toBe("cycle");
  });

  it("maps comparison/versus wording to a comparison figure", () => {
    const rec = selectFigure({ message: "スタンダードとプレミアムのプラン比較" });
    expect(rec.intent).toBe("comparison");
    expect(rec.renderer).toBe("design-pack");
  });

  it("maps score profile wording to a radar schematic", () => {
    const rec = selectFigure({ message: "6軸スコアで施設の特徴をレーダーチャートとして比較する", itemCount: 6 });
    expect(rec.intent).toBe("radar");
    expect(rec.renderer).toBe("schematic");
    expect(rec.kind).toBe("radar");
    expect(rec.schematicKind).toBe("radar");
  });

  it("maps timeline wording to a curated gantt/timeline figure", () => {
    const rec = selectFigure({ message: "導入マイルストーンをタイムラインで示す", itemCount: 4 });
    expect(rec.intent).toBe("timeline");
    expect(rec.renderer).toBe("design-pack");
    expect(rec.tool).toBe("render_design_component");
    expect(rec.kind).toBe("gantt");
  });

  it("maps architecture wording to a native editable architecture diagram", () => {
    const rec = selectFigure({ message: "Microsoft Defender と Sentinel の統合アーキテクチャ構成図", itemCount: 5 });
    expect(rec.intent).toBe("architecture");
    expect(rec.renderer).toBe("native-diagram");
    expect(rec.tool).toBe("generate_native_diagram");
    expect(rec.kind).toBe("architecture");
  });

  it("routes correlation intent to a schematic (no curated component)", () => {
    const rec = selectFigure({ message: "中心概念と関連要素の相関図" });
    expect(rec.intent).toBe("correlation");
    expect(rec.renderer).toBe("schematic");
    expect(rec.kind).toBe("correlation");
  });

  it("honors an explicit design-pack kind", () => {
    const rec = selectFigure({ figureKind: "gantt" });
    expect(rec.intent).toBe("timeline");
    expect(rec.kind).toBe("gantt");
    expect(rec.renderer).toBe("design-pack");
  });

  it("honors an explicit schematic alias", () => {
    const rec = selectFigure({ figureKind: "triangle" });
    expect(rec.intent).toBe("pyramid");
    expect(rec.schematicKind).toBe("triangle");
  });

  it("defaults to a readable vertical list when no cue matches", () => {
    const rec = selectFigure({ message: "xyz qwerty" });
    expect(rec.intent).toBe("list");
    expect(rec.rationale).toMatch(/defaulting|No strong/i);
  });

  it("warns when item count is outside the suggested range", () => {
    const tooMany = selectFigure({ message: "比較", itemCount: 9 });
    expect(tooMany.rationale).toMatch(/exceeds/);
    const tooFew = selectFigure({ message: "サイクル", itemCount: 1 });
    expect(tooFew.rationale).toMatch(/below/);
  });

  it("lists every intent with renderer and item range", () => {
    const intents = listFigureIntents();
    expect(intents).toHaveLength(FIGURE_INTENTS.length);
    for (const entry of intents) {
      expect(["design-pack", "schematic", "native-diagram", "intent-diagram"]).toContain(entry.renderer);
      expect(["render_design_component", "generate_schematic", "generate_native_diagram", "generate_intent_diagram"]).toContain(entry.tool);
      expect(entry.itemRange.min).toBeLessThanOrEqual(entry.itemRange.max);
      expect(entry.kind.length).toBeGreaterThan(0);
    }
  });

  it("always returns a renderable kind for any explicit figureKind", () => {
    for (const intent of FIGURE_INTENTS) {
      const rec = selectFigure({ figureKind: intent });
      expect(rec.intent).toBe(intent);
      expect(rec.kind.length).toBeGreaterThan(0);
    }
  });
});
