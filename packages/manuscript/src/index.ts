import { SourceNotebookSchema, type SourceNotebook } from "@pptcreater/source-notebook";
import { z } from "zod";

export const EditorialDecisionSchema = z.object({
  kind: z.enum(["keep", "merge", "split", "omit"]),
  sourceRefs: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1)
});
export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>;

export const FigureBriefSchema = z.object({
  need: z.string().min(1),
  dataShape: z.enum(["none", "sequence", "comparison", "hierarchy", "relationship", "table", "metric", "image", "custom"]),
  required: z.boolean().default(false),
  catalogHints: z.array(z.string().min(1)).default([]),
  avoid: z.array(z.string().min(1)).default([])
});
export type FigureBrief = z.infer<typeof FigureBriefSchema>;

export const ManuscriptSlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  takeaway: z.string().min(1),
  visibleBody: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([]),
  sourceRefs: z.array(z.string().min(1)).min(1),
  editorialDecisions: z.array(EditorialDecisionSchema).min(1),
  figure: FigureBriefSchema.optional()
}).superRefine((slide, context) => {
  const slideRefs = new Set(slide.sourceRefs);
  for (let decisionIndex = 0; decisionIndex < slide.editorialDecisions.length; decisionIndex += 1) {
    for (const sourceRef of slide.editorialDecisions[decisionIndex].sourceRefs) {
      if (!slideRefs.has(sourceRef)) context.addIssue({ code: "custom", path: ["editorialDecisions", decisionIndex, "sourceRefs"], message: `Editorial decision references ${sourceRef}, which is not present in slide.sourceRefs.` });
    }
  }
});
export type ManuscriptSlide = z.infer<typeof ManuscriptSlideSchema>;

export const ManuscriptChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  purpose: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).min(1),
  slides: z.array(ManuscriptSlideSchema).min(1)
});
export type ManuscriptChapter = z.infer<typeof ManuscriptChapterSchema>;

export const DeckManuscriptSchema = z.object({
  version: z.literal("1.0"),
  title: z.string().min(1),
  audience: z.string().min(1),
  purpose: z.string().min(1),
  desiredAction: z.string().min(1),
  thesis: z.string().min(1),
  sourceNotebookHash: z.string().regex(/^[a-f0-9]{16}$/u),
  chapters: z.array(ManuscriptChapterSchema).min(1),
  sourceOmissions: z.array(EditorialDecisionSchema.refine((decision) => decision.kind === "omit", "sourceOmissions entries must have kind=omit")).default([])
});
export type DeckManuscript = z.infer<typeof DeckManuscriptSchema>;

export type ManuscriptCoverage = {
  totalSourceBlocks: number;
  referencedSourceBlocks: number;
  omittedSourceBlocks: number;
  unexplainedSourceBlocks: string[];
  unknownSourceRefs: string[];
  coverageRatio: number;
};

export function reviewManuscriptCoverage(notebookInput: SourceNotebook, manuscriptInput: DeckManuscript): ManuscriptCoverage {
  const notebook = SourceNotebookSchema.parse(notebookInput);
  const manuscript = DeckManuscriptSchema.parse(manuscriptInput);
  if (manuscript.sourceNotebookHash !== notebook.sourceHash) throw new Error("Manuscript sourceNotebookHash does not match the Source Notebook.");
  const sourceIds = new Set(notebook.blocks.map((block) => block.anchor.id));
  const referenced = new Set(manuscript.chapters.flatMap((chapter) => [...chapter.sourceRefs, ...chapter.slides.flatMap((slide) => slide.sourceRefs)]));
  const omitted = new Set(manuscript.sourceOmissions.flatMap((decision) => decision.sourceRefs));
  const allDeclared = new Set([...referenced, ...omitted]);
  const unknownSourceRefs = [...allDeclared].filter((id) => !sourceIds.has(id));
  const unexplainedSourceBlocks = [...sourceIds].filter((id) => !allDeclared.has(id));
  const covered = [...sourceIds].filter((id) => allDeclared.has(id)).length;
  return {
    totalSourceBlocks: sourceIds.size,
    referencedSourceBlocks: [...sourceIds].filter((id) => referenced.has(id)).length,
    omittedSourceBlocks: [...sourceIds].filter((id) => omitted.has(id)).length,
    unexplainedSourceBlocks,
    unknownSourceRefs,
    coverageRatio: sourceIds.size ? covered / sourceIds.size : 1
  };
}

