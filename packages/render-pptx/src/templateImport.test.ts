import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { lintDeckSpec, parseDeckSpec, scaffoldDeckFromTemplate } from "@pptcreater/core";
import {
  extractTemplateManifestFromPptx,
  importNotPersistedWarning,
  importPersistenceSuffix,
  importTemplateFromPptx,
  isImportPersisted,
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
  file(name: string, data: string | Buffer): void;
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

const SLIDE1_XML = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:bgPr></p:bg>
    <p:spTree>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="5" name="Brand Logo" descr="Microsoft Security logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="1828800" cy="457200"/></a:xfrm></p:spPr>
      </p:pic>
      <p:sp>
        <p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="2743200"/><a:ext cx="7315200" cy="1828800"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:pPr algn="l"/><a:r><a:rPr sz="4000" b="1"><a:solidFill><a:srgbClr val="203864"/></a:solidFill></a:rPr><a:t>PowerPoint template and user guide</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:nvPr><p:ph type="subTitle"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="4800600"/><a:ext cx="7315200" cy="685800"/></a:xfrm></p:spPr>
        <p:txBody><a:p><a:pPr algn="l"/><a:r><a:rPr sz="2000"><a:solidFill><a:srgbClr val="404040"/></a:solidFill></a:rPr><a:t>February 2026</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const SLIDE1_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
  <Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

async function buildRichPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_XML);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_TITLE_XML);
  zip.file("ppt/slideLayouts/slideLayout2.xml", LAYOUT_CLOSING_XML);
  const bgPng = await sharp({
    create: { width: 64, height: 36, channels: 3, background: { r: 32, g: 96, b: 64 } }
  })
    .png()
    .toBuffer();
  const logoPng = await sharp({
    create: { width: 32, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .png()
    .toBuffer();
  zip.file("ppt/media/image1.png", bgPng);
  zip.file("ppt/media/image2.png", logoPng);
  zip.file("ppt/slides/slide1.xml", SLIDE1_XML);
  zip.file("ppt/slides/_rels/slide1.xml.rels", SLIDE1_RELS);
  return zip.generateAsync({ type: "nodebuffer" });
}

// A designer-style template where the title-slide background lives in the slide LAYOUT as a theme
// scheme-color reference (not an srgbClr), the slide's own placeholders carry no geometry (inherited
// from the layout), and paragraph alignment is governed by the master text styles. This mirrors real
// templates (e.g. Duarte) that the abstract-token-only importer used to miss.
const MASTER_SCHEME_XML = `<?xml version="1.0"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree/></p:cSld>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle>
  </p:txStyles>
</p:sldMaster>`;

const LAYOUT_SCHEME_TITLE_XML = `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="title">
  <p:cSld name="Title Slide">
    <p:bg><p:bgPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="2743200"/><a:ext cx="7315200" cy="1828800"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Click to edit</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="subTitle"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4800600"/><a:ext cx="7315200" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Subtitle</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

const SLIDE_SCHEME_XML = `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p/></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p/></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

const SLIDE_SCHEME_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

async function buildSchemeBgPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_SCHEME_XML);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_SCHEME_TITLE_XML);
  zip.file("ppt/slideLayouts/slideLayout2.xml", LAYOUT_CLOSING_XML);
  zip.file("ppt/slides/slide1.xml", SLIDE_SCHEME_XML);
  zip.file("ppt/slides/_rels/slide1.xml.rels", SLIDE_SCHEME_RELS);
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
      logos: [],
      title: "Imported Title",
      subtitle: "Imported Subtitle"
    });
    expect(parseClosingSlide([LAYOUT_TITLE_XML, LAYOUT_CLOSING_XML])).toEqual({ logos: [], title: "Thank You" });
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

