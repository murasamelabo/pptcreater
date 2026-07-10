import { describe, expect, it } from "vitest";
import { extractDocSpecFromMarkdown } from "./docSpec.js";
import { createInformationLedger, createMessageSpecFromDocSpec, deckMessageMapFromMessageSpec, reviewMessageSpec, type MessageSpec } from "./messageSpec.js";

const AUTH_WEB_MARKDOWN = `# 認証Web 仕様理解まとめ

## システムの目的

認証Webは、ゲストシステムアプリケーションがCRANEのActive Directory上のユーザー情報を利用して認証・ユーザー情報取得を行うための共通基盤です。

## 全体構成

\`\`\`mermaid
flowchart LR
  User[ユーザー] --> App[ゲストシステム / アプリケーション]
  App -->|userName / userPassword / appName| AuthWeb[認証Web]
  AuthWeb -->|LDAPS| AD[CRANE Active Directory]
\`\`\`

## 提供機能

- ユーザーID・パスワードによる認証代行
- Active Directoryからのユーザー情報取得
- 所属セキュリティグループ情報の取得

## 外部インターフェース

| 項目 | パラメータ名 | 内容 |
| --- | --- | --- |
| ユーザーID | \`userName\` / \`username\` | ログイン画面等で入力されたユーザーID |
| ユーザーパスワード | \`userPassword\` | ログイン画面等で入力されたパスワード |
| アプリケーションID | \`appName\` | 認証対象アプリケーションを識別するID |

## 返却形式

接続先URLにより、以下3種類の返却形式を選択できます。
返却される主な情報は以下です。
認証結果コード

| 形式 | 内容 |
| --- | --- |
| 改行区切り形式 | LF区切り |
| 簡易XML形式 | sAMAccountName, memberOf, GroupNameを返す |

## 認証結果コード

| コード | 意味 | 主な原因 |
| --- | --- | --- |
| 00 | 正常 | 認証成功 |
| 01 | ADログイン不可 | ID・PW不正 |
| 02 | ユーザー情報取得不可 | 必須属性不足 |

## アプリケーション側の責務

- ログイン画面の実装
- 認証Web呼び出し処理
- 所属グループを使った権限制御

## 内部実装の要点

| ファイル | 主な役割 |
| --- | --- |
| \`Web.config\` | セッション、MemoryCache設定 |
| \`Application.config\` | adUrl、adDomain、prohibitedGet、Expiration |
| \`NLog.config\` | ログ出力 |

## キャッシュ仕様

MemoryCacheでAD問い合わせを抑えるが、ADロック挙動に注意する。

## セキュリティ上の重要事項

- ROPC方式のためMFAを利用できない。
- PCIDSS等の要件を満たせない可能性がある。
- Entra ID、OIDC、OAuth 2.0、PKCE、Managed Identity、Graph APIの検討が必要。

## Entra化プロジェクト立ち上げ時のヒアリング項目

- 何をもってADをやめると定義するか。
- アプリ別移行方式判定表を作るか。
`;

const GENERIC_TECHNICAL_MARKDOWN = `# XAA / ID-JAG 技術解説

## 基本概念

ID-JAGは、IdPがアプリ間APIアクセスを許可したことを示す短命JWTです。

## 登場ロールと信頼

- Clientはユーザー代理アクセスを要求する。
- IdPはポリシーを評価してID-JAGを発行する。
- Resource AppはIdPのJWKSで署名を検証する。

## Token Exchange

RFC 8693のToken ExchangeでID TokenをID-JAGへ交換します。

| パラメータ | 値 |
| --- | --- |
| grant_type | urn:ietf:params:oauth:grant-type:token-exchange |
| requested_token_type | urn:ietf:params:oauth:token-type:id-jag |

## Resource側検証

RFC 7523 JWT BearerでID-JAGを提示し、aud、client_id、exp、scopeを検証します。

## 導入評価

既存OBOとの差、短命性、集中統制、MCPとの接続を評価します。
`;

