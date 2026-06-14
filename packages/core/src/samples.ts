import { defaultTokens } from "./color.js";
import type { ContentMode, DeckSpec, Locale, ShapeElement, SlideElement, TextElement } from "./schema.js";

export type CreateSampleDeckOptions = {
  purpose?: string;
  audience?: string;
  slideCount?: number;
  contentMode?: ContentMode;
};

function textElement(
  id: string,
  role: TextElement["role"],
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  fontSize?: number,
  color?: string,
  align?: TextElement["align"],
  valign?: TextElement["valign"],
  contrastBackground?: string
): SlideElement {
  return {
    id,
    type: "text",
    role,
    text,
    x,
    y,
    w,
    h,
    fontSize,
    color,
    contrastBackground,
    align,
    valign,
    bold: role === "title" || role === "callout",
    decorative: false,
    readingOrder
  };
}

function shapeElement(
  id: string,
  shape: ShapeElement["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  readingOrder: number,
  fill: ShapeElement["fill"] = "none",
  line: ShapeElement["line"] = { color: "#64748b", width: 1 }
): SlideElement {
  return {
    id,
    type: "shape",
    shape,
    x,
    y,
    w,
    h,
    fill,
    line,
    decorative: true,
    readingOrder
  };
}

function normalizeContentMode(value: unknown): ContentMode {
  if (value === undefined) {
    return "presentation";
  }

  if (value === "presentation" || value === "report" || value === "technical" || value === "handout" || value === "decision") {
    return value;
  }

  throw new Error("contentMode must be one of: presentation, report, technical, handout, decision.");
}

function heroElements(isJapanese: boolean, audience: string, contentMode: string): SlideElement[] {
  return [
    shapeElement("hero-panel", "roundRect", 7.48, 0.78, 4.95, 3.55, 3, "#dbeafe", { color: "#93c5fd", width: 1.2 }),
    shapeElement("hero-card", "roundRect", 7.9, 1.14, 2.12, 1.76, 4, "#ffffff", { color: "#93c5fd", width: 1 }),
    shapeElement("hero-title-bar", "roundRect", 8.16, 1.42, 1.42, 0.14, 5, "#1d4ed8", { color: "#1d4ed8", width: 0.1 }),
    shapeElement("hero-line-1", "roundRect", 8.16, 1.78, 1.56, 0.1, 6, "#94a3b8", { color: "#94a3b8", width: 0.1 }),
    shapeElement("hero-line-2", "roundRect", 8.16, 2.06, 1.18, 0.1, 7, "#cbd5e1", { color: "#cbd5e1", width: 0.1 }),
    shapeElement("hero-circle", "ellipse", 10.36, 1.26, 1.52, 1.52, 8, "#1d4ed8", { color: "#1d4ed8", width: 1 }),
    textElement("hero-arrow", "callout", "→", 10.36, 1.49, 1.52, 0.58, 9, 34, "#ffffff", "center", "middle", "#1d4ed8"),
    textElement("hero-three-sec", "callout", "3 sec", 10.16, 3.03, 1.7, 0.35, 10, 22, "#0f172a", "center", "middle"),
    textElement("hero-one-message", "caption", isJapanese ? "One message" : "One message", 9.75, 3.43, 2.55, 0.32, 11, 14, "#334155", "center", "middle"),
    textElement("audience-pill", "caption", `Audience: ${audience}`, 0.72, 3.0, 5.9, 0.62, 12, 14, "#1d4ed8"),
    shapeElement("spark-badge", "ellipse", 0.74, 3.82, 0.54, 0.54, 13, "#7c3aed", { color: "#7c3aed", width: 1 }),
    textElement("spark-mark", "caption", "✦", 0.74, 3.89, 0.54, 0.28, 14, 18, "#ffffff", "center", "middle", "#7c3aed"),
    textElement("principle", "caption", `Mode: ${contentMode} / 1 slide = 1 message / high signal-to-noise / editable PPT objects`, 1.42, 3.9, 7.35, 0.58, 15, 13, "#475569")
  ];
}

function workflowElements(isJapanese: boolean): SlideElement[] {
  const labels = isJapanese
    ? ["目的", "聴衆", "構成", "可視化", "検証", "出力"]
    : ["Purpose", "Audience", "Structure", "Visualize", "Verify", "Render"];
  const elements: SlideElement[] = [
    shapeElement("workflow-bg", "roundRect", 0.78, 1.48, 11.74, 4.18, 1, "#ffffff", { color: "#cbd5e1", width: 1 })
  ];

  labels.forEach((label, index) => {
    const x = 1.08 + index * 1.82;
    const fill = index < 2 ? "#dbeafe" : index < 4 ? "#ecfeff" : "#dcfce7";
    const stroke = index < 2 ? "#2563eb" : index < 4 ? "#0891b2" : "#059669";
    elements.push(shapeElement(`workflow-node-${index}`, "roundRect", x, 2.58, 1.24, 0.88, 2 + index * 3, fill, { color: stroke, width: 1.2 }));
    elements.push(textElement(`workflow-label-${index}`, "caption", label, x, 2.83, 1.24, 0.28, 3 + index * 3, 15, "#0f172a", "center", "middle"));
    if (index < labels.length - 1) {
      elements.push(shapeElement(`workflow-arrow-${index}`, "line", x + 1.22, 3.02, 0.52, 0.01, 4 + index * 3, "none", { color: "#64748b", width: 2, endArrowType: "triangle" }));
    }
  });

  elements.push(
    textElement(
      "workflow-caption",
      "body",
      isJapanese ? "ヒアリングで用途を固定し、DeckSpecに図・アイコン・検証条件を埋め込む" : "Brief first, then encode visuals, icons, and quality gates into DeckSpec.",
      1.04,
      4.66,
      10.2,
      0.48,
      22,
      20,
      "#334155"
    )
  );

  return elements;
}

function qualityCardElements(isJapanese: boolean, contentMode: ContentMode): SlideElement[] {
  const cardSet = {
    presentation: isJapanese
      ? [["Glance", "3秒で要点が見える", "✦", "#1d4ed8"], ["Hierarchy", "視線の順番を設計する", "→", "#0f766e"], ["A11y", "色・順序・alt textを検証", "✓", "#7c3aed"]]
      : [["Glance", "Communicate in three seconds", "✦", "#1d4ed8"], ["Hierarchy", "Design the viewing order", "→", "#0f766e"], ["A11y", "Verify color, order, and alt text", "✓", "#7c3aed"]],
    report: isJapanese
      ? [["Summary", "結論を先に置く", "1", "#1d4ed8"], ["Evidence", "根拠をチャンク化", "2", "#0f766e"], ["Implication", "示唆と次アクション", "3", "#7c3aed"]]
      : [["Summary", "Lead with the conclusion", "1", "#1d4ed8"], ["Evidence", "Chunk supporting detail", "2", "#0f766e"], ["Implication", "State so-what and action", "3", "#7c3aed"]],
    technical: isJapanese
      ? [["Concept", "概念を先に揃える", "C", "#1d4ed8"], ["Flow", "経路と境界を示す", "F", "#0f766e"], ["Control", "制御点を明示", "G", "#7c3aed"]]
      : [["Concept", "Align on the concept", "C", "#1d4ed8"], ["Flow", "Show paths and boundaries", "F", "#0f766e"], ["Control", "Make controls explicit", "G", "#7c3aed"]],
    handout: isJapanese
      ? [["Context", "前提を残す", "1", "#1d4ed8"], ["Detail", "補足はnotesへ", "2", "#0f766e"], ["Scan", "見出しで拾える", "3", "#7c3aed"]]
      : [["Context", "Preserve context", "1", "#1d4ed8"], ["Detail", "Move detail to notes", "2", "#0f766e"], ["Scan", "Make scanning easy", "3", "#7c3aed"]],
    decision: isJapanese
      ? [["Decision", "判断事項を明確に", "D", "#1d4ed8"], ["Risk", "リスクと代替案", "R", "#0f766e"], ["Action", "次アクション", "A", "#7c3aed"]]
      : [["Decision", "Clarify the decision", "D", "#1d4ed8"], ["Risk", "Show risk and options", "R", "#0f766e"], ["Action", "Define next action", "A", "#7c3aed"]]
  } satisfies Record<ContentMode, string[][]>;
  const cards = cardSet[contentMode];

  return cards.flatMap(([title, body, icon, color], index): SlideElement[] => {
    const x = 1.06 + index * 3.65;
    const order = 1 + index * 5;
    return [
      shapeElement(`quality-card-${index}`, "roundRect", x, 1.56, 3.0, 2.24, order, "#ffffff", { color: "#cbd5e1", width: 1.2 }),
      shapeElement(`quality-icon-bg-${index}`, "ellipse", x + 0.32, 1.84, 0.68, 0.68, order + 1, color, { color, width: 1 }),
      textElement(`quality-icon-${index}`, "callout", icon, x + 0.32, 1.94, 0.68, 0.34, order + 2, 22, "#ffffff", "center", "middle", color),
      textElement(`quality-title-${index}`, "callout", title, x + 0.44, 2.55, 2.1, 0.38, order + 3, 20, "#0f172a"),
      textElement(`quality-body-${index}`, "caption", body, x + 0.44, 3.1, 2.2, 0.42, order + 4, 14, "#334155")
    ];
  });
}

function rolloutElements(isJapanese: boolean, contentMode: ContentMode): SlideElement[] {
  const labelsByMode = {
    presentation: isJapanese ? ["主張", "ビジュアル", "余白", "練習", "発表"] : ["Claim", "Visual", "Whitespace", "Rehearse", "Present"],
    report: isJapanese ? ["背景", "事実", "分析", "示唆", "判断"] : ["Context", "Facts", "Analysis", "Implication", "Decision"],
    technical: isJapanese ? ["概念", "構成", "経路", "制御", "運用"] : ["Concept", "System", "Flow", "Control", "Ops"],
    handout: isJapanese ? ["要約", "根拠", "補足", "注釈", "共有"] : ["Summary", "Evidence", "Detail", "Notes", "Share"],
    decision: isJapanese ? ["論点", "選択肢", "リスク", "推奨", "決定"] : ["Issue", "Options", "Risk", "Recommend", "Decide"]
  } satisfies Record<ContentMode, string[]>;
  const labels = labelsByMode[contentMode];
  const elements: SlideElement[] = [
    shapeElement("rollout-base", "line", 1.05, 3.02, 10.7, 0.01, 1, "none", { color: "#93c5fd", width: 8 })
  ];

  labels.forEach((label, index) => {
    const x = 1.05 + index * 2.52;
    const y = index % 2 === 0 ? 2.4 : 3.5;
    const order = 2 + index * 3;
    elements.push(shapeElement(`rollout-node-${index}`, "ellipse", x, y, 0.74, 0.74, order, "#1d4ed8", { color: "#1d4ed8", width: 1 }));
    elements.push(textElement(`rollout-number-${index}`, "caption", String(index + 1), x, y + 0.12, 0.74, 0.34, order + 1, 17, "#ffffff", "center", "middle", "#1d4ed8"));
    elements.push(textElement(`rollout-label-${index}`, "caption", label, x - 0.45, y + 0.86, 1.68, 0.32, order + 2, 13, "#0f172a", "center", "middle"));
  });

  return elements;
}

function hasNativeShapes(slideElements: SlideElement[]): boolean {
  return slideElements.some((element) => element.type === "shape");
}

export function createSampleDeck(locale: Locale, options: CreateSampleDeckOptions = {}): DeckSpec {
  const isJapanese = locale === "ja-JP";
  const purpose = options.purpose ?? (isJapanese ? "AIで資料作成の品質を標準化する" : "standardizing AI-assisted slide quality");
  const audience = options.audience ?? (isJapanese ? "意思決定者と実務担当者" : "decision makers and delivery teams");
  const contentMode = normalizeContentMode(options.contentMode);
  const targetSlideCount = Number.isInteger(options.slideCount) ? Math.max(1, Math.min(options.slideCount ?? 4, 4)) : 4;
  const modeGuidance = {
    presentation: isJapanese ? "発表補助向けに文字量を絞り、図で記憶に残す構成です。" : "Optimized for live presentation: concise text and memorable visuals.",
    report: isJapanese ? "報告資料向けに要点、根拠、補足文脈をspeaker notesへ残す構成です。" : "Optimized for reports: key points, evidence, and supporting context remain in speaker notes.",
    technical: isJapanese ? "技術資料向けに構成図、概念図、ポンチ絵で理解を助ける構成です。" : "Optimized for technical material: architecture, concept, and workflow visuals support understanding.",
    handout: isJapanese ? "配布資料向けにspeaker notesへ補足文脈を残す構成です。" : "Optimized for handouts: speaker notes preserve context for asynchronous reading.",
    decision: isJapanese ? "意思決定向けに判断材料、リスク、次アクションを明示する構成です。" : "Optimized for decisions: evidence, risk, and next actions are made explicit."
  }[contentMode];
  const deckTitle = isJapanese ? "デザイン品質を備えたAIスライド作成" : "AI slide creation with design quality";
  const tokens = defaultTokens(locale);
  const slides = [
    {
      id: "slide-1",
      title: isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test",
      layout: "visual-hero-native",
      speakerNotes: isJapanese
        ? `目的: ${purpose}。聴衆: ${audience}。${modeGuidance} タイトル、図、強調箇所が同じ主張を支える構成です。`
        : `Purpose: ${purpose}. Audience: ${audience}. ${modeGuidance} The title, visual, and emphasis all support one message.`,
      elements: [
        textElement("title", "title", isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test", 0.65, 0.52, 7.1, 1.05, 0, 32),
        textElement("subtitle", "body", isJapanese ? "用途・聴衆・ボリュームを先に固定し、編集可能な図形とアクセシビリティ検証をDeckSpecへ組み込みます。" : "Brief purpose, audience, and volume first; encode editable shapes and accessibility checks into DeckSpec.", 0.72, 1.82, 6.45, 0.9, 1, 22, "#334155"),
        ...heroElements(isJapanese, audience, contentMode)
      ]
    },
    {
      id: "slide-2",
      title: isJapanese ? "ヒアリングから図解までを1つの作成フローにする" : "Turn briefing, structure, and visuals into one creation flow",
      layout: "native-workflow",
      speakerNotes: isJapanese
        ? "目的、聴衆、構成を最初に確認し、図形・アイコン・検証を後段で自動化します。すべてPowerPoint上で編集できるオブジェクトです。"
        : "The workflow starts with purpose and audience, then automates structure, visuals, and verification. Every visual is editable in PowerPoint.",
      elements: [
        textElement("title", "title", isJapanese ? "ヒアリングから図解までを1つの作成フローにする" : "Turn briefing, structure, and visuals into one creation flow", 0.65, 0.48, 10.8, 0.72, 0, 30),
        ...workflowElements(isJapanese),
        textElement("takeaway", "callout", isJapanese ? "先に聞くほど、後のスライドは短く・強く・見やすくなる。" : "Better upfront briefing makes slides shorter, stronger, and easier to scan.", 1.0, 6.08, 10.4, 0.52, 24, 20, "#0f766e")
      ]
    },
    {
      id: "slide-3",
      title: isJapanese ? "優れたスライドは装飾ではなく情報UIとして設計する" : "Great slides are designed as information interfaces, not decoration",
      layout: "native-card-summary",
      speakerNotes: isJapanese
        ? "カード、丸アイコン、テキストはすべてPowerPointオブジェクトなので、後から文字や色を編集できます。"
        : "Cards, icon circles, and text are all PowerPoint objects, so users can edit copy and colors later.",
      elements: [
        textElement("title", "title", isJapanese ? "優れたスライドは装飾ではなく情報UIとして設計する" : "Great slides are designed as information interfaces, not decoration", 0.65, 0.48, 11.4, 0.8, 0, 29),
        ...qualityCardElements(isJapanese, contentMode),
        textElement("explain", "body", isJapanese ? "ノイズを削り、図・余白・強調色を同じ主張に向けることで、聴衆の理解と判断を助けます。" : "Reduce noise and align diagrams, whitespace, and accent color around the same claim to support understanding and decisions.", 0.95, 5.72, 10.5, 0.72, 20, 21, "#334155")
      ]
    },
    {
      id: "slide-4",
      title: isJapanese ? "テンプレートとSVG資産を再利用して継続的に品質を上げる" : "Reuse templates and SVG assets to improve quality over time",
      layout: "native-rollout",
      speakerNotes: isJapanese
        ? "ロードマップの線、丸、番号、ラベルも編集可能なPowerPointオブジェクトです。"
        : "The roadmap line, circles, numbers, and labels are editable PowerPoint objects.",
      elements: [
        textElement("title", "title", isJapanese ? "テンプレートとSVG資産を再利用して継続的に品質を上げる" : "Reuse templates and SVG assets to improve quality over time", 0.65, 0.48, 11.3, 0.8, 0, 29),
        ...rolloutElements(isJapanese, contentMode),
        shapeElement("shield-badge", "ellipse", 0.88, 5.83, 0.5, 0.5, 18, "#0f766e", { color: "#0f766e", width: 1 }),
        textElement("shield-mark", "caption", "✓", 0.88, 5.9, 0.5, 0.26, 19, 16, "#ffffff", "center", "middle", "#0f766e"),
        textElement("quality-gate", "body", isJapanese ? "MCPでは search_assets / register_svg_asset / search_templates / register_template を使い、再利用可能な視覚資産を増やせます。" : "Through MCP, use search_assets / register_svg_asset / search_templates / register_template to grow reusable visual assets.", 1.54, 5.78, 10.4, 0.72, 20, 20, "#334155")
      ]
    }
  ];

  return {
    version: "0.1",
    title: deckTitle,
    locale,
    template: isJapanese ? "minimal-consulting" : "technical-architecture",
    skillPack: isJapanese ? "slide-briefing-ja" : "slide-briefing-en",
    tokens,
    metadata: {
      keywords: ["accessible", "powerpoint", "deck", "native-shape", "editable"],
      contentMode,
      sources: []
    },
    slides: slides
      .slice(0, targetSlideCount)
      .map((slide) => {
        if (!hasNativeShapes(slide.elements)) {
          throw new Error(`Generated sample slide "${slide.id}" must include editable PowerPoint shape elements.`);
        }

        return slide;
      })
  };
}
