import type { LintIssue, LintReport } from "./lint.js";
import type { Locale } from "./schema.js";

export type MessageKey =
  | "cli.created"
  | "cli.noLintIssues"
  | "cli.rendered"
  | "cli.lintWarnings"
  | "cli.studioCreated"
  | "cli.unsupportedLocale";

type MessageParams = Record<string, number | string | undefined>;
type MessageDictionary = Record<MessageKey, (params: MessageParams) => string>;

const CLI_MESSAGES: Record<Locale, MessageDictionary> = {
  "en-US": {
    "cli.created": ({ path }) => `Created ${path}`,
    "cli.noLintIssues": () => "No lint issues.",
    "cli.rendered": ({ path }) => `Rendered ${path}`,
    "cli.lintWarnings": ({ count }) => `Lint warnings: ${count}`,
    "cli.studioCreated": ({ path }) => `Created Studio preview ${path}`,
    "cli.unsupportedLocale": ({ locale }) => `Unsupported locale: ${locale}`
  },
  "ja-JP": {
    "cli.created": ({ path }) => `${path} を作成しました`,
    "cli.noLintIssues": () => "lintの指摘はありません。",
    "cli.rendered": ({ path }) => `${path} を生成しました`,
    "cli.lintWarnings": ({ count }) => `lint警告: ${count}件`,
    "cli.studioCreated": ({ path }) => `Studioプレビュー ${path} を作成しました`,
    "cli.unsupportedLocale": ({ locale }) => `未対応のロケールです: ${locale}`
  }
};

const LINT_MESSAGES: Record<Locale, Record<string, (issue: LintIssue) => string>> = {
  "en-US": {
    "slide.text-density": () => "Slide is text-heavy. Keep each slide focused on one message and move detail to speaker notes.",
    "element.duplicate-id": (issue) => `Duplicate element id "${issue.details?.elementId ?? ""}".`,
    "element.reading-order-missing": () => "Element is missing an explicit readingOrder value.",
    "element.reading-order-duplicate": () => "Two elements share the same reading order.",
    "text.small-font": (issue) =>
      `Text font size ${issue.details?.fontSize ?? "?"}pt is below the recommended ${issue.details?.minimum ?? "?"}pt for ${issue.details?.role ?? "text"}.`,
    "text.long-copy": () => "Text block is long. Prefer concise phrases and move detail to notes.",
    "text.low-contrast": (issue) =>
      `Text contrast ratio ${issue.details?.ratio ?? "?"} is below ${issue.details?.minimumRatio ?? "?"}:1.`,
    "visual.alt-text-missing": () => "Non-decorative visual elements require concise altText.",
    "diagram.long-description-short": () => "Complex diagrams should include a useful longDescription for speaker notes and accessibility review.",
    "slide.title-duplicate": () => "Each slide needs a unique, descriptive title for navigation."
  },
  "ja-JP": {
    "slide.text-density": () => "スライドの文字量が多すぎます。1スライド1メッセージに絞り、詳細はspeaker notesへ移してください。",
    "element.duplicate-id": (issue) => `要素ID "${issue.details?.elementId ?? ""}" が重複しています。`,
    "element.reading-order-missing": () => "要素に明示的なreadingOrderがありません。",
    "element.reading-order-duplicate": () => "複数の要素が同じreadingOrderを持っています。",
    "text.small-font": (issue) =>
      `フォントサイズ ${issue.details?.fontSize ?? "?"}pt は ${issue.details?.role ?? "text"} 推奨値 ${issue.details?.minimum ?? "?"}pt を下回っています。`,
    "text.long-copy": () => "テキストブロックが長すぎます。簡潔なフレーズにし、詳細はnotesへ移してください。",
    "text.low-contrast": (issue) =>
      `テキストのコントラスト比 ${issue.details?.ratio ?? "?"} は基準 ${issue.details?.minimumRatio ?? "?"}:1 を下回っています。`,
    "visual.alt-text-missing": () => "装飾目的ではない視覚要素には、簡潔なaltTextが必要です。",
    "diagram.long-description-short": () => "複雑な図には、speaker notesとアクセシビリティ確認に使えるlongDescriptionを追加してください。",
    "slide.title-duplicate": () => "各スライドには、ナビゲーション用の一意で説明的なタイトルが必要です。"
  }
};

export function cliMessage(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return CLI_MESSAGES[locale][key](params);
}

export function localizeLintIssue(issue: LintIssue, locale: Locale): LintIssue {
  return {
    ...issue,
    message: LINT_MESSAGES[locale][issue.code]?.(issue) ?? issue.message
  };
}

export function localizeLintReport(report: LintReport, locale: Locale): LintReport {
  return {
    ok: report.ok,
    issues: report.issues.map((issue) => localizeLintIssue(issue, locale))
  };
}
