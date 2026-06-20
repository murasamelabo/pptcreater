import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createSampleDeck } from "@pptcreater/core";
import { renderDeckToPptx } from "./index.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<{ file(name: string): { async(type: "string"): Promise<string>; async(type: "nodebuffer"): Promise<Buffer> } | null; files: Record<string, unknown> }> };

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

  it("encodes decorative shapes as a valid extension and preserves PowerPoint-compatible presentation order", async () => {
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

    const presentation = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
    if (presentation.includes("notesMasterIdLst")) {
      // PowerPoint rejects files when notesMasterIdLst is moved before sldIdLst; preserve pptxgenjs order.
      expect(presentation.indexOf("sldIdLst")).toBeLessThan(presentation.indexOf("notesMasterIdLst"));
    }
  });
});
