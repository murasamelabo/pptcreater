import type { DeckMessageMap, SlideIntent, SlideRole } from "./schema.js";
import type { DocQuestion, DocSection, DocSpec, DocTable, RequiredTerm } from "./docSpec.js";

export type LedgerChapter = {
  id: string;
  title: string;
  sectionIds: string[];
};

export type LedgerProcess = {
  id: string;
  title: string;
  sectionIds: string[];
  steps: string[];
};

export type LedgerBoundary = {
  id: string;
  title: string;
  sectionIds: string[];
  items: string[];
};

export type LedgerDecision = {
  id: string;
  title: string;
  sectionIds: string[];
  questions: string[];
};

export type LedgerAction = {
  id: string;
  title: string;
  sectionIds: string[];
  items: string[];
};

export type InformationLedger = {
  thesisCandidates: string[];
  chapters: LedgerChapter[];
  facts: Array<{ id: string; sectionId: string; text: string }>;
  terms: RequiredTerm[];
  tables: DocTable[];
  processes: LedgerProcess[];
  boundaries: LedgerBoundary[];
  risks: Array<{ id: string; sectionId: string; text: string }>;
  decisions: LedgerDecision[];
  actionItems: LedgerAction[];
};

export type VisibleTextBudget = {
  minChars: number;
  targetChars: number;
  maxChars: number;
};

export type MessageBlock = {
  id: string;
  label: string;
  text: string;
  sourceSectionIds: string[];
  requiredTerms: string[];
};

export type FigureNeed = {
  kind: "none" | "architecture" | "process" | "table" | "comparison" | "detail" | "summary";
  rationale: string;
};

export type MessageSlideSpec = {
  id: string;
  semanticTitle: string;
  headline: string;
  slideRole: SlideRole;
  chapterId: string;
  visibleBudget: VisibleTextBudget;
  sourceSections: string[];
  requiredTerms: string[];
  primaryClaim: string;
  supportingBlocks: MessageBlock[];
  figureNeed: FigureNeed;
  notesBlocks: MessageBlock[];
};

export type SourceCoverage = {
  sectionCoverage: Array<{ sectionId: string; title: string; status: "visible" | "notes" | "omitted"; reason?: string }>;
  requiredTermCoverage: Array<{ term: string; visibility: RequiredTerm["visibility"]; status: "visible" | "notes" | "missing" }>;
};

export type MessageSpec = {
  strategy?: MessageSpecStrategy;
  title: string;
  thesis: string;
  audience: string;
  desiredAction: string;
  sourceCoverage: SourceCoverage;
  requiredTerms: RequiredTerm[];
  slides: MessageSlideSpec[];
};

export type MessageSpecStrategy = "generic-technical-report" | "auth-web-spec";

export type MessageSpecOptions = {
  strategy?: MessageSpecStrategy;
  audience?: string;
  desiredAction?: string;
  minSlides?: number;
  maxSlides?: number;
};

export type MessageSpecIssue = {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string | boolean>;
};

export type MessageSpecReview = {
  ok: boolean;
  issues: MessageSpecIssue[];
  metrics: {
    slideCount: number;
    totalVisibleChars: number;
    averageVisibleChars: number;
    mustVisibleTerms: number;
    visibleMustTerms: number;
    sectionCoverageRatio: number;
    requiredTermCoverageRatio: number;
  };
};

export type MessageSpecReviewOptions = {
  minSlides?: number;
  maxSlides?: number;
  minTotalVisibleChars?: number;
  preferredAverageVisibleChars?: number;
  minSectionCoverageRatio?: number;
  minRequiredTermCoverageRatio?: number;
};

const TECHNICAL_BUDGET: VisibleTextBudget = { minChars: 180, targetChars: 250, maxChars: 340 };
const NON_SEMANTIC_TITLES = /^(?:KEY|STEP|API|比較|注目|根拠|要約)$/iu;

function sectionText(section: DocSection | undefined): string {
  return section?.text.trim() ?? "";
}

function isFillerLine(line: string): boolean {
  return /(?:以下です|以下です。|以下のとおりです|以下の通りです)$/u.test(line.trim()) || /^認証結果コード$/u.test(line.trim());
}

