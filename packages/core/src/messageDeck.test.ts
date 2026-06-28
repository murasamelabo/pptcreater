import { describe, expect, it } from "vitest";
import { createDeckFromMessageMap, MESSAGE_DECK_ARCHETYPES, archetypeForIntent } from "./messageDeck.js";
import { lintDeckSpec } from "./lint.js";
import { reviewMessageMap } from "./messageMap.js";
import { reviewVisualQuality } from "./visualQuality.js";
import type { DeckMessageMap } from "./schema.js";

const MESSAGE_MAP: DeckMessageMap = {
  objective: "横浜市周辺で産後ケア施設を選ぶ判断軸を示す",
  audience: "産後ケアを検討する家族",
  desiredAction: "助成を申請し、候補施設へ空き確認する",
  intents: [
    {
      slideId: "summary",
      title: "結論",
      message: "市助成を起点に、不足分を自費施設で補う。",
      evidence: ["市助成は低価格", "自費は柔軟", "急ぎなら併用"],
      quietInfo: [],
      visualType: "summary",
      emphasis: "市助成"
    },
    {
      slideId: "system",
      title: "制度",
      message: "申請・承認・予約枠を先に確認する。",
      evidence: ["妊娠28週以降", "審査約10営業日", "承認後予約", "60日先まで"],
      quietInfo: [],
      visualType: "flow",
      emphasis: "申請順"
    },
    {
      slideId: "price",
      title: "価格差",
      message: "助成と自費で1泊2日の負担が大きく変わる。",
      evidence: ["助成6千円", "自費3万から6万円", "価格と柔軟性"],
      quietInfo: [],
      visualType: "contrast",
      emphasis: "価格差"
    },
    {
      slideId: "map",
      title: "候補",
      message: "病院型と助産院型で特徴が分かれる。",
      evidence: ["医療安心", "生活支援", "休息重視", "近さ", "自費枠"],
      quietInfo: [],
      visualType: "ponchi-e",
      emphasis: "施設タイプ"
    },
    {
      slideId: "subsidy",
      title: "助成候補",
      message: "近さとケア方針で候補を選ぶ。",
      evidence: ["サンマタニティ", "堀病院", "ふれあい横浜", "みやした助産院"],
      quietInfo: [],
      visualType: "table",
      emphasis: "候補比較"
    },
    {
      slideId: "selfpay",
      title: "自費補完",
      message: "急ぎ・休息・預かりでは自費枠が補完になる。",
      evidence: ["助成のみ", "承認待ち", "自費補完", "預かり重視"],
      quietInfo: [],
      visualType: "before-after",
      emphasis: "補完"
    },
    {
      slideId: "decision",
      title: "判断軸",
      message: "価格・安心・柔軟性の優先度で答えが変わる。",
      evidence: ["市助成デイ", "市助成宿泊", "病院自費", "助産院自費"],
      quietInfo: [],
      visualType: "matrix",
      emphasis: "優先軸"
    },
    {
      slideId: "next",
      title: "次の行動",
      message: "対象・空き・追加料金を同時に確認する。",
      evidence: ["対象月齢", "空き日程", "ケア範囲", "追加費用", "キャンセル料"],
      quietInfo: [],
      visualType: "step",
      emphasis: "確認順"
    }
  ]
};