describe("template import reuses the source title-slide visual identity", () => {
  it("captures the title slide background, logo, and title geometry", async () => {
    const buffer = await buildRichPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "rich-demo", name: "Rich Demo" });

    expect(template.titleSlide?.background).toBeDefined();
    expect(template.titleSlide?.background?.imageDataUri).toMatch(/^data:image\/png;base64,/);
    expect(template.titleSlide?.background?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(template.titleSlide?.logos?.length ?? 0).toBeGreaterThan(0);
    expect(template.titleSlide?.logos?.[0]?.altText).toBe("Microsoft Security logo");
    expect(template.titleSlide?.titleBox).toBeDefined();
    expect(template.titleSlide?.titleBox?.align).toBe("left");
    expect(template.titleSlide?.titleBox?.bold).toBe(true);
    expect(template.titleSlide?.titleBox?.fontSize).toBeCloseTo(40, 0);
    expect(template.description).toContain("title-slide background/logo/layout");
  });

  it("reproduces the captured background and logo in the scaffolded deck", async () => {
    const buffer = await buildRichPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "rich-demo", name: "Rich Demo" });
    const deck = scaffoldDeckFromTemplate(template, { title: "新しいタイトル" });

    const titleSlide = deck.slides[0];
    expect(titleSlide.background?.imageDataUri).toMatch(/^data:image\/png;base64,/);

    const logo = titleSlide.elements.find((element) => element.type === "image");
    expect(logo).toBeDefined();

    const heading = titleSlide.elements.find((element) => element.type === "text" && element.role === "title");
    expect(heading).toBeDefined();
    if (heading && heading.type === "text") {
      expect(heading.text).toBe("新しいタイトル");
      expect(heading.align).toBe("left");
    }

    const parsed = parseDeckSpec(deck);
    const report = lintDeckSpec(parsed);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);

    const dir = await mkdtemp(join(tmpdir(), "pptcreater-import-rich-"));
    const outputPath = join(dir, "scaffold.pptx");
    await renderDeckToPptx(deck, outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });

  it("resolves a layout-level theme scheme-color background and inherits geometry/alignment", async () => {
    const buffer = await buildSchemeBgPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "scheme-demo", name: "Scheme Demo" });

    expect(template.titleSlide?.background?.color).toBe("#2e74b5");
    expect(template.titleSlide?.background?.imageDataUri).toBeUndefined();

    const titleBox = template.titleSlide?.titleBox;
    expect(titleBox).toBeDefined();
    expect(titleBox?.x).toBeCloseTo(0.75, 2);
    expect(titleBox?.y).toBeCloseTo(3.0, 2);
    expect(titleBox?.w).toBeCloseTo(8.0, 2);
    expect(titleBox?.h).toBeCloseTo(2.0, 2);
    expect(titleBox?.align).toBe("left");
  });

  it("reproduces a scheme-color background with a contrast-safe title in the scaffold", async () => {
    const buffer = await buildSchemeBgPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "scheme-demo", name: "Scheme Demo" });
    const deck = scaffoldDeckFromTemplate(template, { title: "新しいタイトル案" });

    const titleSlide = deck.slides[0];
    expect(titleSlide.background?.color).toBe("#2e74b5");

    const heading = titleSlide.elements.find((element) => element.type === "text" && element.role === "title");
    expect(heading).toBeDefined();
    if (heading && heading.type === "text") {
      expect(heading.align).toBe("left");
      expect(heading.contrastBackground).toBe("#2e74b5");
    }

    const parsed = parseDeckSpec(deck);
    const report = lintDeckSpec(parsed);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);

    const dir = await mkdtemp(join(tmpdir(), "pptcreater-import-scheme-"));
    const outputPath = join(dir, "scaffold.pptx");
    await renderDeckToPptx(deck, outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });
});

// An unused Office-default theme that ships alongside the real theme. It sits at theme1.xml so a naive
// "first theme by zip order" pick would wrongly choose it; the slide master actually references theme2.
const OFFICE_DEFAULT_THEME_XML = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>`;

const MASTER_RELS_THEME2 = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/>
</Relationships>`;

async function buildTwoThemePptx(): Promise<Buffer> {
  const zip = new JSZip();
  // theme1 (the wrong, unused Office default) sits first in zip order on purpose.
  zip.file("ppt/theme/theme1.xml", OFFICE_DEFAULT_THEME_XML);
  zip.file("ppt/theme/theme2.xml", THEME_XML);
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_XML);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", MASTER_RELS_THEME2);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_TITLE_XML);
  zip.file("ppt/slideLayouts/slideLayout2.xml", LAYOUT_CLOSING_XML);
  return zip.generateAsync({ type: "nodebuffer" });
}

