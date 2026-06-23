import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listDesignComponents } from "../packages/core/dist/index.js";
import { renderDeckToPptx } from "../packages/render-pptx/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const all = await listDesignComponents({ roots: [resolve(root, "design-packs")] });
const components = all.filter((c) => c.packId === "zukai");

const slides = components.map((component) => ({
  id: component.id,
  title: component.name,
  layout: "design-component",
  background: { color: "#ffffff" },
  speakerNotes: component.name,
  elements: [
    {
      id: `${component.id}-slide`,
      type: "pptxSlide",
      templatePath: component.sourcePptxPath,
      sourceSlideIndex: component.sourceSlideIndex,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      decorative: false,
      summary: component.name,
      longDescription: `Curated schematic component (${component.id}) from ${component.packName}.`,
      altText: component.name,
      readingOrder: 1
    }
  ]
}));

const deck = {
  version: "0.1",
  title: "Zukai Design Pack — Full Gallery",
  locale: "ja-JP",
  template: "modern-simple",
  tokens: {
    colors: {
      background: "#ffffff",
      surface: "#f8fafc",
      text: "#111827",
      mutedText: "#334155",
      accent: "#2563eb",
      danger: "#dc2626",
      success: "#16a34a"
    },
    typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", fallbackFonts: [] },
    spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
  },
  slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
  slides,
  metadata: { contentMode: "presentation", keywords: ["zukai"], sources: [] }
};

const output = resolve(root, "generated", "zukai-design-pack-gallery.pptx");
await mkdir(dirname(output), { recursive: true });
const result = await renderDeckToPptx(deck, output, { allowLintErrors: true });
console.log("Rendered:", result.outputPath);
console.log("Components:", components.length);
