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
  title: string;
  thesis: string;
  audience: string;
  desiredAction: string;
  sourceCoverage: SourceCoverage;
  requiredTerms: RequiredTerm[];
  slides: MessageSlideSpec[];
};

export type MessageSpecOptions = {
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
  };
};

export type MessageSpecReviewOptions = {
  minSlides?: number;
  maxSlides?: number;
  minTotalVisibleChars?: number;
  preferredAverageVisibleChars?: number;
};

const TECHNICAL_BUDGET: VisibleTextBudget = { minChars: 180, targetChars: 250, maxChars: 340 };
const NON_SEMANTIC_TITLES = /^(?:KEY|STEP|API|比較|注目|根拠|要約)$/iu;

function sectionText(section: DocSection | undefined): string {
  return section?.text.trim() ?? "";
}

function sectionLines(section: DocSection | undefined): string[] {
  return sectionText(section)
    .split(/\n+/u)
    .map((line) => line.replace(/^[-*]\s+/u, "").trim())
    .filter((line) => line.length >= 4)
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
  return line;
}

function fallbackBlockLabel(idPrefix: string, line: string, index: number): string {
  if (/ユーザーID|パスワード|認証代行/u.test(line)) return "認証代行";
  if (/送信する主なパラメータ|パラメータ/u.test(line)) return "送信項目";
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
  if (/C\/S|レガシー|ブラウザ/u.test(text)) return "C/S・レガシーアプリのブラウザ認証対応を見る";
  if (/ROPC|認可コード|PKCE/u.test(text)) return "ROPC廃止と認可コード+PKCE移行を見る";
  if (/API|Managed Identity|権限/u.test(text)) return "ユーザー委任・アプリ権限・Managed Identityを選ぶ";
  if (/シングルサインオン|サインアウト|セッション|トークン/u.test(text)) return "SSO・サインアウト・トークン期限を決める";
  if (/ADグループ|Entra IDグループ|同期/u.test(text)) return "ADグループの移行・同期・再設計を決める";
  if (/MFA|条件付きアクセス|パスワードレス/u.test(text)) return "MFA・条件付きアクセス・パスワードレス前提を見る";
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
      visibleMustTerms: visibleMustTerms.length
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
      "仕組み・責務・運用リスク・移行確認を同じ流れで見る",
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
    slide("capabilities", "提供機能", "認証代行・属性取得・グループ取得・返却・キャッシュを提供", "認証Webの提供範囲を確認する。", "evidence", { kind: "summary", rationale: "Capabilities are better read as a proof board than a contract table." }, capabilities ? [capabilities.id] : [], termsInText(terms, sectionText(capabilities)), blocksFromLines("capabilities", sectionLines(capabilities), capabilities ? [capabilities.id] : [], terms, 6)),
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
      "返却形式と返却項目を同じ契約として確認する。",
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
      return picked.length ? `${label}: ${picked.join(" / ")} ${suffix}` : undefined;
    };
    const groupsBySlide: Record<string, Array<string | undefined>> = {
      "system-purpose": [group("理解対象", ["Active Directory", "Entra ID"], "との関係を見る")],
      architecture: [group("流れで見る入力", ["userName", "userPassword", "appName"], "の受け渡し"), group("接続先", ["Active Directory", "LDAPS"], "を見る")],
      capabilities: [group("提供範囲", ["Active Directory", "memberOf", "GroupName"], "までを確認")],
      "auth-flow": [group("処理で追う値", ["userName", "userPassword", "appName"], "を見る"), group("照会先", ["Active Directory", "LDAPS"], "を見る")],
      "external-interface": [group("入力契約", ["userName", "username", "userPassword", "appName"], "として確認")],
      "response-format": [group("返却項目", ["sAMAccountName", "memberOf", "GroupName"], "として確認")],
      "result-codes": [group("判定先", ["Active Directory"], "との結果を見る")],
      implementation: [group("設定ファイル", ["Web.config", "Application.config", "NLog.config"], "を確認"), group("運用キー", ["MemoryCache", "Expiration"], "を確認")],
      cache: [group("運用確認", ["MemoryCache", "Expiration"], "で見る")],
      risks: [group("制約確認", ["ROPC", "MFA", "PCIDSS"], "で判断"), group("通信前提", ["Active Directory", "HTTPS", "BIG-IP"], "を見る")],
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
      chunks.push(`確認対象: ${sorted.slice(index, index + 3).join(" / ")} を見る`);
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
        evidence: evidence.slice(0, 7),
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