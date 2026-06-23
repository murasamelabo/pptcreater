import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { listDesignComponents } from "../packages/core/dist/index.js";
import { renderDeckToPptx } from "../packages/render-pptx/dist/index.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const all = await listDesignComponents({ roots: [resolve(root, "design-packs")] });
const editable = all.filter((c) => c.packId === "zukai" && c.editableGroups.length > 0);

const slides = editable.map((component) => {
  const group = component.editableGroups[0];
  const members = group.members;
  // add one node (clone the 2nd member) at the end, and remove the last original member.
  const cloneFrom = members[Math.min(1, members.length - 1)];
  const nodeOperations = [
    { op: "add", group: group.id, cloneFrom, label: "＋追加ノード", at: members.length }
  ];
  if (members.length >= 4) {
    nodeOperations.push({ op: "remove", target: members[members.length - 1] });
  }
  return {
    id: component.id,
    title: component.name,
    layout: "design-component",
    background: { color: "#ffffff" },
    speakerNotes: `${component.name} — node add/remove`,
    elements: [
      {
        id: `${component.id}-slide`,
        type: "pptxSlide",
        templatePath: component.sourcePptxPath,
        sourceSlideIndex: component.sourceSlideIndex,
        nodeGroups: component.editableGroups,
        nodeOperations,
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
        decorative: false,
        summary: component.name,
        longDescription: `Node add/remove demo for ${component.id} (${group.layout}).`,
        altText: component.name,
        readingOrder: 1
      }
    ]
  };
});

const deck = {
  version: "0.1",
  title: "Zukai Node Edit Gallery",
  locale: "ja-JP",
  template: "modern-simple",
  tokens: {
    colors: { background: "#ffffff", surface: "#f8fafc", text: "#111827", mutedText: "#334155", accent: "#2563eb", danger: "#dc2626", success: "#16a34a" },
    typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", fallbackFonts: [] },
    spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
  },
  slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
  slides,
  metadata: { contentMode: "presentation", keywords: ["zukai", "nodes"], sources: [] }
};

const output = resolve(root, "generated", "zukai-node-edit-gallery.pptx");
await mkdir(dirname(output), { recursive: true });
const result = await renderDeckToPptx(deck, output, { allowLintErrors: true });
console.log("Rendered:", result.outputPath, "components:", editable.length);

// Verify every slide is a single spTree.
const zip = await JSZip.loadAsync(await (await import("node:fs/promises")).readFile(output));
const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
let bad = 0;
for (const n of names) {
  const x = await zip.file(n).async("string");
  const tree = (x.match(/<\/p:spTree>/g) || []).length;
  if (tree !== 1) {
    bad++;
    console.log("  BAD spTree", n, tree);
  }
}
console.log("slides:", names.length, "badSpTree:", bad);
