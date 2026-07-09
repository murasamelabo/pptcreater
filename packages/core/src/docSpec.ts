export type DocSection = {
  id: string;
  level: number;
  title: string;
  text: string;
  parentId?: string;
};

export type DocTable = {
  id: string;
  sectionId: string;
  headers: string[];
  rows: string[][];
};

export type DocDiagram = {
  id: string;
  sectionId: string;
  kind: string;
  source: string;
};

export type DocTermCategory = "config" | "protocol" | "identity" | "field" | "risk" | "product" | "standard" | "code";

export type RequiredTerm = {
  term: string;
  sourceSectionIds: string[];
  category: DocTermCategory;
  visibility: "must-visible" | "may-notes";
};

export type DocFact = {
  id: string;
  sectionId: string;
  text: string;
};

export type DocRisk = {
  id: string;
  sectionId: string;
  text: string;
};

export type DocQuestion = {
  id: string;
  sectionId: string;
  text: string;
};

export type DocSpec = {
  sourceId: string;
  title: string;
  sections: DocSection[];
  tables: DocTable[];
  diagrams: DocDiagram[];
  glossary: RequiredTerm[];
  keyFacts: DocFact[];
  risks: DocRisk[];
  openQuestions: DocQuestion[];
  requiredTerms: RequiredTerm[];
};

export type DocSpecMarkdownOptions = {
  sourceId?: string;
  title?: string;
};

type MutableSection = DocSection & { lines: string[] };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/u;
const FENCE_RE = /^```\s*([^\s`]*)/u;

function slugify(value: string, fallback: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return ascii || fallback;
}

function stripInlineMarkup(value: string): string {
  return value
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*_~]/gu, "")
    .trim();
}

function parseTable(lines: string[], index: number): { headers: string[]; rows: string[][]; nextIndex: number } | null {
  const header = lines[index];
  const separator = lines[index + 1];
  if (!header?.includes("|") || !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(separator ?? "")) return null;
  const splitRow = (line: string): string[] => line.replace(/^\s*\|/u, "").replace(/\|\s*$/u, "").split("|").map((cell) => stripInlineMarkup(cell));
  const headers = splitRow(header);
  const rows: string[][] = [];
  let cursor = index + 2;
  while (cursor < lines.length && lines[cursor].includes("|")) {
    rows.push(splitRow(lines[cursor]));
    cursor += 1;
  }
  return rows.length ? { headers, rows, nextIndex: cursor } : null;
}

function sectionParentId(sections: MutableSection[], level: number): string | undefined {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    if (sections[index].level < level) return sections[index].id;
  }
  return undefined;
}

function classifyTerm(term: string): DocTermCategory {
  if (/\.config$/iu.test(term) || /^(?:adUrl|adDomain|excludeEncoding|prohibitedGet|Expiration)$/u.test(term)) return "config";
  if (/^(?:userName|username|userPassword|appName|sAMAccountName|memberOf|GroupName|sn|givenName|displayName|company|department|title|mail)$/u.test(term)) return "field";
  if (/^(?:OIDC|OAuth|SAML|PKCE|ROPC|LDAPS|HTTPS|MFA|PCIDSS)$/iu.test(term)) return "protocol";
  if (/^(?:Active Directory|Entra ID|Managed Identity|Graph API|MemoryCache|BIG-IP)$/u.test(term)) return "product";
  if (/JWT|RFC|ISO|PCI/u.test(term)) return "standard";
  if (/^[A-Za-z][A-Za-z0-9_.-]{2,}$/u.test(term)) return "code";
  return "identity";
}