const GENERIC_LABEL_MARKDOWN = `# 統制要件

## エンタープライズが必要とするもの

- アプリ間連携の**集中可視化**
- セキュリティチームが管理する**ポリシーベースのアクセス制御**
- **短命で自動失効する**クレデンシャル
- どのアプリがいつ何にアクセスしたかの**監査証跡**
- 単一ポイントからの**即時失効(キルスイッチ)**
- → これらがID-JAG/XAAの設計目標。
`;

describe("MessageSpec generation", () => {
  it("creates a generic technical report in source chapter order without auth-web assumptions", () => {
    const docSpec = extractDocSpecFromMarkdown(GENERIC_TECHNICAL_MARKDOWN, { sourceId: "xaa", title: "XAA / ID-JAG 技術解説" });
    const messageSpec = createMessageSpecFromDocSpec(docSpec, { strategy: "generic-technical-report" });
    const visibleText = messageSpec.slides
      .flatMap((slide) => [slide.semanticTitle, slide.headline, slide.primaryClaim, ...slide.supportingBlocks.flatMap((block) => [block.label, block.text])])
      .join("\n");

    expect(messageSpec.strategy).toBe("generic-technical-report");
    expect(messageSpec.slides.filter((slide) => !slide.id.startsWith("chapter-") && !["agenda", "technical-summary"].includes(slide.id)).map((slide) => slide.semanticTitle)).toEqual([
      "基本概念",
      "登場ロールと信頼",
      "Token Exchange",
      "Resource側検証",
      "導入評価"
    ]);
    expect(messageSpec.sourceCoverage.sectionCoverage.every((section) => section.status === "visible")).toBe(true);
    expect(visibleText).toContain("RFC 8693");
    expect(visibleText).toContain("RFC 7523");
    expect(visibleText).toContain("requested_token_type");
    expect(visibleText).not.toMatch(/CRANE|認証Web|ROPC方式の制約/u);
  });

  it("keeps all selected evidence in the DeckMessageMap instead of silently capping it", () => {
    const markdown = `# Technical report\n\n## Controls\n\n${Array.from({ length: 9 }, (_, index) => `- Control ${index + 1}: Evidence ${index + 1}`).join("\n")}`;
    const docSpec = extractDocSpecFromMarkdown(markdown, { sourceId: "controls", title: "Controls" });
    const messageSpec = createMessageSpecFromDocSpec(docSpec, { strategy: "generic-technical-report" });
    const messageMap = deckMessageMapFromMessageSpec(messageSpec);

    const controls = messageMap.intents.find((intent) => intent.slideId === docSpec.sections.find((section) => section.title === "Controls")?.id);
    expect(controls?.evidence).toContain("Control 9: Evidence 9");
    expect(controls?.evidence.length).toBeGreaterThanOrEqual(9);
  });

  it("derives distinct semantic labels for unkeyed generic Markdown bullets", () => {
    const docSpec = extractDocSpecFromMarkdown(GENERIC_LABEL_MARKDOWN, { sourceId: "controls", title: "統制要件" });
    const messageSpec = createMessageSpecFromDocSpec(docSpec, { strategy: "generic-technical-report" });
    const contentSlide = messageSpec.slides.find((slide) => slide.semanticTitle === "エンタープライズが必要とするもの");

    expect(contentSlide?.supportingBlocks.map((block) => block.label)).toEqual([
      "集中可視化",
      "ポリシーベースのアクセス制御",
      "短命クレデンシャル",
      "監査証跡",
      "即時失効(キルスイッチ)",
      "設計目標"
    ]);
    expect(contentSlide?.supportingBlocks.map((block) => block.label)).not.toContain("項目 2");
  });

  it("rejects unexplained source omissions in generic technical reports", () => {
    const docSpec = extractDocSpecFromMarkdown(GENERIC_TECHNICAL_MARKDOWN, { sourceId: "xaa", title: "XAA" });
    const messageSpec = createMessageSpecFromDocSpec(docSpec, { strategy: "generic-technical-report" });
    messageSpec.sourceCoverage.sectionCoverage[1] = { ...messageSpec.sourceCoverage.sectionCoverage[1], status: "omitted" };

    const review = reviewMessageSpec(messageSpec, {
      minSlides: 1,
      minTotalVisibleChars: 1,
      preferredAverageVisibleChars: 1,
      minSectionCoverageRatio: 0,
      minRequiredTermCoverageRatio: 0
    });

    expect(review.issues.map((issue) => issue.code)).toContain("message-spec.omission-reason-missing");
  });

  it("creates a source-faithful MessageSpec and derived DeckMessageMap from DocSpec", () => {
    const docSpec = extractDocSpecFromMarkdown(AUTH_WEB_MARKDOWN, { sourceId: "auth-web", title: "認証Web" });
    const ledger = createInformationLedger(docSpec);
    const messageSpec = createMessageSpecFromDocSpec(docSpec, { strategy: "auth-web-spec", audience: "担当者", desiredAction: "棚卸しする" });
    const messageMap = deckMessageMapFromMessageSpec(messageSpec);
    const review = reviewMessageSpec(messageSpec, { minSlides: 8, minTotalVisibleChars: 900, preferredAverageVisibleChars: 120 });

    expect(ledger.terms.map((term) => term.term)).toEqual(expect.arrayContaining(["Active Directory", "memberOf", "GroupName", "PKCE", "Graph API"]));
    expect(review.ok).toBe(true);
    expect(review.metrics.visibleMustTerms).toBe(review.metrics.mustVisibleTerms);
    expect(messageSpec.slides.map((slide) => slide.semanticTitle)).toEqual(
      expect.arrayContaining(["システムの目的", "全体構成", "外部インターフェース", "認証結果コード", "内部実装と設定ファイル", "リスク"])
    );
    expect(messageSpec.sourceCoverage.requiredTermCoverage.find((item) => item.term === "PKCE")?.status).toBe("visible");
    expect(messageSpec.sourceCoverage.requiredTermCoverage.find((item) => item.term === "Graph API")?.status).toBe("visible");

    const architecture = messageMap.intents.find((intent) => intent.slideId === "architecture");
    expect(architecture?.visualType).toBe("native-diagram");
    expect(architecture?.diagram?.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(["認証Web", "AD"]));

    const resultCodes = messageMap.intents.find((intent) => intent.slideId === "result-codes");
    expect(resultCodes?.evidence).toEqual(expect.arrayContaining(["01: ADログイン不可 / ID・PW不正"]));
    expect(resultCodes?.details?.some((detail) => detail.startsWith("01:"))).toBe(false);
    expect(resultCodes?.details).toEqual(expect.arrayContaining(["補足 01: ADログイン不可 / ID・PW不正"]));

    const responseFormat = messageMap.intents.find((intent) => intent.slideId === "response-format");
    expect(responseFormat?.evidence).toContain("形式選択: 接続先URLで3種類から選択");
    expect(responseFormat?.evidence.some((item) => /返却内容: 返却される主な情報/u.test(item))).toBe(false);
    expect(responseFormat?.evidence).not.toContain("結果コード: 認証結果コード");

    const visibleText = messageMap.intents.flatMap((intent) => [intent.title, intent.message, intent.emphasis ?? "", ...intent.evidence]).join("\n");
    for (const term of ["Active Directory", "memberOf", "GroupName", "Expiration", "PCIDSS", "OAuth", "PKCE", "Managed Identity", "Graph API"]) {
      expect(visibleText, term).toContain(term);
    }
    expect(visibleText).not.toContain("重要語:");
    expect(visibleText).toMatch(/(?:方式判定|移行判断): .*OAuth.*PKCE.*Managed Identity/u);
    expect(visibleText).toContain("返却項目: sAMAccountName / memberOf / GroupName");
  });

  it("rejects thin MessageSpecs that drop visible source terms or semantic titles", () => {
    const thin: MessageSpec = {
      title: "thin",
      thesis: "thin",
      audience: "reader",
      desiredAction: "act",
      requiredTerms: [
        { term: "PKCE", sourceSectionIds: ["s"], category: "protocol", visibility: "must-visible" },
        { term: "Graph API", sourceSectionIds: ["s"], category: "product", visibility: "must-visible" }
      ],
      sourceCoverage: {
        sectionCoverage: [{ sectionId: "s", title: "Source", status: "visible" }],
        requiredTermCoverage: [
          { term: "PKCE", visibility: "must-visible", status: "missing" },
          { term: "Graph API", visibility: "must-visible", status: "missing" }
        ]
      },
      slides: [
        {
          id: "key",
          semanticTitle: "KEY",
          headline: "薄い説明",
          slideRole: "process",
          chapterId: "c",
          visibleBudget: { minChars: 180, targetChars: 250, maxChars: 340 },
          sourceSections: ["s"],
          requiredTerms: [],
          primaryClaim: "短い。",
          supportingBlocks: [],
          figureNeed: { kind: "architecture", rationale: "needs figure" },
          notesBlocks: []
        }
      ]
    };

    const review = reviewMessageSpec(thin);

    expect(review.ok).toBe(false);
    expect(review.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "message-spec.slide-count-out-of-range",
        "message-spec.visible-text-too-thin",
        "message-spec.required-term-missing",
        "message-spec.non-semantic-title",
        "message-spec.figure-without-text-rail"
      ])
    );
  });

  it("rejects comparison slides without explicit comparable columns", () => {
    const badComparison: MessageSpec = {
      title: "bad comparison",
      thesis: "bad comparison",
      audience: "reader",
      desiredAction: "act",
      requiredTerms: [],
      sourceCoverage: { sectionCoverage: [{ sectionId: "s", title: "Source", status: "visible" }], requiredTermCoverage: [] },
      slides: Array.from({ length: 12 }, (_, index) => ({
        id: `slide-${index + 1}`,
        semanticTitle: index === 0 ? "責任分界" : `意味タイトル ${index + 1}`,
        headline: "意味のある見出し",
        slideRole: index === 0 ? "comparison" : "data",
        chapterId: "c",
        visibleBudget: { minChars: 180, targetChars: 250, maxChars: 340 },
        sourceSections: ["s"],
        requiredTerms: [],
        primaryClaim: "責任分界を確認する。",
        supportingBlocks:
          index === 0
            ? [
                { id: "b1", label: "要点 1", text: "認証Web", sourceSectionIds: ["s"], requiredTerms: [] },
                { id: "b2", label: "要点 2", text: "ログイン画面の実装", sourceSectionIds: ["s"], requiredTerms: [] },
                { id: "b3", label: "要点 3", text: "入力チェック", sourceSectionIds: ["s"], requiredTerms: [] }
              ]
            : [
                { id: `b${index}-1`, label: "要点", text: "十分な説明文をここに入れて可視テキスト量を確保する。", sourceSectionIds: ["s"], requiredTerms: [] },
                { id: `b${index}-2`, label: "補足", text: "比較ではない通常スライドの補足説明を入れる。", sourceSectionIds: ["s"], requiredTerms: [] }
              ],
        figureNeed: index === 0 ? { kind: "comparison", rationale: "bad" } : { kind: "table", rationale: "ok" },
        notesBlocks: []
      }))
    };

    const review = reviewMessageSpec(badComparison, { minTotalVisibleChars: 100, preferredAverageVisibleChars: 20 });

    expect(review.ok).toBe(false);
    expect(review.issues.map((issue) => issue.code)).toContain("message-spec.comparison-structure-missing");
    expect(review.issues.map((issue) => issue.code)).toContain("message-spec.generic-visible-label");
  });
});