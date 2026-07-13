import { readFile } from "node:fs/promises";
import { CriticResponseSchema, type CriticResponse, type VisualDefect } from "@pptcreater/authoring-contracts";
import { assertCompleteManuscriptCoverage, DeckManuscriptSchema, type DeckManuscript } from "@pptcreater/manuscript";
import { preflightSlideProgram, SlideProgramSchema, type SlideProgram } from "@pptcreater/slide-sdk";
import { SourceNotebookSchema, type SourceNotebook } from "@pptcreater/source-notebook";
import JSZip from "jszip";

export type CriticInput = { notebook: SourceNotebook; manuscript: DeckManuscript; program: SlideProgram; pptxPath?: string };

function finding(slideId: string, programSourceId: string, type: VisualDefect, severity: "blocking" | "advisory", evidence: string, requestedOutcome: string) {
  return { defect: { type, slideId, severity, evidence }, revision: { programSourceId, reason: evidence, requestedOutcome } };
}

async function pptxIntegrity(pptxPath: string): Promise<{ slideCount: number; emptyFiles: string[]; missingNotes: number }> {
  const zip = await JSZip.loadAsync(await readFile(pptxPath));
  const names = Object.keys(zip.files);
  const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
  const notes = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name));
  const emptyFiles: string[] = [];
  for (const name of names.filter((entry) => !entry.endsWith("/"))) {
    const bytes = await zip.file(name)!.async("uint8array");
    if (!bytes.length) emptyFiles.push(name);
  }
  return { slideCount: slides.length, emptyFiles, missingNotes: Math.max(0, slides.length - notes.length) };
}

export async function critiqueDirectAuthoring(input: CriticInput): Promise<CriticResponse> {
  const notebook = SourceNotebookSchema.parse(input.notebook);
  const manuscript = DeckManuscriptSchema.parse(input.manuscript);
  const program = SlideProgramSchema.parse(input.program);
  const defects: CriticResponse["defects"] = [];
  const revisionBriefs: CriticResponse["revisionBriefs"] = [];
  const slideFindings: CriticResponse["slideFindings"] = [];
  const coverage = assertCompleteManuscriptCoverage(notebook, manuscript);
  const programSourceRefs = new Set(program.slides.flatMap((slide) => slide.sourceRefs));
  const manuscriptSourceRefs = new Set(manuscript.chapters.flatMap((chapter) => [...chapter.sourceRefs, ...chapter.slides.flatMap((slide) => slide.sourceRefs)]));
  const missingProgramRefs = [...manuscriptSourceRefs].filter((ref) => !programSourceRefs.has(ref));
  if (missingProgramRefs.length) {
    const issue = finding("deck", "program", "source-fidelity", "blocking", `Slide Program does not carry ${missingProgramRefs.length} manuscript source references.`, "Preserve every manuscript source reference in program slides or record a manuscript omission before rendering.");
    defects.push(issue.defect); revisionBriefs.push(issue.revision);
  }
  for (const issue of preflightSlideProgram(program)) {
    const type: VisualDefect = issue.code === "bad-line-break" ? "bad-line-break" : issue.code === "text-overflow-risk" ? "truncation" : "alignment";
    const result = finding(issue.slideId, `${issue.slideId}/${issue.commandId ?? "slide"}`, type, "blocking", issue.message, "Revise the Slide Program command geometry or copy; do not patch generated PPTX objects.");
    defects.push(result.defect); revisionBriefs.push(result.revision);
  }
  for (const slide of manuscript.chapters.flatMap((chapter) => chapter.slides)) {
    const bodyChars = [...slide.visibleBody.join("")].length;
    const findings: string[] = [];
    if (bodyChars > 650) findings.push(`Visible manuscript body is ${bodyChars} characters; review paragraph-boundary split.`);
    if (slide.figure?.required && slide.figure.dataShape === "none") findings.push("Figure is required but dataShape is none.");
    if (slide.figure?.dataShape === "sequence" && !/step|sequence|order|flow|手順|順序|工程/iu.test(`${slide.figure.need} ${slide.takeaway}`)) {
      const result = finding(slide.id, slide.id, "semantic-figure-mismatch", "blocking", "Sequence figure brief lacks an ordered relationship in its need/takeaway.", "Use prose/custom composition or rewrite the figure brief with explicit ordered stages.");
      defects.push(result.defect); revisionBriefs.push(result.revision); findings.push(result.defect.evidence);
    }
    if (findings.length) slideFindings.push({ slideId: slide.id, findings });
  }
  if (input.pptxPath) {
    const integrity = await pptxIntegrity(input.pptxPath);
    if (integrity.slideCount !== program.slides.length) {
      const result = finding("deck", "program", "missing-media", "blocking", `PPTX has ${integrity.slideCount} slides but program has ${program.slides.length}.`, "Render the complete Slide Program.");
      defects.push(result.defect); revisionBriefs.push(result.revision);
    }
    if (integrity.emptyFiles.length) {
      const result = finding("deck", "renderer", "missing-media", "blocking", `PPTX contains empty package files: ${integrity.emptyFiles.join(", ")}`, "Repair renderer packaging before review.");
      defects.push(result.defect); revisionBriefs.push(result.revision);
    }
    if (integrity.missingNotes) slideFindings.push({ slideId: "deck", findings: [`${integrity.missingNotes} slides have no notes part; verify source trace and accessibility notes.`] });
  }
  const blocking = defects.filter((defect) => defect.severity === "blocking").length;
  const score = Math.max(0, 100 - blocking * 20 - slideFindings.length * 2);
  return CriticResponseSchema.parse({ defects, scores: { sourceCoverage: coverage.coverageRatio * 100, deterministicQuality: score }, slideFindings, revisionBriefs, humanReviewNeeded: defects.length === 0 });
}
