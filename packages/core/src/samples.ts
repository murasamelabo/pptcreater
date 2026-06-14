import { defaultTokens } from "./color.js";
import type { DeckSpec, Locale, SlideElement } from "./schema.js";

export type CreateSampleDeckOptions = {
  purpose?: string;
  audience?: string;
  slideCount?: number;
  contentMode?: "presentation" | "handout" | "decision";
};

function iconSvg(kind: "spark" | "workflow" | "shield" | "chart" | "template", color: string): string {
  const paths = {
    spark: '<path d="M60 12l10 27 27 10-27 10-10 27-10-27-27-10 27-10 10-27Z" /><path d="M100 76l4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" />',
    workflow: '<rect x="12" y="20" width="34" height="24" rx="6" /><rect x="78" y="20" width="34" height="24" rx="6" /><rect x="45" y="76" width="34" height="24" rx="6" /><path d="M46 32h32" /><path d="M62 44v32" />',
    shield: '<path d="M62 12 104 27v32c0 26-15 43-42 53-27-10-42-27-42-53V27l42-15Z" /><path d="M42 60l14 14 30-34" />',
    chart: '<path d="M18 103h92" /><path d="M28 88l24-26 20 15 30-47" /><path d="M85 30h17v17" />',
    template: '<rect x="16" y="20" width="92" height="68" rx="10" /><path d="M30 38h64" /><path d="M30 55h28" /><path d="M68 55h26" /><path d="M30 72h64" />'
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 124" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
}

function heroVisualSvg(isJapanese: boolean): string {
  const headline = isJapanese ? "3 sec" : "3 sec";
  const message = isJapanese ? "One message" : "One message";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" role="img">
    <defs>
      <linearGradient id="heroA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#dbeafe" />
        <stop offset="1" stop-color="#bfdbfe" />
      </linearGradient>
      <linearGradient id="heroB" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1d4ed8" />
        <stop offset="1" stop-color="#0f766e" />
      </linearGradient>
    </defs>
    <title>Designed slide system preview</title>
    <desc>A slide canvas with a strong title, visual hierarchy, and reusable visual assets.</desc>
    <rect x="24" y="24" width="672" height="372" rx="36" fill="url(#heroA)" />
    <rect x="70" y="72" width="320" height="210" rx="26" fill="#ffffff" stroke="#93c5fd" stroke-width="3" />
    <rect x="104" y="110" width="218" height="18" rx="9" fill="#1d4ed8" />
    <rect x="104" y="148" width="244" height="14" rx="7" fill="#94a3b8" />
    <rect x="104" y="178" width="188" height="14" rx="7" fill="#cbd5e1" />
    <rect x="104" y="222" width="76" height="28" rx="14" fill="#dcfce7" />
    <rect x="197" y="222" width="94" height="28" rx="14" fill="#e0f2fe" />
    <circle cx="505" cy="177" r="88" fill="url(#heroB)" />
    <path d="M472 177h66" stroke="#ffffff" stroke-width="10" stroke-linecap="round" />
    <path d="M518 147l31 30-31 30" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <text x="456" y="313" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#0f172a">${headline}</text>
    <text x="456" y="351" font-family="Arial, sans-serif" font-size="22" fill="#334155">${message}</text>
  </svg>`;
}

function workflowVisualSvg(isJapanese: boolean): string {
  const labels = isJapanese
    ? ["目的", "聴衆", "構成", "可視化", "検証", "出力"]
    : ["Purpose", "Audience", "Structure", "Visualize", "Verify", "Render"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 360" role="img">
    <title>Deck creation workflow</title>
    <desc>Six steps from purpose and audience briefing to structured visuals, accessibility verification, and PowerPoint output.</desc>
    <rect width="920" height="360" rx="28" fill="#ffffff" />
    ${labels
      .map((label, index) => {
        const x = 44 + index * 142;
        const fill = index < 2 ? "#dbeafe" : index < 4 ? "#ecfeff" : "#dcfce7";
        const stroke = index < 2 ? "#2563eb" : index < 4 ? "#0891b2" : "#059669";
        const arrow = index < labels.length - 1 ? `<path d="M${x + 98} 168h48" stroke="#64748b" stroke-width="5" stroke-linecap="round" /><path d="M${x + 132} 154l16 14-16 14" fill="none" stroke="#64748b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />` : "";
        return `${arrow}<rect x="${x}" y="106" width="96" height="92" rx="22" fill="${fill}" stroke="${stroke}" stroke-width="3" /><text x="${x + 48}" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0f172a">${label}</text>`;
      })
      .join("")}
    <text x="44" y="272" font-family="Arial, sans-serif" font-size="22" fill="#334155">${isJapanese ? "ヒアリングで用途を固定し、DeckSpecに図・アイコン・検証条件を埋め込む" : "Brief first, then encode visuals, icons, and quality gates into DeckSpec."}</text>
  </svg>`;
}

function cardsVisualSvg(isJapanese: boolean): string {
  const cards = isJapanese
    ? [
        ["Glance", "3秒で要点が見える"],
        ["Hierarchy", "視線の順番を設計する"],
        ["A11y", "色・順序・alt textを検証"]
      ]
    : [
        ["Glance", "Communicate in three seconds"],
        ["Hierarchy", "Design the viewing order"],
        ["A11y", "Verify color, order, and alt text"]
      ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300" role="img">
    <title>Slide design quality cards</title>
    <desc>Three cards summarizing glance test, visual hierarchy, and accessibility checks.</desc>
    <rect width="900" height="300" rx="28" fill="#f8fafc" />
    ${cards
      .map(([title, body], index) => {
        const x = 36 + index * 288;
        const color = ["#1d4ed8", "#0f766e", "#7c3aed"][index];
        const icon = ["✦", "→", "✓"][index];
        return `<rect x="${x}" y="42" width="250" height="216" rx="28" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" /><circle cx="${x + 54}" cy="92" r="26" fill="${color}" /><text x="${x + 54}" y="102" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${icon}</text><text x="${x + 34}" y="154" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#0f172a">${title}</text><text x="${x + 34}" y="198" font-family="Arial, sans-serif" font-size="18" fill="#475569">${body}</text>`;
      })
      .join("")}
  </svg>`;
}