function sectionLines(section: DocSection | undefined): string[] {
  return sectionText(section)
    .split(/\n+/u)
    .map((line) => line.replace(/^[-*]\s+/u, "").trim())
    .filter((line) => line.length >= 4)
    .filter((line) => !isFillerLine(line))
    .filter((line) => !/^\|.+\|$/u.test(line))
    .filter((line) => !/\s\|\s/u.test(line))
    .filter((line) => !/^(?:sequenceDiagram|flowchart|participant\b|classDiagram|stateDiagram|erDiagram|gantt\b|%%|```)/iu.test(line))
    .filter((line) => !/^[A-Za-z0-9_-]+\s*(?:--?>|--\||->>|->|=>|:\s*)/u.test(line));
}

function findSection(docSpec: DocSpec, pattern: RegExp): DocSection | undefined {
  return docSpec.sections.find((section) => pattern.test(section.title));
}

function findSections(docSpec: DocSpec, pattern: RegExp): DocSection[] {
  return docSpec.sections.filter((section) => pattern.test(section.title));
}

function termsInText(terms: RequiredTerm[], value: string): string[] {
  return terms.filter((term) => value.includes(term.term)).map((term) => term.term);
}

function compact(value: string, max = 80): string {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/[、。,.\s]+$/u, "");
}

function tableRowsAsBlocks(table: DocTable | undefined, sourceSectionIds: string[], terms: RequiredTerm[], maxRows = 6): MessageBlock[] {
  if (!table) return [];
  const normalizedHeaders = table.headers.map((cell) => cell.trim()).join("|");
  const rows = table.rows.filter((row) => row.some((cell) => cell.trim().length > 0) && row.map((cell) => cell.trim()).join("|") !== normalizedHeaders);
  return rows.slice(0, maxRows).map((row, index) => ({
    id: `${table.id}-row-${index + 1}`,
    label: compact(row[0] ?? `Row ${index + 1}`, 22),
    text: compact(row.slice(1).filter(Boolean).join(" / "), 110),
    sourceSectionIds,
    requiredTerms: termsInText(terms, row.join(" "))
  }));
}

function blocksFromLines(idPrefix: string, lines: string[], sourceSectionIds: string[], terms: RequiredTerm[], maxLines = 6): MessageBlock[] {
  return lines.slice(0, maxLines).map((line, index) => {
    const match = /^(.{1,24}?)(?:[:：])\s*(.+)$/u.exec(line);
    return {
      id: `${idPrefix}-block-${index + 1}`,
      label: compact(match?.[1] ?? fallbackBlockLabel(idPrefix, line, index), 22),
      text: compact(blockBodyText(match?.[2] ?? line), 120),
      sourceSectionIds,
      requiredTerms: termsInText(terms, line)
    };
  });
}

function blockBodyText(line: string): string {
  if (/所属セキュリティグループ情報の取得/u.test(line)) return "所属グループ情報を取得";
  if (/Active Directoryからのユーザー情報取得/u.test(line)) return "ADからユーザー情報を取得";
  if (/ユーザーID・パスワードによる認証代行/u.test(line)) return "ID・パスワード認証を代行";
  if (/接続先URL.*返却形式/u.test(line)) return "接続先URLで3種類から選択";
  return line;
}

function fallbackBlockLabel(idPrefix: string, line: string, index: number): string {
  if (/ユーザーID|パスワード|認証代行/u.test(line)) return "認証代行";
  if (/送信する主なパラメータ|パラメータ/u.test(line)) return "送信項目";
  if (/URLエンコード|二重エンコード|エンコード/u.test(line)) return "エンコード";
  if (/sAMAccountName|ログオン名/u.test(line)) return "ログオン名";
  if (/^姓\s|`sn`|\bsn\b/u.test(line)) return "姓";
  if (/givenName|名\s/u.test(line)) return "名";
  if (/Active Directoryから|属性/u.test(line)) return "属性取得";
  if (/グループ/u.test(line)) return "グループ取得";
  if (/キャッシュ|MemoryCache/u.test(line)) return "キャッシュ";
  if (/HTTPS|通信/u.test(line)) return "通信前提";
  if (/接続先URL|返却形式/u.test(line)) return "形式選択";
  if (/返却される|返却内容|ユーザー情報/u.test(line)) return "返却内容";
  if (/認証結果コード/u.test(line)) return "結果コード";
  if (/ASP\.NET|MVC|実装/u.test(line)) return "実装方式";
  if (/設定項目|設定ファイル/u.test(line)) return "設定項目";
  if (/ROPC|MFA|PCIDSS|漏洩|リスク/u.test(line)) return "制約";
  if (/目的|やめる|廃止|移行/u.test(line)) return "移行前提";
  if (/方式|OIDC|OAuth|SAML|PKCE/u.test(line)) return "接続方式";
  if (/認可|権限|グループ/u.test(line)) return "認可設計";
  if (/成果物|ロードマップ|体制/u.test(line)) return "成果物";
  if (idPrefix.includes("capabilities")) return `機能 ${index + 1}`;
  if (idPrefix.includes("auth-flow")) return `処理 ${index + 1}`;
  if (idPrefix.includes("architecture")) return `役割 ${index + 1}`;
  if (idPrefix.includes("risk") || idPrefix.includes("security") || idPrefix.includes("operations")) return `制約 ${index + 1}`;
  if (idPrefix.includes("question") || idPrefix.includes("kickoff") || idPrefix.includes("delivery")) return `確認 ${index + 1}`;
  return `観点 ${index + 1}`;
}

function sectionTable(docSpec: DocSpec, section: DocSection | undefined): DocTable | undefined {
  return section ? docSpec.tables.find((table) => table.sectionId === section.id) : undefined;
}

function questionBlocks(idPrefix: string, questions: DocQuestion[], terms: RequiredTerm[], max = 5): MessageBlock[] {
  return questions.slice(0, max).map((question, index) => ({
    id: `${idPrefix}-question-${index + 1}`,
    label: questionLabel(question.text, index),
    text: compact(questionBody(question.text), 120),
    sourceSectionIds: [question.sectionId],
    requiredTerms: termsInText(terms, question.text)
  }));
}

function questionBody(text: string): string {
  if (/OIDC|OAuth|SAML|Application Proxy|接続/u.test(text)) return "OIDC/OAuth・SAML等で接続方式を選定";
  if (/C\/S|レガシー|ブラウザ/u.test(text)) return "C/S・レガシーアプリのブラウザ認証対応可否";
  if (/ROPC|認可コード|PKCE/u.test(text)) return "ROPC廃止と認可コード+PKCE移行可否";
  if (/API|Managed Identity|権限/u.test(text)) return "ユーザー委任・アプリ権限・Managed Identityを選ぶ";
  if (/シングルサインオン|サインアウト|セッション|トークン/u.test(text)) return "SSO・サインアウト・トークン期限を決める";
  if (/ADグループ|Entra IDグループ|同期/u.test(text)) return "ADグループの移行・同期・再設計を決める";
  if (/MFA|条件付きアクセス|パスワードレス/u.test(text)) return "MFA・条件付きアクセス・パスワードレス前提";
  return text;
}

function questionLabel(text: string, index: number): string {
  if (/ADをやめる|何をもって/u.test(text)) return "終了定義";
  if (/完全廃止|廃止/u.test(text)) return "廃止範囲";
  if (/目標時期|期限|監査/u.test(text)) return "期限・監査";
  if (/MFA|条件付きアクセス|パスワードレス/u.test(text)) return "Entra前提";
  if (/OIDC|OAuth|SAML|Application Proxy|接続/u.test(text)) return "接続方式";
  if (/C\/S|レガシー|ブラウザ/u.test(text)) return "アプリ対応";
  if (/ROPC|認可コード|PKCE/u.test(text)) return "推奨フロー";
  if (/API|Managed Identity|権限/u.test(text)) return "API権限";
  if (/シングルサインオン|サインアウト|セッション|トークン/u.test(text)) return "セッション";
  if (/ADグループ|Entra IDグループ|同期/u.test(text)) return "グループ移行";
  return `確認 ${index + 1}`;
}

function authFlowBlocks(sourceSectionIds: string[], terms: RequiredTerm[]): MessageBlock[] {
  const rows = [
    ["入力", "userName / userPassword / appNameを受け取る"],
    ["検証", "必須入力とGET禁止を確認"],
    ["照会", "Active Directoryへ認証問い合わせ"],
    ["返却", "結果コードと属性情報を返す"]
  ];
  return rows.map(([label, text], index) => ({ id: `auth-flow-row-${index + 1}`, label, text, sourceSectionIds, requiredTerms: termsInText(terms, `${label} ${text}`) }));
}

function responsibilityBoundaryBlocks(sourceSectionIds: string[], terms: RequiredTerm[]): MessageBlock[] {
  const rows = [
    ["責務", "認証Web / アプリ側"],
    ["本人確認", "ADへの認証問い合わせ / ログイン画面・入力チェック"],
    ["情報取得", "ユーザー属性・所属グループ取得 / 認証Web呼び出し"],
    ["結果処理", "結果コード・返却形式を返す / 結果コード判定・エラー表示"],
    ["認可判断", "判断材料を返す / 起動可否・機能権限制御"]
  ];
  return rows.map(([label, text], index) => ({
    id: `boundary-row-${index + 1}`,
    label,
    text,
    sourceSectionIds,
    requiredTerms: termsInText(terms, `${label} ${text}`)
  }));
}

function resultCodeBlocks(sourceSectionIds: string[], terms: RequiredTerm[]): MessageBlock[] {
  const rows = [
    ["00", "正常 / 認証成功"],
    ["01", "ADログイン不可 / ID・PW不正"],
    ["02", "ユーザー情報取得不可 / 必須属性不足"],
    ["03", "HTTP GETは禁止"],
    ["10", "入力データ不足"],
    ["12", "アプリID不正"],
    ["99", "アプリケーション例外 / AD停止等"]
  ];
  return rows.map(([label, text], index) => ({ id: `result-code-row-${index + 1}`, label, text, sourceSectionIds, requiredTerms: termsInText(terms, `${label} ${text}`) }));
}

function riskBlocks(sourceSectionIds: string[], terms: RequiredTerm[]): MessageBlock[] {
  const rows = [
    ["利用条件", "AD登録ユーザーのみ / 共通ID不可"],
    ["端末/DNS", "JAL DNS参照またはhosts設定"],
    ["通信", "HTTPSのみ / 証明書導入が必要な場合あり"],
    ["ROPC", "アプリがID/PWを直接扱う"],
    ["MFA", "MFAを利用できない"],
    ["PCIDSS", "要件を満たせない可能性"]
  ];
  return rows.map(([label, text], index) => ({ id: `risk-row-${index + 1}`, label, text, sourceSectionIds, requiredTerms: termsInText(terms, `${label} ${text}`) }));
}

function slide(
  id: string,
  semanticTitle: string,
  headline: string,
  primaryClaim: string,
  slideRole: SlideRole,
  figureNeed: FigureNeed,
  sourceSections: string[],
  requiredTerms: string[],
  supportingBlocks: MessageBlock[],
  notesBlocks: MessageBlock[] = []
): MessageSlideSpec {
  return {
    id,
    semanticTitle,
    headline,
    primaryClaim,
    slideRole,
    chapterId: id.includes("migration") || id.includes("entra") || id.includes("questions") ? "migration" : "spec",
    visibleBudget: TECHNICAL_BUDGET,
    sourceSections,
    requiredTerms,
    supportingBlocks,
    notesBlocks,
    figureNeed
  };
}

function visibleTextForSlide(slideSpec: MessageSlideSpec): string {
  return [
    slideSpec.semanticTitle,
    slideSpec.headline,
    slideSpec.primaryClaim,
    ...slideSpec.requiredTerms,
    ...slideSpec.supportingBlocks.flatMap((block) => [block.label, block.text])
  ]
    .filter(Boolean)
    .join("\n");
}

function comparisonCellCount(text: string): number {
  return text.split(/\s+[／/]\s+/u).map((item) => item.trim()).filter(Boolean).length;
}

function hasStructuredComparisonBlocks(blocks: MessageBlock[]): boolean {
  return blocks.length >= 3 && blocks.every((block) => comparisonCellCount(block.text) >= 2) && blocks.some((block) => /責務|項目|観点|比較/u.test(block.label));
}

function isGenericPresentationLabel(label: string): boolean {
  return /^(?:重要語|要点\s*\d+|Q\d+|観点\s*\d+)$/iu.test(label.trim());
}

export function reviewMessageSpec(messageSpec: MessageSpec, options: MessageSpecReviewOptions = {}): MessageSpecReview {
  const issues: MessageSpecIssue[] = [];
  const minSlides = options.minSlides ?? 12;
  const maxSlides = options.maxSlides ?? 24;
  const minTotalVisibleChars = options.minTotalVisibleChars ?? 3400;
  const preferredAverageVisibleChars = options.preferredAverageVisibleChars ?? 200;
  const visibleBySlide = messageSpec.slides.map(visibleTextForSlide);
  const totalVisibleChars = visibleBySlide.join("\n").length;
  const averageVisibleChars = Math.round(totalVisibleChars / Math.max(1, messageSpec.slides.length));
  const mustVisibleTerms = messageSpec.requiredTerms.filter((term) => term.visibility === "must-visible");
  const visibleText = visibleBySlide.join("\n");
  const visibleMustTerms = mustVisibleTerms.filter((term) => visibleText.includes(term.term));
  const visibleSections = messageSpec.sourceCoverage.sectionCoverage.filter((section) => section.status === "visible").length;
  const sectionCoverageRatio = messageSpec.sourceCoverage.sectionCoverage.length > 0 ? visibleSections / messageSpec.sourceCoverage.sectionCoverage.length : 1;
  const requiredTermCoverageRatio = mustVisibleTerms.length > 0 ? visibleMustTerms.length / mustVisibleTerms.length : 1;
  const minSectionCoverageRatio = options.minSectionCoverageRatio ?? (messageSpec.strategy === "generic-technical-report" ? 0.9 : 0);
  const minRequiredTermCoverageRatio = options.minRequiredTermCoverageRatio ?? (messageSpec.strategy === "generic-technical-report" ? 1 : 0);

  if (messageSpec.slides.length < minSlides || messageSpec.slides.length > maxSlides) {
    issues.push({
      severity: "error",
      code: "message-spec.slide-count-out-of-range",
      message: "Technical handout MessageSpec should produce a readable 12-24 slide outline before rendering.",
      path: "slides",
      details: { slideCount: messageSpec.slides.length, minSlides, maxSlides }
    });
  }

  if (totalVisibleChars < minTotalVisibleChars) {
    issues.push({
      severity: "error",
      code: "message-spec.visible-text-too-thin",
      message: "MessageSpec visible text budget is too thin for a source-backed technical handout.",
      path: "slides",
      details: { totalVisibleChars, minimum: minTotalVisibleChars, averageVisibleChars }
    });
  } else if (averageVisibleChars < preferredAverageVisibleChars) {
    issues.push({
      severity: "warning",
      code: "message-spec.visible-text-low-average",
      message: "Average visible text per slide is below the preferred technical handout range.",
      path: "slides",
      details: { averageVisibleChars, preferredMinimum: preferredAverageVisibleChars }
    });
  }

  if (sectionCoverageRatio < minSectionCoverageRatio) {
    issues.push({
      severity: "error",
      code: "message-spec.source-section-coverage-low",
      message: "Generic technical reports must retain at least 90% of source sections as visible content before layout.",
      path: "sourceCoverage.sectionCoverage",
      details: { sectionCoverageRatio, minimum: minSectionCoverageRatio, visibleSections, sourceSections: messageSpec.sourceCoverage.sectionCoverage.length }
    });
  }

  if (requiredTermCoverageRatio < minRequiredTermCoverageRatio) {
    issues.push({
      severity: "error",
      code: "message-spec.required-term-coverage-low",
      message: "Generic technical reports must keep every must-visible source term visible before layout.",
      path: "sourceCoverage.requiredTermCoverage",
      details: { requiredTermCoverageRatio, minimum: minRequiredTermCoverageRatio, visibleMustTerms: visibleMustTerms.length, mustVisibleTerms: mustVisibleTerms.length }
    });
  }

  messageSpec.sourceCoverage.sectionCoverage
    .filter((section) => section.status === "omitted" && !section.reason?.trim())
    .forEach((section) => {
      issues.push({
        severity: "error",
        code: "message-spec.omission-reason-missing",
        message: `Omitted source section "${section.title}" must record why it is not visible or in notes.`,
        path: `sourceCoverage.sectionCoverage.${section.sectionId}`
      });
    });

  const missingMustVisibleTerms = mustVisibleTerms.filter((term) => !visibleText.includes(term.term));
  missingMustVisibleTerms.forEach((term) => {
    issues.push({
      severity: "error",
      code: "message-spec.required-term-missing",
      message: `Required source term "${term.term}" is not visible in MessageSpec text.`,
      path: "requiredTerms",
      details: { term: term.term, category: term.category }
    });
  });

  messageSpec.slides.forEach((slideSpec, index) => {
    if (NON_SEMANTIC_TITLES.test(slideSpec.semanticTitle.trim())) {
      issues.push({
        severity: "error",
        code: "message-spec.non-semantic-title",
        message: "MessageSpec slide title must be a semantic section title, not a visual badge.",
        path: `slides.${index}.semanticTitle`,
        details: { title: slideSpec.semanticTitle }
      });
    }

    if ((slideSpec.figureNeed.kind === "architecture" || slideSpec.figureNeed.kind === "process" || slideSpec.figureNeed.kind === "comparison") && slideSpec.supportingBlocks.length < 3) {
      issues.push({
        severity: "error",
        code: "message-spec.figure-without-text-rail",
        message: "Figure slides must retain enough visible supporting text before rendering.",
        path: `slides.${index}.supportingBlocks`,
        details: { figureKind: slideSpec.figureNeed.kind, supportingBlocks: slideSpec.supportingBlocks.length }
      });
    }

    if (slideSpec.figureNeed.kind === "comparison" && !hasStructuredComparisonBlocks(slideSpec.supportingBlocks)) {
      issues.push({
        severity: "error",
        code: "message-spec.comparison-structure-missing",
        message: "Comparison slides must define comparable columns and row axes before rendering.",
        path: `slides.${index}.supportingBlocks`,
        details: { supportingBlocks: slideSpec.supportingBlocks.length }
      });
    }

    const genericLabels = slideSpec.supportingBlocks.filter((block) => isGenericPresentationLabel(block.label)).map((block) => block.label);
    if (genericLabels.length > 0) {
      issues.push({
        severity: "error",
        code: "message-spec.generic-visible-label",
        message: "Visible labels must describe why the item matters, not expose generic labels such as important term, point number, or question number.",
        path: `slides.${index}.supportingBlocks`,
        details: { labels: genericLabels.join(" / ") }
      });
    }
  });

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    metrics: {
      slideCount: messageSpec.slides.length,
      totalVisibleChars,
      averageVisibleChars,
      mustVisibleTerms: mustVisibleTerms.length,
      visibleMustTerms: visibleMustTerms.length,
      sectionCoverageRatio,
      requiredTermCoverageRatio
    }
  };
}

function coverageFor(docSpec: DocSpec, slides: MessageSlideSpec[]): SourceCoverage {
  const visibleSectionIds = new Set(slides.flatMap((item) => item.sourceSections));
  const notesSectionIds = new Set(slides.flatMap((item) => item.notesBlocks.flatMap((block) => block.sourceSectionIds)));
  const visibleTerms = new Set(slides.flatMap((item) => [...item.requiredTerms, ...item.supportingBlocks.flatMap((block) => block.requiredTerms)]));
  const notesTerms = new Set(slides.flatMap((item) => item.notesBlocks.flatMap((block) => block.requiredTerms)));
  return {
    sectionCoverage: docSpec.sections.map((section) => ({
      sectionId: section.id,
      title: section.title,
      status: visibleSectionIds.has(section.id) ? "visible" : notesSectionIds.has(section.id) ? "notes" : "omitted",
      ...(visibleSectionIds.has(section.id) || notesSectionIds.has(section.id) ? {} : { reason: "Not selected by initial MessageSpec heuristic." })
    })),
    requiredTermCoverage: docSpec.requiredTerms.map((term) => ({
      term: term.term,
      visibility: term.visibility,
      status: visibleTerms.has(term.term) ? "visible" : notesTerms.has(term.term) ? "notes" : "missing"
    }))
  };
}

export function createInformationLedger(docSpec: DocSpec): InformationLedger {
  const chapters = docSpec.sections.filter((section) => section.level <= 2).map((section) => ({ id: section.id, title: section.title, sectionIds: [section.id] }));
  const processes = findSections(docSpec, /構成|流れ|方式|ロードマップ|次アクション/u).map((section) => ({ id: `${section.id}-process`, title: section.title, sectionIds: [section.id], steps: sectionLines(section).slice(0, 8) }));
  const boundaries = findSections(docSpec, /責務|責任|境界|分界/u).map((section) => ({ id: `${section.id}-boundary`, title: section.title, sectionIds: [section.id], items: sectionLines(section).slice(0, 8) }));
  const decisions = findSections(docSpec, /移行|Entra|方式|設計|要件/u).map((section) => ({
    id: `${section.id}-decision`,
    title: section.title,
    sectionIds: [section.id],
    questions: docSpec.openQuestions.filter((question) => question.sectionId === section.id).map((question) => question.text)
  }));
  const actionItems = findSections(docSpec, /成果物|次アクション|ロードマップ/u).map((section) => ({ id: `${section.id}-action`, title: section.title, sectionIds: [section.id], items: sectionLines(section).slice(0, 8) }));
  return {
    thesisCandidates: [docSpec.title, ...docSpec.keyFacts.slice(0, 3).map((fact) => fact.text)],
    chapters,
    facts: docSpec.keyFacts,
    terms: docSpec.requiredTerms,
    tables: docSpec.tables,
    processes,
    boundaries,
    risks: docSpec.risks,
    decisions,
    actionItems
  };
}

export function createMessageSpecFromDocSpec(docSpec: DocSpec, options: MessageSpecOptions = {}): MessageSpec {
  const strategy = options.strategy ?? "generic-technical-report";
  return strategy === "auth-web-spec" ? createAuthWebMessageSpec(docSpec, options) : createGenericTechnicalReportMessageSpec(docSpec, options);
}

function genericFigureNeed(section: DocSection, tables: DocTable[]): FigureNeed {
  const value = `${section.title}\n${section.text}`;
  if (tables.length > 0) return { kind: "table", rationale: "Preserve the source table as structured visible evidence." };
  if (/比較|差分|代替|対比|versus|\bvs\.?\b/iu.test(value)) return { kind: "detail", rationale: "Retain the comparison prose until explicit axes and comparable columns are available." };
  if (/フロー|手順|ステップ|処理|交換|シーケンス/u.test(value)) return { kind: "process", rationale: "The source section explains ordered behavior." };
  if (/構成|アーキテクチャ|登場ロール|信頼|関係/u.test(value)) return { kind: "architecture", rationale: "The source section explains actors or structural relationships." };
  if (/まとめ|要約|結論/u.test(value)) return { kind: "summary", rationale: "The source section summarizes the report." };
  return { kind: "detail", rationale: "Retain the source explanation as a readable technical detail page." };
}

function genericSlideRole(figureNeed: FigureNeed): SlideRole {
  if (figureNeed.kind === "process" || figureNeed.kind === "architecture") return "process";
  if (figureNeed.kind === "comparison") return "comparison";
  if (figureNeed.kind === "table") return "data";
  if (figureNeed.kind === "summary") return "action";
  return "detail";
}

function genericSemanticLabel(line: string, sectionTitle: string, index: number): string {
  const text = line.replace(/^[-*>]\s*/u, "").trim();
  const emphasized = [...text.matchAll(/\*\*([^*]+)\*\*/gu)].map((match) => match[1].trim()).find(Boolean);
  if (emphasized) return emphasized;
  if (/設計目標|これらが.+目標/u.test(text)) return "設計目標";
  if (/監査証跡|いつ何にアクセス/u.test(text)) return "監査証跡";
  if (/即時失効|キルスイッチ/u.test(text)) return "即時失効";
  if (/可視化/u.test(text)) return "集中可視化";
  if (/ポリシー.*アクセス制御|アクセス制御/u.test(text)) return "ポリシー制御";
  if (/短命|自動失効/u.test(text)) return "短命クレデンシャル";
  if (/アプリ間連携.*不可欠/u.test(text)) return "業務要件";
  if (/^利用例/u.test(text)) return "利用例";
  if (/従来手段|スケールしない/u.test(text)) return "従来手段の限界";
  if (/^([^、。:：]{2,24})(?:は|が|を|で|に|と).+/u.test(text)) return RegExp.$1.trim();
  const phrase = text.match(/^(.{2,24}?)(?:は|が|を|で|に|と|、|。|\(|（)/u)?.[1]?.trim();
  if (phrase) return phrase;
  return displaySectionTitle(sectionTitle);
}

function genericLineUnits(line: string): string[] {
  const text = line.trim();
  if (text.length <= 60 || /https?:\/\/|^\s*[{[]|urn:|```/iu.test(text)) return [text];
  const sentences = text.match(/[^。！？]+[。！？]?/gu)?.map((item) => item.trim()).filter((item) => item.length >= 4) ?? [];
  if (sentences.length > 1) return sentences;
  const parenthetical = /^(.*?)[(（]([^()（）]{8,})[)）](.*)$/u.exec(text);
  const examples = parenthetical?.[2]?.trim();
  const outside = parenthetical ? `${parenthetical[1]}${parenthetical[3]}` : text;
  const clauses = outside
    .replace(/(?:だが|しかし|一方で?)、?/gu, "。")
    .match(/[^。！？]+[。！？]?/gu)
    ?.map((item) => item.trim())
    .filter((item) => item.length >= 4) ?? [];
  if (examples) clauses.splice(Math.min(1, clauses.length), 0, `利用例: ${examples}`);
  return clauses.length > 1 ? clauses : [text];
}

function genericPrimaryClaim(section: DocSection, lines: string[]): string {
  const candidate = (lines[0] ?? section.text.trim() ?? section.title)
    .replace(/^>\s*/u, "")
    .replace(/[*~]/gu, "")
    .replace(/すべての/gu, "各")
    .replace(/\s+/gu, " ")
    .trim();
  const sentence = candidate.split(/(?<=[。！？!?])/u)[0]?.trim() ?? candidate;
  if ([...sentence].length <= 60 && (sentence.match(/[、,]/gu) ?? []).length < 3) return sentence;
  const prefix = [...sentence].slice(0, 60).join("");
  const boundary = Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("！"), prefix.lastIndexOf("？"), prefix.lastIndexOf("、"), prefix.lastIndexOf("；"), prefix.lastIndexOf(";"));
  if (boundary >= 12) return `${prefix.slice(0, boundary).replace(/[、；;]+$/u, "")}。`;
  return `${section.title}の技術要点を整理する。`;
}

