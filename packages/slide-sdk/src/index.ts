import { createRequire } from "node:module";
import { DrawCommandSchema, SlideFragmentSchema, type DesignBrief, type DrawCommand, type SlideFragment } from "@pptcreater/authoring-contracts";
import { z } from "zod";

const require = createRequire(import.meta.url);

type PptxSlide = {
  background: { color?: string };
  addText(text: string, options: Record<string, unknown>): void;
  addShape(shape: string, options: Record<string, unknown>): void;
  addImage(options: Record<string, unknown>): void;
  addNotes(notes: string): void;
};
type PptxPresentation = {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  lang: string;
  theme: { headFontFace: string; bodyFontFace: string; lang: string };
  addSlide(): PptxSlide;
  writeFile(options: { fileName: string }): Promise<void>;
};
const PptxGenJSConstructor = require("pptxgenjs") as { new (): PptxPresentation };

export const SlideProgramSlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  commands: z.array(DrawCommandSchema),
  notes: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]),
  background: z.string().regex(/^[A-Fa-f0-9]{6}$/u).default("FFFFFF")
});
export type SlideProgramSlide = z.infer<typeof SlideProgramSlideSchema>;

export const SlideProgramSchema = z.object({
  version: z.literal("1.0"),
  id: z.string().min(1),
  title: z.string().min(1),
  locale: z.enum(["ja-JP", "en-US"]),
  designBrief: z.custom<DesignBrief>(),
  slides: z.array(SlideProgramSlideSchema).min(1)
});
export type SlideProgram = z.infer<typeof SlideProgramSchema>;

export type PreflightIssue = {
  code: "text-overflow-risk" | "bad-line-break" | "unknown-command-ref" | "unsupported-component-import" | "duplicate-command-id";
  slideId: string;
  commandId?: string;
  message: string;
};

