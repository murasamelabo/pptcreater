import { createSourceAnchor, SourceAnchorSchema } from "@pptcreater/authoring-contracts";
import { z } from "zod";

const InlineMarkSchema = z.object({
  kind: z.enum(["strong", "emphasis", "code", "link"]),
  text: z.string(),
  href: z.string().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
});
export type InlineMark = z.infer<typeof InlineMarkSchema>;

const BlockBaseSchema = z.object({
  anchor: SourceAnchorSchema,
  order: z.number().int().nonnegative(),
  parentHeadingId: z.string().optional(),
  raw: z.string(),
  marks: z.array(InlineMarkSchema).default([])
});

export const SourceBlockSchema = z.discriminatedUnion("kind", [
  BlockBaseSchema.extend({ kind: z.literal("heading"), level: z.number().int().min(1).max(6), text: z.string() }),
  BlockBaseSchema.extend({ kind: z.literal("paragraph"), text: z.string() }),
  BlockBaseSchema.extend({ kind: z.literal("list-item"), text: z.string(), ordered: z.boolean(), ordinal: z.number().int().positive().optional(), depth: z.number().int().nonnegative() }),
  BlockBaseSchema.extend({ kind: z.literal("table"), headers: z.array(z.string()), alignments: z.array(z.enum(["left", "center", "right", "default"])), rows: z.array(z.array(z.string())) }),
  BlockBaseSchema.extend({ kind: z.literal("code"), language: z.string(), code: z.string() }),
  BlockBaseSchema.extend({ kind: z.literal("quote"), text: z.string() }),
  BlockBaseSchema.extend({ kind: z.literal("image"), alt: z.string(), source: z.string(), title: z.string().optional() }),
  BlockBaseSchema.extend({ kind: z.literal("citation"), label: z.string(), target: z.string() })
]);
export type SourceBlock = z.infer<typeof SourceBlockSchema>;

export const SourceNotebookSchema = z.object({
  version: z.literal("1.0"),
  sourceUri: z.string().min(1),
  title: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{16}$/u),
  sourceText: z.string(),
  blocks: z.array(SourceBlockSchema),
  parseWarnings: z.array(z.object({ line: z.number().int().positive(), message: z.string().min(1) })).default([])
});
export type SourceNotebook = z.infer<typeof SourceNotebookSchema>;

export type ParseSourceNotebookOptions = {
  sourceUri: string;
  previous?: SourceNotebook;
  title?: string;
  maxSourceBytes?: number;
};

type HeadingState = { level: number; text: string; provisionalId: string };
type DraftBlock = SourceBlock extends infer Block
  ? Block extends SourceBlock
    ? Omit<Block, "anchor" | "order" | "parentHeadingId"> & { structuralPath: string[]; contentForId: string; parentProvisionalId?: string; provisionalHeadingId?: string }
    : never
  : never;

function normalizeNewlines(markdown: string): string {
  return markdown.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

function hashSource(markdown: string): string {
  return createSourceAnchor({ sourceUri: "notebook-source", structuralPath: ["source"], kind: "paragraph", content: normalizeNewlines(markdown) }).normalizedContentHash;
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\s*\|/u, "").replace(/\|\s*$/u, "").split("|").map((cell) => cell.trim());
}

function tableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function tableAlignments(line: string): Array<"left" | "center" | "right" | "default"> {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (left) return "left";
    if (right) return "right";
    return "default";
  });
}