describe("message map deck generator", () => {
  it("turns SlideIntent entries into varied editable visual archetypes", () => {
    const deck = createDeckFromMessageMap(MESSAGE_MAP, {
      title: "横浜市周辺の産後ケア施設比較",
      locale: "ja-JP",
      contentMode: "report",
      keywords: ["産後ケア"]
    });

    expect(deck.metadata.messageMap?.intents).toHaveLength(MESSAGE_MAP.intents.length);
    expect(deck.slides.map((slide) => slide.id)).toEqual(["cover", ...MESSAGE_MAP.intents.map((intent) => intent.slideId), "closing"]);
    expect(new Set(deck.slides.map((slide) => slide.layout)).size).toBeGreaterThan(5);
    expect(MESSAGE_DECK_ARCHETYPES).toContain(archetypeForIntent(MESSAGE_MAP.intents[5]));
    expect(archetypeForIntent(MESSAGE_MAP.intents[7])).toBe("steps");
    expect(deck.slides.find((slide) => slide.id === "next")?.layout).toBe("message-steps");
    for (const slide of deck.slides.filter((candidate) => candidate.layout?.startsWith("message-"))) {
      expect(slide.elements.some((element) => element.type === "svg")).toBe(true);
    }
    expect(reviewMessageMap(deck)).toEqual({ ok: true, issues: [] });
    expect(reviewVisualQuality(deck)).toEqual({ ok: true, issues: [] });

    const blocking = lintDeckSpec(deck).issues.filter((issue) => issue.severity === "error" && !issue.polishFixable);
    expect(blocking).toEqual([]);
  });

  it("keeps generated matrix axes orthogonal and generated text untruncated", () => {
    const deck = createDeckFromMessageMap(MESSAGE_MAP, { title: "産後ケア比較", locale: "ja-JP" });
    const serialized = JSON.stringify(deck);
    expect(serialized).not.toContain("…");
    expect(serialized).not.toContain("-accent");

    const matrix = deck.slides.find((slide) => slide.id === "decision");
    const yAxis = matrix?.elements.find((element) => element.type === "shape" && element.id === "decision-axis-y-line");
    const xAxis = matrix?.elements.find((element) => element.type === "shape" && element.id === "decision-axis-x-line");
    expect(yAxis).toMatchObject({ type: "shape", shape: "line", w: 0.001 });
    expect(xAxis).toMatchObject({ type: "shape", shape: "line", h: 0 });
  });

  it("renders hub-map slides as categorized panels rather than broken radial connectors", () => {
    const deck = createDeckFromMessageMap(MESSAGE_MAP, { title: "産後ケア比較", locale: "ja-JP" });
    const hubMap = deck.slides.find((slide) => slide.id === "map");

    expect(hubMap?.layout).toBe("message-hub-map");
    expect(hubMap?.elements.some((element) => element.type === "text" && element.text === "病院型")).toBe(true);
    expect(hubMap?.elements.some((element) => element.type === "text" && element.text === "助産院型")).toBe(true);
    expect(hubMap?.elements.filter((element) => element.type === "shape" && element.shape === "line")).toHaveLength(0);
    expect(hubMap?.elements.filter((element) => element.type === "svg").length).toBeGreaterThanOrEqual(2);
  });

  it("uses neutral hub-map labels for non-healthcare topics", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "Compare rollout options",
        audience: "Platform team",
        desiredAction: "Choose the rollout path",
        intents: [
          {
            slideId: "rollout-map",
            title: "Options",
            message: "Two rollout groups carry different coordination needs.",
            evidence: ["Pilot teams", "Internal champions", "External partners", "Operations owners"],
            quietInfo: [],
            visualType: "map",
            emphasis: "Rollout groups"
          }
        ]
      },
      { title: "Rollout comparison", locale: "en-US" }
    );

    const hubMap = deck.slides.find((slide) => slide.id === "rollout-map");
    const textValues = hubMap?.elements.filter((element) => element.type === "text").map((element) => element.text) ?? [];
    expect(textValues).toContain("Option group A");
    expect(textValues).toContain("Option group B");
    expect(textValues).not.toContain("病院型");
    expect(textValues).not.toContain("助産院型");
  });

  it("renders image visualType as a side image plus message layout with source metadata", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "Show the official service context",
        audience: "Residents",
        desiredAction: "Confirm eligibility",
        intents: [
          {
            slideId: "official-context",
            title: "Official context",
            message: "Use the official visual only when usage rights and source are clear.",
            evidence: ["Official image", "Clear source", "Side-by-side explanation"],
            quietInfo: [],
            visualType: "image",
            emphasis: "Official visual",
            visualAsset: {
              type: "svg",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e0f2fe"/><circle cx="60" cy="40" r="18" fill="#0284c7"/></svg>',
              altText: "Official service diagram",
              placement: "right",
              caption: "Source: official service page",
              sourceId: "official-page",
              citation: "Official page"
            }
          }
        ]
      },
      {
        title: "Official visual example",
        locale: "en-US",
        sources: [{ id: "official-page", title: "Official service page", url: "https://example.com/service", usage: "quote" }]
      }
    );

    const slide = deck.slides.find((candidate) => candidate.id === "official-context");
    expect(slide?.layout).toBe("message-image");
    const visual = slide?.elements.find((element) => element.id === "official-context-visual-asset");
    const backdrop = slide?.elements.find((element) => element.id === "official-context-image-backdrop");
    expect(visual).toMatchObject({ type: "svg", sourceId: "official-page", citation: "Official page", altText: "Official service diagram" });
    if (!visual || visual.type !== "svg" || !backdrop || backdrop.type !== "shape") {
      throw new Error("Expected a generated SVG visual inside an image backdrop.");
    }
    expect(visual.w / visual.h).toBeCloseTo(120 / 80, 2);
    expect(visual.x).toBeGreaterThan(backdrop.x);
    expect(visual.y).toBeGreaterThan(backdrop.y);
    expect(visual.x + visual.w).toBeLessThan(backdrop.x + backdrop.w);
    expect(visual.y + visual.h).toBeLessThan(backdrop.y + backdrop.h);
    expect(slide?.elements.some((element) => element.id === "official-context-copy-panel")).toBe(true);
    expect(reviewVisualQuality(deck)).toEqual({ ok: true, issues: [] });
  });
});
