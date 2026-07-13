import { writeFile } from "node:fs/promises";
import { DesignBriefSchema, type DesignBriefInput, type DrawCommand, type SlideFragment } from "@pptcreater/authoring-contracts";
import { critiqueDirectAuthoring } from "@pptcreater/design-critic";
import { createCatalogComponentResolver, instantiateFigure, loadFigureCatalog, searchFigures, type FigureCatalogEntry } from "@pptcreater/figure-catalog";
import { assertCompleteManuscriptCoverage, DeckManuscriptSchema, serializeDeckManuscript, type DeckManuscript, type ManuscriptSlide } from "@pptcreater/manuscript";
import { renderSlideProgram, type SlideProgram, type SlideProgramSlide } from "@pptcreater/slide-sdk";
import { SourceNotebookSchema, type SourceNotebook } from "@pptcreater/source-notebook";

export type ProgramAuthorContext = { manuscript: DeckManuscript; notebook: SourceNotebook; catalog: FigureCatalogEntry[]; designBrief: ReturnType<typeof DesignBriefSchema.parse> };
export type SlideComposer = (slide: ManuscriptSlide, index: number, context: ProgramAuthorContext) => Promise<SlideProgramSlide> | SlideProgramSlide;

function bodyText(slide: ManuscriptSlide): string {
  return slide.visibleBody.join("\n\n");
}

async function figureForSlide(slide: ManuscriptSlide, catalog: FigureCatalogEntry[]): Promise<SlideFragment | undefined> {
  if (!slide.figure || slide.figure.dataShape === "none") return undefined;
  const dataShape = slide.figure.dataShape === "custom" || slide.figure.dataShape === "image" || slide.figure.dataShape === "metric" || slide.figure.dataShape === "table" ? undefined : slide.figure.dataShape;
  const candidates = searchFigures(catalog, { semanticNeed: `${slide.figure.need} ${slide.figure.catalogHints.join(" ")}`, dataShape, itemCount: Math.max(2, slide.visibleBody.length), limit: 1 });
  if (!candidates.length) {
    if (slide.figure.required) throw new Error(`No Figure Catalog candidate satisfies required figure brief for ${slide.id}.`);
    return undefined;
  }
  const labels = slide.visibleBody.length >= 2 ? slide.visibleBody.map((item) => item.replace(/\s+/gu, " ").slice(0, 32)) : [slide.takeaway, slide.visibleBody[0] ?? slide.title].map((item) => item.slice(0, 32));
  return instantiateFigure(candidates[0], { labels, sourceRefs: slide.sourceRefs }, { x: 0, y: 0, w: 13.333, h: 7.5 });
}

export const defaultSlideComposer: SlideComposer = async (slide, index, context) => {
  const figure = await figureForSlide(slide, context.catalog);
  if (figure) return { id: slide.id, title: slide.title, background: "FBFAF7", sourceRefs: slide.sourceRefs, notes: slide.notes, commands: figure.commands };
  const body = bodyText(slide);
  const commands: DrawCommand[] = [
    { id: `${slide.id}-number`, kind: "text", role: "caption", text: `SLIDE ${String(index + 1).padStart(2, "0")}`, frame: { x: 0.72, y: 0.36, w: 1.4, h: 0.24 }, sourceRefs: [], style: { fontFace: "Aptos", fontSize: 10, bold: true, color: "A33B32" } },
    { id: `${slide.id}-title`, kind: "text", role: "title", text: slide.title, frame: { x: 0.72, y: 0.78, w: 7.7, h: 0.65 }, sourceRefs: slide.sourceRefs, style: { fontSize: 25, bold: true, color: "222222" } },
    { id: `${slide.id}-takeaway`, kind: "text", role: "message", text: slide.takeaway, frame: { x: 8.7, y: 0.78, w: 3.9, h: 0.72 }, sourceRefs: slide.sourceRefs, style: { fontSize: 15, color: "5B554F" } },
    { id: `${slide.id}-rule`, kind: "shape", shape: "line", frame: { x: 0.72, y: 1.58, w: 11.9, h: 0.01 }, sourceRefs: [], style: { line: "D3CEC7", lineWidth: 1 } },
    { id: `${slide.id}-body`, kind: "text", role: "body", text: body, frame: { x: 0.9, y: 1.92, w: 11.5, h: 4.95 }, sourceRefs: slide.sourceRefs, style: { fontSize: body.length > 420 ? 13 : 16, color: "2B2927", margin: 0.1, valign: "top" } }
  ];
  return { id: slide.id, title: slide.title, background: "FBFAF7", sourceRefs: slide.sourceRefs, notes: slide.notes, commands };
};

export async function compileManuscriptToSlideProgram(input: { notebook: SourceNotebook; manuscript: DeckManuscript; composer?: SlideComposer; catalog?: FigureCatalogEntry[]; designBrief?: DesignBriefInput }): Promise<SlideProgram> {
  const notebook = SourceNotebookSchema.parse(input.notebook);
  const manuscript = DeckManuscriptSchema.parse(input.manuscript);
  assertCompleteManuscriptCoverage(notebook, manuscript);
  const catalog = input.catalog ?? await loadFigureCatalog();
  const designBrief = DesignBriefSchema.parse(input.designBrief ?? { id: "direct-authoring-default", locale: "ja-JP", mood: ["editorial", "precise"], paletteRoles: { background: "FBFAF7", text: "222222", accent: "A33B32" }, typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", cjkFallbacks: ["Meiryo"] }, spacing: { gridInches: 0.125, marginInches: 0.7, whitespace: "balanced" }, density: { targetVisibleChars: 240, maxVisibleChars: 520 }, do: ["Preserve complete prose", "Use figures only when semantic"], dont: ["Force card grids", "Fragment sentences"], referenceAssets: [] });
  const context: ProgramAuthorContext = { manuscript, notebook, catalog, designBrief };
  const composer = input.composer ?? defaultSlideComposer;
  const manuscriptSlides = manuscript.chapters.flatMap((chapter) => chapter.slides.map((slide, slideIndex) => slideIndex === 0 ? { ...slide, sourceRefs: [...new Set([...chapter.sourceRefs, ...slide.sourceRefs])] } : slide));
  const slides: SlideProgramSlide[] = [];
  for (let index = 0; index < manuscriptSlides.length; index += 1) slides.push(await composer(manuscriptSlides[index], index, context));
  return { version: "1.0", id: `${notebook.sourceHash}-program`, title: manuscript.title, locale: designBrief.locale, designBrief, slides };
}

export async function runDirectAuthoring(input: { notebook: SourceNotebook; manuscript: DeckManuscript; outputPath: string; manuscriptOutputPath?: string; composer?: SlideComposer; designBrief?: DesignBriefInput }): Promise<{ program: SlideProgram; critic: Awaited<ReturnType<typeof critiqueDirectAuthoring>>; outputPath: string }> {
  const catalog = await loadFigureCatalog();
  const program = await compileManuscriptToSlideProgram({ notebook: input.notebook, manuscript: input.manuscript, composer: input.composer, catalog, designBrief: input.designBrief });
  await renderSlideProgram(program, input.outputPath, { componentResolver: createCatalogComponentResolver(catalog), workspaceRoot: process.cwd() });
  const critic = await critiqueDirectAuthoring({ notebook: input.notebook, manuscript: input.manuscript, program, pptxPath: input.outputPath });
  if (input.manuscriptOutputPath) await writeFile(input.manuscriptOutputPath, serializeDeckManuscript(input.manuscript), "utf8");
  return { program, critic, outputPath: input.outputPath };
}