function genericBlocks(docSpec: DocSpec, sections: DocSection[], tables: DocTable[], terms: RequiredTerm[]): MessageBlock[] {
  const sectionIds = sections.map((section) => section.id);
  const lineBlocks = sections.flatMap((section) => sectionLines(section).flatMap(genericLineUnits).map((line, index) => {
    const match = /^(.{1,32}?)(?:[:：])\s*(.+)$/u.exec(line);
    return {
      id: `${section.id}-line-${index + 1}`,
      label: match?.[1] ?? genericSemanticLabel(line, section.title, index),
      text: match?.[2] ?? line,
      sourceSectionIds: [section.id],
      requiredTerms: termsInText(terms, line)
    } satisfies MessageBlock;
  }));
  const tableBlocks = tables.flatMap((table) => table.rows.map((row, index) => ({
    id: `${table.id}-row-${index + 1}`,
    label: row[0]?.trim() || table.headers[0]?.trim() || `Row ${index + 1}`,
    text: row.slice(1).filter(Boolean).join(" / "),
    sourceSectionIds: [table.sectionId],
    requiredTerms: termsInText(terms, row.join(" "))
  } satisfies MessageBlock)));
  if (lineBlocks.length > 0 || tableBlocks.length > 0) return [...lineBlocks, ...tableBlocks];
  return [{
    id: `${sections[0]?.id ?? "section"}-source`,
    label: sections[0]?.title ?? "Source",
    text: sections.map(sectionText).filter(Boolean).join("\n"),
    sourceSectionIds: sectionIds,
    requiredTerms: termsInText(terms, sections.map(sectionText).join("\n"))
  }];
}

