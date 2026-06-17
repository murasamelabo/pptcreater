import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createSampleDeck } from "@pptcreater/core";
import { renderDeckToPptx } from "./index.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip") as { loadAsync(data: Buffer): Promise<{ file(name: string): { async(type: "string"): Promise<string> } | null }> };

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

  it("embeds local workspace SVG image paths without requiring PowerPoint automation", async () => {
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
    expect(mediaNames.some((name) => name.endsWith(".svg"))).toBe(true);
  });
});
