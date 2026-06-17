import { sanitizeSvg, searchSvgAssets } from "@pptcreater/assets-svg";
import { ensureSourceReferenceSlide, listSkillPacks, listTemplates, lintDeckSpec, localizeLintReport, parseDeckSpec, type DeckSpec, type Locale } from "@pptcreater/core";

type StudioLabels = {
  title: string;
  subtitle: string;
  slides: string;
  lint: string;
  templates: string;
  assets: string;
  skills: string;
  notes: string;
  noIssues: string;
};

const LABELS: Record<Locale, StudioLabels> = {
  "en-US": {
    title: "pptcreater Studio",
    subtitle: "Static deck preview for templates, lint, assets, and slides.",
    slides: "Slides",
    lint: "Lint",
    templates: "Templates",
    assets: "SVG assets",
    skills: "Skill packs",
    notes: "Speaker notes",
    noIssues: "No lint issues."
  },
  "ja-JP": {
    title: "pptcreater Studio",
    subtitle: "テンプレート、lint、SVG資産、スライドを確認する静的プレビューです。",
    slides: "スライド",
    lint: "lint",
    templates: "テンプレート",
    assets: "SVG資産",
    skills: "スキルパック",
    notes: "Speaker notes",
    noIssues: "lintの指摘はありません。"
  }
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textElements(slide: DeckSpec["slides"][number]): string {
  return sortedElements(slide.elements)
    .filter((element) => element.type === "text")
    .map((element) => `<p class="text text-${element.role}">${escapeHtml(element.text)}</p>`)
    .join("");
}

function sortedElements(elements: DeckSpec["slides"][number]["elements"]): DeckSpec["slides"][number]["elements"] {
  return [...elements].sort((a, b) => (a.readingOrder ?? Number.MAX_SAFE_INTEGER) - (b.readingOrder ?? Number.MAX_SAFE_INTEGER));
}

function shapeStyle(element: Extract<DeckSpec["slides"][number]["elements"][number], { type: "shape" }>): string {
  const left = (element.x / 13.333) * 100;
  const top = (element.y / 7.5) * 100;
  const width = (element.w / 13.333) * 100;
  const height = (element.h / 7.5) * 100;
  const borderColor = element.line?.color ?? "#64748b";
  const borderWidth = element.line?.width ?? 1;
  const fill = element.fill === "none" ? "transparent" : element.fill;
  const normalizedShape = element.shape === "oval" ? "ellipse" : element.shape === "roundedRect" ? "roundRect" : element.shape === "arrow" ? "rightArrow" : element.shape;
  const radius = normalizedShape === "ellipse" ? "999px" : normalizedShape === "roundRect" ? "18px" : "2px";
  return `left:${left}%;top:${top}%;width:${width}%;height:${Math.max(height, 0.2)}%;background:${fill};border:${borderWidth}px solid ${borderColor};border-radius:${radius};`;
}

function nativeShapePreview(slide: DeckSpec["slides"][number]): string {
  const items = sortedElements(slide.elements)
    .map((element) => {
      if (element.type === "shape") {
        const accessibility = element.decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escapeHtml(element.altText ?? element.id)}"`;
        const normalizedShape = element.shape === "oval" ? "ellipse" : element.shape === "roundedRect" ? "roundRect" : element.shape === "arrow" ? "rightArrow" : element.shape;
        return `<div class="native-shape native-${normalizedShape}" style="${shapeStyle(element)}" ${accessibility}></div>`;
      }

      if (element.type === "text") {
        const left = (element.x / 13.333) * 100;
        const top = (element.y / 7.5) * 100;
        const width = (element.w / 13.333) * 100;
        const height = (element.h / 7.5) * 100;
        const fontSize = Math.max(10, Math.round((element.fontSize ?? 18) * 0.52));
        const weight = element.bold ? 700 : 400;
        const align = element.align ?? "left";
        return `<div class="native-text native-text-${element.role}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;font-size:${fontSize}px;font-weight:${weight};color:${element.color ?? "#0f172a"};text-align:${align};">${escapeHtml(element.text)}</div>`;
      }

      if (element.type === "svg" || element.type === "diagram") {
        const left = (element.x / 13.333) * 100;
        const top = (element.y / 7.5) * 100;
        const width = (element.w / 13.333) * 100;
        const height = (element.h / 7.5) * 100;
        return `<div class="native-svg" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;">${sanitizeSvg(element.svg)}</div>`;
      }

      return "";
    })
    .join("");

  return items ? `<div class="native-canvas">${items}</div>` : "";
}

function visualElements(slide: DeckSpec["slides"][number]): string {
  return sortedElements(slide.elements)
    .filter((element) => element.type === "image")
    .map((element) => {
      const source = element.dataUri ?? element.path;
      if (!source) {
        return "";
      }

      return `<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(element.altText ?? "")}" /><figcaption>${escapeHtml(element.description ?? element.altText ?? "")}</figcaption></figure>`;
    })
    .join("");
}