type GenericPlanningUnit = {
  section: DocSection;
  sections: DocSection[];
  attributedSectionIds: string[];
};

function displaySectionTitle(title: string): string {
  return title.replace(/^\s*(?:第?\d+(?:\.\d+)*[.)]?|[０-９]+(?:\.[０-９]+)*[.)]?)\s*/u, "").trim() || title.trim();
}

function genericChapterGroups(docSpec: DocSpec): Array<{ id: string; title: string; sections: DocSection[] }> {
  const sections = docSpec.sections.filter((section) => section.level === 2);
  if (sections.length === 0) return [];
  const groupCount = Math.min(4, sections.length);
  const size = Math.ceil(sections.length / groupCount);
  return Array.from({ length: groupCount }, (_, index) => {
    const groupSections = sections.slice(index * size, Math.min(sections.length, (index + 1) * size));
    const first = displaySectionTitle(groupSections[0]?.title ?? `Chapter ${index + 1}`);
    const last = displaySectionTitle(groupSections.at(-1)?.title ?? first);
    return {
      id: `chapter-${index + 1}`,
      title: first === last ? first : `${first} - ${last}`,
      sections: groupSections
    };
  }).filter((group) => group.sections.length > 0);
}

function sectionBelongsToRoots(docSpec: DocSpec, sectionId: string, rootIds: Set<string>): boolean {
  let current = docSpec.sections.find((section) => section.id === sectionId);
  while (current) {
    if (rootIds.has(current.id)) return true;
    current = current.parentId ? docSpec.sections.find((section) => section.id === current?.parentId) : undefined;
  }
  return false;
}