const LAYOUT_CONTENT_XML = `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="obj">
  <p:cSld name="One Column Non-Bulleted Text">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="7315200" cy="914400"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1600200"/><a:ext cx="7315200" cy="3886200"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Body</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

async function buildContentLayoutPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file("ppt/presentation.xml", PRESENTATION_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_XML);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_TITLE_XML);
  zip.file("ppt/slideLayouts/slideLayout2.xml", LAYOUT_CLOSING_XML);
  zip.file("ppt/slideLayouts/slideLayout3.xml", LAYOUT_CONTENT_XML);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("template import resolves the master-referenced theme", () => {
  it("picks the theme the slide master links to, not the first theme by zip order", async () => {
    const buffer = await buildTwoThemePptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "two-theme", name: "Two Theme" });

    // theme2 (master-referenced) palette/fonts, not theme1's Office default (#4f81bd / Calibri).
    expect(template.tokens.colors.accent).toBe("#2e74b5");
    expect(template.tokens.colors.accent).not.toBe("#4f81bd");
    expect(template.tokens.typography.headingFont).toBe("Yu Gothic UI");
  });
});

describe("template import captures a content-slide blueprint", () => {
  it("captures the neutral content layout background and notes it in the description", async () => {
    const buffer = await buildContentLayoutPptx();
    const template = await extractTemplateManifestFromPptx(buffer, { id: "content-demo", name: "Content Demo" });

    expect(template.contentSlide?.background?.color).toBe("#f2f2f2");
    expect(template.description).toContain("content-slide background/branding");
  });
});

describe("importTemplateFromPptx accepts PowerPoint template extensions", () => {
  it("imports a .potx file and rejects unsupported extensions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pptcreater-import-potx-"));
    const potxPath = join(dir, "demo.potx");
    await writeFile(potxPath, await buildMinimalPptx());

    const result = await importTemplateFromPptx(potxPath);
    expect(result.template.id).toBe("demo");
    expect(result.template.tokens.colors.background).toBe("#ffffff");
    expect(result.template.powerPointTemplate?.extension).toBe(".potx");
    expect(result.template.powerPointTemplate?.dataUri).toMatch(/^data:application\/vnd\.openxmlformats-officedocument\.presentationml\.template;base64,/);

    await expect(importTemplateFromPptx(join(dir, "demo.key"))).rejects.toThrow(/PowerPoint file/);
  });
});

describe("import persistence helpers", () => {
  it("warns when an imported template is neither registered nor written to a file", () => {
    const state = { templateId: "demo" };
    expect(isImportPersisted(state)).toBe(false);
    expect(importPersistenceSuffix(state)).toBe("");
    const warning = importNotPersistedWarning(state);
    expect(warning).toBeDefined();
    expect(warning).toContain("demo");
    expect(warning).toContain("register");
    expect(warning).toContain("template list");
    expect(warning).toContain("template apply");
  });

  it("does not warn and confirms the registry path when registered", () => {
    const state = { templateId: "demo", registryPath: "/home/user/registry.json" };
    expect(isImportPersisted(state)).toBe(true);
    expect(importPersistenceSuffix(state)).toBe(" (registered in /home/user/registry.json)");
    expect(importNotPersistedWarning(state)).toBeUndefined();
  });

  it("does not warn and confirms the manifest path when only an output path is given", () => {
    const state = { templateId: "demo", outputPath: "out/demo.manifest.json" };
    expect(isImportPersisted(state)).toBe(true);
    expect(importPersistenceSuffix(state)).toBe(" (manifest written to out/demo.manifest.json)");
    expect(importNotPersistedWarning(state)).toBeUndefined();
  });

  it("prefers the registry confirmation over the output path when both are present", () => {
    const state = {
      templateId: "demo",
      registryPath: "/home/user/registry.json",
      outputPath: "out/demo.manifest.json"
    };
    expect(importPersistenceSuffix(state)).toBe(" (registered in /home/user/registry.json)");
    expect(importNotPersistedWarning(state)).toBeUndefined();
  });
});
