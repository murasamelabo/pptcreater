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
  it("supports expressive message-map patterns beyond generic text panels", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "採用候補者が会社の実態と成長の証拠を理解する",
        audience: "採用候補者、事業責任者、投資家",
        desiredAction: "次の面談で詳しく話を聞きたいと思ってもらう",
        intents: [
          {
            slideId: "field-photo",
            title: "現場の空気",
            message: "働く場所と顧客接点の実感を先に伝える。",
            evidence: ["採用候補者", "現場", "事例"],
            quietInfo: [],
            visualType: "image",
            emphasis: "現場"
          },
          {
            slideId: "proof-number",
            title: "改善実績",
            message: "お直し率が70%減り、体験改善が数字で確認できる。",
            evidence: ["-70%", "1年半", "改善"],
            quietInfo: [],
            visualType: "summary",
            emphasis: "-70%"
          },
          {
            slideId: "chapter-break",
            title: "カルチャーについて",
            message: "ここから働く環境と価値観を見る。",
            evidence: ["chapter", "culture"],
            quietInfo: [],
            visualType: "section",
            emphasis: "Culture"
          },
          {
            slideId: "concept-map",
            title: "体験の循環",
            message: "購入後の利用体験まで支えることで、関係が循環する。",
            evidence: ["認知", "購入", "利用", "回収"],
            quietInfo: [],
            visualType: "cycle",
            emphasis: "循環"
          }
        ]
      },
      { title: "表現力サンプル", locale: "ja-JP", contentMode: "presentation" }
    );

    const layouts = deck.slides.map((slide) => slide.layout);
    expect(layouts).toContain("message-photo-hero");
    expect(layouts).toContain("message-focal-proof");
    expect(layouts).toContain("message-section-break");
    expect(layouts).toContain("message-concept");
    expect(JSON.stringify(deck)).not.toContain("…");
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("routes repeated slide-comment feature requests into richer generated layouts", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "役員がクラウド移行の初期投資を判断する",
        audience: "経営層、IT責任者、財務責任者",
        desiredAction: "移行計画と初期予算の承認を得る",
        intents: [
          {
            slideId: "executive-summary",
            title: "要約",
            message: "移行判断に必要な投資効果とリスクを先に示す。",
            evidence: ["投資対効果", "リスク低減", "承認論点"],
            quietInfo: [],
            visualType: "image",
            visualAsset: {
              type: "svg",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640"><rect width="960" height="640" fill="#dbeafe"/><path d="M140 440h680" stroke="#1f4e79" stroke-width="28"/><circle cx="260" cy="340" r="90" fill="#4f81bd"/><circle cx="520" cy="260" r="120" fill="#ffffff"/><circle cx="735" cy="345" r="80" fill="#548235"/></svg>',
              altText: "Cloud migration decision scene",
              placement: "left",
              caption: "投資判断の全体像"
            },
            emphasis: "投資判断"
          }
        ]
      },
      { title: "クラウド移行判断", locale: "ja-JP", contentMode: "decision" }
    );

    const cover = deck.slides.find((slide) => slide.id === "cover");
    expect(cover?.elements.some((element) => element.id === "cover-audience-chip")).toBe(true);
    expect(cover?.elements.some((element) => element.id === "cover-action-chip")).toBe(true);
    const actionChipText = cover?.elements.find((element) => element.id === "cover-action-chip-text");
    expect(actionChipText).toMatchObject({ type: "text" });
    expect(actionChipText?.type === "text" ? actionChipText.text.length : 0).toBeGreaterThan(5);

    const photo = deck.slides.find((slide) => slide.id === "executive-summary");
    expect(photo?.layout).toBe("message-photo-hero");
    expect(photo?.elements.some((element) => element.id === "executive-summary-photo-annotation")).toBe(true);
    expect(photo?.elements.some((element) => element.id === "executive-summary-photo-caption-rail")).toBe(true);
    expect(photo?.elements.some((element) => element.type === "text" && /注目|Focus/u.test(element.text))).toBe(true);

    const closing = deck.slides.find((slide) => slide.id === "closing");
    expect(closing?.elements.filter((element) => element.id.startsWith("closing-check-") && element.type === "shape")).toHaveLength(3);
    expect(closing?.elements.some((element) => element.type === "text" && element.text === "担当")).toBe(true);
    expect(closing?.elements.some((element) => element.type === "text" && element.text === "期限")).toBe(true);
    expect(closing?.elements.some((element) => element.type === "text" && element.text === "確認物")).toBe(true);
    expect(closing?.elements.some((element) => element.type === "text" && element.text === "次回会議までに確認")).toBe(true);

    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("promotes numeric table and contrast intents into oversized proof-number slides", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "経営層が投資対効果を判断する",
        audience: "経営層、事業責任者、財務責任者",
        desiredAction: "投資継続を判断する",
        intents: [
          {
            slideId: "roi-proof",
            title: "ROI実績",
            message: "導入後の手戻りが70%減少した。",
            evidence: ["70%減少", "レビュー時間30%短縮", "年間1,200万円削減"],
            quietInfo: [],
            visualType: "table",
            emphasis: "70%減少"
          },
          {
            slideId: "cost-before-after",
            title: "コスト比較",
            message: "運用費が年間1,200万円下がる。",
            evidence: ["Before 3,800万円", "After 2,600万円", "差分1,200万円"],
            quietInfo: [],
            visualType: "contrast",
            emphasis: "1,200万円"
          }
        ]
      },
      { title: "投資対効果", locale: "ja-JP", contentMode: "decision" }
    );

    const roi = deck.slides.find((slide) => slide.id === "roi-proof");
    const cost = deck.slides.find((slide) => slide.id === "cost-before-after");
    expect(roi?.layout).toBe("message-focal-proof");
    expect(cost?.layout).toBe("message-focal-proof");
    expect(roi?.elements.some((element) => element.type === "text" && element.id === "roi-proof-proof-number" && /70/.test(element.text))).toBe(true);
    expect(cost?.elements.some((element) => element.type === "text" && element.id === "cost-before-after-proof-number" && /1,200/.test(element.text))).toBe(true);
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("adds focal hierarchy to table, flow, and step visuals", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "意思決定に必要な論点を短時間で確認する",
        audience: "経営層と実務責任者",
        desiredAction: "最初の判断点を合意する",
        intents: [
          {
            slideId: "priority-table",
            title: "優先論点",
            message: "最も重要な論点を先に見る。",
            evidence: ["投資判断", "コスト", "リスク", "運用負荷"],
            quietInfo: [],
            visualType: "table",
            emphasis: "投資判断"
          },
          {
            slideId: "process-flow",
            title: "確認順序",
            message: "最初の確認が後続の判断を決める。",
            evidence: ["方針合意", "予算確認", "リスク整理", "承認"],
            quietInfo: [],
            visualType: "flow",
            emphasis: "方針合意"
          },
          {
            slideId: "decision-steps",
            title: "実行手順",
            message: "最初の判断点を明確にしてから進める。",
            evidence: ["判断点", "担当", "期限", "確認資料"],
            quietInfo: [],
            visualType: "step",
            emphasis: "判断点"
          }
        ]
      },
      { title: "Focal hierarchy", locale: "ja-JP", contentMode: "decision" }
    );

    expect(deck.slides.find((slide) => slide.id === "priority-table")?.elements.some((element) => element.id === "priority-table-table-focal-card")).toBe(true);
    expect(deck.slides.find((slide) => slide.id === "process-flow")?.elements.some((element) => element.id === "process-flow-flow-focal-label")).toBe(true);
    expect(deck.slides.find((slide) => slide.id === "decision-steps")?.elements.some((element) => element.id === "decision-steps-step-focal-card")).toBe(true);
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("renders statement evidence as a primary support card plus secondary rows", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "要点と根拠を短く伝える",
        audience: "意思決定者",
        desiredAction: "次の判断へ進む",
        intents: [
          {
            slideId: "summary-statement",
            title: "要約",
            message: "最初に判断すべき論点を一つに絞る。",
            evidence: ["最重要論点", "補助根拠", "次の確認"],
            quietInfo: [],
            visualType: "summary",
            emphasis: "最重要論点"
          }
        ]
      },
      { title: "Statement hierarchy", locale: "ja-JP", contentMode: "report" }
    );

    const statement = deck.slides.find((slide) => slide.id === "summary-statement");
    expect(statement?.layout).toBe("message-statement");
    expect(statement?.elements.some((element) => element.id === "summary-statement-statement-support-card-0")).toBe(true);
    expect(statement?.elements.some((element) => element.id === "summary-statement-statement-support-note-0")).toBe(true);
    expect(statement?.elements.filter((element) => element.id.includes("statement-support-card")).length).toBe(3);
    expect(statement?.elements.filter((element) => element.id.includes("evidence-chip")).length).toBe(0);
  });

  it("adds visible decision emphasis to structural visuals", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "選択肢の判断点を明確にする",
        audience: "意思決定者",
        desiredAction: "推奨案を選ぶ",
        intents: [
          {
            slideId: "matrix-choice",
            title: "候補比較",
            message: "費用と柔軟性で選択肢を比較する。",
            evidence: ["案A", "案B", "案C", "案D"],
            quietInfo: [],
            visualType: "matrix",
            emphasis: "推奨案"
          },
          {
            slideId: "hub-choice",
            title: "関係整理",
            message: "関係者間の判断点を示す。",
            evidence: ["利用者", "運用", "財務", "開発"],
            quietInfo: [],
            visualType: "map",
            emphasis: "判断点"
          },
          {
            slideId: "before-choice",
            title: "導入前後",
            message: "変更前後の分岐を明確にする。",
            evidence: ["現状", "課題", "導入後", "効果"],
            quietInfo: [],
            visualType: "before-after",
            emphasis: "分岐点"
          },
          {
            slideId: "concept-choice",
            title: "価値循環",
            message: "中心となる判断点を見える形にする。",
            evidence: ["入力", "処理", "成果", "学習"],
            quietInfo: [],
            visualType: "cycle",
            emphasis: "判断点"
          }
        ]
      },
      { title: "Decision emphasis", locale: "ja-JP", contentMode: "decision" }
    );

    expect(deck.slides.find((slide) => slide.id === "matrix-choice")?.elements.some((element) => element.id === "matrix-choice-decision-zone")).toBe(true);
    expect(deck.slides.find((slide) => slide.id === "hub-choice")?.elements.some((element) => element.id === "hub-choice-decision-callout")).toBe(true);
    expect(deck.slides.find((slide) => slide.id === "before-choice")?.elements.some((element) => element.id === "before-choice-decision-badge")).toBe(true);
    expect(deck.slides.find((slide) => slide.id === "concept-choice")?.elements.some((element) => element.id === "concept-choice-decision-callout")).toBe(true);
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("uses complete English decision badge labels", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "Clarify an executive choice",
        audience: "Executives",
        desiredAction: "Choose the target state",
        intents: [
          {
            slideId: "target-state",
            title: "Target state",
            message: "The target state makes the tradeoff explicit.",
            evidence: ["Target state", "Risk", "Cost", "Governance"],
            quietInfo: [],
            visualType: "before-after",
            emphasis: "Target state"
          }
        ]
      },
      { title: "Target state", locale: "en-US", contentMode: "decision" }
    );

    const badge = deck.slides.find((slide) => slide.id === "target-state")?.elements.find((element) => element.id === "target-state-decision-badge-text");
    expect(badge).toMatchObject({ type: "text" });
    expect(badge?.type === "text" ? badge.text.replace(/\s+/g, " ") : "").toBe("Decision point");
    expect(JSON.stringify(deck)).not.toContain("Decision: Target");
  });

  it("renders card and detail intents as a dedicated editorial-board archetype", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "実務で使う判断材料を整理する",
        audience: "意思決定者と実務担当者",
        desiredAction: "次の打ち手を選ぶ",
        intents: [
          {
            slideId: "detail-board",
            title: "判断材料",
            message: "主張と根拠を同じ画面で確認する。",
            evidence: ["根拠", "リスク", "次の判断", "確認資料"],
            quietInfo: [],
            visualType: "detail",
            emphasis: "判断材料"
          },
          {
            slideId: "card-board",
            title: "改善余地",
            message: "改善点を見える形で比較する。",
            evidence: ["写真", "数値", "章扉", "コンセプト図"],
            quietInfo: [],
            visualType: "cards",
            emphasis: "改善余地"
          }
        ]
      },
      { title: "編集ボードサンプル", locale: "ja-JP", contentMode: "presentation" }
    );

    expect(deck.slides.map((slide) => slide.layout)).toContain("message-editorial-board");
    expect(archetypeForIntent(deck.metadata.messageMap?.intents[0] as DeckMessageMap["intents"][number])).toBe("editorial-board");
    const editorial = deck.slides.find((slide) => slide.id === "detail-board");
    expect(editorial?.elements.some((element) => element.id === "detail-board-editorial-hero")).toBe(true);
    expect(editorial?.elements.filter((element) => element.id.includes("editorial-support-card")).length).toBeGreaterThanOrEqual(2);
    expect(editorial?.elements.filter((element) => element.id.includes("editorial-card-")).length).toBe(0);
    expect(reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("generates review-clean slides for long Japanese user-request topics", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "家族が箱根旅館を比較して予約候補を決める",
        audience: "三世代旅行を検討している家族",
        desiredAction: "候補を二つに絞って予約条件を確認する",
        intents: [
          {
            slideId: "cloud-migration-board-approval",
            title: "クラウド移行の取締役会承認に必要な投資判断とリスク整理",
            message: "投資判断に必要な論点を短く示す。",
            evidence: ["対象: 意思決定者", "観点: 投資判断", "表現: roadmap"],
            quietInfo: ["profile: adaptive+compact-copy+executive-summary+safe-contrast+expression-polish-5"],
            visualType: "step",
            emphasis: "投資判断"
          },
          {
            slideId: "hakone-ryokan-family-choice",
            title: "箱根旅館比較で家族全員が納得できる候補を選ぶ",
            message: "候補の違いを一目で見せる。",
            evidence: ["対象: 家族", "観点: 露天風呂と食事", "表現: comparison"],
            quietInfo: ["profile: adaptive+compact-copy+executive-summary+safe-contrast+expression-polish-5"],
            visualType: "matrix",
            emphasis: "候補比較"
          }
        ]
      },
      { title: "箱根旅館比較", locale: "ja-JP", contentMode: "report", styleProfile: "report" }
    );

    const issueCodes = new Set([
      ...lintDeckSpec(deck).issues.map((issue) => issue.code),
      ...reviewVisualQuality(deck).issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)
    ]);
    expect([...issueCodes]).not.toContain("content.title-too-long");
    expect([...issueCodes]).not.toContain("visual.truncated-text");
    expect([...issueCodes]).not.toContain("layout.compact-label-wrap");
  });

  it("does not leave cover titles ending with incomplete Japanese fragments", () => {
    const deck = createDeckFromMessageMap(
      {
        objective: "移行計画と初期予算の承認を得る",
        audience: "経営層、IT責任者、財務責任者",
        desiredAction: "移行計画と初期予算の承認を得る",
        intents: [
          {
            slideId: "current-state",
            title: "current state",
            message: "Current stateを判断に使える形にする。",
            evidence: ["対象: 経営層、IT責任者、財務責任者", "観点: current state"],
            quietInfo: [],
            visualType: "summary",
            emphasis: "current state"
          }
        ]
      },
      { title: "オンプレ環境からクラウドへ移行する計画を、経営会議で承認する", locale: "ja-JP", contentMode: "decision" }
    );

    const coverTitle = deck.slides[0]?.elements.find((element) => element.type === "text" && element.id === "cover-title");
    expect(coverTitle).toMatchObject({ type: "text" });
    const coverTitleText = coverTitle?.type === "text" ? coverTitle.text : "";
    expect(coverTitleText).not.toMatch(/[、,，・／\s]$/u);
    expect(coverTitleText).not.toMatch(/[、,，・／\s]\n/u);
    expect(coverTitleText).not.toMatch(/[経予承判移計をにのへ、]$/u);
    expect(coverTitleText).not.toContain("、経");
  });

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
    expect(slide?.layout).toBe("message-photo-hero");
    const visual = slide?.elements.find((element) => element.id === "official-context-photo");
    const backdrop = slide?.elements.find((element) => element.id === "official-context-photo-bg");
    expect(visual).toMatchObject({ type: "svg", sourceId: "official-page", citation: "Official page", altText: "Official service diagram" });
    if (!visual || visual.type !== "svg" || !backdrop || backdrop.type !== "shape") {
      throw new Error("Expected a generated SVG visual inside an image backdrop.");
    }
    expect(visual.w / visual.h).toBeCloseTo(120 / 80, 2);
    expect(visual.x).toBeGreaterThan(backdrop.x);
    expect(visual.y).toBeGreaterThan(backdrop.y);
    expect(visual.x + visual.w).toBeLessThan(backdrop.x + backdrop.w);
    expect(visual.y + visual.h).toBeLessThan(backdrop.y + backdrop.h);
    expect(slide?.elements.some((element) => element.id === "official-context-caption-panel")).toBe(true);
    expect(reviewVisualQuality(deck)).toEqual({ ok: true, issues: [] });
  });
});
