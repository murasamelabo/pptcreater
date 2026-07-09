import { describe, expect, it } from "vitest";
import { extractDocSpecFromMarkdown } from "./docSpec.js";

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

## 外部インターフェース

| 項目 | パラメータ名 | 内容 |
| --- | --- | --- |
| ユーザーID | \`userName\` / \`username\` | ログイン画面等で入力されたユーザーID |
| ユーザーパスワード | \`userPassword\` | ログイン画面等で入力されたパスワード |
| アプリケーションID | \`appName\` | 認証対象アプリケーションを識別するID |

## 内部実装の要点

| ファイル | 主な役割 |
| --- | --- |
| \`Web.config\` | セッション、MemoryCache設定 |
| \`Application.config\` | adUrl、adDomain、prohibitedGet、Expiration |
| \`NLog.config\` | ログ出力 |

## セキュリティ上の重要事項

- ROPC方式のためMFAを利用できない。
- PCIDSS等の要件を満たせない可能性がある。
- Entra ID、OIDC、OAuth 2.0、PKCE、Managed Identity、Graph APIの検討が必要。

## Entra化プロジェクト立ち上げ時のヒアリング項目

- 何をもってADをやめると定義するか。
- アプリ別移行方式判定表を作るか。
`;

describe("DocSpec markdown extraction", () => {
  it("preserves source sections, tables, diagrams, risks, questions, and required terms", () => {
    const spec = extractDocSpecFromMarkdown(AUTH_WEB_MARKDOWN, { sourceId: "auth-web", title: "認証Web" });

    expect(spec.sourceId).toBe("auth-web");
    expect(spec.title).toBe("認証Web");
    expect(spec.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["システムの目的", "全体構成", "外部インターフェース", "内部実装の要点", "セキュリティ上の重要事項"])
    );
    expect(spec.tables).toHaveLength(2);
    expect(spec.tables[0]).toMatchObject({ headers: ["項目", "パラメータ名", "内容"] });
    expect(spec.diagrams).toHaveLength(1);
    expect(spec.diagrams[0].source).toContain("flowchart LR");
    expect(spec.risks.map((risk) => risk.text).join("\n")).toContain("PCIDSS");
    expect(spec.openQuestions.map((question) => question.text)).toEqual(expect.arrayContaining(["何をもってADをやめると定義するか。"]));

    const requiredTerms = new Map(spec.requiredTerms.map((term) => [term.term, term]));
    for (const term of ["Active Directory", "userName", "username", "userPassword", "appName", "Web.config", "Application.config", "NLog.config", "MemoryCache", "Expiration", "ROPC", "MFA", "PCIDSS", "Entra ID", "OIDC", "OAuth", "PKCE", "Managed Identity", "Graph API", "LDAPS"]) {
      expect(requiredTerms.has(term), term).toBe(true);
    }
    expect(requiredTerms.get("userName")?.category).toBe("field");
    expect(requiredTerms.get("Application.config")?.category).toBe("config");
    expect(requiredTerms.get("PKCE")?.visibility).toBe("must-visible");
  });
});