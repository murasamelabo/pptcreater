import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createSampleDeck } from "@pptcreater/core";
import { importTemplateFromPptx, renderDeckToPptx } from "./index.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as {
  new (): {
    file(name: string, data: string | Buffer): void;
    generateAsync(options: { type: "nodebuffer" }): Promise<Buffer>;
  };
  loadAsync(data: Buffer): Promise<{ file(name: string): { async(type: "string"): Promise<string>; async(type: "nodebuffer"): Promise<Buffer> } | null; files: Record<string, unknown> }>;
};

const TEMPLATE_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;

const TEMPLATE_PRESENTATION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

const TEMPLATE_PRESENTATION_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>`;

const TEMPLATE_UNUSED_THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements>
    <a:clrScheme name="Unused"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="00222E"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="FFFFFF"/></a:accent1><a:accent2><a:srgbClr val="B91C1C"/></a:accent2><a:accent3><a:srgbClr val="85E89F"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="Unused"><a:majorFont><a:latin typeface="Aptos"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
  </a:themeElements>
</a:theme>`;

const TEMPLATE_THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements>
    <a:clrScheme name="Template"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="00222E"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2><a:accent1><a:srgbClr val="00222E"/></a:accent1><a:accent2><a:srgbClr val="B91C1C"/></a:accent2><a:accent3><a:srgbClr val="85E89F"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="Template"><a:majorFont><a:latin typeface="Segoe UI"/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont></a:fontScheme>
  </a:themeElements>
</a:theme>`;

const TEMPLATE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld name="Office Theme"><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg2"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="TEMPLATE_MASTER_MARK"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="1860C5"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>TEMPLATE_MASTER_MARK</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/><p:sldLayoutId id="2147483651" r:id="rId3"/></p:sldLayoutIdLst>
</p:sldMaster>`;

const TEMPLATE_MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/>
</Relationships>`;

function templateLayoutXml(name: string, type: string, placeholder: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="${type}">
  <p:cSld name="${name}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="${name} Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="${placeholder}"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${name}</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sldLayout>`;
}

const TEMPLATE_LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

async function buildTemplatePotx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", TEMPLATE_CONTENT_TYPES);
  zip.file("ppt/presentation.xml", TEMPLATE_PRESENTATION_XML);
  zip.file("ppt/_rels/presentation.xml.rels", TEMPLATE_PRESENTATION_RELS);
  zip.file("ppt/theme/theme1.xml", TEMPLATE_UNUSED_THEME_XML);
  zip.file("ppt/theme/theme2.xml", TEMPLATE_THEME_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", TEMPLATE_MASTER_XML);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", TEMPLATE_MASTER_RELS);
  zip.file("ppt/slideLayouts/slideLayout1.xml", templateLayoutXml("Title Layout", "title", "ctrTitle"));
  zip.file("ppt/slideLayouts/slideLayout2.xml", templateLayoutXml("Content Layout", "obj", "body"));
  zip.file("ppt/slideLayouts/slideLayout3.xml", templateLayoutXml("Thank You", "secHead", "title"));
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", TEMPLATE_LAYOUT_RELS);
  zip.file("ppt/slideLayouts/_rels/slideLayout2.xml.rels", TEMPLATE_LAYOUT_RELS);
  zip.file("ppt/slideLayouts/_rels/slideLayout3.xml.rels", TEMPLATE_LAYOUT_RELS);
  return zip.generateAsync({ type: "nodebuffer" });
}

const SMARTART_SOURCE_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="SmartArt Template"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="914400"/><a:ext cx="5486400" cy="2743200"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rId1" r:lo="rId2" r:qs="rId3" r:cs="rId4"/></a:graphicData></a:graphic></p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`;

const SMARTART_SOURCE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout" Target="../diagrams/layout1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle" Target="../diagrams/quickStyle1.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors" Target="../diagrams/colors1.xml"/>
  <Relationship Id="rId5" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="../diagrams/drawing1.xml"/>