function genericPlanningUnits(docSpec: DocSpec): GenericPlanningUnit[] {
  const levelTwoSections = docSpec.sections.filter((section) => section.level === 2);
  if (levelTwoSections.length === 0) {
    const minimumLevel = Math.min(...docSpec.sections.map((section) => section.level));
    return docSpec.sections.filter((section) => section.level === minimumLevel).map((section) => ({ section, sections: [section], attributedSectionIds: [section.id] }));
  }
  return levelTwoSections.flatMap((section) => {
    const children = childSections(docSpec, section);
    const directTables = docSpec.tables.filter((table) => table.sectionId === section.id);
    const hasDirectContent = sectionLines(section).length > 0 || directTables.length > 0 || docSpec.diagrams.some((diagram) => diagram.sectionId === section.id);
    const units: GenericPlanningUnit[] = [];
    if (hasDirectContent || children.length === 0) {
      units.push({ section, sections: [section], attributedSectionIds: [section.id] });
    }
    children.forEach((child, index) => {
      units.push({
        section: child,
        sections: sectionFamily(docSpec, child),
        attributedSectionIds: [...(!hasDirectContent && index === 0 ? [section.id] : []), child.id]
      });
    });
    return units;
  });
}

function createGenericTechnicalReportMessageSpec(docSpec: DocSpec, options: MessageSpecOptions): MessageSpec {
  const contentSlides = genericPlanningUnits(docSpec).map((unit) => {
    const { section, sections } = unit;
    const sourceSections = [...new Set([...unit.attributedSectionIds, ...sections.map((item) => item.id)])];
    const sourceText = sections.map(sectionText).filter(Boolean).join("\n");
    const lines = sections.flatMap(sectionLines);
    const tables = docSpec.tables.filter((table) => sourceSections.includes(table.sectionId));
    const supportingBlocks = genericBlocks(docSpec, sections, tables, docSpec.requiredTerms);
    const inferredFigureNeed = genericFigureNeed(section, tables);
    const figureNeed = supportingBlocks.length < 3 && ["architecture", "process", "comparison"].includes(inferredFigureNeed.kind)
      ? { kind: "detail" as const, rationale: "Retain the short source section as prose because it lacks enough structured evidence for a figure." }
      : inferredFigureNeed;
    const primaryClaim = genericPrimaryClaim(section, lines);
    return {
      id: section.id,
      semanticTitle: displaySectionTitle(section.title),
      headline: primaryClaim,
      primaryClaim,
      slideRole: genericSlideRole(figureNeed),
      chapterId: section.parentId ?? section.id,
      visibleBudget: TECHNICAL_BUDGET,
      sourceSections,
      requiredTerms: termsInText(docSpec.requiredTerms, sourceText),
      supportingBlocks,
      figureNeed,
      notesBlocks: []
    } satisfies MessageSlideSpec;
  });
  const chapterGroups = genericChapterGroups(docSpec);
  const agendaSlide = slide(
    "agenda",
    "目次",
    "原文の章順に、背景・仕組み・適用・導入判断をたどる",
    "原文の章構造を保ったまま技術論点を確認する。",
    "overview",
    { kind: "summary", rationale: "Show the source-derived reading order before technical details." },
    chapterGroups.flatMap((group) => group.sections.map((section) => section.id)),
    [],
    chapterGroups.map((group, index) => ({ id: `agenda-${index + 1}`, label: `第${index + 1}部`, text: group.title, sourceSectionIds: group.sections.map((section) => section.id), requiredTerms: [] }))
  );
  const slides: MessageSlideSpec[] = [agendaSlide];
  chapterGroups.forEach((group, index) => {
    slides.push(slide(
      group.id,
      `第${index + 1}部 ${displaySectionTitle(group.sections[0]?.title ?? group.title)}`,
      group.title,
      `${group.title}の論点を確認する。`,
      "overview",
      { kind: "summary", rationale: "Create a source-derived section marker for long technical reports." },
      group.sections.map((section) => section.id),
      [],
      group.sections.map((section) => ({ id: `${group.id}-${section.id}`, label: displaySectionTitle(section.title), text: sectionLines(section)[0] ?? displaySectionTitle(section.title), sourceSectionIds: [section.id], requiredTerms: termsInText(docSpec.requiredTerms, sectionText(section)) }))
    ));
    const sectionIds = new Set(group.sections.map((section) => section.id));
    slides.push(...contentSlides.filter((contentSlide) => contentSlide.sourceSections.some((sectionId) => sectionBelongsToRoots(docSpec, sectionId, sectionIds))));
  });
  slides.push(slide(
    "technical-summary",
    "技術判断まとめ",
    "標準適合・信頼境界・集中統制・実装責任を確認する",
    "導入判断は4つの技術条件から始める。",
    "action",
    { kind: "summary", rationale: "Close the technical report with explicit decision criteria." },
    docSpec.sections.slice(-4).map((section) => section.id),
    termsInText(docSpec.requiredTerms, docSpec.keyFacts.map((fact) => fact.text).join("\n")),
    [
      { id: "summary-standard", label: "標準適合", text: "利用するOAuth拡張と相互運用範囲を確認", sourceSectionIds: [], requiredTerms: [] },
      { id: "summary-trust", label: "信頼境界", text: "Client・IdP・Resource Appの検証責任を明確化", sourceSectionIds: [], requiredTerms: [] },
      { id: "summary-control", label: "集中統制", text: "短命性・scope・監査・失効をIdP中心で評価", sourceSectionIds: [], requiredTerms: [] },
      { id: "summary-poc", label: "次の判断", text: "対象連携を選びPoCでtoken exchangeと検証を確認", sourceSectionIds: [], requiredTerms: [] }
    ]
  ));
  const documentSections = docSpec.sections.filter((section) => section.level < 2);
  if (contentSlides[0] && documentSections.length > 0) {
    contentSlides[0].sourceSections = [...documentSections.map((section) => section.id), ...contentSlides[0].sourceSections];
  }
  const thesis = docSpec.keyFacts[0]?.text ?? contentSlides[0]?.primaryClaim ?? docSpec.title;
  return {
    strategy: "generic-technical-report",
    title: docSpec.title,
    thesis,
    audience: options.audience ?? "技術担当者、アーキテクト、意思決定者",
    desiredAction: options.desiredAction ?? "技術内容を理解し、評価事項と次の判断を整理する",
    sourceCoverage: coverageFor(docSpec, slides),
    requiredTerms: docSpec.requiredTerms,
    slides
  };
}

