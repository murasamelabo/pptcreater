import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SCHEMATIC_KIND_CATALOG,
  SCHEMATIC_KINDS,
  SCHEMATIC_MODE_TEMPLATES,
  renderSchematicDiagram,
  schematicTemplatesForStyleProfile
} from "../packages/diagram/dist/index.js";

const STYLE_SAMPLE_PATHS = {
  minimal: "samples/pptcreater-overview-minimal.deck.json",
  stylish: "samples/pptcreater-overview-stylish.deck.json",
  report: "samples/pptcreater-overview-report.deck.json",
  presentation: "samples/pptcreater-overview-presentation.deck.json",
  technical: "samples/pptcreater-overview-technical.deck.json"
};

const DEFAULT_SAMPLE_PATH = "samples/pptcreater-overview.deck.json";
const SCHEMATIC_SOURCE = {
  id: "slideland-schematic-inspiration",
  title: "Slideland schematic and taste references",
  url: "https://www.slideland.tech/docs/schematic",
  usage: "inspiration",
  notes: "Layouts are inspired by common schematic categories, not copied from source visuals."
};

const defaultTokens = {
  colors: {
    background: "#ffffff",
    surface: "#f6f5f2",
    text: "#1f2933",
    mutedText: "#59636e",
    accent: "#315f9f",
    danger: "#9f3a38",
    success: "#2f6f55"
  },
  typography: {
    headingFont: "Yu Gothic",
    bodyFont: "Yu Gothic",
    fallbackFonts: ["Meiryo", "Hiragino Kaku Gothic ProN", "Arial", "sans-serif"],
    titleSize: 38,
    bodySize: 22,
    captionSize: 14
  },
  spacing: {
    margin: 0.6,
    gutter: 0.28,
    radius: 0.1
  }
};

async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function schematicSlide(template, index) {
  const catalog = SCHEMATIC_KIND_CATALOG[template.kind];
  const slideTitle =
    template.styleProfile === "report" || template.styleProfile === "technical"
      ? `${catalog.labelJa}テンプレート`
      : template.titleJa;
  const rendered = renderSchematicDiagram({
    kind: template.kind,
    title: template.titleJa,
    summary: template.summary,
    longDescription: template.longDescription,
    items: [...template.items],
    secondaryItems: [...(template.secondaryItems ?? [])],
    axisX: template.axisX,
    axisY: template.axisY,
    tone: template.tone
  });

  return {
    id: `schematic-${template.styleProfile}-${template.kind}`,
    title: slideTitle,
    layout: `schematic-${template.styleProfile}`,
    speakerNotes: `Pattern ${index + 1}: ${template.kind}. ${template.usage}`,
    elements: [
      {
        id: `${template.styleProfile}-${template.kind}-visual`,
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
        readingOrder: 1,
        decorative: false,
        altText: `${catalog.labelJa} (${template.kind}) ${template.styleProfile} schematic template`,
        type: "diagram",
        svg: rendered.svg,
        summary: rendered.summary,
        longDescription: rendered.longDescription
      }
    ]
  };
}

function referenceSlide(deck) {
  const tokens = deck.tokens ?? defaultTokens;
  return {
    id: "source-references",
    title: "参考URL・出典",
    layout: "references",
    speakerNotes:
      "Source URLs and attribution:\n1. Slideland schematic and taste references | URL: https://www.slideland.tech/docs/schematic | Notes: Layouts are inspired by common schematic categories, not copied from source visuals.",
    elements: [
      {
        id: "references-title",
        type: "text",
        role: "title",
        text: "参考URL・出典",
        x: 0.75,
        y: 0.58,
        w: 11.8,
        h: 0.9,
        fontSize: 34,
        color: tokens.colors.text,
        contrastBackground: tokens.colors.background,
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "references-message",
        type: "text",
        role: "body",
        text: "外部サイトを参照した内容は、以下のURLを出典として確認できます（1件）。",
        x: 0.78,
        y: 1.48,
        w: 11.6,
        h: 0.42,
        fontSize: 20,
        color: tokens.colors.mutedText,
        contrastBackground: tokens.colors.background,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "reference-1",
        type: "text",
        role: "caption",
        text: "1. Slideland schematic and taste references\nhttps://www.slideland.tech/docs/schematic",
        x: 0.85,
        y: 2.08,
        w: 11.45,
        h: 4.76,
        fontSize: 14,
        color: tokens.colors.text,
        contrastBackground: tokens.colors.background,
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ]
  };
}

function withoutGeneratedSchematicSlides(slides) {
  return slides.filter((slide) => !String(slide.id).startsWith("schematic-") && slide.id !== "source-references");
}

function withSchematicMetadata(deck) {
  const sources = deck.metadata?.sources ?? [];
  const sourceExists = sources.some((source) => source.id === SCHEMATIC_SOURCE.id);
  return {
    ...(deck.metadata ?? {}),
    keywords: [...new Set([...(deck.metadata?.keywords ?? []), "schematic", "slideland-inspired", ...SCHEMATIC_KINDS])],
    sources: sourceExists ? sources : [...sources, SCHEMATIC_SOURCE]
  };
}

async function updateModeSample(path, styleProfile) {
  const deck = await readJson(path);
  const templates = Object.values(schematicTemplatesForStyleProfile(styleProfile));
  const slides = [
    ...withoutGeneratedSchematicSlides(deck.slides),
    ...templates.map((template, index) => schematicSlide(template, index)),
    referenceSlide(deck)
  ];
  const updated = {
    ...deck,
    metadata: withSchematicMetadata(deck),
    slides
  };
  await writeJson(path, updated);
  return { path, styleProfile, slides: slides.length, schematicSlides: templates.length };
}

async function writeCatalogSample() {
  const templates = Object.values(SCHEMATIC_MODE_TEMPLATES.minimal);
  const deck = {
    version: "0.1",
    title: "pptcreater schematic pattern samples",
    locale: "ja-JP",
    template: "modern-simple",
    skillPack: "slide-briefing-ja",
    tokens: defaultTokens,
    metadata: {
      keywords: ["schematic", "slideland-inspired", ...SCHEMATIC_KINDS],
      contentMode: "presentation",
      sources: [SCHEMATIC_SOURCE]
    },
    slides: [...templates.map((template, index) => schematicSlide(template, index)), referenceSlide({ tokens: defaultTokens })]
  };
  await writeJson("samples/schematic-patterns.deck.json", deck);
  return { path: "samples/schematic-patterns.deck.json", styleProfile: "minimal", slides: deck.slides.length, schematicSlides: templates.length };
}

const results = [await writeCatalogSample()];
for (const [styleProfile, path] of Object.entries(STYLE_SAMPLE_PATHS)) {
  results.push(await updateModeSample(path, styleProfile));
}
results.push(await updateModeSample(DEFAULT_SAMPLE_PATH, "minimal"));

for (const result of results) {
  console.log(`Updated ${resolve(result.path)} with ${result.schematicSlides} ${result.styleProfile} schematic slides (${result.slides} total).`);
}
