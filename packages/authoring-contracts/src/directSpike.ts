import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type DirectSlide = {
  background: { color?: string };
  addText(text: string, options: Record<string, unknown>): void;
  addShape(shape: string, options: Record<string, unknown>): void;
  addNotes(notes: string): void;
};

type DirectPresentation = {
  layout: string;
  author: string;
  subject: string;
  title: string;
  company: string;
  lang: string;
  theme: { headFontFace: string; bodyFontFace: string; lang: string };
  addSlide(): DirectSlide;
  writeFile(options: { fileName: string }): Promise<void>;
};

const PptxGenJSConstructor = require("pptxgenjs") as { new (): DirectPresentation };

export type DirectSpikeOptions = {
  sourceMarkdownPath: string;
  outputPath: string;
  title?: string;
};

type SourceSection = { title: string; body: string };

function sourceSections(markdown: string): SourceSection[] {
  const sections: SourceSection[] = [];
  let current: SourceSection | undefined;
  for (const line of markdown.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const heading = /^##\s+(.+)$/u.exec(line);
    if (heading) {
      current = { title: heading[1].replace(/^\d+(?:\.\d+)*[.)]?\s*/u, "").trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (current && line.trim() && !/^---$/u.test(line.trim())) current.body += `${line.trim()}\n`;
  }
  return sections.filter((section) => section.body.trim());
}

function plainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/^[-*>]\s*/gmu, "")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^\|.*\|$/gmu, "")
    .replace(/\n{2,}/gu, "\n")
    .trim();
}

function addHeader(slide: DirectSlide, label: string, title: string): void {
  slide.addText(label, { x: 0.72, y: 0.36, w: 1.2, h: 0.24, fontFace: "Aptos", fontSize: 10, bold: true, color: "A33B32", margin: 0 });
  slide.addText(title, { x: 0.72, y: 0.82, w: 11.8, h: 0.62, fontFace: "Yu Gothic", fontSize: 25, bold: true, color: "222222", margin: 0, breakLine: false, fit: "shrink" });
  slide.addShape("line", { x: 0.72, y: 1.55, w: 11.8, h: 0, line: { color: "D3CEC7", width: 1 } });
}

/**
 * Architecture spike: creates a PPTX directly with PptxGenJS. It intentionally imports neither
 * DeckSpec nor MessageSpec and does not route source text through a slide-shaped intermediate schema.
 */
export async function renderDirectAuthoringSpike(options: DirectSpikeOptions): Promise<{ outputPath: string; slides: number; sourceSections: number }> {
  const markdown = await readFile(options.sourceMarkdownPath, "utf8");
  const sections = sourceSections(markdown);
  if (sections.length < 4) throw new Error("Direct authoring spike requires at least four H2 sections.");

  const pptx = new PptxGenJSConstructor();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "pptcreater direct authoring spike";
  pptx.subject = "DeckSpec-independent authoring architecture spike";
  pptx.title = options.title ?? "Direct Authoring Spike";
  pptx.company = "pptcreater";
  pptx.lang = "ja-JP";
  pptx.theme = {
    headFontFace: "Yu Gothic",
    bodyFontFace: "Yu Gothic",
    lang: "ja-JP"
  };

  const cover = pptx.addSlide();
  cover.background = { color: "FBFAF7" };
  cover.addShape("rect", { x: 0, y: 0, w: 0.2, h: 7.5, fill: { color: "A33B32" }, line: { color: "A33B32" } });
  cover.addText(options.title ?? "Direct Authoring Spike", { x: 0.9, y: 2.15, w: 7.8, h: 1.2, fontFace: "Yu Gothic", fontSize: 30, bold: true, color: "222222", margin: 0, fit: "shrink" });
  cover.addText("Source-first manuscript → executable slide code → PPTX", { x: 0.94, y: 3.6, w: 7.4, h: 0.5, fontFace: "Aptos", fontSize: 16, color: "6F6962", margin: 0 });
  cover.addShape("roundRect", { x: 9.25, y: 1.25, w: 2.8, h: 4.9, rectRadius: 0.08, fill: { color: "EFE9E2" }, line: { color: "D3CEC7" } });
  cover.addText("NO\nDECKSPEC", { x: 9.7, y: 2.55, w: 1.9, h: 1.2, fontFace: "Aptos Display", fontSize: 23, bold: true, color: "A33B32", align: "center", valign: "mid", margin: 0 });
  cover.addNotes(`Source: ${options.sourceMarkdownPath}\nThis deck was authored directly with PptxGenJS.`);

  const selected = sections.slice(0, 4);
  selected.forEach((section, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FBFAF7" };
    addHeader(slide, `CHAPTER ${String(index + 1).padStart(2, "0")}`, section.title);
    const body = plainText(section.body);
    slide.addText(body, {
      x: 0.86,
      y: 1.92,
      w: 7.15,
      h: 4.72,
      fontFace: "Yu Gothic",
      fontSize: 15,
      color: "2B2927",
      margin: 0.12,
      breakLine: false,
      fit: "shrink",
      valign: "top",
      paraSpaceAfterPt: 9,
      lineSpacingMultiple: 1.12
    });
    slide.addShape("roundRect", { x: 8.45, y: 1.9, w: 3.9, h: 4.75, rectRadius: 0.06, fill: { color: index % 2 === 0 ? "EFE9E2" : "F2F0EC" }, line: { color: "D3CEC7", width: 1 } });
    slide.addText(section.title, { x: 8.82, y: 2.35, w: 3.15, h: 0.8, fontFace: "Yu Gothic", fontSize: 18, bold: true, color: "A33B32", align: "center", valign: "mid", margin: 0, fit: "shrink" });
    slide.addText("The layout is authored for this chapter.\nNo evidence-count or card-count schema is involved.", { x: 8.92, y: 4.0, w: 2.95, h: 1.1, fontFace: "Aptos", fontSize: 12, color: "6F6962", align: "center", valign: "mid", margin: 0.04, fit: "shrink" });
    slide.addNotes(`Source section: ${section.title}\nSource path: ${options.sourceMarkdownPath}\nVisible prose remains a single text object.`);
  });

  await pptx.writeFile({ fileName: options.outputPath });
  return { outputPath: options.outputPath, slides: selected.length + 1, sourceSections: sections.length };
}
