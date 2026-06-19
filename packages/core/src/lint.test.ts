import { describe, expect, it } from "vitest";
import { createSampleDeck, ensureSourceReferenceSlide, lintDeckSpec, parseDeckSpec } from "./index.js";

describe("DeckSpec linting", () => {
  it("accepts the generated sample deck", () => {
    const deck = parseDeckSpec(createSampleDeck("ja-JP"));
    const report = lintDeckSpec(deck);

    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("flags overlapping text elements", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "overlap-a",
        type: "text",
        role: "body",
        text: "重なるテキストA",
        x: 1,
        y: 6.2,
        w: 4,
        h: 0.8,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 200
      },
      {
        id: "overlap-b",
        type: "text",
        role: "body",
        text: "重なるテキストB",
        x: 1.2,
        y: 6.3,
        w: 4,
        h: 0.8,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 201
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overlap = report.issues.find((issue) => issue.code === "layout.text-overlap");

    expect(overlap?.severity).toBe("error");
  });

  it("treats text overflow risk as a render-blocking error", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "長すぎるタイトル".repeat(30);
      title.w = 2;
      title.h = 0.3;
      title.fontSize = 32;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const overflow = report.issues.find((issue) => issue.code === "layout.text-overflow-risk");

    expect(overflow?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("treats unreadably small text as a render-blocking error", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const callout = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "callout");
    if (callout?.type === "text") {
      callout.text = "Key";
      callout.fontSize = 10;
      callout.w = 4;
      callout.h = 0.8;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const small = report.issues.find((issue) => issue.code === "layout.text-too-small-to-read");

    expect(small?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags square accent bars flush with rounded card edges", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "card",
        type: "shape",
        shape: "roundRect",
        x: 1,
        y: 1,
        w: 4,
        h: 2,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 1
      },
      {
        id: "bar",
        type: "shape",
        shape: "rect",
        x: 1,
        y: 1,
        w: 0.12,
        h: 2,
        fill: "#8f3d35",
        decorative: true,
        readingOrder: 2
      },
      {
        id: "text",
        type: "text",
        role: "body",
        text: "Card text",
        x: 1.4,
        y: 1.4,
        w: 3,
        h: 0.7,
        fontSize: 18,
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));
    const bar = report.issues.find((issue) => issue.code === "layout.card-accent-bar-unshaped");

    expect(bar?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags bad orphan line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "中継局とインターフェイスは、Zero Trustを適用する入口にな\nる";
      title.w = 8;
      title.h = 1.6;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags a connected diagram built from hand-placed arrow shapes", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    // Four node-like cards plus a hand-placed arrow shape between them: this is a diagram an agent
    // should build with generate_diagram, where arrows are routed border-to-border automatically.
    deck.slides[0].elements.push(
      { id: "card-a", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 1, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 300 },
      { id: "card-b", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 4, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 301 },
      { id: "card-c", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 7, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 302 },
      { id: "card-d", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 10, y: 2, w: 1.5, h: 0.8, decorative: true, readingOrder: 303 },
      {
        id: "arrow-ab",
        type: "shape",
        shape: "line",
        fill: "none",
        x: 2.5,
        y: 2.4,
        w: 1.5,
        h: 0,
        decorative: true,
        readingOrder: 304,
        line: { color: "#475569", endArrowType: "triangle" }
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));
    const native = report.issues.find((issue) => issue.code === "diagram.native-connectors");

    expect(native?.severity).toBe("warning");
    expect(native?.message).toMatch(/generate_native_diagram/);
  });

  it("does not flag native diagram generator connectors as hand-placed arrows", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      { id: "arch-node-a-0", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 1, y: 2, w: 2, h: 1, decorative: true, readingOrder: 300 },
      { id: "arch-node-b-1", type: "shape", shape: "roundRect", fill: "#e2e8f0", x: 5, y: 2, w: 2, h: 1, decorative: true, readingOrder: 301 },
      {
        id: "arch-connector-0-0",
        type: "shape",
        shape: "line",
        fill: "none",
        x: 3,
        y: 2.5,
        w: 2,
        h: 0,
        decorative: true,
        readingOrder: 302,
        line: { color: "#475569", endArrowType: "triangle" }
      },
      {
        id: "arch-connector-1-0",
        type: "shape",
        shape: "line",
        fill: "none",
        x: 3,
        y: 2.8,
        w: 2,
        h: 0,
        decorative: true,
        readingOrder: 303,
        line: { color: "#475569", endArrowType: "triangle" }
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.native-connectors")).toBe(false);
  });

  it("does not flag a single decorative divider line as a native connector", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "divider",
      type: "shape",
      shape: "line",
      fill: "none",
      x: 1,
      y: 3,
      w: 6,
      h: 0,
      decorative: true,
      readingOrder: 320,
      line: { color: "#cbd5e1" }
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.native-connectors")).toBe(false);
  });

  it("does not flag a slide that already uses the diagram engine", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push(
      {
        id: "engine-diagram",
        type: "diagram",
        x: 1,
        y: 2,
        w: 10,
        h: 4,
        svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\"><rect width=\"960\" height=\"540\" fill=\"#fff\"/></svg>",
        summary: "engine diagram",
        longDescription: "A diagram produced by the engine so hand-placed arrows are not needed on this slide.",
        decorative: false,
        altText: "Architecture overview produced by the diagram engine",
        readingOrder: 330
      },
      {
        id: "arrow-extra",
        type: "shape",
        shape: "rightArrow",
        fill: "#475569",
        x: 2,
        y: 6.2,
        w: 1,
        h: 0.4,
        decorative: true,
        readingOrder: 331
      },
      {
        id: "arrow-extra2",
        type: "shape",
        shape: "rightArrow",
        fill: "#475569",
        x: 4,
        y: 6.2,
        w: 1,
        h: 0.4,
        decorative: true,
        readingOrder: 332
      }
    );

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.native-connectors")).toBe(false);
  });

  it("blocks when a large technical diagram is embedded as a flattened SVG image", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.metadata.contentMode = "technical";
    deck.slides[0].elements.push({
      id: "private-marketplace-diagram",
      type: "image",
      path: "generated-assets\\vscode-private-extension-marketplace.svg",
      x: 0.7,
      y: 1.5,
      w: 12,
      h: 5.2,
      description: "Private Marketplace architecture diagram",
      decorative: false,
      altText: "Private Marketplace architecture diagram",
      readingOrder: 340
    });

    const report = lintDeckSpec(parseDeckSpec(deck));
    const issue = report.issues.find((item) => item.code === "diagram.image-svg-not-editable");

    expect(issue?.severity).toBe("error");
    expect(issue?.message).toMatch(/generate_native_diagram/);
  });

  it("does not warn for small SVG image assets", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "small-icon",
      type: "image",
      dataUri: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==",
      x: 1,
      y: 1,
      w: 0.4,
      h: 0.4,
      description: "Small icon",
      decorative: true,
      readingOrder: 341
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.image-svg-not-editable")).toBe(false);
  });

  it("does not block unrelated large SVG illustrations in technical decks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.title = "Security architecture decision";
    deck.metadata.subject = "Security architecture decision";
    deck.metadata.contentMode = "technical";
    deck.slides[0].elements.push({
      id: "security-illustration",
      type: "image",
      dataUri: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5NjAgNTQwIj48Y2lyY2xlIGN4PSI0ODAiIGN5PSIyNzAiIHI9IjE2MCIgZmlsbD0iI2VmZjZmZiIvPjwvc3ZnPg==",
      x: 0.7,
      y: 1.5,
      w: 12,
      h: 5.2,
      description: "Security illustration",
      decorative: false,
      altText: "Security illustration",
      readingOrder: 342
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.image-svg-not-editable")).toBe(false);
  });

  it("blocks embedded SVG diagrams whose internal text becomes unreadably small", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "tiny-svg-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 5,
      h: 2.75,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1200 660\">",
        "<rect width=\"1200\" height=\"660\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"15\">Prediction</text>",
        "<text x=\"420\" y=\"120\" font-size=\"15\">Blast Radius</text>",
        "<text x=\"760\" y=\"120\" font-size=\"15\">Enforcement</text>",
        "</svg>"
      ].join(""),
      summary: "Tiny internal text diagram",
      longDescription: "A large SVG canvas with labels that become too small when the whole diagram is scaled down on a slide.",
      decorative: false,
      altText: "Diagram with tiny text",
      readingOrder: 340
    });

    const report = lintDeckSpec(parseDeckSpec(deck));
    const tinySvg = report.issues.find((issue) => issue.code === "visual.svg-text-too-small");

    expect(tinySvg?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("accounts for SVG group scaling when checking internal text size", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "scaled-svg-diagram",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<g transform=\"translate(0 200) scale(0.45)\">",
        "<text x=\"100\" y=\"120\" font-size=\"14\">Privileged session controls</text>",
        "<text x=\"520\" y=\"120\" font-size=\"14\">Monitoring response</text>",
        "</g>",
        "</svg>"
      ].join(""),
      summary: "Scaled SVG diagram",
      longDescription: "A slide-shaped SVG whose actual diagram content is scaled down inside a group.",
      decorative: false,
      altText: "Scaled SVG diagram",
      readingOrder: 345
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(true);
  });

  it("accounts for SVG matrix scaling when checking internal text size", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "matrix-scaled-svg-diagram",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<g transform=\"matrix(0.45 0 0 0.45 0 200)\">",
        "<text x=\"100\" y=\"120\" font-size=\"14\">Privileged session controls</text>",
        "</g>",
        "</svg>"
      ].join(""),
      summary: "Matrix scaled SVG diagram",
      longDescription: "A slide-shaped SVG whose diagram text is scaled down with an SVG matrix transform.",
      decorative: false,
      altText: "Matrix scaled SVG diagram",
      readingOrder: 346
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(true);
  });

  it("prefers inline SVG style font-size over the presentation attribute", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "style-overrides-font-size",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"24\" style=\"font-size:6px\">Looks small</text>",
        "</svg>"
      ].join(""),
      summary: "Style override SVG diagram",
      longDescription: "A slide-shaped SVG where inline style overrides the presentation font-size attribute.",
      decorative: false,
      altText: "Style override SVG diagram",
      readingOrder: 346
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(true);
  });

  it("accounts for inherited SVG font sizes when checking scaled text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "inherited-scaled-svg-diagram",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<g transform=\"translate(0 200) scale(0.45)\" font-size=\"14\">",
        "<text x=\"100\" y=\"120\">Privileged session controls</text>",
        "<text x=\"520\" y=\"120\">Monitoring response</text>",
        "</g>",
        "</svg>"
      ].join(""),
      summary: "Inherited font SVG diagram",
      longDescription: "A slide-shaped SVG whose actual diagram content inherits font size from a scaled group.",
      decorative: false,
      altText: "Inherited font SVG diagram",
      readingOrder: 347
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(true);
  });

  it("accounts for tspan SVG font sizes when checking scaled text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "tspan-scaled-svg-diagram",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<g transform=\"translate(0 200) scale(0.45)\">",
        "<text x=\"100\" y=\"120\"><tspan font-size=\"14\">Privileged session controls</tspan></text>",
        "</g>",
        "</svg>"
      ].join(""),
      summary: "Tspan font SVG diagram",
      longDescription: "A slide-shaped SVG whose actual diagram content stores font size on a scaled tspan.",
      decorative: false,
      altText: "Tspan font SVG diagram",
      readingOrder: 348
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(true);
  });

  it("does not apply parent text font size when a tspan overrides all visible text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "tspan-readable-override",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"6\"><tspan font-size=\"24\">Readable override</tspan></text>",
        "</svg>"
      ].join(""),
      summary: "Tspan override diagram",
      longDescription: "A slide-shaped SVG where visible text overrides a smaller parent text font size.",
      decorative: false,
      altText: "Tspan override diagram",
      readingOrder: 349
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(false);
  });

  it("does not apply unrelated non-text SVG group scaling to readable labels", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "scaled-icon-readable-text",
      type: "diagram",
      x: 1,
      y: 1.6,
      w: 10,
      h: 5.6,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<g transform=\"translate(40 40) scale(0.08)\"><circle cx=\"80\" cy=\"80\" r=\"40\" fill=\"#1d4ed8\"/></g>",
        "<text x=\"120\" y=\"160\" font-size=\"24\">Readable diagram label</text>",
        "</svg>"
      ].join(""),
      summary: "Readable SVG diagram",
      longDescription: "A slide-shaped SVG with readable text and an unrelated scaled decorative icon group.",
      decorative: false,
      altText: "Readable SVG diagram",
      readingOrder: 346
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(false);
  });

  it("blocks non-decorative diagram SVGs that only contain unlabeled shapes and connectors", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "unlabeled-threat-model",
      type: "diagram",
      x: 1,
      y: 2,
      w: 8,
      h: 4,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 900 520\">",
        "<rect width=\"900\" height=\"520\" fill=\"#111827\"/>",
        "<rect x=\"60\" y=\"60\" rx=\"16\" ry=\"16\" width=\"200\" height=\"90\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<rect x=\"350\" y=\"60\" rx=\"16\" ry=\"16\" width=\"200\" height=\"90\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<rect x=\"640\" y=\"60\" rx=\"16\" ry=\"16\" width=\"200\" height=\"90\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<line x1=\"260\" y1=\"105\" x2=\"350\" y2=\"105\" stroke=\"#cbd5e1\" stroke-width=\"4\"/>",
        "<line x1=\"550\" y1=\"105\" x2=\"640\" y2=\"105\" stroke=\"#cbd5e1\" stroke-width=\"4\"/>",
        "</svg>"
      ].join(""),
      summary: "Threat model diagram",
      longDescription: "A diagram with a complete accessible description but no visible labels inside the SVG itself.",
      decorative: false,
      altText: "Unlabeled threat model diagram",
      readingOrder: 350
    });

    const report = lintDeckSpec(parseDeckSpec(deck));
    const labels = report.issues.find((issue) => issue.code === "diagram.visible-labels-missing");

    expect(labels?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("allows visible SVG labels that use non-zero opacity styles", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "translucent-label-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 8,
      h: 4,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 900 520\">",
        "<rect width=\"900\" height=\"520\" fill=\"#111827\"/>",
        "<rect x=\"60\" y=\"80\" rx=\"16\" width=\"260\" height=\"120\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<rect x=\"520\" y=\"80\" rx=\"16\" width=\"260\" height=\"120\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<line x1=\"320\" y1=\"140\" x2=\"520\" y2=\"140\" stroke=\"#cbd5e1\" stroke-width=\"4\"/>",
        "<text x=\"190\" y=\"150\" font-size=\"28\" style=\"opacity:0.8\" fill=\"#f8fafc\" text-anchor=\"middle\">Policy</text>",
        "<text x=\"650\" y=\"150\" font-size=\"28\" opacity=\"0.8\" fill=\"#f8fafc\" text-anchor=\"middle\">Client</text>",
        "</svg>"
      ].join(""),
      summary: "Policy to client flow",
      longDescription: "A labeled policy to client flow diagram with visible translucent labels.",
      decorative: false,
      altText: "Labeled policy flow",
      readingOrder: 351
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "diagram.visible-labels-missing")).toBe(false);
  });

  it("does not count hidden SVG text in defs or hidden ancestor groups as visible labels", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "hidden-label-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 8,
      h: 4,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 900 520\">",
        "<defs><text x=\"20\" y=\"20\" font-size=\"20\">Template label</text></defs>",
        "<g display=\"none\"><text x=\"100\" y=\"100\" font-size=\"20\">Hidden group label</text></g>",
        "<rect width=\"900\" height=\"520\" fill=\"#111827\"/>",
        "<rect x=\"60\" y=\"80\" rx=\"16\" width=\"260\" height=\"120\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<rect x=\"520\" y=\"80\" rx=\"16\" width=\"260\" height=\"120\" fill=\"#1e293b\" stroke=\"#38bdf8\"/>",
        "<line x1=\"320\" y1=\"140\" x2=\"520\" y2=\"140\" stroke=\"#cbd5e1\" stroke-width=\"4\"/>",
        "</svg>"
      ].join(""),
      summary: "Hidden labels do not explain the visual",
      longDescription: "A diagram whose only text is hidden in defs or a display none group, so slide viewers still see unlabeled boxes.",
      decorative: false,
      altText: "Hidden-label diagram",
      readingOrder: 352
    });

    const report = lintDeckSpec(parseDeckSpec(deck));
    const labels = report.issues.find((issue) => issue.code === "diagram.visible-labels-missing");

    expect(labels?.severity).toBe("error");
  });

  it("allows embedded SVG diagrams whose internal text remains readable after scaling", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "readable-svg-diagram",
      type: "diagram",
      x: 1,
      y: 2,
      w: 10,
      h: 4,
      svg: [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 960 540\">",
        "<rect width=\"960\" height=\"540\" fill=\"#fff\"/>",
        "<text x=\"100\" y=\"120\" font-size=\"18\">Prediction</text>",
        "<text x=\"420\" y=\"120\" font-size=\"18\">Enforcement</text>",
        "</svg>"
      ].join(""),
      summary: "Readable internal text diagram",
      longDescription: "A diagram with labels that remain readable after scaling into the slide area.",
      decorative: false,
      altText: "Readable diagram",
      readingOrder: 340
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.svg-text-too-small")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "diagram.visible-labels-missing")).toBe(false);
  });

  it("does not flag concise bullet lists as bad line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "Risks:\n• A\n• B";
      body.w = 4;
      body.h = 1.4;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
  });

  it("flags orphaned continuation lines inside bullet lists", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "• 後続attack-chain stageは部分観測に留ま\nる";
      body.w = 5;
      body.h = 1.2;
      body.fontSize = 16;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("flags common Japanese continuation fragments inside bullet lists", () => {
    const brokenTexts = [
      "• 条件を確認す\nることが必要",
      "• Zero Trustを適用し\nている状態",
      "• ID侵害を保護でき\nない場合",
      "• 自動遮断を実行でき\nるようにする",
      "• ID侵害\nを保護",
      "• 事前\nに確認",
      "• MFA\nを保護",
      "• Zero Trust\nを適用"
    ];

    for (const text of brokenTexts) {
      const deck = createSampleDeck("ja-JP", { slideCount: 1 });
      const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
      if (body?.type === "text") {
        body.text = text;
        body.w = 5;
        body.h = 1.2;
        body.fontSize = 16;
      }

      const report = lintDeckSpec(parseDeckSpec(deck));
      const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

      expect(badBreak?.severity).toBe("error");
      expect(report.ok).toBe(false);
    }
  });

  it("flags empty bullet markers before wrapped content", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "• identity compromiseを直接示すSigninLogs sampleがない\n•\nDeviceTvmSecureConfigurationAssessmentが0 rows";
      body.w = 5.5;
      body.h = 1.7;
      body.fontSize = 14;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  it("allows short alphanumeric final title lines", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Roadmap\nQ4";
      title.w = 4;
      title.h = 1.4;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
  });

  it("allows compact Japanese label-value structures", () => {
    const compactTexts = ["指標\n値", "リスク\n状態", "サービス\n入口"];

    for (const text of compactTexts) {
      const deck = createSampleDeck("ja-JP", { slideCount: 1 });
      const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
      if (body?.type === "text") {
        body.text = text;
        body.w = 2;
        body.h = 0.8;
        body.fontSize = 20;
      }

      const report = lintDeckSpec(parseDeckSpec(deck));

      expect(report.issues.some((issue) => issue.code === "layout.bad-line-break")).toBe(false);
    }
  });

  it("flags compact Japanese continuation fragments outside bullet lists", () => {
    const brokenTexts = ["確認す\nること", "適用し\nている状態", "保護でき\nない場合"];

    for (const text of brokenTexts) {
      const deck = createSampleDeck("ja-JP", { slideCount: 1 });
      const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
      if (body?.type === "text") {
        body.text = text;
        body.w = 2.8;
        body.h = 0.9;
        body.fontSize = 20;
      }

      const report = lintDeckSpec(parseDeckSpec(deck));
      const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

      expect(badBreak?.severity).toBe("error");
      expect(report.ok).toBe(false);
    }
  });

  it("still flags punctuation-only compact line breaks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "指標\n、値";
      body.w = 2;
      body.h = 0.8;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("still flags compact orphan title lines", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "中継局と\nる";
      title.w = 5;
      title.h = 1.4;
      title.fontSize = 30;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("still flags compact orphan body lines", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const body = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "body");
    if (body?.type === "text") {
      body.text = "中継局と\nる";
      body.w = 3;
      body.h = 0.9;
      body.fontSize = 20;
    }

    const report = lintDeckSpec(parseDeckSpec(deck));
    const badBreak = report.issues.find((issue) => issue.code === "layout.bad-line-break");

    expect(badBreak?.severity).toBe("error");
  });

  it("suggests visual hierarchy for body-only enumerations", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "one",
        type: "text",
        role: "body",
        text: "大きな列挙項目その一",
        x: 1,
        y: 1,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "two",
        type: "text",
        role: "body",
        text: "大きな列挙項目その二",
        x: 1,
        y: 2.2,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "three",
        type: "text",
        role: "body",
        text: "大きな列挙項目その三",
        x: 1,
        y: 3.4,
        w: 3,
        h: 1,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));
    const hierarchy = report.issues.find((issue) => issue.code === "layout.enumeration-hierarchy");

    expect(hierarchy?.severity).toBe("warning");
  });

  it("does not block enumerations with shape-based visual structure", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [
      {
        id: "card-one",
        type: "shape",
        shape: "roundRect",
        x: 0.8,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 1
      },
      {
        id: "one",
        type: "text",
        role: "body",
        text: "大きな列挙項目その一",
        x: 1,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "card-two",
        type: "shape",
        shape: "roundRect",
        x: 4.1,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 3
      },
      {
        id: "two",
        type: "text",
        role: "body",
        text: "大きな列挙項目その二",
        x: 4.3,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 4
      },
      {
        id: "card-three",
        type: "shape",
        shape: "roundRect",
        x: 7.4,
        y: 1,
        w: 3,
        h: 1,
        fill: "#ffffff",
        decorative: true,
        readingOrder: 5
      },
      {
        id: "three",
        type: "text",
        role: "body",
        text: "大きな列挙項目その三",
        x: 7.6,
        y: 1.2,
        w: 2.5,
        h: 0.6,
        fontSize: 22,
        bold: false,
        decorative: false,
        readingOrder: 6
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.enumeration-hierarchy")).toBe(false);
  });

  it("does not treat long prose boxes as enumeration cards", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements = [1, 2, 3].map((item) => ({
      id: `prose-${item}`,
      type: "text" as const,
      role: "body" as const,
      text: "これは報告書で使う長めの説明文です。複数の根拠や背景を一つの段落として示しており、列挙カードではありません。",
      x: 1,
      y: item,
      w: 8,
      h: 0.8,
      fontSize: 18,
      bold: false,
      decorative: false,
      readingOrder: item
    }));

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.enumeration-hierarchy")).toBe(false);
  });

  it("flags Japanese technical titles that read like document sentences", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "technical" });
    deck.metadata.contentMode = "technical";
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "露出グラフに攻撃活動を重ね、blast radius と最短経路を推定する",
        x: 0.8,
        y: 0.7,
        w: 11,
        h: 1.2,
        fontSize: 30,
        bold: true,
        decorative: false,
        readingOrder: 1
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.title-too-long")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "content.ja-title-claim-like")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "content.ja-message-missing")).toBe(true);
  });

  it("allows a Japanese presentation action title when it is concise", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "presentation" });
    deck.metadata.contentMode = "presentation";
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "初動の時間負けを縮める";
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.ja-title-claim-like")).toBe(false);
  });

  it("flags English generic topic titles", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1, contentMode: "decision" });
    deck.metadata.contentMode = "decision";
    const title = deck.slides[0].elements.find((element) => element.type === "text" && element.role === "title");
    if (title?.type === "text") {
      title.text = "Overview";
    }

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "content.title-generic")).toBe(true);
  });

  it("flags an opaque shape drawn over text", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.slides[0].elements.push({
      id: "cover-shape",
      type: "shape",
      shape: "rect",
      x: 0.8,
      y: 1.35,
      w: 6.5,
      h: 2.3,
      fill: "#000000",
      decorative: true,
      readingOrder: 900
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "layout.shape-over-text")).toBe(true);
  });

  it("flags missing alt text for non-decorative visuals", () => {
    const deck = createSampleDeck("en-US");
    deck.slides[0].elements.push({
      id: "visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 2,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.alt-text-missing")).toBe(true);
  });

  it("uses calibrated small-font recommendations for report-formal decks", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "report" });
    deck.template = "report-formal";
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "短い報告見出し",
        x: 0.8,
        y: 0.6,
        w: 7,
        h: 0.7,
        fontSize: 24,
        color: "#24211d",
        contrastBackground: "#fbfaf7",
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "body",
        type: "text",
        role: "body",
        text: "短い本文",
        x: 0.8,
        y: 1.5,
        w: 5,
        h: 0.5,
        fontSize: 12,
        color: "#24211d",
        contrastBackground: "#fbfaf7",
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "caption",
        type: "text",
        role: "caption",
        text: "注釈",
        x: 0.8,
        y: 2.2,
        w: 5,
        h: 0.3,
        fontSize: 8.5,
        color: "#24211d",
        contrastBackground: "#fbfaf7",
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "text.small-font")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "layout.text-too-small-to-read")).toBe(false);
  });

  it("allows compact Diagram Intent captions without small-font warnings", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "technical" });
    deck.slides[0].elements.push({
      id: "custom-intent-approved-step-3-text",
      type: "text",
      role: "caption",
      text: "PIM\nJIT / approval",
      x: 6,
      y: 4,
      w: 1.2,
      h: 0.5,
      fontSize: 8.5,
      color: "#4F5D66",
      contrastBackground: "#FFF4E0",
      bold: true,
      decorative: false,
      altText: "generated diagram intent text",
      readingOrder: 900
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "text.small-font" && issue.path.endsWith(".fontSize"))).toBe(false);
  });

  it("blocks text-only content slides so pptcreater output stays visually rich", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "report" });
    deck.slides[0].elements = [
      {
        id: "title",
        type: "text",
        role: "title",
        text: "企業概要",
        x: 0.8,
        y: 0.6,
        w: 11,
        h: 0.7,
        fontSize: 32,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      {
        id: "body",
        type: "text",
        role: "body",
        text: "主力事業、組織、顧客理解の観点を文章だけで説明します。事業領域の違いや部門ごとの特徴も、図解やカード構造を使わずに長い本文で並べてしまっています。",
        x: 0.9,
        y: 1.8,
        w: 10.5,
        h: 1,
        fontSize: 22,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: false,
        decorative: false,
        readingOrder: 2
      },
      {
        id: "body-2",
        type: "text",
        role: "body",
        text: "本来は事業マップ、部門構造、顧客接点を表やポンチ絵で示すべき内容です。",
        x: 0.9,
        y: 2.95,
        w: 10.5,
        h: 0.8,
        fontSize: 22,
        color: "#0f172a",
        contrastBackground: "#ffffff",
        bold: false,
        decorative: false,
        readingOrder: 3
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.richness-missing")).toBe(true);
  });

  it("allows sparse cover or section slides without forcing decoration", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1, contentMode: "presentation" });
    deck.slides[0] = {
      id: "cover",
      title: "表紙",
      layout: "cover",
      elements: [
        {
          id: "title",
          type: "text",
          role: "title",
          text: "企業紹介",
          x: 0.8,
          y: 2,
          w: 11,
          h: 0.8,
          fontSize: 36,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        }
      ]
    };

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.richness-missing")).toBe(false);
  });

  it("blocks whole decks that are mostly text-only", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "report" });
    deck.slides.forEach((slide, index) => {
      slide.elements = [
        {
          id: `title-${index}`,
          type: "text",
          role: "title",
          text: slide.title,
          x: 0.8,
          y: 0.6,
          w: 11,
          h: 0.7,
          fontSize: 30,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: `body-${index}`,
          type: "text",
          role: "body",
          text: "箇条書きだけで構成された、視覚構造のないスライドです。読み手は各項目の関係性や優先度を自分で解釈する必要があり、pptcreater の出力として不十分です。",
          x: 0.9,
          y: 1.8,
          w: 10.5,
          h: 1,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 2
        },
        {
          id: `body-extra-${index}`,
          type: "text",
          role: "body",
          text: "図解、表、アイコン、カード構造のいずれもなく、読み手にとって単調な資料です。",
          x: 0.9,
          y: 3,
          w: 10.5,
          h: 0.8,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 3
        }
      ];
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "visual.richness-deck")).toBe(true);
  });

  it("allows decks that use shape/card composition without SVG diagrams", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 4, contentMode: "report" });
    deck.slides.forEach((slide, index) => {
      slide.layout = "title-content";
      slide.elements = [
        {
          id: `title-${index}`,
          type: "text",
          role: "title",
          text: slide.title,
          x: 0.8,
          y: 0.6,
          w: 11,
          h: 0.7,
          fontSize: 30,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: `card-${index}-a`,
          type: "shape",
          shape: "roundRect",
          x: 0.9,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#eff6ff",
          line: { color: "#93c5fd" },
          decorative: true,
          readingOrder: 2
        },
        {
          id: `card-${index}-b`,
          type: "shape",
          shape: "roundRect",
          x: 4.5,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#f0fdf4",
          line: { color: "#86efac" },
          decorative: true,
          readingOrder: 3
        },
        {
          id: `card-${index}-c`,
          type: "shape",
          shape: "roundRect",
          x: 8.1,
          y: 1.8,
          w: 3.2,
          h: 1.6,
          fill: "#fff7ed",
          line: { color: "#fdba74" },
          decorative: true,
          readingOrder: 4
        },
        {
          id: `body-${index}`,
          type: "text",
          role: "body",
          text: "カード構造で情報を分割しているため、文字だけのスライドではありません。",
          x: 1.1,
          y: 2.1,
          w: 9.5,
          h: 0.6,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 5
        }
      ];
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.richness-deck")).toBe(false);
  });

  it("requires citation metadata for quoted source visuals", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "quote"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Quoted source visual",
      sourceId: "source-1",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.attribution-missing")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "source.citation-missing")).toBe(true);
  });

  it("requires external source URLs to appear on the final references slide", () => {
    const deck = createSampleDeck("ja-JP");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Microsoft reference",
        url: "https://learn.microsoft.com/azure/example",
        usage: "inspiration"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(true);
  });

  it("adds a final references slide with actual source URLs", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Microsoft reference",
        url: "https://learn.microsoft.com/azure/example",
        usage: "inspiration"
      },
      {
        id: "source-2",
        title: "AWS reference",
        url: "https://aws.amazon.com/architecture/icons/",
        usage: "inspiration"
      }
    ];

    const withReferences = ensureSourceReferenceSlide(parseDeckSpec(deck));
    const finalSlide = withReferences.slides.at(-1);

    expect(finalSlide?.title).toBe("参考URL・出典");
    expect(finalSlide?.elements.some((element) => element.type === "text" && element.text.includes("https://learn.microsoft.com/azure/example"))).toBe(true);
    expect(finalSlide?.speakerNotes).toContain("https://aws.amazon.com/architecture/icons/");
    expect(lintDeckSpec(withReferences).issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(false);
  });

  it("updates a generated references slide when source URLs change", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Old source",
        url: "https://example.com/old",
        usage: "inspiration"
      }
    ];
    const withOldReferences = ensureSourceReferenceSlide(parseDeckSpec(deck));
    const updatedDeck = {
      ...withOldReferences,
      metadata: {
        ...withOldReferences.metadata,
        sources: [
          {
            id: "source-2",
            title: "New source",
            url: "https://example.com/new",
            usage: "inspiration" as const
          }
        ]
      }
    };

    const withNewReferences = ensureSourceReferenceSlide(parseDeckSpec(updatedDeck));
    const finalText = withNewReferences.slides.at(-1)?.elements.map((element) => (element.type === "text" ? element.text : "")).join("\n");

    expect(finalText).toContain("https://example.com/new");
    expect(finalText).not.toContain("https://example.com/old");
  });

  it("allows URL sources to be collected only on the final references slide", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/reference",
        usage: "quote"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Quoted source visual",
      sourceId: "source-1",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(ensureSourceReferenceSlide(parseDeckSpec(deck)));

    expect(report.issues.some((issue) => issue.code === "source.citation-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.visual-reference-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.attribution-missing")).toBe(false);
  });

  it("does not require visual richness on a manually authored final references slide", () => {
    const deck = createSampleDeck("en-US", { slideCount: 1 });
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        url: "https://example.com/reference",
        usage: "inspiration"
      }
    ];
    deck.slides.push({
      id: "manual-reference-list",
      title: "Useful links",
      layout: "title-content",
      elements: [
        {
          id: "manual-ref-title",
          type: "text",
          role: "title",
          text: "Useful links",
          x: 0.8,
          y: 0.6,
          w: 10,
          h: 0.7,
          fontSize: 32,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: true,
          decorative: false,
          readingOrder: 1
        },
        {
          id: "manual-ref-url",
          type: "text",
          role: "body",
          text: "https://example.com/reference",
          x: 0.9,
          y: 1.8,
          w: 10.5,
          h: 0.5,
          fontSize: 22,
          color: "#0f172a",
          contrastBackground: "#ffffff",
          bold: false,
          decorative: false,
          readingOrder: 2
        }
      ]
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "source.reference-slide-missing")).toBe(false);
    expect(report.issues.some((issue) => issue.path === "slides.1" && issue.code === "visual.richness-missing")).toBe(false);
  });

  it("requires quoted or recreated sources to be referenced by elements", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.visual-reference-missing")).toBe(true);
  });

  it("rejects duplicate source ids", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "quote",
        attribution: "Reference article"
      },
      {
        id: "source-1",
        title: "Shadow source",
        usage: "inspiration"
      }
    ];

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.duplicate-id")).toBe(true);
  });

  it("requires recreated source visuals to be editable objects", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-visual",
      type: "svg",
      svg: "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>",
      altText: "Recreated visual",
      sourceId: "source-1",
      citation: "Adapted from Reference article.",
      x: 1,
      y: 3,
      w: 2,
      h: 2,
      readingOrder: 20,
      decorative: false
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.recreate-not-editable")).toBe(true);
  });

  it("requires source-linked recreated shapes to make an accessibility decision", () => {
    const deck = createSampleDeck("en-US");
    deck.metadata.sources = [
      {
        id: "source-1",
        title: "Reference article",
        usage: "recreate",
        attribution: "Reference article"
      }
    ];
    deck.slides[0].elements.push({
      id: "source-shape",
      type: "shape",
      shape: "roundRect",
      fill: "#ffffff",
      sourceId: "source-1",
      citation: "Adapted from Reference article.",
      x: 1,
      y: 3,
      w: 2,
      h: 1,
      readingOrder: 20,
      decorative: true
    });

    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "source.recreate-shape-accessibility-missing")).toBe(true);
  });
});