function extractMarks(raw: string): InlineMark[] {
  const marks: InlineMark[] = [];
  const patterns: Array<{ kind: InlineMark["kind"]; regex: RegExp; textGroup: number; hrefGroup?: number }> = [
    { kind: "strong", regex: /\*\*([^*]+)\*\*/gu, textGroup: 1 },
    { kind: "emphasis", regex: /(?<!\*)\*([^*]+)\*(?!\*)/gu, textGroup: 1 },
    { kind: "code", regex: /`([^`]+)`/gu, textGroup: 1 },
    { kind: "link", regex: /\[([^\]]+)\]\(([^)]+)\)/gu, textGroup: 1, hrefGroup: 2 }
  ];
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern.regex)) {
      marks.push({
        kind: pattern.kind,
        text: match[pattern.textGroup] ?? "",
        href: pattern.hrefGroup ? match[pattern.hrefGroup] : undefined,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length
      });
    }
  }
  return marks.sort((a, b) => a.start - b.start || a.end - b.end);
}

function headingPath(stack: HeadingState[]): string[] {
  return stack.map((heading) => heading.text);
}

function previousByStructuralKey(notebook: SourceNotebook | undefined): Map<string, SourceBlock[]> {
  const map = new Map<string, SourceBlock[]>();
  for (const block of notebook?.blocks ?? []) {
    const key = `${block.anchor.kind}\u001f${block.anchor.structuralPath.join("/")}`;
    const values = map.get(key) ?? [];
    values.push(block);
    map.set(key, values);
  }
  return map;
}

function assignAnchors(drafts: DraftBlock[], options: ParseSourceNotebookOptions): SourceBlock[] {
  const previous = previousByStructuralKey(options.previous);
  const occurrences = new Map<string, number>();
  const prepared = drafts.map((draft) => {
    const structuralKey = `${draft.kind}\u001f${draft.structuralPath.join("/")}`;
    const contentHash = createSourceAnchor({ sourceUri: options.sourceUri, structuralPath: draft.structuralPath, kind: draft.kind, content: draft.contentForId }).normalizedContentHash;
    const occurrenceKey = `${structuralKey}\u001f${contentHash}`;
    const occurrence = occurrences.get(occurrenceKey) ?? 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    const candidate = createSourceAnchor({ sourceUri: options.sourceUri, structuralPath: draft.structuralPath, kind: draft.kind, content: draft.contentForId, occurrence });
    return { draft, structuralKey, candidate, occurrence };
  });
  const exactPreviousIds = new Set(prepared.flatMap(({ structuralKey, candidate }) => previous.get(structuralKey)?.some((block) => block.anchor.id === candidate.id) ? [candidate.id] : []));
  const usedPreviousIds = new Set<string>();
  const finalHeadingIds = new Map<string, string>();
  return prepared.map(({ draft, structuralKey, candidate, occurrence }, order) => {
    const priorBlocks = previous.get(structuralKey) ?? [];
    const exactPrevious = priorBlocks.find((block) => block.anchor.id === candidate.id && !usedPreviousIds.has(block.anchor.id));
    const lineagePrevious = exactPrevious ?? priorBlocks.find((block) => !usedPreviousIds.has(block.anchor.id) && !exactPreviousIds.has(block.anchor.id));
    if (lineagePrevious) usedPreviousIds.add(lineagePrevious.anchor.id);
    const anchor = exactPrevious
      ? candidate
      : createSourceAnchor({
          sourceUri: options.sourceUri,
          structuralPath: draft.structuralPath,
          kind: draft.kind,
          content: draft.contentForId,
          occurrence,
          previousId: lineagePrevious?.anchor.id
        });
    const parentHeadingId = draft.parentProvisionalId ? finalHeadingIds.get(draft.parentProvisionalId) : undefined;
    const { structuralPath: _structuralPath, contentForId: _contentForId, parentProvisionalId: _parentProvisionalId, provisionalHeadingId: _provisionalHeadingId, ...block } = draft;
    const parsed = SourceBlockSchema.parse({ ...block, parentHeadingId, anchor, order });
    if (parsed.kind === "heading" && draft.provisionalHeadingId) finalHeadingIds.set(draft.provisionalHeadingId, parsed.anchor.id);
    return parsed;
  });
}

export function parseMarkdownToSourceNotebook(markdown: string, options: ParseSourceNotebookOptions): SourceNotebook {
  const maxSourceBytes = options.maxSourceBytes ?? 10 * 1024 * 1024;
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) throw new Error("maxSourceBytes must be a positive safe integer.");
  const sourceBytes = Buffer.byteLength(markdown, "utf8");
  if (sourceBytes > maxSourceBytes) throw new Error(`Markdown source is ${sourceBytes} bytes; maximum allowed is ${maxSourceBytes}.`);
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.split("\n");
  const drafts: DraftBlock[] = [];
  const warnings: SourceNotebook["parseWarnings"] = [];
  const headings: HeadingState[] = [];
  let paragraphLines: string[] = [];

  const parentProvisionalId = (): string | undefined => headings.at(-1)?.provisionalId;
  const path = (suffix: string): string[] => [...headingPath(headings), suffix];
  const pushParagraph = (): void => {
    if (!paragraphLines.length) return;
    const raw = paragraphLines.join("\n");
    const text = paragraphLines.map((line) => line.trim()).join(" ").trim();
    if (text) drafts.push({ kind: "paragraph", raw, text, marks: extractMarks(raw), parentProvisionalId: parentProvisionalId(), structuralPath: path("paragraph"), contentForId: text });
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      pushParagraph();
      const level = heading[1].length;
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      const text = heading[2].trim();
      const structuralPath = [...headingPath(headings), text];
      const anchor = createSourceAnchor({ sourceUri: options.sourceUri, structuralPath, kind: "heading", content: text });
      headings.push({ level, text, provisionalId: anchor.id });
      drafts.push({ kind: "heading", level, text, raw: line, marks: extractMarks(line), parentProvisionalId: headings.at(-2)?.provisionalId, provisionalHeadingId: anchor.id, structuralPath, contentForId: text });
      continue;
    }

    const fence = /^```\s*([^\s`]*)\s*$/u.exec(line);
    if (fence) {
      pushParagraph();
      const start = index;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index >= lines.length) warnings.push({ line: start + 1, message: "Unclosed fenced code block." });
      const raw = lines.slice(start, Math.min(index + 1, lines.length)).join("\n");
      const code = codeLines.join("\n");
      drafts.push({ kind: "code", language: fence[1] || "text", code, raw, marks: [], parentProvisionalId: parentProvisionalId(), structuralPath: path("code"), contentForId: `${fence[1]}\n${code}` });
      continue;
    }

    if (line.includes("|") && tableSeparator(lines[index + 1] ?? "")) {
      pushParagraph();
      const start = index;
      const headers = splitTableRow(line);
      const alignments = tableAlignments(lines[index + 1]);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      const raw = lines.slice(start, index + 1).join("\n");
      drafts.push({ kind: "table", headers, alignments, rows, raw, marks: extractMarks(raw), parentProvisionalId: parentProvisionalId(), structuralPath: path("table"), contentForId: JSON.stringify({ headers, alignments, rows }) });
      continue;
    }

    const image = /^!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']+)["'])?\)\s*$/u.exec(line.trim());
    if (image) {
      pushParagraph();
      drafts.push({ kind: "image", alt: image[1], source: image[2], title: image[3], raw: line, marks: [], parentProvisionalId: parentProvisionalId(), structuralPath: path("image"), contentForId: `${image[1]}\n${image[2]}\n${image[3] ?? ""}` });
      continue;
    }

    const citation = /^\[([^\]]+)\]\s*:\s*(\S+)\s*$/u.exec(line.trim());
    if (citation) {
      pushParagraph();
      drafts.push({ kind: "citation", label: citation[1], target: citation[2], raw: line, marks: [], parentProvisionalId: parentProvisionalId(), structuralPath: path(`citation:${citation[1]}`), contentForId: `${citation[1]}\n${citation[2]}` });
      continue;
    }

    const quote = /^>\s?(.*)$/u.exec(line);
    if (quote) {
      pushParagraph();
      const quoteLines = [quote[1]];
      const start = index;
      while (/^>\s?(.*)$/u.test(lines[index + 1] ?? "")) {
        index += 1;
        quoteLines.push(/^>\s?(.*)$/u.exec(lines[index])![1]);
      }
      const raw = lines.slice(start, index + 1).join("\n");
      const text = quoteLines.join("\n");
      drafts.push({ kind: "quote", text, raw, marks: extractMarks(raw), parentProvisionalId: parentProvisionalId(), structuralPath: path("quote"), contentForId: text });
      continue;
    }

    const unordered = /^(\s*)[-+*]\s+(.+)$/u.exec(line);
    const ordered = /^(\s*)(\d+)[.)]\s+(.+)$/u.exec(line);
    if (unordered || ordered) {
      pushParagraph();
      const indent = (unordered?.[1] ?? ordered?.[1] ?? "").replace(/\t/gu, "    ").length;
      const text = unordered?.[2] ?? ordered?.[3] ?? "";
      drafts.push({ kind: "list-item", text, ordered: Boolean(ordered), ordinal: ordered ? Number(ordered[2]) : undefined, depth: Math.floor(indent / 2), raw: line, marks: extractMarks(line), parentProvisionalId: parentProvisionalId(), structuralPath: path("list-item"), contentForId: text });
      continue;
    }

    if (!line.trim()) {
      pushParagraph();
      continue;
    }
    paragraphLines.push(line);
  }
  pushParagraph();

  const blocks = assignAnchors(drafts, options);
  const title = options.title ?? blocks.find((block): block is Extract<SourceBlock, { kind: "heading" }> => block.kind === "heading" && block.level === 1)?.text ?? "Document";
  return SourceNotebookSchema.parse({ version: "1.0", sourceUri: options.sourceUri, title, sourceHash: hashSource(normalized), sourceText: normalized, blocks, parseWarnings: warnings });
}

export function serializeSourceNotebook(notebook: SourceNotebook): string {
  return normalizeNewlines(SourceNotebookSchema.parse(notebook).sourceText);
}

export type LegacyDocSpecLike = {
  sourceId: string;
  title: string;
  sections: Array<{ id: string; level: number; title: string; text: string; parentId?: string }>;
  tables?: Array<{ id: string; sectionId: string; headers: string[]; rows: string[][] }>;
  diagrams?: Array<{ id: string; sectionId: string; kind: string; source: string }>;
};

/**
 * One-way compatibility adapter. It preserves the information available in a legacy DocSpec but
 * cannot recover Markdown syntax already discarded by that format. New authoring must parse source
 * material directly with parseMarkdownToSourceNotebook.
 */
export function sourceNotebookFromLegacyDocSpec(docSpec: LegacyDocSpecLike, sourceUri = `legacy:${docSpec.sourceId}`): SourceNotebook {
  const sectionById = new Map(docSpec.sections.map((section) => [section.id, section]));
  const provisionalHeadingIds = new Map<string, string>();
  const sectionPath = (section: LegacyDocSpecLike["sections"][number]): string[] => {
    const values = [section.title];
    let parentId = section.parentId;
    while (parentId) {
      const parent = sectionById.get(parentId);
      if (!parent) break;
      values.unshift(parent.title);
      parentId = parent.parentId;
    }
    return values;
  };
  const drafts: DraftBlock[] = [];
  for (const section of docSpec.sections) {
    const structuralPath = sectionPath(section);
    const provisionalHeadingId = createSourceAnchor({ sourceUri, structuralPath, kind: "heading", content: section.title }).id;
    provisionalHeadingIds.set(section.id, provisionalHeadingId);
    const parentProvisionalId = section.parentId ? provisionalHeadingIds.get(section.parentId) : undefined;
    drafts.push({ kind: "heading", level: section.level, text: section.title, raw: `${"#".repeat(section.level)} ${section.title}`, marks: [], parentProvisionalId, provisionalHeadingId, structuralPath, contentForId: section.title });
    if (section.text.trim()) drafts.push({ kind: "paragraph", text: section.text.trim(), raw: section.text.trim(), marks: [], parentProvisionalId: provisionalHeadingId, structuralPath: [...structuralPath, "paragraph"], contentForId: section.text.trim() });
    for (const table of (docSpec.tables ?? []).filter((item) => item.sectionId === section.id)) {
      const alignments = table.headers.map(() => "default" as const);
      const raw = [table.headers.join(" | "), ...table.rows.map((row) => row.join(" | "))].join("\n");
      drafts.push({ kind: "table", headers: table.headers, rows: table.rows, alignments, raw, marks: [], parentProvisionalId: provisionalHeadingId, structuralPath: [...structuralPath, `table:${table.id}`], contentForId: JSON.stringify({ headers: table.headers, rows: table.rows }) });
    }
    for (const diagram of (docSpec.diagrams ?? []).filter((item) => item.sectionId === section.id)) {
      drafts.push({ kind: "code", language: diagram.kind, code: diagram.source, raw: diagram.source, marks: [], parentProvisionalId: provisionalHeadingId, structuralPath: [...structuralPath, `diagram:${diagram.id}`], contentForId: `${diagram.kind}\n${diagram.source}` });
    }
  }
  const blocks = assignAnchors(drafts, { sourceUri });
  const sourceText = blocks.map((block) => block.raw).join("\n\n");
  return SourceNotebookSchema.parse({ version: "1.0", sourceUri, title: docSpec.title, sourceHash: hashSource(sourceText), sourceText, blocks, parseWarnings: [{ line: 1, message: "Adapted from legacy DocSpec; original Markdown syntax may already be lost." }] });
}

export function notebookCoverage(notebook: SourceNotebook): Record<SourceBlock["kind"], number> {
  const result = { heading: 0, paragraph: 0, "list-item": 0, table: 0, code: 0, quote: 0, image: 0, citation: 0 } satisfies Record<SourceBlock["kind"], number>;
  for (const block of notebook.blocks) result[block.kind] += 1;
  return result;
}