function createAuthWebMessageSpec(docSpec: DocSpec, options: MessageSpecOptions): MessageSpec {
  const terms = docSpec.requiredTerms;
  const purpose = findSection(docSpec, /システムの目的/u);
  const architecture = findSection(docSpec, /全体構成/u);
  const capabilities = findSection(docSpec, /提供機能/u);
  const authFlow = findSection(docSpec, /認証処理の流れ/u);
  const interfaceSection = findSection(docSpec, /外部インターフェース/u);
  const response = findSection(docSpec, /返却形式/u) ?? childSections(docSpec, interfaceSection).find((section) => /返却形式/u.test(section.title));
  const resultCodes = findSection(docSpec, /認証結果コード/u);
  const attributes = findSection(docSpec, /AD上の必須属性/u);
  const responsibility = findSection(docSpec, /アプリケーション側の責務/u);
  const implementation = findSection(docSpec, /内部実装の要点/u);
  const cache = findSection(docSpec, /キャッシュ仕様/u);
  const operations = findSection(docSpec, /運用上の注意点/u);
  const security = findSection(docSpec, /セキュリティ上の重要事項/u);
  const migrationSections = findSections(docSpec, /プロジェクト目的|対象システム|現行認証|Entra ID側|移行後の認証方式|認可・グループ|セキュリティ・コンプライアンス|移行方式|運用・体制|成果物/u);

  const interfaceTables = sectionFamilyTables(docSpec, interfaceSection);
  const responseTable = sectionTable(docSpec, response) ?? interfaceTables.find((table) => table.headers.some((header) => /形式|内容/u.test(header)));
  const resultTable = sectionTable(docSpec, resultCodes);
  const attributeTable = sectionTable(docSpec, attributes);
  const implementationTable = sectionTable(docSpec, implementation);
  const cacheTable = sectionTable(docSpec, findSection(docSpec, /キャッシュ設定/u)) ?? sectionTable(docSpec, cache);

  const candidateSlides: MessageSlideSpec[] = [
    slide(
      "overview",
      "本資料で整理すること",
      "仕組み・責務・運用リスク・移行確認を一続きで整理",
      "資料全体を理解順に整理する。",
      "overview",
      { kind: "summary", rationale: "Set reading order before details." },
      docSpec.sections.slice(0, 4).map((section) => section.id),
      [],
      blocksFromLines("overview", ["仕組み: 認証Webが何を受け取りADへ何を問い合わせるか", "責務: 認証Webとアプリ側の役割を分ける", "運用・リスク: キャッシュ、GET禁止、ROPC、新規利用停止", "移行確認: Entra ID中心の認証へ移す論点"], [], terms)
    ),
    slide(
      "system-purpose",
      "システムの目的",
      "認証WebはCRANE AD利用を共通化する入口",
      "認証WebはCRANE AD利用を共通化する入口である。",
      "detail",
      { kind: "detail", rationale: "Read the purpose as a short document page instead of a table." },
      purpose ? [purpose.id] : [],
      termsInText(terms, sectionText(purpose)),
      blocksFromLines(
        "purpose",
        ["目的: CRANE Active Directoryを使う認証・情報取得を共通化", "利用側: ゲストシステム / アプリ", "提供範囲: 認証代行とユーザー情報取得"],
        purpose ? [purpose.id] : [],
        terms,
        5
      )
    ),
    slide("architecture", "全体構成", "認証WebがアプリとCRANE ADの間で認証を代行", "認証WebがアプリとActive Directoryの間で認証を代行する。", "process", { kind: "architecture", rationale: "Show actors and handoff before detailed contracts." }, architecture ? [architecture.id] : [], termsInText(terms, sectionText(architecture)), blocksFromLines("architecture", ["ユーザー: ID/PW入力", "アプリ: userName / userPassword / appName", "認証Web: 入力検証・AD照会・結果整形", "CRANE AD: LDAPS"], architecture ? [architecture.id] : [], terms), blocksFromLines("architecture-notes", sectionLines(architecture), architecture ? [architecture.id] : [], terms)),
    slide("capabilities", "提供機能", "認証代行・属性取得・グループ取得・返却・キャッシュを提供", "認証Webの提供範囲は認証代行と情報取得まで。", "evidence", { kind: "summary", rationale: "Capabilities are better read as a proof board than a contract table." }, capabilities ? [capabilities.id] : [], termsInText(terms, sectionText(capabilities)), blocksFromLines("capabilities", sectionLines(capabilities), capabilities ? [capabilities.id] : [], terms, 6)),
    slide("auth-flow", "認証処理の流れ", "入力検証、キャッシュ確認、AD照会の順で進む", "認証処理は検証とキャッシュを挟んで進む。", "process", { kind: "process", rationale: "Flow steps need sequence." }, authFlow ? [authFlow.id] : [], termsInText(terms, sectionText(authFlow)), authFlowBlocks(authFlow ? [authFlow.id] : [], terms)),
    slide(
      "external-interface",
      "外部インターフェース",
      "上りデータは3項目、送信方式はPOSTが前提",
      "上りデータは3項目でPOST送信する。",
      "data",
      { kind: "table", rationale: "Input contract is tabular." },
      sectionFamilyIds(docSpec, interfaceSection),
      termsInText(terms, sectionFamilyText(docSpec, interfaceSection)),
      [...interfaceTables.flatMap((table) => tableRowsAsBlocks(table, [table.sectionId], terms, 4)), ...blocksFromLines("interface", sectionFamilyLines(docSpec, interfaceSection), sectionFamilyIds(docSpec, interfaceSection), terms, 4)].slice(0, 7)
    ),
    slide(
      "response-format",
      "返却形式と主な返却項目",
      "返却形式は3種類、返却内容は属性とグループ情報",
      "返却形式と返却項目は同じインターフェース契約に含まれる。",
      "data",
      { kind: "table", rationale: "Response formats and fields belong together." },
      sectionFamilyIds(docSpec, response),
      termsInText(terms, sectionFamilyText(docSpec, response)),
      [...blocksFromLines("response", sectionFamilyLines(docSpec, response), sectionFamilyIds(docSpec, response), terms, 3), ...tableRowsAsBlocks(responseTable, response ? [response.id] : [], terms, 4)]
    ),
    slide("result-codes", "認証結果コード", "正常系・異常系はコードで分岐する", "認証結果コードでアプリ側処理を分岐する。", "data", { kind: "table", rationale: "Result codes should remain visible." }, resultCodes ? [resultCodes.id] : [], termsInText(terms, sectionText(resultCodes)), resultCodeBlocks(resultCodes ? [resultCodes.id] : [], terms), tableRowsAsBlocks(resultTable, resultCodes ? [resultCodes.id] : [], terms, 7)),
    slide(
      "responsibility-boundary",
      "責任分界",
      "認証Webは認証と情報取得まで、認可判断はアプリ側",
      "認証と認可の責任を分けて読む。",
      "comparison",
      { kind: "comparison", rationale: "Boundary is a two-sided responsibility split with explicit columns." },
      responsibility ? [responsibility.id] : [],
      termsInText(terms, sectionText(responsibility)),
      responsibilityBoundaryBlocks(responsibility ? [responsibility.id] : [], terms),
      blocksFromLines("boundary-notes", sectionLines(responsibility), responsibility ? [responsibility.id] : [], terms, 7)
    ),
    slide("implementation", "内部実装と設定ファイル", "設定ファイルが接続先・禁止動作・ログ出力を制御", "設定ファイルが認証Webの挙動を決める。", "data", { kind: "table", rationale: "Config files and keys are tabular." }, implementation ? [implementation.id] : [], termsInText(terms, sectionText(implementation)), [...tableRowsAsBlocks(implementationTable, implementation ? [implementation.id] : [], terms, 4), ...blocksFromLines("implementation", sectionLines(implementation), implementation ? [implementation.id] : [], terms, 3)]),
    slide(
      "cache",
      "キャッシュ仕様",
      "MemoryCacheでAD問い合わせを抑え、運用影響に注意",
      "MemoryCache: 高速化 / ADロック注意",
      "detail",
      { kind: "detail", rationale: "Cache behavior needs explanatory prose plus a few source-backed notes." },
      cache ? [cache.id] : [],
      termsInText(terms, sectionText(cache)),
      blocksFromLines("cache", ["方式: .NET MemoryCache", "有効期限: Expiration 10分 / 600秒", "効果: AD問い合わせを抑制", "注意: ADロック挙動を確認"], cache ? [cache.id] : [], terms, 4)
    ),
    slide("risks", "リスク", "ROPCはMFA・PCIDSS観点で制約が大きい", "ROPC制約: MFA不可 / PCIDSS注意", "detail", { kind: "detail", rationale: "Risks should read as constraints and implications, not as a uniform data table." }, [operations?.id, security?.id].filter((id): id is string => Boolean(id)), [...termsInText(terms, sectionText(operations)), ...termsInText(terms, sectionText(security))], riskBlocks([operations?.id, security?.id].filter((id): id is string => Boolean(id)), terms)),
    slide("kickoff-questions", "Entra化PJ立ち上げ確認", "目的・対象・現行方式・Entra前提を先に確認", "移行前提を先に確認する。", "decision", { kind: "summary", rationale: "Kickoff questions should work as a decision-prep board." }, migrationSections.slice(0, 4).map((section) => section.id), termsInText(terms, migrationSections.slice(0, 4).map(sectionText).join("\n")), questionBlocks("kickoff", docSpec.openQuestions.filter((question) => migrationSections.slice(0, 4).some((section) => section.id === question.sectionId)), terms, 6)),
    slide("delivery-questions", "移行設計と成果物", "方式・認可・統制・ロードマップ・体制を成果物へ落とす", "移行論点を成果物へ落とす。", "decision", { kind: "summary", rationale: "Delivery questions should be grouped as decision outputs, not a plain table." }, migrationSections.slice(4).map((section) => section.id), termsInText(terms, migrationSections.slice(4).map(sectionText).join("\n")), questionBlocks("delivery", docSpec.openQuestions.filter((question) => migrationSections.slice(4).some((section) => section.id === question.sectionId)), terms, 6)),
    slide("summary", "まとめ", "認証Webは共通基盤だが、ROPC方式の制約を踏まえ移行判断が必要", "仕様理解を棚卸しと移行判断へつなげる。", "action", { kind: "summary", rationale: "Close with actions." }, docSpec.sections.slice(-1).map((section) => section.id), termsInText(terms, docSpec.keyFacts.map((fact) => fact.text).join("\n")), blocksFromLines("summary", ["認証Web: CRANE ADへの認証とユーザー情報取得を代行", "アプリ: 返却結果で権限判断", "今後: Entra ID中心の認証へ移行検討", "次: 現行利用アプリの棚卸し", "成果物: 方式判定表・PoC計画"], [], terms))
  ];

  const slides = candidateSlides.filter((item) => item.sourceSections.length > 0 || item.supportingBlocks.length > 0 || item.id === "overview" || item.id === "summary");

  return {
    strategy: "auth-web-spec",
    title: docSpec.title,
    thesis: "認証Webは共通基盤だが、ROPC方式の制約を踏まえ移行判断が必要である。",
    audience: options.audience ?? "認証Web利用アプリ担当者、ID基盤担当者、セキュリティ担当者",
    desiredAction: options.desiredAction ?? "現行利用を棚卸しし、移行に必要な確認事項を整理する",
    sourceCoverage: coverageFor(docSpec, slides),
    requiredTerms: terms,
    slides
  };
}