const BAD_LINE_START = /^[、。，．・,，!?！？:：;；）」』】\]\})]/u;
const BAD_LINE_END = /[（「『【\[\({]$/u;

function textUnits(text: string): number {
  return [...text].reduce((sum, char) => sum + (/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]$/u.test(char) ? 1 : char === " " ? 0.3 : 0.55), 0);
}

function textPreflight(command: Extract<DrawCommand, { kind: "text" }>): string[] {
  const fontSize = Number(command.style.fontSize ?? (command.role === "title" ? 28 : command.role === "caption" ? 11 : 16));
  const unitsPerLine = Math.max(1, (command.frame.w * 72) / (fontSize * 0.52));
  const estimatedLines = command.text.split(/\r?\n/u).reduce((sum, line) => sum + Math.max(1, Math.ceil(textUnits(line) / unitsPerLine)), 0);
  const maxLines = Math.max(1, Math.floor((command.frame.h * 72) / (fontSize * 1.22)));
  const issues: string[] = [];
  if (estimatedLines > maxLines) issues.push(`Estimated ${estimatedLines} lines exceed the ${maxLines}-line box capacity.`);
  const explicitLines = command.text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const bad = explicitLines.find((line) => BAD_LINE_START.test(line) || BAD_LINE_END.test(line));
  if (bad) issues.push(`Line has unsafe Japanese punctuation boundary: ${bad}`);
  return issues;
}

export function preflightSlideProgram(programInput: SlideProgram): PreflightIssue[] {
  const program = SlideProgramSchema.parse(programInput);
  const issues: PreflightIssue[] = [];
  for (const slide of program.slides) {
    const ids = new Set<string>();
    for (const command of slide.commands) {
      if (ids.has(command.id)) issues.push({ code: "duplicate-command-id", slideId: slide.id, commandId: command.id, message: `Command id ${command.id} is duplicated.` });
      ids.add(command.id);
      if (command.kind === "text") {
        for (const message of textPreflight(command)) issues.push({ code: message.startsWith("Estimated") ? "text-overflow-risk" : "bad-line-break", slideId: slide.id, commandId: command.id, message });
      }
      if (command.kind === "importPptxComponent") issues.push({ code: "unsupported-component-import", slideId: slide.id, commandId: command.id, message: "PPTX component import requires the Figure Catalog transplant renderer." });
    }
    for (const command of slide.commands) {
      if (command.kind === "connector" && (!ids.has(command.from) || !ids.has(command.to))) issues.push({ code: "unknown-command-ref", slideId: slide.id, commandId: command.id, message: `Connector references missing command: ${command.from} -> ${command.to}.` });
      if (command.kind === "group") for (const childId of command.childIds) if (!ids.has(childId)) issues.push({ code: "unknown-command-ref", slideId: slide.id, commandId: command.id, message: `Group references missing command ${childId}.` });
    }
  }
  return issues;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Fa-f0-9]{6}$/u.test(value) ? value : fallback;
}

function renderCommand(slide: PptxSlide, command: DrawCommand): void {
  const { x, y, w, h } = command.frame;
  if (command.kind === "text") {
    slide.addText(command.text, { x, y, w, h, margin: command.style.margin ?? 0, fontFace: command.style.fontFace, fontSize: command.style.fontSize, bold: command.style.bold, color: color(command.style.color, "222222"), align: command.style.align, valign: command.style.valign, fit: "shrink", breakLine: false, ...(command.style.hyperlink ? { hyperlink: { url: command.style.hyperlink } } : {}) });
    return;
  }
  if (command.kind === "shape") {
    const shape = command.shape === "roundRect" ? "roundRect" : command.shape;
    slide.addShape(shape, { x, y, w, h, fill: { color: color(command.style.fill, "FFFFFF"), transparency: command.style.fill === "none" ? 100 : 0 }, line: { color: color(command.style.line, "D1D5DB"), width: command.style.lineWidth ?? 1 }, ...(command.shape === "arrow" ? { endArrowType: "triangle" } : {}) });
    return;
  }
  if (command.kind === "connector") {
    slide.addShape("line", { x, y, w, h, line: { color: color(command.style.color, "6B7280"), width: command.style.width ?? 1.5, beginArrowType: command.style.beginArrow, endArrowType: command.style.endArrow ?? "triangle", dash: command.style.dash } });
    if (command.label) slide.addText(command.label, { x: x + w * 0.25, y: y - 0.2, w: Math.max(0.8, w * 0.5), h: 0.3, fontSize: 10, color: color(command.style.color, "6B7280"), align: "center", margin: 0, fit: "shrink" });
    return;
  }
  if (command.kind === "image") {
    slide.addImage({ path: command.source, x, y, w, h, altText: command.altText, sizing: command.fit });
    return;
  }
  if (command.kind === "group") return;
  throw new Error(`Unsupported command ${command.kind}: Figure Catalog component import is not wired yet.`);
}

export function fragmentToCommands(fragmentInput: SlideFragment): DrawCommand[] {
  return SlideFragmentSchema.parse(fragmentInput).commands;
}

export async function renderSlideProgram(programInput: SlideProgram, outputPath: string, options: { allowPreflightIssues?: boolean } = {}): Promise<{ outputPath: string; issues: PreflightIssue[] }> {
  const program = SlideProgramSchema.parse(programInput);
  const issues = preflightSlideProgram(program);
  if (issues.length && !options.allowPreflightIssues) throw new Error(`Slide Program preflight failed:\n${issues.map((issue) => `${issue.code} ${issue.slideId}/${issue.commandId ?? "slide"}: ${issue.message}`).join("\n")}`);
  const pptx = new PptxGenJSConstructor();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "pptcreater Slide SDK";
  pptx.subject = program.designBrief.id;
  pptx.title = program.title;
  pptx.company = "pptcreater";
  pptx.lang = program.locale;
  pptx.theme = { headFontFace: program.designBrief.typography.headingFont, bodyFontFace: program.designBrief.typography.bodyFont, lang: program.locale };
  for (const programSlide of program.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: programSlide.background };
    for (const command of programSlide.commands) renderCommand(slide, command);
    const notes = [...programSlide.notes, programSlide.sourceRefs.length ? `Source refs: ${programSlide.sourceRefs.join(", ")}` : ""].filter(Boolean).join("\n");
    if (notes) slide.addNotes(notes);
  }
  await pptx.writeFile({ fileName: outputPath });
  return { outputPath, issues };
}
