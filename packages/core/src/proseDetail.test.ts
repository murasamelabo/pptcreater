import { describe, expect, it } from "vitest";
import { createDetailSlide, lintDeckSpec, parseDeckSpec, createSampleDeck, reviewDeckContent } from "./index.js";

describe("createDetailSlide", () => {
  it("builds an explanation slide with concise heading + prose blocks and a detail layout", () => {
    const { slide, warnings } = createDetailSlide({
      variant: "explanation",
      title: "サービスの概要",
      lead: "全体像を一段詳しく説明します",
      blocks: [
        { heading: "可視化", body: "クラウド利用を検出し、シャドー IT を含む全体像を継続的に把握します。" },
        { heading: "制御", body: "ポリシーによりリアルタイムでセッションを制御し、機密データの持ち出しを防ぎます。" }
      ]
    });

    expect(slide.layout).toBe("detail");
    expect(warnings).toHaveLength(0);
    expect(slide.elements.some((element) => element.type === "text" && element.role === "title")).toBe(true);
    const bodies = slide.elements.filter((element) => element.type === "text" && element.role === "body");
    expect(bodies.length).toBe(2);
    // Reading order is explicit on every element.
    expect(slide.elements.every((element) => element.readingOrder !== undefined)).toBe(true);
  });

  it("builds a Q&A slide with a qa layout and Q/A markers per item", () => {
    const { slide } = createDetailSlide({
      variant: "qa",
      title: "よくある質問",
      items: [
        { question: "既存環境と連携できますか？", answer: "はい。アラートは既存のインシデント基盤へ自動集約されます。" }
      ]
    });

    expect(slide.layout).toBe("qa");
    const marks = slide.elements.filter((element) => element.type === "text" && (element.text === "Q" || element.text === "A"));
    expect(marks.length).toBe(2);
  });

  it("builds a benefits (得られること) slide with numbered items", () => {
    const { slide } = createDetailSlide({
      variant: "benefits",
      title: "導入で得られること",
      items: [
        { label: "可視化", description: "未承認のクラウド利用を検出して評価できます。" },
        { label: "抑止", description: "機密データの持ち出しをリアルタイムにブロックします。" }
      ]
    });

    expect(slide.layout).toBe("detail");
    expect(slide.elements.some((element) => element.type === "text" && element.text === "1")).toBe(true);
    expect(slide.elements.some((element) => element.type === "text" && element.text === "2")).toBe(true);
  });

  it("caps items beyond six and reports a warning", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ label: `項目${index + 1}`, description: "説明文です。" }));
    const { slide, warnings } = createDetailSlide({ variant: "benefits", title: "メリット", items });

    expect(warnings.length).toBe(1);
    expect(slide.elements.filter((element) => element.type === "text" && /^[0-9]$/.test(element.text ?? "")).length).toBe(6);
  });

  it("produces a renderable, lint-clean detail slide inside a deck", () => {
    const { slide } = createDetailSlide({
      variant: "explanation",
      title: "詳細説明",
      blocks: [{ body: "ここに詳細な説明文を記載します。文章主体のスライドでもアクセシビリティは維持されます。" }]
    });
    const deck = createSampleDeck("ja-JP", { slideCount: 2 });
    deck.slides[1] = slide;
    const report = lintDeckSpec(parseDeckSpec(deck));

    // The text-rich detail slide must not raise the visual-richness error.
    expect(report.issues.some((issue) => issue.code === "visual.richness-missing")).toBe(false);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("warns (does not error) when prose/detail slides dominate the deck body", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 2 });
    deck.slides = [0, 1, 2, 3].map(
      (index) =>
        createDetailSlide(
          {
            variant: "explanation",
            title: `詳細 ${index + 1}`,
            blocks: [{ body: "文章主体のスライドです。詳細な説明をここに記載します。" }]
          },
          { id: `detail-${index}` }
        ).slide
    );
    const report = lintDeckSpec(parseDeckSpec(deck));

    expect(report.issues.some((issue) => issue.code === "visual.prose-heavy" && issue.severity === "warning")).toBe(true);
    // Prose-heavy is advisory, not a blocking error.
    expect(report.issues.some((issue) => issue.code === "visual.prose-heavy" && issue.severity === "error")).toBe(false);
  });

  it("does not raise content.body-prose on a detail slide but does on a normal body slide", () => {
    const longBody =
      "これは二文以上の長い説明文です。詳細スライドでは意図的に文章が多くなります。さらに補足の説明も続きます。" +
      "加えて、背景や前提条件、運用上の注意点なども丁寧に記述するため、本文の文字数はかなり多くなります。";
    const detail = createDetailSlide({ variant: "explanation", title: "詳細", blocks: [{ body: longBody }] }, { id: "detail-prose" }).slide;
    const normal = createDetailSlide({ variant: "explanation", title: "通常", blocks: [{ body: longBody }] }, { id: "normal-prose" }).slide;
    normal.layout = "title-content";

    const deck = createSampleDeck("ja-JP", { slideCount: 2 });
    deck.slides = [detail, normal];
    const report = reviewDeckContent(parseDeckSpec(deck), "ja-JP", "presentation");

    const proseIssues = report.issues.filter((issue) => issue.code === "content.body-prose");
    expect(proseIssues.some((issue) => issue.path.startsWith("slides.1"))).toBe(true);
    expect(proseIssues.some((issue) => issue.path.startsWith("slides.0"))).toBe(false);
  });
});