function extractInlineCodeTerms(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\n]{2,80})`/gu)].map((match) => match[1].trim()).filter(Boolean);
}

const KNOWN_REQUIRED_TERMS = [
  "Active Directory",
  "Entra ID",
  "userName",
  "username",
  "userPassword",
  "appName",
  "sAMAccountName",
  "memberOf",
  "GroupName",
  "Web.config",
  "Application.config",
  "NLog.config",
  "MemoryCache",
  "Expiration",
  "ROPC",
  "MFA",
  "PCIDSS",
  "OIDC",
  "OAuth",
  "SAML",
  "PKCE",
  "Managed Identity",
  "Graph API",
  "LDAPS",
  "HTTPS",
  "BIG-IP"
];

function extractKnownTerms(markdown: string): string[] {
  return KNOWN_REQUIRED_TERMS.filter((term) => markdown.includes(term));
}

function makeRequiredTerms(markdown: string, sections: DocSection[]): RequiredTerm[] {
  const terms = Array.from(new Set([...extractInlineCodeTerms(markdown), ...extractKnownTerms(markdown)]));
  return terms.map((term) => {
    const sourceSectionIds = sections.filter((section) => section.text.includes(term) || section.title.includes(term)).map((section) => section.id);
    return {
      term,
      sourceSectionIds: sourceSectionIds.length ? sourceSectionIds : [sections[0]?.id ?? "root"],
      category: classifyTerm(term),
      visibility: /^(?:sn|givenName|displayName|company|department|title|mail)$/u.test(term) ? "may-notes" : "must-visible"
    };
  });
}

function extractFacts(sections: DocSection[]): DocFact[] {
  const facts: DocFact[] = [];
  sections.forEach((section) => {
    const lines = section.text.split(/\n+/u).map((line) => stripInlineMarkup(line.replace(/^[-*]\s+/u, ""))).filter((line) => line.length >= 8);
    lines.slice(0, 8).forEach((line, index) => facts.push({ id: `${section.id}-fact-${index + 1}`, sectionId: section.id, text: line }));
  });
  return facts;
}

function extractRisks(sections: DocSection[]): DocRisk[] {
  const riskWords = /リスク|漏洩|攻撃|禁止|停止|不足|例外|PCIDSS|MFA|ROPC|できない|満たせない/u;
  return extractFacts(sections)
    .filter((fact) => riskWords.test(fact.text))
    .map((fact, index) => ({ id: `risk-${index + 1}`, sectionId: fact.sectionId, text: fact.text }));
}

function extractQuestions(sections: DocSection[]): DocQuestion[] {
  const questions: DocQuestion[] = [];
  sections.forEach((section) => {
    section.text.split(/\n+/u).forEach((line) => {
      const text = stripInlineMarkup(line.replace(/^[-*]\s+/u, ""));
      if (text.endsWith("か。") || text.endsWith("か?")) {
        questions.push({ id: `question-${questions.length + 1}`, sectionId: section.id, text });
      }
    });
  });
  return questions;
}

export function extractDocSpecFromMarkdown(markdown: string, options: DocSpecMarkdownOptions = {}): DocSpec {
  const normalized = markdown.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const sections: MutableSection[] = [];
  const tables: DocTable[] = [];
  const diagrams: DocDiagram[] = [];
  let current: MutableSection | undefined;
  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];

  const ensureSection = (): MutableSection => {
    if (current) return current;
    current = { id: "root", level: 1, title: options.title ?? "Document", text: "", lines: [] };
    sections.push(current);
    return current;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[1] || "code";
        fenceLines = [];
      } else {
        inFence = false;
        const section = ensureSection();
        const source = fenceLines.join("\n");
        if (/mermaid|flowchart|sequenceDiagram/iu.test(fenceLang) || /flowchart|sequenceDiagram/iu.test(source)) {
          diagrams.push({ id: `${section.id}-diagram-${diagrams.length + 1}`, sectionId: section.id, kind: fenceLang || "mermaid", source });
        }
        section.lines.push(source);
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = stripInlineMarkup(heading[2]);
      const id = slugify(title, `section-${sections.length + 1}`);
      current = { id, level, title, parentId: sectionParentId(sections, level), text: "", lines: [] };
      sections.push(current);
      continue;
    }
    const table = parseTable(lines, index);
    if (table) {
      const section = ensureSection();
      tables.push({ id: `${section.id}-table-${tables.length + 1}`, sectionId: section.id, headers: table.headers, rows: table.rows });
      section.lines.push([table.headers.join(" | "), ...table.rows.map((row) => row.join(" | "))].join("\n"));
      index = table.nextIndex - 1;
      continue;
    }
    ensureSection().lines.push(line);
  }

  const docSections: DocSection[] = sections.map(({ lines: sectionLines, ...section }) => ({ ...section, text: sectionLines.join("\n").trim() }));
  const title = options.title ?? docSections.find((section) => section.level === 1)?.title ?? "Document";
  const requiredTerms = makeRequiredTerms(normalized, docSections);
  const keyFacts = extractFacts(docSections);
  return {
    sourceId: options.sourceId ?? slugify(title, "doc"),
    title,
    sections: docSections,
    tables,
    diagrams,
    glossary: requiredTerms,
    keyFacts,
    risks: extractRisks(docSections),
    openQuestions: extractQuestions(docSections),
    requiredTerms
  };
}