function rolloutVisualSvg(isJapanese: boolean): string {
  const labels = isJapanese ? ["テンプレート", "アイコン", "ポンチ絵", "lint", "pptx"] : ["Template", "Icons", "Diagram", "Lint", "PPTX"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 300" role="img">
    <title>Reusable asset rollout path</title>
    <desc>Reusable templates, icons, diagrams, lint checks, and PPTX rendering connected as a repeatable creation path.</desc>
    <rect width="860" height="300" rx="26" fill="#ffffff" />
    <path d="M74 152 C210 52 334 252 466 152 S700 52 794 152" fill="none" stroke="#93c5fd" stroke-width="14" stroke-linecap="round" />
    ${labels
      .map((label, index) => {
        const x = 74 + index * 180;
        const y = index % 2 === 0 ? 118 : 184;
        return `<circle cx="${x}" cy="${y}" r="38" fill="#1d4ed8" /><text x="${x}" y="${y + 7}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">${index + 1}</text><text x="${x}" y="${y + 68}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#0f172a">${label}</text>`;
      })
      .join("")}
  </svg>`;
}

function textElement(id: string, role: "title" | "subtitle" | "body" | "caption" | "callout", text: string, x: number, y: number, w: number, h: number, readingOrder: number, fontSize?: number, color?: string): SlideElement {
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
    bold: role === "title" || role === "callout",
    decorative: false,
    readingOrder
  };
}

function svgElement(id: string, svg: string, altText: string, x: number, y: number, w: number, h: number, readingOrder: number): SlideElement {
  return {
    id,
    type: "svg",
    svg,
    altText,
    decorative: false,
    x,
    y,
    w,
    h,
    readingOrder
  };
}

function diagramElement(id: string, svg: string, summary: string, longDescription: string, x: number, y: number, w: number, h: number, readingOrder: number): SlideElement {
  return {
    id,
    type: "diagram",
    svg,
    summary,
    longDescription,
    altText: summary,
    decorative: false,
    x,
    y,
    w,
    h,
    readingOrder
  };
}

function normalizeContentMode(value: unknown): "presentation" | "handout" | "decision" {
  if (value === undefined) {
    return "presentation";
  }

  if (value === "presentation" || value === "handout" || value === "decision") {
    return value;
  }

  throw new Error("contentMode must be one of: presentation, handout, decision.");
}

export function createSampleDeck(locale: Locale, options: CreateSampleDeckOptions = {}): DeckSpec {
  const isJapanese = locale === "ja-JP";
  const purpose = options.purpose ?? (isJapanese ? "AIで資料作成の品質を標準化する" : "standardizing AI-assisted slide quality");
  const audience = options.audience ?? (isJapanese ? "意思決定者と実務担当者" : "decision makers and delivery teams");
  const contentMode = normalizeContentMode(options.contentMode);
  const targetSlideCount = Number.isInteger(options.slideCount) ? Math.max(1, Math.min(options.slideCount ?? 4, 4)) : 4;
  const modeGuidance = {
    presentation: isJapanese ? "発表補助向けに文字量を絞り、図で記憶に残す構成です。" : "Optimized for live presentation: concise text and memorable visuals.",
    handout: isJapanese ? "配布資料向けにspeaker notesへ補足文脈を残す構成です。" : "Optimized for handouts: speaker notes preserve context for asynchronous reading.",
    decision: isJapanese ? "意思決定向けに判断材料、リスク、次アクションを明示する構成です。" : "Optimized for decisions: evidence, risk, and next actions are made explicit."
  }[contentMode];
  const deckTitle = isJapanese ? "デザイン品質を備えたAIスライド作成" : "AI slide creation with design quality";
  const tokens = defaultTokens(locale);

  return {
    version: "0.1",
    title: deckTitle,
    locale,
    template: isJapanese ? "minimal-consulting" : "technical-architecture",
    skillPack: isJapanese ? "slide-briefing-ja" : "slide-briefing-en",
    tokens,
    metadata: {
      keywords: ["accessible", "powerpoint", "deck", "visual", "diagram"]
    },
    slides: [
      {
        id: "slide-1",
        title: isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test",
        layout: "visual-hero",
        speakerNotes: isJapanese
          ? `目的: ${purpose}。聴衆: ${audience}。${modeGuidance} タイトル、図、強調箇所が同じ主張を支える構成です。`
          : `Purpose: ${purpose}. Audience: ${audience}. ${modeGuidance} The title, visual, and emphasis all support one message.`,
        elements: [
          textElement("title", "title", isJapanese ? "3秒で要点が伝わるスライドを標準化する" : "Standardize slides that pass the three-second glance test", 0.65, 0.52, 7.1, 1.05, 0, 32),
          textElement("subtitle", "body", isJapanese ? `用途・聴衆・ボリュームを先に固定し、図解とアクセシビリティ検証をDeckSpecへ組み込みます。` : "Brief purpose, audience, and volume first; encode visuals and accessibility checks into DeckSpec.", 0.72, 1.82, 6.45, 0.9, 1, 22, "#334155"),
          textElement("audience-pill", "caption", isJapanese ? `Audience: ${audience}` : `Audience: ${audience}`, 0.72, 3.0, 4.4, 0.42, 2, 14, "#1d4ed8"),
          svgElement("hero-visual", heroVisualSvg(isJapanese), isJapanese ? "3秒で伝わるスライド構成のプレビュー" : "Preview of a slide structure designed for three-second comprehension", 7.55, 0.78, 4.9, 3.2, 3),
          svgElement("spark-icon", iconSvg("spark", "#7c3aed"), isJapanese ? "品質を示すスパークアイコン" : "Spark icon representing quality", 0.74, 3.82, 0.54, 0.54, 4),
          textElement("principle", "caption", isJapanese ? `Mode: ${contentMode} / 1 slide = 1 message / high signal-to-noise / accessible by default` : `Mode: ${contentMode} / 1 slide = 1 message / high signal-to-noise / accessible by default`, 1.42, 3.9, 6.7, 0.38, 5, 13, "#475569")
        ]
      },
      {
        id: "slide-2",
        title: isJapanese ? "ヒアリングから図解までを1つの作成フローにする" : "Turn briefing, structure, and visuals into one creation flow",
        layout: "diagram-focus",
        speakerNotes: isJapanese
          ? "目的、聴衆、構成を最初に確認し、図解・アイコン・検証を後段で自動化します。"
          : "The workflow starts with purpose and audience, then automates structure, visuals, and verification.",
        elements: [
          textElement("title", "title", isJapanese ? "ヒアリングから図解までを1つの作成フローにする" : "Turn briefing, structure, and visuals into one creation flow", 0.65, 0.48, 10.8, 0.72, 0, 30),
          diagramElement(
            "workflow-diagram",
            workflowVisualSvg(isJapanese),
            isJapanese ? "目的、聴衆、構成、可視化、検証、出力をつなぐ6段階の作成フロー" : "Six-step creation flow from purpose and audience to visualized, verified output",
            isJapanese
              ? "図は、目的と聴衆の確認から始まり、構成化、可視化、検証、PowerPoint出力へ進む流れを示しています。"
              : "The diagram shows the deck creation flow: clarify purpose and audience, structure content, add visuals, verify accessibility, and render PowerPoint output.",
            0.78,
            1.45,
            11.7,
            4.25,
            1
          ),
          textElement("takeaway", "callout", isJapanese ? "先に聞くほど、後のスライドは短く・強く・見やすくなる。" : "Better upfront briefing makes slides shorter, stronger, and easier to scan.", 1.0, 6.08, 10.4, 0.52, 2, 20, "#0f766e")
        ]
      },
      {
        id: "slide-3",
        title: isJapanese ? "優れたスライドは装飾ではなく情報UIとして設計する" : "Great slides are designed as information interfaces, not decoration",
        layout: "three-card",
        speakerNotes: isJapanese
          ? "3秒テスト、視覚階層、アクセシビリティを品質ゲートとして使います。"
          : "Use the glance test, visual hierarchy, and accessibility as quality gates.",
        elements: [
          textElement("title", "title", isJapanese ? "優れたスライドは装飾ではなく情報UIとして設計する" : "Great slides are designed as information interfaces, not decoration", 0.65, 0.48, 11.4, 0.8, 0, 29),
          svgElement("quality-cards", cardsVisualSvg(isJapanese), isJapanese ? "3秒テスト、視覚階層、アクセシビリティの3つの品質カード" : "Three quality cards for glance test, visual hierarchy, and accessibility", 0.75, 1.42, 11.5, 3.9, 1),
          textElement("explain", "body", isJapanese ? "ノイズを削り、図・余白・強調色を同じ主張に向けることで、聴衆の理解と判断を助けます。" : "Reduce noise and align diagrams, whitespace, and accent color around the same claim to support understanding and decisions.", 0.95, 5.72, 10.5, 0.72, 2, 21, "#334155")
        ]
      },
      {
        id: "slide-4",
        title: isJapanese ? "テンプレートとSVG資産を再利用して継続的に品質を上げる" : "Reuse templates and SVG assets to improve quality over time",
        layout: "asset-rollout",
        speakerNotes: isJapanese
          ? "テンプレート、アイコン、ポンチ絵、lint、出力を繰り返し使える仕組みにします。"
          : "Templates, icons, diagrams, lint, and rendering become reusable assets and repeatable workflow steps.",
        elements: [
          textElement("title", "title", isJapanese ? "テンプレートとSVG資産を再利用して継続的に品質を上げる" : "Reuse templates and SVG assets to improve quality over time", 0.65, 0.48, 11.3, 0.8, 0, 29),
          svgElement("rollout", rolloutVisualSvg(isJapanese), isJapanese ? "テンプレート、アイコン、ポンチ絵、lint、pptx出力の再利用パス" : "Reusable path connecting templates, icons, diagrams, lint, and PPTX output", 0.75, 1.35, 11.3, 3.95, 1),
          svgElement("shield-icon", iconSvg("shield", "#0f766e"), isJapanese ? "アクセシビリティと安全性を示す盾アイコン" : "Shield icon representing accessibility and safety", 0.88, 5.83, 0.5, 0.5, 2),
          textElement("quality-gate", "body", isJapanese ? "MCPでは search_assets / register_svg_asset / search_templates / register_template を使い、再利用可能な視覚資産を増やせます。" : "Through MCP, use search_assets / register_svg_asset / search_templates / register_template to grow reusable visual assets.", 1.54, 5.78, 10.4, 0.72, 3, 20, "#334155")
        ]
      }
    ].slice(0, targetSlideCount)
  };
}