function sourceCitations(deck: DeckSpec, slide: DeckSpec["slides"][number]): string {
  const sourcesById = new Map(deck.metadata.sources.map((source) => [source.id, source]));
  const citations = slide.elements
    .filter((element) => element.sourceId)
    .map((element) => {
      const source = sourcesById.get(element.sourceId ?? "");
      return `<li>${escapeHtml(element.citation ?? source?.attribution ?? source?.title ?? element.sourceId ?? "")}</li>`;
    })
    .join("");

  return citations ? `<details><summary>Sources</summary><ul>${citations}</ul></details>` : "";
}

export function renderStudioHtml(input: unknown, localeOverride?: Locale): string {
  const deck = ensureSourceReferenceSlide(parseDeckSpec(input));
  const locale = localeOverride ?? deck.locale;
  const labels = LABELS[locale];
  const lintReport = localizeLintReport(lintDeckSpec(deck), locale);
  const templates = listTemplates();
  const assets = searchSvgAssets("");
  const skills = listSkillPacks();

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(labels.title)} - ${escapeHtml(deck.title)}</title>
  <style>
    :root { color-scheme: light; --bg: #f8fafc; --ink: #0f172a; --muted: #475569; --surface: #ffffff; --line: #cbd5e1; --accent: #1d4ed8; --danger: #b91c1c; --warn: #a16207; --ok: #047857; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Aptos", "Yu Gothic", "Meiryo", sans-serif; line-height: 1.5; }
    header { padding: 32px clamp(20px, 5vw, 72px); background: linear-gradient(135deg, #eff6ff, #fff); border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: -0.04em; }
    h2 { margin-top: 0; font-size: 24px; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; padding: 24px clamp(20px, 5vw, 72px); }
    section, aside { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 20px; box-shadow: 0 16px 40px rgb(15 23 42 / 0.06); }
    .slide { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: 18px; padding: 28px; margin-bottom: 20px; background: #fff; overflow: auto; }
    .slide h3 { margin: 0 0 18px; font-size: 28px; }
    .text-title { font-size: 28px; font-weight: 700; }
    .text-body { font-size: 20px; }
    .text-caption { color: var(--muted); font-size: 14px; }
    .svg-frame svg { max-width: 100%; height: auto; border-radius: 12px; }
    figure img { max-width: 100%; height: auto; border-radius: 12px; }
    .native-canvas { position: relative; aspect-ratio: 16 / 9; min-height: 360px; background: #fff; border-radius: 16px; overflow: hidden; }
    .native-shape, .native-text, .native-svg { position: absolute; box-sizing: border-box; }
    .native-svg svg { width: 100%; height: 100%; display: block; }
    .native-line { height: 2px !important; border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important; }
    .issue { border-left: 5px solid var(--line); padding: 10px 12px; margin: 10px 0; background: #f8fafc; }
    .issue.error { border-color: var(--danger); }
    .issue.warning { border-color: var(--warn); }
    .issue.suggestion { border-color: var(--accent); }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e0f2fe; color: #075985; font-size: 12px; margin-right: 6px; }
    .list { display: grid; gap: 8px; }
    .card { border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
    @media (max-width: 980px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(deck.title)}</h1>
    <p>${escapeHtml(labels.subtitle)}</p>
  </header>
  <main>
    <section aria-labelledby="slides-title">
      <h2 id="slides-title">${escapeHtml(labels.slides)}</h2>
      ${deck.slides
        .map(
          (slide, index) => `<article class="slide">
        <h3>${index + 1}. ${escapeHtml(slide.title)}</h3>
        ${nativeShapePreview(slide) || textElements(slide)}
        ${visualElements(slide)}
        ${sourceCitations(deck, slide)}
        ${slide.speakerNotes ? `<details><summary>${escapeHtml(labels.notes)}</summary><p>${escapeHtml(slide.speakerNotes)}</p></details>` : ""}
      </article>`
        )
        .join("")}
    </section>
    <aside>
      <h2>${escapeHtml(labels.lint)}</h2>
      ${
        lintReport.issues.length === 0
          ? `<p class="issue">${escapeHtml(labels.noIssues)}</p>`
          : lintReport.issues
              .map((issue) => `<div class="issue ${issue.severity}"><strong>${issue.severity.toUpperCase()} ${escapeHtml(issue.code)}</strong><br /><span>${escapeHtml(issue.path)}</span><p>${escapeHtml(issue.message)}</p></div>`)
              .join("")
      }
      <h2>${escapeHtml(labels.templates)}</h2>
      <div class="list">${templates.map((template) => `<div class="card"><strong>${escapeHtml(template.name)}</strong><br /><span>${escapeHtml(template.description)}</span></div>`).join("")}</div>
      <h2>${escapeHtml(labels.assets)}</h2>
      <p>${assets.map((asset) => `<span class="pill">${escapeHtml(asset.id)}</span>`).join("")}</p>
      <h2>${escapeHtml(labels.skills)}</h2>
      <div class="list">${skills.map((skill) => `<div class="card"><strong>${escapeHtml(skill.name)}</strong><br /><span>${escapeHtml(skill.description)}</span></div>`).join("")}</div>
    </aside>
  </main>
</body>
</html>`;
}