</Relationships>`;

async function buildSmartArtTemplatePptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", SMARTART_SOURCE_SLIDE_XML);
  zip.file("ppt/slides/_rels/slide1.xml.rels", SMARTART_SOURCE_RELS);
  zip.file("ppt/diagrams/data1.xml", '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:ptLst/><dgm:cxnLst/><dgm:extLst><dgm:ext uri="{test}"><test:drawing xmlns:test="urn:test" relId="rId5"/></dgm:ext></dgm:extLst></dgm:dataModel>');
  zip.file("ppt/diagrams/layout1.xml", '<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" uniqueId="urn:test:layout"><dgm:title val="Test"/></dgm:layoutDef>');
  zip.file("ppt/diagrams/quickStyle1.xml", '<dgm:styleDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" uniqueId="urn:test:style"><dgm:title val="Test"/></dgm:styleDef>');
  zip.file("ppt/diagrams/colors1.xml", '<dgm:colorsDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" uniqueId="urn:test:colors"><dgm:title val="Test"/></dgm:colorsDef>');
  zip.file("ppt/diagrams/drawing1.xml", '<dsp:drawing xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram"/>');
  return zip.generateAsync({ type: "nodebuffer" });
}

function pngDimensions(png: Buffer): { width: number; height: number } {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

describe("PPTX renderer", () => {
  it("refuses to render decks with lint errors by default", async () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements.push({
      id: "unsafe-visual",
      type: "svg",
      svg: '<svg><script>alert(1)</script><circle cx="5" cy="5" r="4" /></svg>',
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 2,
      decorative: false
    });

    await expect(renderDeckToPptx(deck, "should-not-render.pptx")).rejects.toThrow(/lint error/);
  });

  it("automatically polishes text layout before rendering", async () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "守る対象はアカウント単体ではなくエンドツーエンドの経路";
      title.w = 7.8;
      title.h = 2.0;
      title.fontSize = 32;
    }

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const result = await renderDeckToPptx(deck, join(outputDir, "polished.pptx"));

    expect(result.warnings.some((warning) => warning.includes("layout.text-overflow-risk"))).toBe(false);
  });

  it("automatically fixes bad line breaks before rendering", async () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "中継局とインターフェイスは、Zero Trustを適用する入口にな\nる";
      title.w = 6.5;
      title.h = 2.3;
      title.fontSize = 30;
    }

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const result = await renderDeckToPptx(deck, join(outputDir, "balanced-line-break.pptx"));

    expect(result.warnings.some((warning) => warning.includes("layout.bad-line-break"))).toBe(false);
  });

  it("automatically shapes rounded-card accent bars before rendering", async () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "card",
        type: "shape",
        shape: "roundRect",
        x: 1,
        y: 3,
        w: 4,
        h: 1.6,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 200
      },
      {
        id: "bar",
        type: "shape",
        shape: "rect",
        x: 1,
        y: 3,
        w: 0.12,
        h: 1.6,
        fill: "#8f3d35",
        decorative: true,
        readingOrder: 201
      }
    );

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const result = await renderDeckToPptx(deck, join(outputDir, "accent-bar.pptx"));

    expect(result.warnings.some((warning) => warning.includes("layout.card-accent-bar-unshaped"))).toBe(false);
  });

  it("does not emit round-rectangle adjustment guides on ellipse shapes", async () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "ellipse-with-radius",
      type: "shape",
      shape: "ellipse",
      x: 1,
      y: 3,
      w: 2,
      h: 1.2,
      radius: 0.08,
      fill: "#1d4ed8",
      decorative: true,
      readingOrder: 20
    });
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "ellipse-radius.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
    const ellipseShape = slide1.match(/<p:sp>[\s\S]*?prst="ellipse"[\s\S]*?<\/p:sp>/)?.[0] ?? "";
    expect(ellipseShape).toContain('prst="ellipse"');
    expect(ellipseShape).not.toContain('<a:gd name="adj"');
  });

  it("does not hide non-text out-of-bounds errors by polishing", async () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "off-slide-shape",
      type: "shape",
      shape: "rect",
      x: 20,
      y: 1,
      w: 3,
      h: 1,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 100
    });

    await expect(renderDeckToPptx(deck, "should-not-render-out-of-bounds.pptx")).rejects.toThrow(/lint error/);
  });

  it("automatically appends final source references before rendering", async () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/reference",
        usage: "inspiration"
      }
    ];
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "references.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const slide2 = await zip.file("ppt/slides/slide2.xml")?.async("string");
    expect(slide2).toContain("References and sources");
    expect(slide2).toContain("https://example.com/reference");
  });

  it("rasterizes local workspace SVG image paths to valid PNG media", async () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    const assetDir = join(process.cwd(), "generated", `render-path-test-${randomUUID()}`);
    const svgPath = join(assetDir, "diagram.svg");
    await mkdir(assetDir, { recursive: true });
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="10" y="10" width="100" height="60" fill="#eff6ff" stroke="#1d4ed8"/></svg>', "utf8");
    deck.slides[0].elements.push({
      id: "local-svg-path",
      type: "image",
      path: svgPath,
      altText: "Local SVG diagram",
      x: 1,
      y: 3,
      w: 3,
      h: 2,
      readingOrder: 20,
      decorative: false
    });
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "local-svg-path.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys((zip as unknown as { files: Record<string, unknown> }).files).filter((name) => name.startsWith("ppt/media/"));
    const pngName = mediaNames.find((name) => name.endsWith(".png"));
    expect(pngName).toBeDefined();
    expect(mediaNames.some((name) => name.endsWith(".svg"))).toBe(false);
    const png = await zip.file(pngName!)?.async("nodebuffer");
    expect(png?.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("caps rasterized SVG pixel dimensions", async () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "huge-svg",
      type: "svg",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10000 10000"><rect width="10000" height="10000" fill="#eff6ff"/></svg>',
      altText: "Huge SVG",
      x: 1,
      y: 3,
      w: 3,
      h: 2,
      readingOrder: 20,
      decorative: false
    });
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "huge-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const dimensionsList = await Promise.all(mediaNames.map(async (name) => pngDimensions((await zip.file(name)?.async("nodebuffer"))!)));
    const dimensions = dimensionsList.reduce((largest, current) => (current.width * current.height > largest.width * largest.height ? current : largest));
    expect(dimensions.width).toBeLessThanOrEqual(2048);
    expect(dimensions.height).toBeLessThanOrEqual(2048);
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(4_000_000);
  });

  it("preserves width-height SVG coordinate systems when rasterizing", async () => {
    const deck = {
      version: "0.1" as const,
      title: "Width height SVG",
      locale: "en-US" as const,
      template: "modern-simple",
      slides: [
        {
          id: "s1",
          title: "Width height SVG",
          elements: [
            {
              id: "svg-only",
              type: "svg" as const,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="50" y="0" width="50" height="50" fill="#1d4ed8"/></svg>',
              altText: "Width height SVG",
              x: 1,
              y: 1,
              w: 2,
              h: 1,
              readingOrder: 1,
              decorative: false
            }
          ]
        }
      ],
      metadata: { keywords: [], sources: [], contentMode: "presentation" as const }
    };
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "width-height-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const png = await zip.file(mediaNames[0])?.async("nodebuffer");
    expect(pngDimensions(png!)).toEqual({ width: 200, height: 100 });
  });

  it("ignores nested viewBox attributes when root SVG has width and height", async () => {
    const deck = {
      version: "0.1" as const,
      title: "Nested viewBox SVG",
      locale: "en-US" as const,
      template: "modern-simple",
      slides: [
        {
          id: "s1",
          title: "Nested viewBox SVG",
          elements: [
            {
              id: "nested-viewbox-svg",
              type: "svg" as const,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><defs><marker id="arrow" viewBox="0 0 1 1" markerWidth="1" markerHeight="1"><path d="M0 0L1 .5L0 1Z"/></marker></defs><rect width="100" height="50" fill="#eff6ff"/><line x1="5" y1="25" x2="95" y2="25" stroke="#1d4ed8" marker-end="url(#arrow)"/></svg>',
              altText: "Nested viewBox SVG",
              x: 1,
              y: 1,
              w: 2,
              h: 1,
              readingOrder: 1,
              decorative: false
            }
          ]
        }
      ],
      metadata: { keywords: [], sources: [], contentMode: "presentation" as const }
    };
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "nested-viewbox-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const png = await zip.file(mediaNames[0])?.async("nodebuffer");
    expect(pngDimensions(png!)).toEqual({ width: 200, height: 100 });
  });

  it("uses explicit root SVG width and height for raster resolution even when viewBox exists", async () => {
    const deck = {
      version: "0.1" as const,
      title: "Viewport SVG",
      locale: "en-US" as const,
      template: "modern-simple",
      slides: [
        {
          id: "s1",
          title: "Viewport SVG",
          elements: [
            {
              id: "viewport-svg",
              type: "svg" as const,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" viewBox="0 0 80 20"><rect width="80" height="20" fill="#eff6ff"/></svg>',
              altText: "Viewport SVG",
              x: 1,
              y: 1,
              w: 8,
              h: 2,
              readingOrder: 1,
              decorative: false
            }
          ]
        }
      ],
      metadata: { keywords: [], sources: [], contentMode: "presentation" as const }
    };
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "viewport-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const png = await zip.file(mediaNames[0])?.async("nodebuffer");
    expect(pngDimensions(png!)).toEqual({ width: 1600, height: 400 });
  });

  it("falls back to root viewBox for non-pixel root width and height", async () => {
    const deck = {
      version: "0.1" as const,
      title: "Percent SVG",
      locale: "en-US" as const,
      template: "modern-simple",
      slides: [
        {
          id: "s1",
          title: "Percent SVG",
          elements: [
            {
              id: "percent-svg",
              type: "svg" as const,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="50%" stroke-width="999" viewBox="0 0 80 20"><rect width="80" height="20" fill="#eff6ff"/></svg>',
              altText: "Percent SVG",
              x: 1,
              y: 1,
              w: 8,
              h: 2,
              readingOrder: 1,
              decorative: false
            }
          ]
        }
      ],
      metadata: { keywords: [], sources: [], contentMode: "presentation" as const }
    };
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "percent-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const png = await zip.file(mediaNames[0])?.async("nodebuffer");
    expect(pngDimensions(png!)).toEqual({ width: 160, height: 40 });
  });

  it("preserves oversized non-square SVG aspect ratios when capping raster output", async () => {
    const deck = {
      version: "0.1" as const,
      title: "Wide SVG",
      locale: "en-US" as const,
      template: "modern-simple",
      slides: [
        {
          id: "s1",
          title: "Wide SVG",
          elements: [
            {
              id: "wide-svg",
              type: "svg" as const,
              svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="100"><rect x="9900" y="0" width="100" height="100" fill="#1d4ed8"/></svg>',
              altText: "Wide SVG",
              x: 1,
              y: 1,
              w: 8,
              h: 1,
              readingOrder: 1,
              decorative: false
            }
          ]
        }
      ],
      metadata: { keywords: [], sources: [], contentMode: "presentation" as const }
    };
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "wide-svg.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const mediaNames = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && name.endsWith(".png"));
    const png = await zip.file(mediaNames[0])?.async("nodebuffer");
    expect(pngDimensions(png!)).toEqual({ width: 2048, height: 20 });
  });

  it("rejects oversized SVG data URIs before rasterization", async () => {
    const oversizedSvgBase64 = "A".repeat(Math.ceil(((2 * 1024 * 1024) + 1) * 4 / 3));
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "oversized-svg-data-uri",
      type: "image",
      dataUri: `data:image/svg+xml;base64,${oversizedSvgBase64}`,
      altText: "Oversized SVG",
      x: 1,
      y: 3,
      w: 3,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    await expect(renderDeckToPptx(deck, join(outputDir, "oversized-svg.pptx"))).rejects.toThrow(/too large to rasterize/);
  });

  it("encodes decorative shapes as a valid extension and removes the generated notes master reference", async () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "decorative-panel",
      type: "shape",
      shape: "roundRect",
      x: 1,
      y: 3,
      w: 4,
      h: 1.6,
      fill: "#ffffff",
      decorative: true,
      readingOrder: 200
    }, {
      id: "editable-connector",
      type: "shape",
      shape: "line",
      x: 1,
      y: 5,
      w: 2,
      h: 0,
      fill: "none",
      line: { color: "#1d4ed8", width: 1.5, endArrowType: "triangle" },
      decorative: true,
      readingOrder: 201
    });

    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-"));
    const outputPath = join(outputDir, "decorative.pptx");
    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const slide1 = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
    // `decorative` is not a declared attribute on p:cNvPr; emitting it makes PowerPoint treat the
    // file as corrupt. Decorative intent must live in the extLst extension instead.
    expect(slide1).not.toMatch(/<p:cNvPr[^>]*\sdecorative=/);
    expect(slide1).toContain("adec:decorative");
    expect(slide1).toContain("<p:cxnSp>");
    expect(slide1).toContain("<p:cNvCxnSpPr/>");
    expect([...slide1.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].some((shape) => shape[0].includes('prst="line"'))).toBe(false);

    const presentation = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
    const presentationRels = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";
    const notesSlideRels = (await zip.file("ppt/notesSlides/_rels/notesSlide1.xml.rels")?.async("string")) ?? "";
    const contentTypes = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
    expect(presentation).not.toContain("notesMasterIdLst");
    expect(presentationRels).not.toContain("notesMaster");
    expect(notesSlideRels).not.toContain("notesMaster");
    expect(contentTypes).not.toContain("notesMasters");
    expect(Object.keys(zip.files).some((name) => name.startsWith("ppt/notesMasters/"))).toBe(false);
  });

  it("transplants SmartArt graphicFrames and diagram parts from a template PPTX", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-smartart-"));
    const sourceDataUri = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${(await buildSmartArtTemplatePptx()).toString("base64")}`;
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "smartart-tree",
      type: "smartart",
      templateDataUri: sourceDataUri,
      sourceSlideIndex: 1,
      x: 1,
      y: 2,
      w: 10,
      h: 4,
      summary: "SmartArt hierarchy",
      longDescription: "A transplanted SmartArt hierarchy diagram from a template PPTX.",
      altText: "SmartArt hierarchy",
      decorative: false,
      readingOrder: 20
    });
    const outputPath = join(outputDir, "smartart.pptx");

    await renderDeckToPptx(deck, outputPath);

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const names = Object.keys(zip.files);
    const slide = (await zip.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
    const rels = (await zip.file("ppt/slides/_rels/slide1.xml.rels")?.async("string")) ?? "";
    const contentTypes = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
    const dataPartName = names.find((name) => /^ppt\/diagrams\/data\d+\.xml$/.test(name));
    const dataPart = dataPartName ? ((await zip.file(dataPartName)?.async("string")) ?? "") : "";
    const drawingRelId = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bType="[^"]*\/diagramDrawing"/.exec(rels)?.[1];

    expect(slide).toContain("<p:graphicFrame");
    expect(slide).toContain("dgm:relIds");
    expect(slide).toContain("xmlns:dgm=");
    expect(slide).toContain("xmlns:r=");
    expect(slide).toContain('descr="SmartArt hierarchy"');
    expect(rels).toContain("/diagramData");
    expect(rels).toContain("/diagramLayout");
    expect(rels).toContain("/diagramQuickStyle");
    expect(rels).toContain("/diagramColors");
    expect(rels).toContain("diagramDrawing");
    expect(drawingRelId).toBeDefined();
    expect(dataPart).toContain(`relId="${drawingRelId}"`);
    expect(dataPart).not.toContain('relId="rId5"');
    expect(names.filter((name) => /^ppt\/diagrams\/[^/]+\.xml$/.test(name)).length).toBe(5);
    expect(contentTypes).toContain("diagramData+xml");
    expect(contentTypes).toContain("diagramDrawing+xml");
  });

  it("applies an imported .potx slide master and layouts when rendering a deck with that template id", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pptcreater-render-template-"));
    const registryPath = join(outputDir, "registry.json");
    const potxPath = join(outputDir, "brand.potx");
    await writeFile(potxPath, await buildTemplatePotx());

    const imported = await importTemplateFromPptx(potxPath, {
      id: "brand-potx",
      name: "Brand POTX",
      register: true,
      registryPath
    });
    expect(imported.template.powerPointTemplate?.extension).toBe(".potx");
    expect(imported.template.powerPointTemplate?.titleLayoutPath).toBe("ppt/slideLayouts/slideLayout1.xml");
    expect(imported.template.powerPointTemplate?.contentLayoutPath).toBe("ppt/slideLayouts/slideLayout2.xml");
    expect(imported.template.powerPointTemplate?.closingLayoutPath).toBe("ppt/slideLayouts/slideLayout3.xml");

    const deck = createSampleDeck("en-US", { slideCount: 3 });
    deck.template = "brand-potx";
    deck.slides[0].layout = "title-slide";
    deck.slides[1].layout = "title-content";
    deck.slides[2].layout = "closing-slide";
    deck.slides.forEach((slide) => {
      slide.background = { color: "#ffffff" };
    });
    deck.metadata.sources = [{ id: "source", title: "Reference source", url: "https://example.com", usage: "quote" }];

    const outputPath = join(outputDir, "brand-output.pptx");
    const previousRegistryPath = process.env.PPTCREATER_TEMPLATE_REGISTRY_PATH;
    process.env.PPTCREATER_TEMPLATE_REGISTRY_PATH = registryPath;
    try {
      await renderDeckToPptx(deck, outputPath);
    } finally {
      if (previousRegistryPath === undefined) {
        delete process.env.PPTCREATER_TEMPLATE_REGISTRY_PATH;
      } else {
        process.env.PPTCREATER_TEMPLATE_REGISTRY_PATH = previousRegistryPath;
      }
    }

    const zip = await JSZip.loadAsync(await readFile(outputPath));
    const master = (await zip.file("ppt/slideMasters/slideMaster1.xml")?.async("string")) ?? "";
    const presentation = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
    const presentationRels = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";
    const titleRels = (await zip.file("ppt/slides/_rels/slide1.xml.rels")?.async("string")) ?? "";
    const contentRels = (await zip.file("ppt/slides/_rels/slide2.xml.rels")?.async("string")) ?? "";
    const closingRels = (await zip.file("ppt/slides/_rels/slide3.xml.rels")?.async("string")) ?? "";
    const referencesRels = (await zip.file("ppt/slides/_rels/slide4.xml.rels")?.async("string")) ?? "";
    const contentSlide = (await zip.file("ppt/slides/slide2.xml")?.async("string")) ?? "";
    const referencesSlide = (await zip.file("ppt/slides/slide4.xml")?.async("string")) ?? "";
    const contentTypes = (await zip.file("[Content_Types].xml")?.async("string")) ?? "";

    expect(master).toContain("TEMPLATE_MASTER_MARK");
    expect(presentation).toContain("sldMasterIdLst");
    expect(presentationRels).toContain("/slideMaster");
    expect(titleRels).toContain("Target=\"../slideLayouts/slideLayout1.xml\"");
    expect(contentRels).toContain("Target=\"../slideLayouts/slideLayout2.xml\"");
    expect(closingRels).toContain("Target=\"../slideLayouts/slideLayout3.xml\"");
    expect(referencesRels).toContain("Target=\"../slideLayouts/slideLayout2.xml\"");
    expect(contentSlide).not.toContain("<p:bg>");
    expect(contentSlide).toContain('val="FFFFFF"');
    expect(referencesSlide).toContain('val="FFFFFF"');
    expect(contentTypes).toContain('PartName="/ppt/slideMasters/slideMaster1.xml"');
    expect(contentTypes).toContain('PartName="/ppt/slideLayouts/slideLayout2.xml"');
    expect(contentTypes).not.toContain('PartName="/ppt/slideMasters/_rels/');
    expect(contentTypes).not.toContain('PartName="/ppt/slideLayouts/_rels/');
  });
});
