import { describe, expect, it } from "vitest";
import { attachMessageMap, createSampleDeck, reviewMessageMap } from "./index.js";

describe("message map / slide intent", () => {
  it("flags slides that do not have a one-message intent before DeckSpec authoring", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4 });
    const report = reviewMessageMap(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "message-map.missing")).toBe(true);
  });

  it("accepts a deck with one clear intent per content slide", () => {
    const deck = attachMessageMap(createSampleDeck("ja-JP", { slideCount: 3 }), [
      {
        slideId: "slide-1",
        title: "要点",
        message: "市助成を起点にし、不足分を自費で補う。",
        evidence: ["助成は低価格", "自費は柔軟"],
        visualType: "flow",
        emphasis: "市助成",
        quietInfo: ["細かい条件は出典へ"]
      },
      {
        slideId: "slide-2",
        title: "比較",
        message: "病院型と助産院型は、安心と生活支援で分けて見る。",
        evidence: ["医師連携", "授乳支援"],
        visualType: "matrix",
        emphasis: "選び分け",
        quietInfo: ["住所"]
      },
      {
        slideId: "slide-3",
        title: "次の行動",
        message: "申請、面談、空き確認の順で進める。",
        evidence: ["申請が必要", "承認後に予約"],
        visualType: "step",
        emphasis: "申請",
        quietInfo: ["電話番号"]
      }
    ]);

    const report = reviewMessageMap(deck);

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("rejects vague or overlong slide messages", () => {
    const deck = attachMessageMap(createSampleDeck("ja-JP", { slideCount: 1 }), [
      {
        slideId: "slide-1",
        title: "検討",
        message: "制度、施設、価格、メリット、デメリット、申し込み、持ち物、注意点を全部まとめて説明する。",
        evidence: [],
        visualType: "cards",
        emphasis: "",
        quietInfo: []
      }
    ]);

    const report = reviewMessageMap(deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["message-map.message-too-broad", "message-map.evidence-missing", "message-map.emphasis-missing"])
    );
  });
});