function visualTypeForFigure(figure: FigureNeed): SlideIntent["visualType"] {
  if (figure.kind === "architecture") return "native-diagram";
  if (figure.kind === "process") return "flow";
  if (figure.kind === "comparison") return "contrast";
  if (figure.kind === "detail") return "detail";
  if (figure.kind === "summary") return "summary";
  return "table";
}

function maybeArchitectureDiagram(slide: MessageSlideSpec): SlideIntent["diagram"] | undefined {
  const text = [slide.semanticTitle, slide.headline, slide.primaryClaim, ...slide.supportingBlocks.map((block) => `${block.label} ${block.text}`)].join(" ");
  if (!/全体構成|アーキテクチャ|認証Web.*AD|Active Directory/u.test(text)) return undefined;
  return {
    direction: "LR",
    nodes: [
      { id: "user", label: "ユーザー", sublabel: "ID/PW", kind: "actor" },
      { id: "app", label: "アプリ", sublabel: "POST", kind: "system" },
      { id: "auth", label: "認証Web", sublabel: "認証代行", kind: "process", emphasis: true },
      { id: "ad", label: "AD", sublabel: "LDAPS", kind: "system" }
    ],
    edges: [
      { from: "user", to: "app", label: "入力" },
      { from: "app", to: "auth" },
      { from: "auth", to: "ad" },
      { from: "auth", to: "app" }
    ],
    groups: []
  };
}

