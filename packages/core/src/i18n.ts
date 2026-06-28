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
    "layout.text-too-small-to-read": (issue) =>
      `Text font size ${issue.details?.fontSize ?? "?"}pt is below the practical readable minimum ${issue.details?.minimum ?? "?"}pt for ${issue.details?.role ?? "text"}.`,
    "layout.card-accent-bar-unshaped": () => "A square accent bar is flush with a rounded card edge. Run layout polish so the bar is inset and rounded.",
    "text.long-copy": () => "Text block is long. Prefer concise phrases and move detail to notes.",
    "text.low-contrast": (issue) =>
      `Text contrast ratio ${issue.details?.ratio ?? "?"} is below ${issue.details?.minimumRatio ?? "?"}:1.`,
    "visual.alt-text-missing": () => "Non-decorative visual elements require concise altText.",
    "visual.svg-text-too-small": (issue) =>
      `Embedded SVG text will render too small (${issue.details?.effectiveFontSize ?? "?"}pt). Enlarge the diagram, simplify labels, or split the visual.`,
    "visual.svg-text-small": (issue) =>
      `Embedded SVG text may be hard to read after scaling (${issue.details?.effectiveFontSize ?? "?"}pt).`,
    "visual.richness-missing": () => "Plain content slides need visual structure such as a schematic, diagram, icon/card composition, or image. For intentional text-rich slides, use a detail/prose/structured-text layout with clear hierarchy.",
    "visual.richness-deck": (issue) =>
      `Deck is too text-heavy for pptcreater output (${issue.details?.richSlides ?? "?"}/${issue.details?.contentSlides ?? "?"} rich content slides). Add diagrams, schematics, icons, or images.`,
    "diagram.long-description-short": () => "Complex diagrams should include a useful longDescription for speaker notes and accessibility review.",
    "diagram.visible-labels-missing": () =>
      "The diagram SVG has shapes/connectors but no visible labels. Add SVG <text> labels/callouts or rebuild it with generate_diagram/generate_schematic; alt text alone is not visible.",
    "diagram.image-svg-not-editable": () =>
      "This looks like a diagram embedded as an SVG image. Recreate it with generate_native_diagram so boxes, connectors, and labels remain editable PowerPoint objects; use image SVG only when exact fidelity is required.",
    "diagram.native-connectors": () =>
      "This connected diagram uses hand-placed arrow shapes. Use generate_native_diagram for editable PowerPoint objects with automatic spacing and connector routing.",
    "source.reference-slide-missing": (issue) =>
      `Add a final references slide that lists the actual external source URLs (${issue.details?.sourceCount ?? "?"} source(s)).`,
    "slide.title-duplicate": () => "Each slide needs a unique, descriptive title for navigation.",
    "content.title-generic": () => "Slide title is generic. Use a title that explains this slide's specific point.",
    "content.title-too-long": (issue) =>
      `Slide title is too long for ${issue.details?.contentMode ?? "this"} mode (current ${issue.details?.length ?? issue.details?.words ?? "?"}, recommended maximum ${issue.details?.maximum ?? "?"}).`,
    "content.ja-title-claim-like": () => "For Japanese report/technical decks, keep the title as a concise topic label and move the claim to a slide message.",
    "content.ja-message-missing": () => "Add a concise slide message below the title so the claim is separated from the topic label.",
    "content.message-too-long": () => "Slide message is too long. Keep it to one concise claim and move detail to notes.",
    "content.body-prose": () => "Body text reads like prose. Convert it into evidence chunks, a table/schematic, or speaker notes.",
    "content.too-many-bullets": () => "Too many bullets increase cognitive load. Group them into fewer chunks or use a table/flow visual."
  },
  "ja-JP": {
    "slide.text-density": () => "スライドの文字量が多すぎます。1スライド1メッセージに絞り、詳細はspeaker notesへ移してください。",
    "element.duplicate-id": (issue) => `要素ID "${issue.details?.elementId ?? ""}" が重複しています。`,
    "element.reading-order-missing": () => "要素に明示的なreadingOrderがありません。",
    "element.reading-order-duplicate": () => "複数の要素が同じreadingOrderを持っています。",
    "text.small-font": (issue) =>
      `フォントサイズ ${issue.details?.fontSize ?? "?"}pt は ${issue.details?.role ?? "text"} 推奨値 ${issue.details?.minimum ?? "?"}pt を下回っています。`,
    "layout.text-too-small-to-read": (issue) =>
      `フォントサイズ ${issue.details?.fontSize ?? "?"}pt は ${issue.details?.role ?? "text"} の実用可読下限 ${issue.details?.minimum ?? "?"}pt を下回っています。`,
    "layout.card-accent-bar-unshaped": () => "角丸カードの端に四角いアクセントバーが密着しています。layout polishで内側に寄せた角丸バーへ整形してください。",
    "text.long-copy": () => "テキストブロックが長すぎます。簡潔なフレーズにし、詳細はnotesへ移してください。",
    "text.low-contrast": (issue) =>
      `テキストのコントラスト比 ${issue.details?.ratio ?? "?"} は基準 ${issue.details?.minimumRatio ?? "?"}:1 を下回っています。`,
    "visual.alt-text-missing": () => "装飾目的ではない視覚要素には、簡潔なaltTextが必要です。",
    "visual.svg-text-too-small": (issue) =>
      `SVG内部の文字がスライド上で小さすぎます（推定 ${issue.details?.effectiveFontSize ?? "?"}pt）。図を大きくする、ラベルを減らす、または分割してください。`,
    "visual.svg-text-small": (issue) =>
      `SVG内部の文字が縮小後に読みにくい可能性があります（推定 ${issue.details?.effectiveFontSize ?? "?"}pt）。`,
    "visual.richness-missing": () => "通常の本文スライドには図解・構成図・アイコン付きカード・画像などの視覚構造が必要です。意図的なテキスト主体スライドは detail/prose/structured-text レイアウトで見出し・インデント・強調・色・余白を入れてください。",
    "visual.richness-deck": (issue) =>
      `pptcreaterの出力として文字中心すぎます（リッチな本文スライド ${issue.details?.richSlides ?? "?"}/${issue.details?.contentSlides ?? "?"}）。図解、構成図、アイコン、画像を追加してください。`,
    "diagram.long-description-short": () => "複雑な図には、speaker notesとアクセシビリティ確認に使えるlongDescriptionを追加してください。",
    "diagram.visible-labels-missing": () =>
      "図のSVGに図形・コネクタはありますが、見えるラベルがありません。SVG内に<text>ラベル/吹き出しを追加するか、generate_diagram/generate_schematicで作り直してください。alt textだけでは閲覧者に見えません。",
    "diagram.image-svg-not-editable": () =>
      "構成図がSVG画像として埋め込まれている可能性があります。箱・コネクタ・ラベルをPowerPoint上で編集できるよう、generate_native_diagramで作り直してください。image SVGは厳密な見た目の再現が必要な場合に限定します。",
    "diagram.native-connectors": () =>
      "手置きの矢印図形で接続図を作っています。間隔調整とコネクタ経路を自動化しつつ編集可能なPowerPointオブジェクトにするため、generate_native_diagramを使ってください。",
    "source.reference-slide-missing": (issue) =>
      `外部サイトを参照した場合は、最後のスライドに実際の参考URL・出典をまとめてください（${issue.details?.sourceCount ?? "?"}件）。`,
    "slide.title-duplicate": () => "各スライドには、ナビゲーション用の一意で説明的なタイトルが必要です。",
    "content.title-generic": () => "スライドタイトルが汎用的です。このスライド固有の話題や要点が分かる見出しにしてください。",
    "content.title-too-long": (issue) =>
      `スライドタイトルが ${issue.details?.contentMode ?? "この"} モードの推奨より長すぎます（現在 ${issue.details?.length ?? issue.details?.words ?? "?"}、推奨最大 ${issue.details?.maximum ?? "?"}）。`,
    "content.ja-title-claim-like": () => "日本語の報告書/技術文書では、タイトルは短い話題ラベルにし、主張はスライドメッセージへ分けてください。",
    "content.ja-message-missing": () => "タイトル下に短いスライドメッセージを追加し、話題と主張を分けてください。",
    "content.message-too-long": () => "スライドメッセージが長すぎます。1つの短い主張に絞り、詳細はnotesへ移してください。",
    "content.body-prose": () => "本文が文章的です。根拠チャンク、表、図解、speaker notesへ分解してください。",
    "content.too-many-bullets": () => "箇条書きが多すぎます。少数のまとまり、表、フロー図に整理してください。"
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