export function assertCompleteManuscriptCoverage(notebook: SourceNotebook, manuscript: DeckManuscript): ManuscriptCoverage {
  const coverage = reviewManuscriptCoverage(notebook, manuscript);
  if (coverage.unknownSourceRefs.length) throw new Error(`Manuscript references unknown source IDs: ${coverage.unknownSourceRefs.join(", ")}`);
  if (coverage.unexplainedSourceBlocks.length) throw new Error(`Manuscript leaves source blocks unexplained: ${coverage.unexplainedSourceBlocks.join(", ")}`);
  return coverage;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function serializeDeckManuscript(manuscriptInput: DeckManuscript): string {
  const manuscript = DeckManuscriptSchema.parse(manuscriptInput);
  const lines = [
    "---",
    `version: ${yamlString(manuscript.version)}`,
    `title: ${yamlString(manuscript.title)}`,
    `audience: ${yamlString(manuscript.audience)}`,
    `purpose: ${yamlString(manuscript.purpose)}`,
    `desiredAction: ${yamlString(manuscript.desiredAction)}`,
    `thesis: ${yamlString(manuscript.thesis)}`,
    `sourceNotebookHash: ${yamlString(manuscript.sourceNotebookHash)}`,
    "---",
    ""
  ];
  for (const chapter of manuscript.chapters) {
    lines.push(`# ${chapter.title}`, "", `> ${chapter.purpose}`, "", `<!-- Chapter source refs: ${chapter.sourceRefs.join(", ")} -->`, "");
    for (const slide of chapter.slides) {
      lines.push(`## ${slide.title}`, "", `**Takeaway:** ${slide.takeaway}`, "");
      lines.push(...slide.visibleBody, "");
      if (slide.figure) {
        lines.push(`**Figure brief:** ${slide.figure.need}`, `- Data shape: ${slide.figure.dataShape}`, `- Required: ${slide.figure.required ? "yes" : "no"}`);
        if (slide.figure.catalogHints.length) lines.push(`- Catalog hints: ${slide.figure.catalogHints.join(", ")}`);
        if (slide.figure.avoid.length) lines.push(`- Avoid: ${slide.figure.avoid.join(", ")}`);
        lines.push("");
      }
      lines.push("**Source refs:**", ...slide.sourceRefs.map((ref) => `- ${ref}`), "", "**Editorial decisions:**", ...slide.editorialDecisions.map((decision) => `- ${decision.kind}: ${decision.reason} [${decision.sourceRefs.join(", ")}]`), "");
      if (slide.notes.length) lines.push("**Speaker notes:**", ...slide.notes.map((note) => `- ${note}`), "");
    }
  }
  if (manuscript.sourceOmissions.length) lines.push("# Source omissions", "", ...manuscript.sourceOmissions.map((decision) => `- ${decision.reason} [${decision.sourceRefs.join(", ")}]`), "");
  return `\uFEFF${lines.join("\n").trimEnd()}\n`;
}

/**
 * Creates a lossless editorial starting point: one chapter per heading family and one slide per
 * source block. It is intentionally not the final deck outline; a manuscript author must merge,
 * split, title, and rewrite these drafts while preserving sourceRefs and editorial reasons.
 */
export function createLosslessManuscriptDraft(notebookInput: SourceNotebook, options: { audience: string; purpose: string; desiredAction: string }): DeckManuscript {
  const notebook = SourceNotebookSchema.parse(notebookInput);
  const headingBlocks = notebook.blocks.filter((block) => block.kind === "heading");
  const topHeadings = headingBlocks.filter((heading) => heading.level <= 2);
  const chapterSeeds = topHeadings.length ? topHeadings : headingBlocks.slice(0, 1);
  const assigned = new Set<string>();
  const chapters = chapterSeeds.map((heading, chapterIndex) => {
    const nextHeadingOrder = chapterSeeds[chapterIndex + 1]?.order ?? Number.POSITIVE_INFINITY;
    const blocks = notebook.blocks.filter((block) => block.order > heading.order && block.order < nextHeadingOrder);
    blocks.forEach((block) => assigned.add(block.anchor.id));
    const slideBlocks = blocks.length ? blocks : [heading];
    return {
      id: `chapter-${chapterIndex + 1}`,
      title: heading.text,
      purpose: `Explain ${heading.text} before visual layout decisions.`,
      sourceRefs: [heading.anchor.id],
      slides: slideBlocks.map((block, slideIndex) => ({
        id: `chapter-${chapterIndex + 1}-source-${slideIndex + 1}`,
        title: block.kind === "heading" ? block.text : `${heading.text} source ${slideIndex + 1}`,
        takeaway: block.kind === "heading" ? block.text : "Preserve this source unit until editorial planning merges or splits it.",
        visibleBody: [block.kind === "table" ? [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n") : block.kind === "code" ? block.code : "text" in block ? block.text : block.raw],
        notes: [],
        sourceRefs: [block.anchor.id],
        editorialDecisions: [{ kind: "keep" as const, sourceRefs: [block.anchor.id], reason: "Lossless draft keeps each source block separate." }]
      }))
    };
  });
  const unassigned = notebook.blocks.filter((block) => !assigned.has(block.anchor.id) && !chapterSeeds.some((heading) => heading.anchor.id === block.anchor.id));
  if (unassigned.length && chapters.length) {
    chapters[0].slides.unshift(...unassigned.map((block, index) => ({
      id: `unassigned-source-${index + 1}`,
      title: `Source context ${index + 1}`,
      takeaway: "Preserve source context before editorial grouping.",
      visibleBody: [block.raw],
      notes: [],
      sourceRefs: [block.anchor.id],
      editorialDecisions: [{ kind: "keep" as const, sourceRefs: [block.anchor.id], reason: "Lossless draft preserves source context." }]
    })));
  }
  return DeckManuscriptSchema.parse({
    version: "1.0",
    title: notebook.title,
    audience: options.audience,
    purpose: options.purpose,
    desiredAction: options.desiredAction,
    thesis: "Editorial thesis not yet authored.",
    sourceNotebookHash: notebook.sourceHash,
    chapters,
    sourceOmissions: []
  });
}