export function deckMessageMapFromMessageSpec(messageSpec: MessageSpec): DeckMessageMap {
  const requiredTermPriority = (term: string): number => {
    const priority = ["memberOf", "GroupName", "sAMAccountName", "Expiration", "PCIDSS", "OAuth", "PKCE", "Managed Identity", "Graph API", "Active Directory"];
    const index = priority.indexOf(term);
    return index === -1 ? priority.length : index;
  };
  const requiredTermEvidence = (slideSpec: MessageSlideSpec): string[] => {
    const terms = slideSpec.requiredTerms;
    const sorted = [...new Set(terms)].sort((a, b) => requiredTermPriority(a) - requiredTermPriority(b) || a.localeCompare(b));
    const has = (term: string) => sorted.includes(term);
    const group = (label: string, candidates: string[], suffix = "を確認"): string | undefined => {
      const picked = candidates.filter(has).slice(0, 4);
      return picked.length ? `${label}: ${picked.join(" / ")} ${suffix}`.trim() : undefined;
    };
    const groupsBySlide: Record<string, Array<string | undefined>> = {
      "system-purpose": [group("理解対象", ["Active Directory", "Entra ID"], "との関係")],
      architecture: [group("入力値", ["userName", "userPassword", "appName"], "の受け渡し"), group("接続先", ["Active Directory", "LDAPS"], "")],
      capabilities: [group("提供範囲", ["Active Directory", "memberOf", "GroupName"], "までを確認")],
      "auth-flow": [group("処理値", ["userName", "userPassword", "appName"], ""), group("照会先", ["Active Directory", "LDAPS"], "")],
      "external-interface": [group("入力契約", ["userName", "username", "userPassword", "appName"], "")],
      "response-format": [group("返却項目", ["sAMAccountName", "memberOf", "GroupName"], "")],
      "result-codes": [group("判定先", ["Active Directory"], "")],
      implementation: [group("設定ファイル", ["Web.config", "Application.config", "NLog.config"], "を確認"), group("運用キー", ["MemoryCache", "Expiration"], "を確認")],
      cache: [group("運用対象", ["MemoryCache", "Expiration"], "")],
      risks: [group("制約確認", ["ROPC", "MFA", "PCIDSS"], "で判断"), group("通信前提", ["Active Directory", "HTTPS", "BIG-IP"], "")],
      "kickoff-questions": [group("移行前提", ["Entra ID", "MFA", "ROPC"], "を先に確認")],
      "delivery-questions": [group("方式判定", ["OAuth", "PKCE", "Managed Identity"], "で選ぶ"), group("連携設計", ["Graph API", "Entra ID", "memberOf"], "で詰める")],
      summary: [group("移行判断", ["OAuth", "PKCE", "Managed Identity", "Graph API"], "へつなげる"), group("返却と権限", ["memberOf", "sAMAccountName", "PCIDSS"], "を棚卸し")]
    };
    const contextual = (groupsBySlide[slideSpec.id] ?? []).filter((item): item is string => Boolean(item));
    if (contextual.length > 0) {
      return contextual.slice(0, 2);
    }
    const chunks: string[] = [];
    for (let index = 0; index < sorted.length && chunks.length < 2; index += 3) {
      chunks.push(`確認対象: ${sorted.slice(index, index + 3).join(" / ")}`);
    }
    return chunks;
  };
  return {
    objective: messageSpec.thesis,
    audience: messageSpec.audience,
    desiredAction: messageSpec.desiredAction,
    intents: messageSpec.slides.map((slideSpec) => {
      const evidence = [...requiredTermEvidence(slideSpec), ...slideSpec.supportingBlocks.map((block) => `${block.label}: ${block.text}`)];
      const details = slideSpec.notesBlocks.length
        ? slideSpec.notesBlocks.map((block) => `補足 ${block.label}: ${block.text}`)
        : slideSpec.supportingBlocks.slice(4).map((block) => `補足 ${block.label}: ${block.text}`);
      return {
        slideId: slideSpec.id,
        title: slideSpec.semanticTitle,
        message: slideSpec.primaryClaim,
        slideRole: slideSpec.slideRole,
        visualType: visualTypeForFigure(slideSpec.figureNeed),
        emphasis: slideSpec.headline,
        evidence,
        details,
        sourceTrace: slideSpec.sourceSections,
        quietInfo: slideSpec.requiredTerms,
        ...(slideSpec.figureNeed.kind === "architecture" ? { diagram: maybeArchitectureDiagram(slideSpec) } : {})
      } satisfies SlideIntent;
    })
  };
}

function childSections(docSpec: DocSpec, section: DocSection | undefined): DocSection[] {
  if (!section) return [];
  return docSpec.sections.filter((candidate) => candidate.parentId === section.id);
}

function sectionFamily(docSpec: DocSpec, section: DocSection | undefined): DocSection[] {
  return section ? [section, ...childSections(docSpec, section)] : [];
}

function sectionFamilyIds(docSpec: DocSpec, section: DocSection | undefined): string[] {
  return sectionFamily(docSpec, section).map((item) => item.id);
}

function sectionFamilyText(docSpec: DocSpec, section: DocSection | undefined): string {
  return sectionFamily(docSpec, section).map(sectionText).join("\n");
}

function sectionFamilyLines(docSpec: DocSpec, section: DocSection | undefined): string[] {
  return sectionFamily(docSpec, section).flatMap(sectionLines);
}

function sectionFamilyTables(docSpec: DocSpec, section: DocSection | undefined): DocTable[] {
  const ids = new Set(sectionFamilyIds(docSpec, section));
  return docSpec.tables.filter((table) => ids.has(table.sectionId));
}