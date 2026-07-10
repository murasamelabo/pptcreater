import { describe, expect, it } from "vitest";
import { createDeckFromMessageMap, materializeExpressionCandidateDecks } from "./messageDeck.js";
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
    expect(artifacts.expressionCandidateSets).toHaveLength(MESSAGE_MAP.intents.length);
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

  it("routes summary intents to a readable evidence-board grammar", () => {
    const artifacts = createNarrativePlanArtifacts(MESSAGE_MAP, { locale: "ja-JP", contentMode: "decision" });

    expect(artifacts.expressionPlans[0].selectedGrammarId).toBe("evidence-board");
  });

  it("does not turn unstructured prose fragments into a table based on count alone", () => {
    const map: DeckMessageMap = {
      objective: "技術概念を説明する",
      audience: "設計者",
      desiredAction: "概念を理解する",
      intents: [{
        slideId: "prose-explanation",
        title: "エグゼクティブサマリ",
        message: "ID-JAGの位置づけを説明する。",
        evidence: [
          "ID-JAGはOAuth拡張です。",
          "企業のIdPが許可を判断します。",
          "短命JWTを発行します。",
          "Resource Appが署名を検証します。",
          "従来の長命APIキーを置き換えます。",
          "監査可能な委任を実現します。"
        ],
        contentStructure: "prose",
        quietInfo: [],
        visualType: "summary",
        emphasis: "短命な委任"
      }]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "technical" });

    expect(artifacts.expressionPlans[0].selectedGrammarId).toBe("detail-reading-page");
    expect(artifacts.expressionPlans[0].selectedGrammarId).not.toBe("table-text-system");
  });

  it("uses SlideIntent slideRole as a visual grammar prior", () => {
    const map: DeckMessageMap = {
      objective: "スライド役割ごとに表現を選ぶ",
      audience: "資料作成者",
      desiredAction: "MessageSpecにslideRoleを入れる",
      intents: [
        {
          slideId: "policy-detail",
          title: "ポリシー詳細",
          message: "例外条件は本文で読める形にする。",
          slideRole: "detail",
          evidence: ["対象", "例外", "承認条件"],
          quietInfo: [],
          visualType: "summary",
          emphasis: "本文で読める"
        },
        {
          slideId: "plan-compare",
          title: "プラン比較",
          message: "FreeとProは統制要件で選び分ける。",
          slideRole: "comparison",
          evidence: ["Free", "Pro", "Enterprise"],
          quietInfo: [],
          visualType: "summary",
          emphasis: "統制要件"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "handout" });

    expect(artifacts.slideBriefs.map((brief) => brief.role)).toEqual(["detail", "comparison"]);
    expect(artifacts.expressionPlans.map((plan) => plan.selectedGrammarId)).toEqual(["detail-reading-page", "comparison-field"]);
  });

  it("creates slide communication contracts before selecting visual grammar", () => {
    const map: DeckMessageMap = {
      objective: "認証Webとアプリの責任分界を合意する",
      audience: "アプリ開発者と認証基盤担当者",
      desiredAction: "実装責任を確認する",
      intents: [
        {
          slideId: "responsibility-boundary",
          title: "責任分界",
          message: "認証Webは本人確認、アプリは認可判断を担う。",
          slideRole: "comparison",
          evidence: [
            "本人確認: 認証Web / アプリは結果を利用",
            "認可判断: 認証Webは対象外 / アプリが実施"
          ],
          quietInfo: ["認証結果コードを境界にする"],
          visualType: "table",
          emphasis: "本人確認と認可判断を分離"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "handout" });
    const contract = artifacts.communicationContracts[0];

    expect(contract.slideId).toBe("responsibility-boundary");
    expect(contract.relation).toBe("responsibility");
    expect(contract.entities).toEqual(expect.arrayContaining(["認証Web", "アプリ"]));
    expect(contract.comparisonAxes).toEqual(expect.arrayContaining(["本人確認", "認可判断"]));
    expect(contract.readerTest).toContain("誰が");
    expect(contract.forbiddenLosses).toEqual(expect.arrayContaining(["認証結果コードを境界にする"]));
    expect(artifacts.expressionPlans[0].communicationContractId).toBe(contract.id);
    expect(artifacts.expressionPlans[0].rationale).toContain("responsibility");

    const candidateSet = artifacts.expressionCandidateSets[0];
    expect(candidateSet.slideId).toBe("responsibility-boundary");
    expect(candidateSet.selectionPolicy).toBe("primary-grammar-until-rendered");
    expect(candidateSet.candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidateSet.selectedCandidateId).toBe(candidateSet.candidates[0].id);
    expect(candidateSet.candidates[0].grammarId).toBe("comparison-field");
    expect(candidateSet.candidates[0].scores.accuracy).toBeGreaterThanOrEqual(90);
    expect(candidateSet.candidates[0].accuracyGate.passed).toBe(true);
    expect(candidateSet.candidates.map((candidate) => candidate.scoreRank).sort()).toEqual([1, 2, 3]);
    expect(candidateSet.candidates.every((candidate) => candidate.scores.total >= 0 && candidate.scores.total <= 100)).toBe(true);
    expect(artifacts.expressionPlans[0].selectedCandidateId).toBe(candidateSet.selectedCandidateId);
  });

  it("uses an explicit two-axis communication relation for decision surfaces", () => {
    const map: DeckMessageMap = {
      objective: "優先順位を決める",
      audience: "意思決定者",
      desiredAction: "PoC対象を選ぶ",
      intents: [
        {
          slideId: "priority-matrix",
          title: "優先順位",
          message: "統制強度と実装負荷の二軸でPoC対象を選ぶ。",
          slideRole: "decision",
          evidence: ["低負荷・高統制", "高負荷・高統制", "低負荷・低統制"],
          quietInfo: [],
          visualType: "summary",
          emphasis: "二軸で選ぶ"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "decision" });

    expect(artifacts.communicationContracts[0].relation).toBe("tradeoff");
    expect(artifacts.communicationContracts[0].comparisonAxes).toEqual(["統制強度", "実装負荷"]);
    expect(artifacts.expressionPlans[0].selectedGrammarId).toBe("decision-surface");

    const candidateSet = artifacts.expressionCandidateSets[0];
    const selected = candidateSet.candidates.find((candidate) => candidate.id === candidateSet.selectedCandidateId);
    expect(selected?.grammarId).toBe("decision-surface");
    expect(selected?.selectionReasons).toEqual(expect.arrayContaining([expect.stringContaining("tradeoff")]));
    expect(candidateSet.candidates.filter((candidate) => candidate.accuracyGate.passed).length).toBeGreaterThanOrEqual(1);
    expect(candidateSet.candidates.some((candidate) => !candidate.accuracyGate.passed)).toBe(true);
  });

  it("materializes ranked candidates as isolated DeckSpecs with deterministic review evidence", () => {
    const map: DeckMessageMap = {
      objective: "運用条件を整理する",
      audience: "実務担当者",
      desiredAction: "運用方針を確認する",
      intents: [
        {
          slideId: "operations",
          title: "運用条件",
          message: "運用条件を分類して確認する。",
          evidence: ["監視: ログを確認", "期限: Expirationを確認", "障害: 結果コードを確認"],
          details: ["担当者を決める"],
          quietInfo: [],
          visualType: "summary",
          emphasis: "運用条件"
        }
      ]
    };

    const result = materializeExpressionCandidateDecks(map, {
      title: "Candidate materialization",
      locale: "ja-JP",
      contentMode: "handout"
    });

    expect(result.candidateDecks).toHaveLength(3);
    expect(new Set(result.candidateDecks.map((candidate) => candidate.grammarId)).size).toBe(3);
    for (const candidate of result.candidateDecks) {
      expect(candidate.deck.slides).toHaveLength(1);
      expect(candidate.deck.slides[0].layout).toBe(`message-grammar-${candidate.grammarId}`);
      expect(candidate.evaluation.accuracy).toBeGreaterThanOrEqual(0);
      expect(candidate.evaluation.clarity).toBeGreaterThanOrEqual(0);
      expect(candidate.evaluation.beauty).toBeGreaterThanOrEqual(0);
      expect(candidate.evaluation.reviewEvidence.blockingCount).toBeGreaterThanOrEqual(0);
      expect(candidate.evaluation.reviewEvidence.visualErrorCount).toBeGreaterThanOrEqual(0);
      expect(candidate.evaluation.reviewEvidence.qualityOverall).toBeGreaterThanOrEqual(0);
    }
    expect(result.selectedCandidateId).toBe(result.planningCandidateSet.selectedCandidateId);
    expect(result.selectionPolicy).toBe("primary-grammar-until-rendered");
  });

  it("materializes structured comparison candidates with distinct grammar elements", () => {
    const map: DeckMessageMap = {
      objective: "責任分界を合意する",
      audience: "開発担当者",
      desiredAction: "担当を確定する",
      intents: [
        {
          slideId: "responsibility",
          title: "責任分界",
          message: "認証Webは認証と情報取得まで、認可判断はアプリ側。",
          slideRole: "comparison",
          evidence: [
            "責務: 認証Web / アプリ側",
            "本人確認: ADへの認証問い合わせ / ログイン画面・入力チェック",
            "情報取得: ユーザー属性・所属グループ取得 / 認証Web呼び出し",
            "結果処理: 結果コード・返却形式を返す / 結果コード判定・エラー表示"
          ],
          quietInfo: [],
          visualType: "contrast",
          emphasis: "認証と認可を分離"
        }
      ]
    };

    const result = materializeExpressionCandidateDecks(map, {
      title: "Structured comparison candidates",
      locale: "ja-JP",
      contentMode: "handout"
    });
    const elementsByGrammar = new Map(result.candidateDecks.map((candidate) => [
      candidate.grammarId,
      candidate.deck.slides[0].elements.map((element) => element.id)
    ]));

    expect(elementsByGrammar.get("comparison-field")).toEqual(expect.arrayContaining(["responsibility-ctable-h-label"]));
    expect(elementsByGrammar.get("table-text-system")).toEqual(expect.arrayContaining(["responsibility-table-stage"]));
    expect(elementsByGrammar.get("evidence-board")).toEqual(expect.arrayContaining(["responsibility-narrative-evidence-field"]));
    expect(new Set([...elementsByGrammar.values()].map((ids) => ids.join("|"))).size).toBe(3);
  });

  it("does not force list-like matrix intents into repeated two-axis maps", () => {
    const map: DeckMessageMap = {
      objective: "統制要件を整理する",
      audience: "セキュリティアーキテクト",
      desiredAction: "評価観点を確認する",
      intents: [
        {
          slideId: "controls",
          title: "必要な統制",
          message: "企業が欲しいのは、IdP中心の統制面である。",
          evidence: ["集中ビュー", "許可/拒否", "短命認証", "監査証跡", "即時失効"],
          quietInfo: [],
          visualType: "matrix",
          emphasis: "IdP中心の統制面"
        },
        {
          slideId: "true-matrix",
          title: "優先順位マトリクス",
          message: "統制強度と実装負荷の二軸で優先度を決める。",
          evidence: ["低負荷・高統制", "高負荷・高統制", "低負荷・低統制"],
          quietInfo: [],
          visualType: "matrix",
          emphasis: "二軸で優先度を決める"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "handout" });

    expect(artifacts.expressionPlans[0].selectedGrammarId).toBe("table-text-system");
    expect(artifacts.expressionPlans[1].selectedGrammarId).toBe("decision-surface");
  });

  it("does not turn map-like requests into spatial diagrams without structural data", () => {
    const map: DeckMessageMap = {
      objective: "関係する要素を説明する",
      audience: "実務担当者",
      desiredAction: "論点を確認する",
      intents: [
        {
          slideId: "loose-map",
          title: "関係整理",
          message: "関係する論点を同じ面で確認する。",
          evidence: ["論点A", "論点B", "論点C"],
          quietInfo: [],
          visualType: "map",
          emphasis: "論点整理"
        },
        {
          slideId: "structured-map",
          title: "三者関係",
          message: "三者の接続関係を示す。",
          evidence: ["Client", "IdP", "Resource"],
          quietInfo: [],
          visualType: "map",
          emphasis: "三者関係",
          diagram: {
            direction: "LR",
            nodes: [
              { id: "client", label: "Client" },
              { id: "idp", label: "IdP" },
              { id: "resource", label: "Resource" }
            ],
            edges: [
              { from: "client", to: "idp" },
              { from: "idp", to: "resource" }
            ],
            groups: []
          }
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "handout" });

    expect(artifacts.expressionPlans[0].selectedGrammarId).toBe("evidence-board");
    expect(artifacts.expressionPlans[1].selectedGrammarId).toBe("spatial-model");
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

  it("keeps source details and traces in planning artifacts", () => {
    const map: DeckMessageMap = {
      objective: "ID-JAGを説明する",
      audience: "アーキテクト",
      desiredAction: "仕様差分を確認する",
      intents: [
        {
          slideId: "jwt-claims",
          title: "JWTクレーム",
          message: "ID-JAGはaud/client_id/typで利用先と呼び出し元を縛る。",
          evidence: ["audはリソースアプリtoken endpoint", "client_idは要求クライアント"],
          details: ["typ=oauth-id-jag+jwt", "jti/exp/iatを必須にする"],
          sourceTrace: ["§4.4 ID-JAG JWT のクレーム"],
          quietInfo: ["RFC 7523 JWT Bearer"],
          visualType: "detail",
          emphasis: "aud/client_id/typ"
        }
      ]
    };

    const artifacts = createNarrativePlanArtifacts(map, { locale: "ja-JP", contentMode: "handout" });
    const informationText = artifacts.slideBriefs[0].informationUnits.map((unit) => unit.text).join("\n");

    expect(informationText).toContain("typ=oauth-id-jag+jwt");
    expect(informationText).toContain("§4.4 ID-JAG JWT のクレーム");
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
    // Roles/relationships without explicit diagram structure must not be forced into fake maps.
    expect(deck.slides.find((slide) => slide.id === "actors")?.layout).toBe("message-grammar-evidence-board");
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