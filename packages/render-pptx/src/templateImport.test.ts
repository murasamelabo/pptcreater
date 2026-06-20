import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { lintDeckSpec, parseDeckSpec, scaffoldDeckFromTemplate } from "@pptcreater/core";
import {
  extractTemplateManifestFromPptx,
  mapThemeToTokens,
  parseHeaderFooter,
  parseSlideSize,
  parseTitleSlide,
  parseClosingSlide,
  themeColor,
  renderDeckToPptx
} from "./index.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as new () => {
  file(name: string, data: string): void;
  generateAsync(options: { type: "nodebuffer" }): Promise<Buffer>;
};

const THEME_XML = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements>
    <a:clrScheme name="Imported">
      <a:dk1><a:sysClr val="windowText" lastClr="1A1A1A"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="2E74B5"/></a:accent1>
      <a:accent2><a:srgbClr val="C0392B"/></a:accent2>
      <a:accent3><a:srgbClr val="27AE60"/></a:accent3>
      <a:accent4><a:srgbClr val="8E44AD"/></a:accent4>
      <a:accent5><a:srgbClr val="F39C12"/></a:accent5>
      <a:accent6><a:srgbClr val="16A085"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Imported">
      <a:majorFont><a:latin typeface="Yu Gothic UI"/><a:ea typeface="Yu Gothic"/></a:majorFont>
      <a:minorFont><a:latin typeface="Meiryo UI"/><a:ea typeface="Meiryo"/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>`;

const PRESENTATION_XML = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

const MASTER_XML = `<?xml version="1.0"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="ftr"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Confidential</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="dt"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="datetime"><a:t>2026/01/01</a:t></a:fld></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
  <p:hf hdr="0"/>
</p:sldMaster>`;

const LAYOUT_TITLE_XML = `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="title">
  <p:cSld name="Title Slide"><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Imported Title</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="subTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Imported Subtitle</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sldLayout>`;

const LAYOUT_CLOSING_XML = `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="secHead">
  <p:cSld name="Thank You"><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Thank You</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sldLayout>`;

async function buildMinimalPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_XML);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_TITLE_XML);
  zip.file("ppt/slideLayouts/slideLayout2.xml", LAYOUT_CLOSING_XML);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("template import parsers", () => {
  it("resolves theme colors from srgbClr and sysClr lastClr", () => {
    expect(themeColor(THEME_XML, "dk1")).toBe("#1a1a1a");
    expect(themeColor(THEME_XML, "lt1")).toBe("#ffffff");
    expect(themeColor(THEME_XML, "accent1")).toBe("#2e74b5");
  });

  it("maps theme colors and fonts onto design tokens", () => {
    const tokens = mapThemeToTokens(THEME_XML, {
      colors: {
        background: "#000000",
        surface: "#000000",
        text: "#000000",
        mutedText: "#000000",
        accent: "#000000",
        danger: "#000000",
        success: "#000000"
      },
      typography: {
        headingFont: "Base Heading",
        bodyFont: "Base Body",
        fallbackFonts: ["Base Fallback"],
        titleSize: 36,
        bodySize: 24,
        captionSize: 14
      },
      spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
    });
    expect(tokens.colors.background).toBe("#ffffff");
    expect(tokens.colors.text).toBe("#1a1a1a");
    expect(tokens.colors.accent).toBe("#2e74b5");
    expect(tokens.colors.danger).toBe("#c0392b");
    expect(tokens.colors.success).toBe("#27ae60");
    expect(tokens.typography.headingFont).toBe("Yu Gothic UI");
    expect(tokens.typography.bodyFont).toBe("Meiryo UI");
    expect(tokens.typography.fallbackFonts).toContain("Yu Gothic");
    expect(tokens.typography.fallbackFonts).toContain("Meiryo");
  });

  it("parses slide size from EMU", () => {
    const size = parseSlideSize(PRESENTATION_XML);
    expect(size).toEqual({ widthInches: 13.333, heightInches: 7.5, aspect: "16:9" });
  });

  it("parses header/footer visibility and footer text", () => {
    const hf = parseHeaderFooter(MASTER_XML, [LAYOUT_TITLE_XML, LAYOUT_CLOSING_XML]);
    expect(hf).toBeDefined();
    expect(hf?.showFooter).toBe(true);
    expect(hf?.showSlideNumber).toBe(true);
    expect(hf?.showDate).toBe(true);
    expect(hf?.footerText).toBe("Confidential");
    expect(hf?.dateText).toBeUndefined();
  });

  it("parses title and closing scaffold text", () => {
    expect(parseTitleSlide([LAYOUT_TITLE_XML, LAYOUT_CLOSING_XML])).toEqual({
      title: "Imported Title",
      subtitle: "Imported Subtitle"
    });
    expect(parseClosingSlide([LAYOUT_TITLE_XML, LAYOUT_CLOSING_XML])).toEqual({ title: "Thank You" });
  });
});

describe("extractTemplateManifestFromPptx", () => {
  it("produces a valid manifest from a minimal .pptx", async () => {
    const buffer = await buildMinimalPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "imported-demo", name: "Imported Demo" });
    expect(template.id).toBe("imported-demo");
    expect(template.locale).toBe("ja-JP");
    expect(template.tokens.colors.background).toBe("#ffffff");
    expect(template.slideSize?.aspect).toBe("16:9");
    expect(template.headerFooter?.showFooter).toBe(true);
    expect(template.titleSlide?.title).toBe("Imported Title");
    expect(template.closingSlide?.title).toBe("Thank You");
    expect(template.layouts.length).toBe(2);
  });

  it("scaffolds a renderable deck from the imported template", async () => {
    const buffer = await buildMinimalPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "imported-demo", name: "Imported Demo" });
    const deck = scaffoldDeckFromTemplate(template, { title: "四半期レビュー" });

    const parsed = parseDeckSpec(deck);
    const report = lintDeckSpec(parsed);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);

    const dir = await mkdtemp(join(tmpdir(), "pptcreater-import-"));
    const outputPath = join(dir, "scaffold.pptx");
    await renderDeckToPptx(deck, outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });
});
