#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const scenarioDocPath = path.join(repoRoot, "docs", "dev-loop-test-scenarios.md");

const validVisualTypes = new Set([
  "section",
  "summary",
  "table",
  "contrast",
  "matrix",
  "flow",
  "before-after",
  "step",
  "cycle",
  "map",
  "ponchi-e",
  "native-diagram",
  "detail",
  "visual-scaffold",
  "image",
  "cards"
]);

function parseArgs(argv) {
  const options = {
    loops: 1,
    scenarios: "all",
    output: path.join("generated", "dev-loop-runs", `run-${timestampForPath(new Date())}`),
    force: false,
    stopOnFeatureActions: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--loops") {
      options.loops = Number(argv[++index]);
    } else if (arg === "--scenarios") {
      options.scenarios = argv[++index];
    } else if (arg === "--output") {
      options.output = argv[++index];
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--continue-with-feature-actions") {
      options.stopOnFeatureActions = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.loops) || options.loops < 1) {
    throw new Error("--loops must be a positive integer.");
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/run-dev-loop.mjs [options]\n\nOptions:\n  --loops <n>                       Number of loop iterations to run (default: 1)\n  --scenarios <sel>                 all | first:N | comma-separated scenario ids (default: all)\n  --output <dir>                    Output run directory (default: generated/dev-loop-runs/run-<timestamp>)\n  --force                           Overwrite an existing output directory\n  --continue-with-feature-actions   Continue loops even when Dev Lead identifies program-level feature-extension work\n  -h, --help                        Show this help`);
}

function timestampForPath(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readScenarios() {
  const markdown = readFileSync(scenarioDocPath, "utf8");
  const matches = [...markdown.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
  const scenarios = [];
  for (const match of matches) {
    const raw = match[1].trim();
    if (!raw.startsWith("{")) {
      continue;
    }
    const parsed = JSON.parse(raw);
    if (parsed.id && parsed.userRequest) {
      scenarios.push(parsed);
    }
  }
  if (scenarios.length === 0) {
    throw new Error(`No ScenarioSpec objects found in ${scenarioDocPath}`);
  }
  return scenarios;
}

function selectScenarios(scenarios, selector) {
  if (selector === "all") {
    return scenarios;
  }
  const firstMatch = selector.match(/^first:(\d+)$/i);
  if (firstMatch) {
    return scenarios.slice(0, Number(firstMatch[1]));
  }
  const ids = new Set(selector.split(",").map((item) => item.trim()).filter(Boolean));
  const selected = scenarios.filter((scenario) => ids.has(scenario.id));
  if (selected.length !== ids.size) {
    const found = new Set(selected.map((scenario) => scenario.id));
    const missing = [...ids].filter((id) => !found.has(id));
    throw new Error(`Unknown scenario id(s): ${missing.join(", ")}`);
  }
  return selected;
}

function ensureDirectory(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, value) {
  writeFileSync(file, value, "utf8");
}

function toPosixRelative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function runCli(args, outputFile) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeText(outputFile, output);
  return {
    command: `node ${toPosixRelative(cliPath)} ${args.map(quoteArg).join(" ")}`,
    exitCode: result.status ?? 1,
    outputFile: toPosixRelative(outputFile),
    json: parseJsonOutput(result.stdout ?? output)
  };
}

function recordSourceCheck(scenario, messageMap, outputFile) {
  const sourceHints = sourceHintsForScenario(scenario);
  const embeddedUrls = urlsInObject(messageMap);
  const lines = [
    "# Source Check",
    "",
    `Scenario: ${scenario.id}`,
    `Mode: deterministic-dev-loop-placeholder`,
    "",
    "This runner does not browse live websites. It records the scenario's source-backed requirement so Evaluator/QA can verify that source work was explicitly acknowledged instead of silently skipped.",
    "",
    "## Source Hints",
    ...(sourceHints.length ? sourceHints.map((hint) => `- ${hint}`) : ["- none provided by ScenarioSpec"]),
    "",
    "## URLs Present In Message Map",
    ...(embeddedUrls.length ? embeddedUrls.map((url) => `- ${url}`) : ["- none"]),
    "",
    "## Verification Result",
    embeddedUrls.length ? "- PASS: message-map contains URL evidence." : "- WAIVED: no live URLs were available to the deterministic runner; manual source verification is required before treating the deck as source-backed.",
    ""
  ];
  writeText(outputFile, lines.join("\n"));
  return {
    command: "source-check deterministic-waiver",
    exitCode: 0,
    outputFile: toPosixRelative(outputFile),
    json: {
      ok: true,
      mode: "deterministic-dev-loop-placeholder",
      sourceHints,
      embeddedUrls,
      manualVerificationRequired: embeddedUrls.length === 0
    }
  };
}

function sourceHintsForScenario(scenario) {
  return [
    ...(scenario.sourceHints ?? []),
    ...(scenario.sources ?? []),
    ...(scenario.officialSources ?? [])
  ].map(String).filter(Boolean);
}

function urlsInObject(value) {
  const matches = JSON.stringify(value ?? {}).match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return [...new Set(matches.filter((url) => !/^https?:\/\/www\.w3\.org\//i.test(url)))];
}

function quoteArg(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function parseJsonOutput(output) {
  const text = output.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function messageMapForScenario(scenario, loopNumber, improvementState) {
  const expressions = Array.isArray(scenario.requiredExpressions) && scenario.requiredExpressions.length > 0 ? scenario.requiredExpressions : ["summary", "table", "step"];
  const profile = qualityProfile(loopNumber, improvementState);
  const topics = normalizeTopics(scenario, profile);
  return {
    objective: scenario.purpose,
    audience: scenario.audience,
    desiredAction: scenario.purpose,
    intents: topics.map((topic, index) => {
      const expression = expressions[index % expressions.length];
      const visualType = visualTypeForExpression(expression, index, profile, scenario, topic);
      if (!validVisualTypes.has(visualType)) {
        throw new Error(`Internal visualType mapping produced invalid value: ${visualType}`);
      }
      return {
        slideId: `s${String(index + 1).padStart(2, "0")}-${slug(topic)}`,
        title: titleForTopic(topic, profile),
        message: messageForTopic(topic, scenario, profile),
        evidence: evidenceForTopic(topic, scenario, expression, profile),
        quietInfo: [shorten(`tone: ${scenario.tone ?? "not specified"}`, 42), `loop: ${loopNumber}`, `profile: ${profile.name}`],
        visualType,
        visualAsset: visualType === "image" ? visualAssetForScenario(scenario, topic, index) : undefined,
        emphasis: titleForTopic(topic, profile)
      };
    })
  };
}

function qualityProfile(loopNumber, improvementState) {
  const compactCopyLevel = Math.max(loopNumber >= 2 ? 1 : 0, improvementState.compactCopyLevel ?? 0);
  const expressionPolishLevel = improvementState.expressionPolishLevel ?? 0;
  const informationDensityLevel = improvementState.informationDensityLevel ?? 0;
  const designAmbitionLevel = improvementState.designAmbitionLevel ?? 0;
  const baseEvidenceMax = compactCopyLevel >= 2 ? 2 : compactCopyLevel >= 1 ? 3 : 4;
  return {
    name: [
      loopNumber <= 1 ? "baseline" : "adaptive",
      compactCopyLevel > 0 ? "compact-copy" : null,
      improvementState.forceExecutiveSummary ? "executive-summary" : null,
      improvementState.safeContrast ? "safe-contrast" : null,
      expressionPolishLevel > 0 ? `expression-polish-${expressionPolishLevel}` : null,
      informationDensityLevel > 0 ? `information-density-${informationDensityLevel}` : null,
      designAmbitionLevel > 0 ? `design-ambition-${designAmbitionLevel}` : null
    ].filter(Boolean).join("+"),
    includeExecutiveSummary: loopNumber >= 2 || Boolean(improvementState.forceExecutiveSummary),
    compactCopy: compactCopyLevel > 0,
    compactCopyLevel,
    informationDensityLevel,
    designAmbitionLevel,
    evidenceMax: Math.min(6, Math.max(baseEvidenceMax, 3 + informationDensityLevel)),
    titleMax: improvementState.shortenTitles ? 18 : compactCopyLevel > 0 ? 24 : 36,
    topicLimit: improvementState.reduceSlideDensity && informationDensityLevel === 0 ? 7 : 10,
    safeContrast: Boolean(improvementState.safeContrast),
    expressionPolishLevel
  };
}

function normalizeTopics(scenario, profile) {
  const mustCover = Array.isArray(scenario.mustCover) ? scenario.mustCover.filter(Boolean) : [];
  const topics = mustCover.length >= 4 ? mustCover.slice(0, profile.topicLimit) : [...mustCover, "Overview", "Why it matters", "Options", "Next actions"].slice(0, Math.min(6, profile.topicLimit));
  const needsSummary = scenario.contentMode === "decision" || (scenario.requiredTools ?? []).includes("plan_business_deck");
  if ((needsSummary || profile.includeExecutiveSummary) && !topics.some((topic) => String(topic).toLowerCase().includes("executive"))) {
    return ["Executive Summary", ...topics].slice(0, profile.topicLimit);
  }
  return topics;
}

function visualTypeForExpression(expression, index, profile = {}, scenario = {}, topic = "") {
  const value = String(expression).toLowerCase();
  const context = [scenario.userRequest, scenario.purpose, scenario.audience, topic, value].filter(Boolean).join(" ").toLowerCase();
  if ((profile.designAmbitionLevel ?? 0) >= 1) {
    const slot = (index + (profile.designAmbitionLevel ?? 0)) % 7;
    if (value.includes("section") || value.includes("chapter")) return "section";
    if (/写真|現場|顧客|事例|採用|会社|患者|家族|旅館|office|customer|case|recruit|photo/.test(context) || slot === 1) return "image";
    if (/kpi|roi|売上|数字|指標|実績|成果|効果|予算|費用|gmv|budget|finance|traction|impact/.test(context) || slot === 2) return "summary";
    if (/関係|体験|循環|journey|concept|system|portfolio/.test(context) || slot === 3) return "cycle";
    if (/プロセス|構造|アーキテクチャ|移行|ロードマップ|workflow|architecture|roadmap|migration/.test(context) || slot === 4) return "native-diagram";
    if (slot === 5) return "matrix";
    if (slot === 6) return "flow";
  }
  if ((profile.expressionPolishLevel ?? 0) >= 1) {
    if (/採用|会社|事例|顧客|支援者|寄付|患者|家族|旅館|現場|office|customer|case|recruit|community|patient|family/.test(context) && index % 4 === 1) return "image";
    if (/kpi|roi|売上|数字|実績|成果|効果|予算|費用|gmv|budget|finance|traction|impact/.test(context) && index % 3 === 0) return "summary";
    if (/関係|構造|体験|journey|workflow|architecture|roadmap|migration|プロセス|ロードマップ|移行/.test(context)) return index % 2 === 0 ? "native-diagram" : "flow";
  }
  if ((profile.expressionPolishLevel ?? 0) >= 3 && (value.includes("structured") || value.includes("faq") || value.includes("detail"))) return "cards";
  if (value.includes("summary") || value.includes("overview") || value.includes("hero")) return "summary";
  if (value.includes("roi") || value.includes("kpi") || value.includes("table") || value.includes("dashboard") || value.includes("budget") || value.includes("cost") || value.includes("source")) return "table";
  if (value.includes("matrix") || value.includes("risk") || value.includes("comparison") || value.includes("competitive") || value.includes("radar") || value.includes("ranking") || value.includes("persona")) return "matrix";
  if (value.includes("before") || value.includes("after") || value.includes("contrast")) return "before-after";
  if (value.includes("roadmap") || value.includes("timeline") || value.includes("gantt") || value.includes("calendar") || value.includes("step") || value.includes("checklist")) return "step";
  if (value.includes("flow") || value.includes("workflow") || value.includes("funnel")) return "flow";
  if (value.includes("architecture") || value.includes("governance") || value.includes("repo") || value.includes("map") || value.includes("stakeholder") || value.includes("dependency")) return "native-diagram";
  if (value.includes("card") || value.includes("tip") || value.includes("story") || value.includes("photo") || value.includes("illustration")) return "cards";
  if (value.includes("detail") || value.includes("structured") || value.includes("faq")) return "detail";
  const rotation = ["summary", "flow", "table", "matrix", "step", "cards"];
  return rotation[index % rotation.length];
}

function visualAssetForScenario(scenario, topic, index) {
  const title = shorten(topic, 28);
  const audience = audienceLabel(scenario.audience);
  const colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe"];
  const fill = colors[index % colors.length];
  const accent = ["#1860c5", "#0f7a43", "#8a5a0c", "#be185d", "#6d28d9"][index % 5];
  return {
    type: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640"><rect width="960" height="640" rx="44" fill="${fill}"/><circle cx="760" cy="140" r="92" fill="${accent}" opacity="0.16"/><rect x="96" y="104" width="430" height="318" rx="34" fill="#fff" opacity="0.86"/><rect x="568" y="344" width="268" height="132" rx="28" fill="${accent}" opacity="0.9"/><path d="M130 478c126-98 214-18 326-92 98-65 168-142 326-84" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round" opacity="0.45"/><text x="130" y="194" font-family="Yu Gothic, Meiryo, sans-serif" font-size="42" font-weight="700" fill="#111827">${escapeSvg(title)}</text><text x="130" y="260" font-family="Yu Gothic, Meiryo, sans-serif" font-size="28" fill="#374151">${escapeSvg(audience)}</text><text x="604" y="425" font-family="Yu Gothic, Meiryo, sans-serif" font-size="38" font-weight="700" fill="#fff">Scene</text></svg>`,
    altText: `${title} contextual visual`,
    placement: index % 2 === 0 ? "right" : "left",
    caption: `${title} / ${audience}`
  };
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function titleForTopic(topic, profile = { titleMax: 36 }) {
  return trimTrailingFragment(shorten(String(topic)
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase()), profile.titleMax ?? 36));
}

function messageForTopic(topic, scenario, profile) {
  const subject = titleForTopic(topic, { titleMax: profile.compactCopy ? 20 : 28 });
  if (String(topic).toLowerCase().includes("executive")) {
    return "結論、重要性、次の判断を先に示す。";
  }
  if ((profile.informationDensityLevel ?? 0) >= 2) {
    return `${subject}について、判断材料・リスク・次の行動を同時に示す。`;
  }
  if ((profile.informationDensityLevel ?? 0) >= 1) {
    return `${subject}の論点、根拠、次の行動を示す。`;
  }
  if (profile.expressionPolishLevel >= 2) {
    return `${subject}の要点と判断軸を示す。`;
  }
  if (profile.compactCopy) {
    return `${subject}を判断に使える形にする。`;
  }
  return `${subject}を整理し、次の判断材料にする。`;
}

function evidenceForTopic(topic, scenario, expression, profile) {
  const audience = trimTrailingFragment(profile.compactCopyLevel >= 2 ? audienceLabel(scenario.audience) : shorten(scenario.audience ?? "対象者", profile.compactCopy ? 18 : 28));
  const tone = trimTrailingFragment(shorten(scenario.tone ?? "標準", profile.compactCopy ? 12 : 20));
  const point = trimTrailingFragment(shorten(topic, profile.compactCopy ? 20 : 28));
  if ((profile.informationDensityLevel ?? 0) >= 1) {
    return [
      `材料: ${point}`,
      `読み手: ${audience}`,
      `行動: ${trimTrailingFragment(shorten(scenario.purpose ?? "判断", 24))}`,
      `表現: ${expressionLabel(expression)}`,
      `トーン: ${tone}`
    ].slice(0, profile.evidenceMax ?? 5);
  }
  return [
    `対象: ${audience}`,
    `観点: ${trimTrailingFragment(shorten(topic, profile.compactCopy ? 18 : 24))}`,
    `表現: ${trimTrailingFragment(shorten(expression, 18))}`,
    `口調: ${tone}`
  ].slice(0, profile.evidenceMax ?? 4);
}

function audienceLabel(audience) {
  const text = String(audience ?? "対象者").toLowerCase();
  if (/エンジニア|開発|developer|engineer/.test(text)) return "エンジニア";
  if (/経営|役員|意思決定|decision|executive/.test(text)) return "意思決定者";
  if (/営業|sales/.test(text)) return "営業";
  if (/自治体|行政|public sector/.test(text)) return "自治体";
  if (/投資|investor|vc/.test(text)) return "投資家";
  if (/顧客|customer/.test(text)) return "顧客";
  return shorten(audience ?? "対象者", 14);
}

function expressionLabel(expression) {
  const value = String(expression).toLowerCase();
  if (value.includes("competitive")) return "競合比較";
  if (value.includes("roadmap") || value.includes("timeline")) return "ロードマップ";
  if (value.includes("dashboard") || value.includes("kpi")) return "KPI";
  if (value.includes("funnel")) return "ファネル";
  if (value.includes("persona")) return "ペルソナ";
  if (value.includes("source")) return "出典確認";
  if (value.includes("table")) return "表";
  if (value.includes("matrix")) return "マトリクス";
  if (value.includes("card")) return "カード";
  return trimTrailingFragment(shorten(expression, 12));
}

function shorten(value, maxLength) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  const candidate = clipTextAtSemanticBoundary(text, maxLength);
  if (/^[\p{Script=Latin}0-9 _-]+$/u.test(text)) {
    const words = candidate.split(/[ _-]+/).filter(Boolean);
    if (words.length > 1) {
      return words.slice(0, -1).join(" ");
    }
  }
  return candidate;
}

function trimTrailingFragment(value) {
  return trimJapaneseDanglingEnd(String(value));
}

function clipTextAtSemanticBoundary(value, maxLength) {
  const chars = Array.from(value);
  const clipped = chars.slice(0, Math.max(1, maxLength)).join("").trimEnd();
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value)) {
    return clipped;
  }

  const punctuationIndex = Math.max(clipped.lastIndexOf("、"), clipped.lastIndexOf("，"), clipped.lastIndexOf("・"), clipped.lastIndexOf("/"), clipped.lastIndexOf("／"));
  if (punctuationIndex >= 4) {
    return trimJapaneseDanglingEnd(clipped.slice(0, punctuationIndex));
  }

  const particlePattern = /[をにへでとがはの]/gu;
  let lastParticle = -1;
  for (const match of clipped.matchAll(particlePattern)) {
    lastParticle = match.index ?? -1;
  }
  if (lastParticle >= 4) {
    return trimJapaneseDanglingEnd(clipped.slice(0, lastParticle));
  }

  return trimJapaneseDanglingEnd(clipped);
}

function trimJapaneseDanglingEnd(value) {
  return String(value).replace(/[、,，・／/\s]+$/u, "").replace(/[をにへでとがはの]$/u, "").trim();
}

function slug(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return normalized || "topic";
}

function titleForScenario(scenario, loopNumber, profile = {}) {
  const maxLength = profile.shortenTitles ? 30 : profile.compactCopy ? 42 : 54;
  const base = String(scenario.userRequest ?? scenario.id).split("。")[0].replace(/を作ってください$/, "").slice(0, maxLength);
  return `L${String(loopNumber).padStart(2, "0")} ${base}`;
}

function styleForContentMode(contentMode, profile = {}) {
  if (profile.safeContrast) {
    return "report";
  }
  switch (contentMode) {
    case "presentation":
      return "presentation";
    case "technical":
      return "technical";
    case "decision":
      return "stylish";
    case "handout":
    case "report":
    default:
      return "report";
  }
}

function runScenario(scenario, loopNumber, loopDir, improvementState) {
  const scenarioDir = path.join(loopDir, scenario.id);
  ensureDirectory(scenarioDir);

  const scenarioFile = path.join(scenarioDir, "scenario.json");
  const messageMapFile = path.join(scenarioDir, "message-map.json");
  const deckFile = path.join(scenarioDir, "deck.json");
  const polishedFile = path.join(scenarioDir, "polished.deck.json");
  const pptxFile = path.join(scenarioDir, "deck.pptx");
  const studioFile = path.join(scenarioDir, "studio.html");

  const messageMap = messageMapForScenario(scenario, loopNumber, improvementState);
  const profile = qualityProfile(loopNumber, improvementState);
  writeJson(scenarioFile, scenario);
  writeJson(messageMapFile, messageMap);

  const commands = [];

  if (Array.isArray(scenario.requiredExpressions)) {
    scenario.requiredExpressions.forEach((expression, index) => {
      commands.push(runCli([
        "figure",
        "--kind",
        String(expression),
        "--message",
        `${scenario.purpose ?? scenario.userRequest} ${expression}`,
        "--items",
        String(Math.max(3, Math.min(8, (scenario.mustCover ?? []).length || 4))),
        "--json"
      ], path.join(scenarioDir, `figure-${String(index + 1).padStart(2, "0")}.json`)));
    });
  }

  if (Array.isArray(scenario.requiredTools) && scenario.requiredTools.includes("plan_business_deck")) {
    commands.push(runCli([
      "business-plan",
      "--locale",
      "ja-JP",
      "--topic",
      titleForScenario(scenario, loopNumber, profile),
      "--purpose",
      scenario.purpose ?? scenario.userRequest,
      "--audience",
      scenario.audience ?? "未指定",
      "--desired-action",
      scenario.purpose ?? "次の判断へ進む",
      "--slides",
      String(scenario.suggestedSlideCount ?? 8),
      "--important-meeting",
      "--json",
      "--output",
      path.join(scenarioDir, "business-plan.json")
    ], path.join(scenarioDir, "business-plan.stdout.txt")));
  }

  if (Array.isArray(scenario.requiredTools) && scenario.requiredTools.includes("source-check")) {
    commands.push(recordSourceCheck(scenario, messageMap, path.join(scenarioDir, "source-check.txt")));
  }

  commands.push(runCli([
    "from-message-map",
    messageMapFile,
    "--title",
    titleForScenario(scenario, loopNumber, profile),
    "--locale",
    "ja-JP",
    "--content-mode",
    scenario.contentMode ?? "report",
    "--style",
    styleForContentMode(scenario.contentMode, profile),
    "--output",
    deckFile,
    "--json"
  ], path.join(scenarioDir, "from-message-map.stdout.txt")));

  commands.push(runCli([
    "finalize",
    deckFile,
    "--output",
    pptxFile,
    "--polished-out",
    polishedFile,
    "--force",
    "--json"
  ], path.join(scenarioDir, "finalize.txt")));

  const reviewTarget = existsSync(polishedFile) ? polishedFile : deckFile;
  commands.push(runCli([
    "review",
    reviewTarget,
    "--json"
  ], path.join(scenarioDir, "review.txt")));

  commands.push(runCli([
    "studio",
    reviewTarget,
    "--output",
    studioFile
  ], path.join(scenarioDir, "studio.txt")));

  const zip = existsSync(pptxFile) ? inspectZip(pptxFile) : { exists: false, zeroNonDir: null, entries: 0 };
  const hashes = {
    deckJson: fileHashIfExists(deckFile),
    polishedDeckJson: fileHashIfExists(polishedFile),
    pptx: fileHashIfExists(pptxFile)
  };
  const evalReport = evaluateScenario(scenario, loopNumber, commands, zip, hashes);
  const userReport = {
    role: "User Simulator",
    scenarioId: scenario.id,
    loop: loopNumber,
    model: "host-selected",
    artifacts: artifactList(scenarioDir),
    commands: commands.map(({ command, exitCode, outputFile }) => ({ command, exitCode, outputFile })),
    blockingIssues: evalReport.patchRequests.filter((request) => request.severity === "critical" || request.severity === "high"),
    notes: [`Generated from realistic userRequest: ${scenario.userRequest}`]
  };

  writeJson(path.join(scenarioDir, "tool-ledger.json"), { commands });
  writeJson(path.join(scenarioDir, "user-report.json"), userReport);
  writeJson(path.join(scenarioDir, "eval-report.json"), evalReport);
  writeText(path.join(scenarioDir, "eval-summary.md"), evalSummaryMarkdown(evalReport));
  writeJson(path.join(scenarioDir, "improvement-state.json"), improvementState);

  return {
    scenarioId: scenario.id,
    directory: toPosixRelative(scenarioDir),
    patchRequestCount: evalReport.patchRequests.length,
    highOrCriticalCount: evalReport.patchRequests.filter((request) => request.severity === "critical" || request.severity === "high").length,
    expressionCraft: evalReport.scores.expressionCraft,
    informationDensity: evalReport.scores.informationDensity,
    designAmbition: evalReport.scores.designAmbition,
    expressionFingerprint: evalReport.deterministic.expressionCraft?.fingerprint,
    hashes
  };
}

function artifactList(dir) {
  const files = ["scenario.json", "message-map.json", "source-check.txt", "deck.json", "polished.deck.json", "deck.pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "eval-report.json"];
  return files.filter((file) => existsSync(path.join(dir, file))).map((file) => toPosixRelative(path.join(dir, file)));
}

function evaluateScenario(scenario, loopNumber, commands, zip, hashes) {
  const patchRequests = [];
  const failedCommands = commands.filter((command) => command.exitCode !== 0 && !isExpectedStructuredNonZero(command));
  for (const failed of failedCommands) {
    patchRequests.push({
      severity: "critical",
      problem: "A required pptcreater CLI command failed during scenario generation.",
      evidence: `${failed.command} exited ${failed.exitCode}; see ${failed.outputFile}`,
      expected: "Scenario artifacts should be generated without command failures.",
      suggestedScope: ["packages/cli", "packages/core", "packages/render-pptx"]
    });
  }

  if (zip.exists && zip.zeroNonDir !== 0) {
    patchRequests.push({
      severity: "critical",
      problem: "Rendered PPTX has zero-length non-directory zip entries.",
      evidence: `zeroNonDir=${zip.zeroNonDir}; entries=${zip.entries}`,
      expected: "PPTX zip integrity should have zeroNonDir=0.",
      suggestedScope: ["packages/render-pptx"]
    });
  }

  const finalizeJson = lastJsonForCommand(commands, "finalize");
  const reviewJson = lastJsonForCommand(commands, "review");
  const deckJson = loadJsonIfExists(findScenarioArtifact(commands, "from-message-map", "deck.json"));
  const expressionCraft = evaluateExpressionCraft(deckJson, scenario);
  const informationDensity = evaluateInformationDensity(deckJson);
  const designAmbition = evaluateDesignAmbition(deckJson, scenario);
  const standaloneClarity = evaluateStandaloneClarity(deckJson);
  const textCompleteness = evaluateTextCompleteness(deckJson);
  const slideComments = buildSlideComments(deckJson, scenario, finalizeJson, reviewJson);
  const reviewBlocking = reviewJson?.blocking?.length ?? reviewJson?.blockingIssues?.length ?? 0;
  const reviewOk = reviewJson?.ok ?? (reviewBlocking === 0);
  if (!reviewOk || reviewBlocking > 0) {
    patchRequests.push({
      severity: "high",
      problem: "Aggregated review found blocking issues.",
      evidence: `blocking=${reviewBlocking}; see review.txt`,
      expected: "Review should report ok=true with no blocking issues for generated scenarios.",
      suggestedScope: ["packages/core/src/lint.ts", "packages/core/src/director.ts", "packages/core/src/messageDeck.ts"]
    });
  }

  const badLineBreaks = lintIssuesByCode(finalizeJson, reviewJson, "layout.bad-line-break");
  if (badLineBreaks.length > 0) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated slides contain broken line breaks or visually cut-off text.",
      evidence: badLineBreaks.slice(0, 6).map((issue) => `${issue.path ?? "unknown"}: ${issue.message ?? issue.code}`).join(" | "),
      expected: "Evaluator should fail slides whose visible text breaks into orphan particles, dangling continuations, or cutoff-looking lines.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/layout.ts", "scripts/run-dev-loop.mjs"]
    });
  }

  const requiredTools = new Set(scenario.requiredTools ?? []);
  const commandText = commands.map((command) => command.command).join("\n");
  const missingRequiredTools = [...requiredTools].filter((tool) => !toolCovered(tool, commandText));
  if (missingRequiredTools.length > 0) {
    patchRequests.push({
      severity: "medium",
      problem: "Scenario required tools were not fully exercised by the deterministic runner.",
      evidence: `missing=${missingRequiredTools.join(", ")}`,
      expected: "The loop runner or User Simulator should exercise every ScenarioSpec.requiredTools entry or record a justified waiver.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md", ".github/agents/pptcreater-dev-user.agent.md"]
    });
  }

  const sourceExpected = requiredTools.has("source-check") || (scenario.requiredExpressions ?? []).some((expression) => String(expression).includes("source"));
  const sourceCheckFile = findScenarioArtifact(commands, "source-check", "source-check.txt");
  if (sourceExpected && !sourceCheckFile) {
    patchRequests.push({
      severity: "medium",
      problem: "Source-backed scenario needs live source verification that the deterministic runner cannot infer from placeholders.",
      evidence: "Scenario expects source-check or source-note; source-check.txt was not recorded.",
      expected: "User Simulator should collect official source URLs or record a deterministic source-check waiver for source-backed decks.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md"]
    });
  }

  if (expressionCraft.score < 3) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated deck lacks scenario-specific expressive craft.",
      evidence: expressionCraft.evidence,
      expected: "Decks should vary their expressive strategy by scenario, using sample-derived tactics such as anchored realism, focal proof, spatial models, deliberate repetition, deck rhythm, or brand materiality.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/visualQuality.ts", "scripts/run-dev-loop.mjs", ".github/agents/pptcreater-dev-evaluator.agent.md"]
    });
  }

  if (informationDensity.score < 3) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated deck is too thin in visible information density.",
      evidence: informationDensity.evidence,
      expected: "Slides should carry enough visible context, evidence, and next-action information to feel substantive, like the reference decks that combine claim, support, and visual proof on one slide.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "packages/core/src/messageDeck.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (designAmbition.score < 3) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated deck is visually safe but not ambitious enough.",
      evidence: designAmbition.evidence,
      expected: "The loop should attempt bolder visual strategies such as photo-led spreads, oversized proof numbers, strong spatial models, deliberate repetition, and dramatic scale contrast; ineffective attempts should be reverted after comparison.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "packages/core/src/messageDeck.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (standaloneClarity.score < 3) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated slides are not understandable from visible output alone.",
      evidence: standaloneClarity.evidence,
      expected: "Each slide should be understandable from visible title, message, labels, and visual content without reading generation scripts, scenario files, speaker notes, or quiet metadata.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/content.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (textCompleteness.score < 5) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated visible text contains incomplete or meaning-breaking fragments.",
      evidence: textCompleteness.evidence,
      expected: "Every visible text element, including cover titles and labels, should read as a complete understandable phrase or sentence rather than ending mid-word, mid-phrase, or after dangling punctuation.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/layout.ts", "scripts/run-dev-loop.mjs"]
    });
  }

  const toolCoverage = requiredTools.size === 0 ? 5 : Math.max(0, Math.round(((requiredTools.size - missingRequiredTools.length) / requiredTools.size) * 5));
  const commandScore = failedCommands.length === 0 ? 5 : 1;
  const reviewScore = reviewOk ? 4 : 2;
  const zipScore = !zip.exists ? 1 : zip.zeroNonDir === 0 ? 5 : 0;

  return {
    role: "Evaluator",
    model: "Opus4.8",
    scenarioId: scenario.id,
    loop: loopNumber,
    deterministic: {
      commandFailures: failedCommands.length,
      reviewOk,
      reviewBlocking,
      zip,
      hashes,
      expressionCraft,
      informationDensity,
      designAmbition,
      standaloneClarity,
      textCompleteness,
      slideCommentCount: slideComments.length,
      finalize: summarizeJson(finalizeJson),
      review: summarizeJson(reviewJson)
    },
    scores: {
      messageFit: reviewScore,
      standaloneClarity: Math.min(standaloneClarity.score, textCompleteness.score),
      visualFit: reviewScore,
      expressionCraft: Math.min(expressionCraft.score, designAmbition.score),
      informationDensity: informationDensity.score,
      designAmbition: designAmbition.score,
      editability: Math.min(reviewScore, zipScore),
      accessibility: reviewJson?.scores?.accessibility ? Math.round(reviewJson.scores.accessibility / 20) : reviewScore,
      toolDiscipline: Math.min(toolCoverage, commandScore)
    },
    slideComments,
    patchRequests,
    residualRisks: patchRequests.length === 0 ? [] : ["Review generated artifacts manually in PowerPoint/Studio before accepting visual quality."]
  };
}

function findScenarioArtifact(commands, commandName, fallbackName) {
  const normalized = commandName.toLowerCase();
  const command = commands.find((entry) => entry.command.toLowerCase().includes(normalized));
  if (!command?.outputFile) {
    return null;
  }
  return path.join(repoRoot, path.dirname(command.outputFile), fallbackName);
}

function loadJsonIfExists(file) {
  if (!file || !existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function evaluateExpressionCraft(deck, scenario) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for expression craft evaluation." };
  }

  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const layouts = bodySlides.map((slide) => slide.layout ?? "unknown");
  const fingerprint = layouts.join(" > ");
  const layoutCounts = countBy(layouts);
  const dominantLayoutShare = bodySlides.length ? Math.max(...Object.values(layoutCounts)) / bodySlides.length : 1;
  const slidesWithLargeMedia = bodySlides.filter(hasLargeMedia).length;
  const slidesWithFocalProof = bodySlides.filter(hasFocalProof).length;
  const slidesWithSpatialModel = bodySlides.filter(hasSpatialModel).length;
  const slidesWithDeliberateRepetition = bodySlides.filter(hasDeliberateRepetition).length;
  const layoutDiversity = Object.keys(layoutCounts).length;

  const scenarioText = [scenario.purpose, scenario.audience, scenario.userRequest, ...(scenario.requiredExpressions ?? [])].join(" ").toLowerCase();
  const wantsAnchoredRealism = /採用|会社|事例|顧客|製品|現場|office|customer|product|case|recruit/.test(scenarioText);
  const wantsFocalProof = /kpi|roi|売上|数字|指標|実績|効果|比較|データ|budget|finance/.test(scenarioText);
  const wantsSpatialModel = /プロセス|関係|構造|アーキテクチャ|移行|ロードマップ|journey|workflow|architecture|roadmap/.test(scenarioText);

  let score = 2;
  if (layoutDiversity >= Math.min(4, bodySlides.length)) score += 1;
  if (dominantLayoutShare <= 0.45) score += 1;
  if (slidesWithLargeMedia > 0 || !wantsAnchoredRealism) score += 0.5;
  if (slidesWithFocalProof > 0 || !wantsFocalProof) score += 0.5;
  if (slidesWithSpatialModel > 0 || !wantsSpatialModel) score += 0.5;
  if (slidesWithDeliberateRepetition > 0) score += 0.5;
  score = Math.max(1, Math.min(5, Math.round(score)));

  const missing = [];
  if (layoutDiversity < Math.min(4, bodySlides.length)) missing.push("deck rhythm / layout diversity");
  if (dominantLayoutShare > 0.45) missing.push(`dominant layout share ${dominantLayoutShare.toFixed(2)}`);
  if (wantsAnchoredRealism && slidesWithLargeMedia === 0) missing.push("anchored realism: no large photo/image/product visual");
  if (wantsFocalProof && slidesWithFocalProof === 0) missing.push("focal proof: no large KPI/number proof slide");
  if (wantsSpatialModel && slidesWithSpatialModel === 0) missing.push("spatial model: no map/flow/matrix/diagram/step spatial explanation");

  return {
    score,
    fingerprint,
    evidence: `expressionCraft=${score}/5; bodySlides=${bodySlides.length}; layoutDiversity=${layoutDiversity}; dominantLayoutShare=${dominantLayoutShare.toFixed(2)}; largeMedia=${slidesWithLargeMedia}; focalProof=${slidesWithFocalProof}; spatialModel=${slidesWithSpatialModel}; deliberateRepetition=${slidesWithDeliberateRepetition}; missing=${missing.join("; ") || "none"}`
  };
}

function evaluateInformationDensity(deck) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for information density evaluation." };
  }
  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const slideCount = Math.max(1, bodySlides.length);
  const textElements = bodySlides.flatMap((slide) => (slide.elements ?? []).filter((element) => element.type === "text"));
  const visibleChars = textElements.reduce((sum, element) => sum + String(element.text ?? "").replace(/\s+/g, "").length, 0);
  const avgCharsPerSlide = visibleChars / slideCount;
  const avgTextElementsPerSlide = textElements.length / slideCount;
  const contentBearingSlides = bodySlides.filter((slide) => {
    const chars = (slide.elements ?? []).filter((element) => element.type === "text").reduce((sum, element) => sum + String(element.text ?? "").replace(/\s+/g, "").length, 0);
    return chars >= 85 || hasFocalProof(slide) || hasLargeMedia(slide);
  }).length;

  let score = 1;
  if (avgCharsPerSlide >= 85) score += 1;
  if (avgCharsPerSlide >= 115) score += 1;
  if (avgTextElementsPerSlide >= 8) score += 1;
  if (contentBearingSlides / slideCount >= 0.65) score += 1;
  score = Math.max(1, Math.min(5, score));

  return {
    score,
    evidence: `informationDensity=${score}/5; avgCharsPerSlide=${avgCharsPerSlide.toFixed(1)}; avgTextElementsPerSlide=${avgTextElementsPerSlide.toFixed(1)}; contentBearingSlides=${contentBearingSlides}/${slideCount}`
  };
}

function evaluateDesignAmbition(deck, scenario) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for design ambition evaluation." };
  }
  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const slideCount = Math.max(1, bodySlides.length);
  const largeMedia = bodySlides.filter(hasLargeMedia).length;
  const focalProof = bodySlides.filter(hasFocalProof).length;
  const spatialModel = bodySlides.filter(hasSpatialModel).length;
  const deliberateRepetition = bodySlides.filter(hasDeliberateRepetition).length;
  const dramaticScale = bodySlides.filter(hasDramaticScaleContrast).length;
  const layouts = new Set(bodySlides.map((slide) => slide.layout ?? "unknown"));
  const scenarioText = [scenario.purpose, scenario.audience, scenario.userRequest, ...(scenario.requiredExpressions ?? [])].join(" ").toLowerCase();
  const wantsMedia = /採用|会社|事例|顧客|製品|現場|office|customer|product|case|recruit|community/.test(scenarioText);
  const wantsProof = /kpi|roi|売上|数字|指標|実績|効果|比較|データ|予算|費用|gmv|budget|finance|traction|impact/.test(scenarioText);

  let score = 1;
  if (layouts.size >= Math.min(5, slideCount)) score += 1;
  if (largeMedia >= Math.max(1, Math.ceil(slideCount * 0.2)) || !wantsMedia) score += 1;
  if (focalProof > 0 || !wantsProof) score += 1;
  if (spatialModel >= Math.min(4, slideCount)) score += 1;
  if (deliberateRepetition >= 2 && dramaticScale >= 2) score += 1;
  score = Math.max(1, Math.min(5, score));

  const missing = [];
  if (wantsMedia && largeMedia === 0) missing.push("no photo/product/customer-scale visual");
  if (wantsProof && focalProof === 0) missing.push("no oversized proof number");
  if (dramaticScale === 0) missing.push("no dramatic scale contrast like large blob/oversized figure");
  if (deliberateRepetition === 0) missing.push("no strong repeated card rhythm");
  return {
    score,
    evidence: `designAmbition=${score}/5; layouts=${layouts.size}; largeMedia=${largeMedia}; focalProof=${focalProof}; spatialModel=${spatialModel}; deliberateRepetition=${deliberateRepetition}; dramaticScale=${dramaticScale}; missing=${missing.join("; ") || "none"}`
  };
}

function buildSlideComments(deck, scenario, ...reports) {
  if (!deck?.slides) {
    return [
      {
        slideIndex: 0,
        slideId: "deck-missing",
        title: "Deck unavailable",
        layout: "unknown",
        comment: "deck.jsonが取得できないため、スライド単位の評価コメントを作れません。",
        wouldBeBetterIf: "生成後のdeck.jsonを必ず保存し、評価者が最終アウトプットだけを見て各スライドを確認できる状態にするとよいです。",
        evidence: "deckJson=null"
      }
    ];
  }

  return deck.slides.map((slide, index) => {
    const textElements = (slide.elements ?? []).filter((element) => element.type === "text");
    const visibleChars = textElements.reduce((sum, element) => sum + String(element.text ?? "").replace(/\s+/g, "").length, 0);
    const issueHints = issuesForSlide(index, reports);
    const title = slide.title || textElements.find((element) => element.role === "title")?.text || slide.id || `Slide ${index + 1}`;
    const layout = slide.layout ?? "unknown";
    const comment = slideCommentFor({ slide, index, title, layout, visibleChars, textCount: textElements.length, issueHints, scenario });
    return {
      slideIndex: index + 1,
      slideId: slide.id ?? `slide-${index + 1}`,
      title,
      layout,
      comment: comment.comment,
      wouldBeBetterIf: comment.wouldBeBetterIf,
      evidence: comment.evidence
    };
  });
}

function slideCommentFor({ slide, index, title, layout, visibleChars, textCount, issueHints, scenario }) {
  const topic = trimTrailingFragment(shorten(title, 22));
  const blockingHints = issueHints.filter(isBlockingSlideIssue);
  const issueSummary = blockingHints.slice(0, 2).map((issue) => `${issue.code ?? "issue"}: ${issue.message ?? issue.path ?? "review finding"}`).join(" / ");
  const hasBlockingIssue = blockingHints.length > 0;
  const largeMedia = hasLargeMedia(slide);
  const focalProof = hasFocalProof(slide);
  const spatialModel = hasSpatialModel(slide);
  const dramaticScale = hasDramaticScaleContrast(slide);
  const cards = (slide.elements ?? []).filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.5 && element.h >= 0.8).length;
  const scenarioNeed = [scenario.userRequest, scenario.purpose, scenario.audience, ...(scenario.requiredExpressions ?? [])].filter(Boolean).join(" ").toLowerCase();

  if (hasBlockingIssue) {
    return {
      comment: `${topic}は重大な表示品質の問題があり、読者が内容へ入る前に可読性や信頼感で止まる可能性があります。`,
      wouldBeBetterIf: `該当箇所を修正したうえで、同じスライドに主張・根拠・次の判断が一目で残るように再配置するともっと良くなります。`,
      evidence: `${blockingHints.length} blocking-like issue(s): ${issueSummary}`
    };
  }

  if (layout === "cover") {
    if (hasCoverAudienceActionStrip(slide)) {
      return {
        comment: `表紙はテーマに加えて読者と行動が見えるため、会議の用途が初見で伝わりやすくなっています。`,
        wouldBeBetterIf: `次は背景ビジュアルや右側モチーフもシナリオ固有にすると、さらに記憶に残る表紙になります。`,
        evidence: `layout=${layout}; audienceActionStrip=true; visibleChars=${visibleChars}; textElements=${textCount}`
      };
    }
    return {
      comment: `表紙はテーマを示していますが、聞き手が最初の3秒で期待値を持つには、読者と到達行動の見せ方がまだ控えめです。`,
      wouldBeBetterIf: `タイトルの横に「誰が何を判断する資料か」を短いタグで置き、表紙から会議の緊張感や用途が伝わるともっと良くなります。`,
      evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}`
    };
  }

  if (layout === "closing") {
    if (hasClosingActionChecklist(slide)) {
      return {
        comment: `締めスライドは次の行動を担当・期限・確認物に分けており、会議後の実行に移しやすくなっています。`,
        wouldBeBetterIf: `実データがある場合は担当名や日付をScenarioSpecから埋めると、さらに実務に近いクロージングになります。`,
        evidence: `layout=${layout}; actionChecklist=true; visibleChars=${visibleChars}; textElements=${textCount}`
      };
    }
    return {
      comment: `締めスライドは行動を促していますが、実務で次に動くための期限・担当・確認物が見えるとさらに強くなります。`,
      wouldBeBetterIf: `次アクションを「担当、期限、確認する資料」の3点で小さく分解し、会議後にそのまま使えるチェックにするともっと良くなります。`,
      evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}`
    };
  }

  if (visibleChars < 70 && !largeMedia && !focalProof) {
    return {
      comment: `${topic}は読みやすい一方で、スライド単体で判断するには情報量が薄く、要点だけが置かれている印象です。`,
      wouldBeBetterIf: `主張の下に「根拠、反証リスク、次の判断」のうち最低2つを足し、短いが中身のあるスライドにするともっと良くなります。`,
      evidence: `visibleChars=${visibleChars}; textElements=${textCount}; largeMedia=${largeMedia}; focalProof=${focalProof}`
    };
  }

  if (/message-statement|message-table|message-flow|message-steps/u.test(layout) && cards >= 3) {
    return {
      comment: `${topic}は情報整理として成立していますが、見慣れたカードやステップの並びに寄っており、発見や驚きは弱めです。`,
      wouldBeBetterIf: `1つだけ大きな主役カードを作る、または大きな数値・対立構図・比喩図のどれかを加えて視線の入口を作るともっと良くなります。`,
      evidence: `layout=${layout}; cards=${cards}; dramaticScale=${dramaticScale}; spatialModel=${spatialModel}`
    };
  }

  if (/message-matrix|message-hub-map|message-concept|message-before-after/u.test(layout)) {
    return {
      comment: `${topic}は構造を図解で示せていますが、図の軸や関係がさらに鋭くなる余地があります。`,
      wouldBeBetterIf: `単なる分類ではなく、「どこを選ぶべきか」「何が対立しているか」「どこで判断が分かれるか」を図の中に1つ強調するともっと良くなります。`,
      evidence: `layout=${layout}; spatialModel=${spatialModel}; visibleChars=${visibleChars}`
    };
  }

  if (largeMedia) {
    if (hasPhotoAnnotationOverlay(slide)) {
      return {
        comment: `${topic}は画像に注目点とキャプションが重なり、視覚の入口と論点が結びついています。`,
        wouldBeBetterIf: `次は注釈を1つの根拠数値や判断ラベルと連動させると、写真主役スライドの説得力がさらに上がります。`,
        evidence: `layout=${layout}; photoAnnotation=true; largeMedia=${largeMedia}; visibleChars=${visibleChars}`
      };
    }
    return {
      comment: `${topic}は視覚の入口がありますが、画像や場面が資料の論点とより強く結びつく余地があります。`,
      wouldBeBetterIf: `画像の上に短いキャプションや注目点を重ね、読者が「何を見ればよいか」まで分かる写真主役スライドにするともっと良くなります。`,
      evidence: `layout=${layout}; largeMedia=${largeMedia}; visibleChars=${visibleChars}`
    };
  }

  if (focalProof || /kpi|roi|売上|数字|指標|実績|効果|比較|予算|費用|gmv|budget|finance/u.test(scenarioNeed)) {
    if (focalProof) {
      return {
        comment: `${topic}は数値や比較を主役化しており、判断材料が記憶に残りやすい構成です。`,
        wouldBeBetterIf: `実データがある場合は出典や比較期間を近くに添えると、証拠としての信頼感がさらに上がります。`,
        evidence: `layout=${layout}; focalProof=${focalProof}; dramaticScale=${dramaticScale}`
      };
    }
    return {
      comment: `${topic}は判断材料を示していますが、数字や比較の見せ方をさらに主役化できます。`,
      wouldBeBetterIf: `最も重要な数値を1つだけ大きく置き、その横に「なぜ重要か」を短く添えると、記憶に残るスライドになります。`,
      evidence: `layout=${layout}; focalProof=${focalProof}; dramaticScale=${dramaticScale}`
    };
  }

  return {
    comment: `${topic}は主張と最低限の根拠が見えますが、まだ無難な構成に収まっています。`,
    wouldBeBetterIf: `読み手が思わず立ち止まる主役要素を1つ決め、数値・比喩図・章扉・対立構図のどれかへ大胆に寄せるともっと良くなります。`,
    evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}; largeMedia=${largeMedia}; focalProof=${focalProof}; spatialModel=${spatialModel}`
  };
}

function issuesForSlide(slideIndex, reports) {
  const prefix = `slides.${slideIndex}`;
  const issues = [];
  for (const report of reports.filter(Boolean)) {
    for (const key of ["blockingErrors", "blocking", "blockingIssues", "polishFixable", "warnings", "renderWarnings", "advisory"]) {
      for (const entry of Array.isArray(report?.[key]) ? report[key] : []) {
        if (typeof entry === "string") {
          if (entry.includes(prefix)) issues.push({ code: key, message: entry, path: prefix });
        } else if (String(entry?.path ?? "").startsWith(prefix)) {
          issues.push(entry);
        }
      }
    }
  }
  return issues;
}

function isBlockingSlideIssue(issue) {
  const code = String(issue?.code ?? "");
  const disposition = String(issue?.disposition ?? "");
  const severity = String(issue?.severity ?? "");
  if (disposition === "blocking" || severity === "error") return true;
  return [
    "text.low-contrast",
    "visual.truncated-text",
    "layout.bad-line-break",
    "layout.compact-label-wrap",
    "diagram.native-connectors",
    "element.reading-order-duplicate"
  ].includes(code);
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function hasLargeMedia(slide) {
  return (slide.elements ?? []).some((element) => ["image", "svg", "diagram"].includes(element.type) && element.w >= 3.5 && element.h >= 2.2 && !element.decorative);
}

function hasFocalProof(slide) {
  return (
    slide.layout === "message-focal-proof" ||
    (slide.elements ?? []).some((element) => element.type === "text" && (element.fontSize ?? 0) >= 28 && /\d|%|倍|億|万|円|pt|ポイント/u.test(element.text ?? ""))
  );
}

function hasSpatialModel(slide) {
  const layout = slide.layout ?? "";
  return /flow|matrix|map|diagram|step|journey|architecture|before-after/u.test(layout);
}

function hasDeliberateRepetition(slide) {
  const cards = (slide.elements ?? []).filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.5 && element.h >= 0.8);
  return cards.length >= 3;
}

function hasDramaticScaleContrast(slide) {
  return (slide.elements ?? []).some((element) => {
    if (element.type === "text" && (element.fontSize ?? 0) >= 40) return true;
    if (element.type === "shape" && element.w >= 5.5 && element.h >= 3.0) return true;
    if (["image", "svg", "diagram"].includes(element.type) && element.w >= 5.5 && element.h >= 3.0 && !element.decorative) return true;
    return false;
  });
}

function hasPhotoAnnotationOverlay(slide) {
  return (slide.elements ?? []).some((element) => /photo-annotation|photo-caption-rail/u.test(element.id ?? ""));
}

function hasCoverAudienceActionStrip(slide) {
  const ids = new Set((slide.elements ?? []).map((element) => element.id));
  return ids.has("cover-audience-chip") && ids.has("cover-action-chip");
}

function hasClosingActionChecklist(slide) {
  return (slide.elements ?? []).filter((element) => /^closing-check-\d+$/u.test(element.id ?? "")).length >= 3;
}

function lastJsonForCommand(commands, name) {
  const found = [...commands].reverse().find((command) => command.command.includes(` ${name} `) || command.command.endsWith(` ${name}`));
  return found?.json ?? null;
}

function summarizeJson(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    ok: value.ok,
    scores: value.scores,
    blocking: Array.isArray(value.blocking) ? value.blocking.length : undefined,
    warnings: Array.isArray(value.warnings) ? value.warnings.length : undefined,
    blockingErrors: Array.isArray(value.blockingErrors) ? value.blockingErrors.length : undefined,
    polishFixable: Array.isArray(value.polishFixable) ? value.polishFixable.length : undefined
  };
}

function lintIssuesByCode(...args) {
  const code = args.pop();
  const reports = args.filter(Boolean);
  const issues = [];
  for (const report of reports) {
    for (const key of ["blockingErrors", "blocking", "blockingIssues", "polishFixable", "warnings", "renderWarnings"]) {
      const entries = Array.isArray(report?.[key]) ? report[key] : [];
      for (const entry of entries) {
        if (typeof entry === "string") {
          if (entry.includes(code)) {
            issues.push({ code, message: entry });
          }
        } else if (entry?.code === code) {
          issues.push(entry);
        }
      }
    }
  }
  return issues;
}

function toolCovered(tool, commandText) {
  const normalized = tool.replaceAll("_", "-").toLowerCase();
  const aliases = {
    rules: [" rules"],
    recommend_template: ["recommend-template", " template", " from-message-map", " new"],
    recommend_figure: [" figure"],
    generate_schematic: [" schematic", "from-message-map"],
    render_design_component: [" design render", "from-message-map"],
    generate_native_diagram: [" diagram-native", "from-message-map"],
    generate_visual_scaffold: [" visual-scaffold", "from-message-map"],
    plan_business_deck: [" business-plan"],
    finalize: [" finalize"],
    review: [" review"],
    polish: [" polish", " finalize"],
    "source-check": ["source-check"],
    source_check: ["source-check"],
    source: ["source-check"],
    pptx_zip_check: ["zip-check"],
    "pptx-zip-check": ["zip-check"]
  };
  const candidates = aliases[tool] ?? aliases[normalized] ?? [` ${normalized}`];
  return candidates.some((candidate) => commandText.toLowerCase().includes(candidate));
}

function inspectZip(file) {
  const bytes = readFileSync(file);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    return { exists: true, valid: false, entries: 0, zeroNonDir: null, size: bytes.length };
  }
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  let cursor = centralOffset;
  let zeroNonDir = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) {
      break;
    }
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name.endsWith("/") && compressedSize === 0 && uncompressedSize === 0) {
      zeroNonDir += 1;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { exists: true, valid: true, entries, zeroNonDir, size: bytes.length };
}

function fileHashIfExists(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    return null;
  }
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function evalSummaryMarkdown(report) {
  const lines = [`# Eval Summary: ${report.scenarioId}`, "", `Loop: ${report.loop}`, "", "## Scores", ""];
  for (const [key, value] of Object.entries(report.scores)) {
    lines.push(`- ${key}: ${value}/5`);
  }
  lines.push("", "## Slide Comments", "");
  for (const comment of report.slideComments ?? []) {
    lines.push(`### Slide ${comment.slideIndex}: ${comment.title}`);
    lines.push(`- Comment: ${comment.comment}`);
    lines.push(`- Would be better if: ${comment.wouldBeBetterIf}`);
    lines.push(`- Evidence: ${comment.evidence}`);
    lines.push("");
  }
  lines.push("", "## Patch Requests", "");
  if (report.patchRequests.length === 0) {
    lines.push("- None");
  } else {
    report.patchRequests.forEach((request, index) => {
      lines.push(`${index + 1}. **${request.severity}** ${request.problem}`);
      lines.push(`   Evidence: ${request.evidence}`);
      lines.push(`   Expected: ${request.expected}`);
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createLoopQaReport(loopNumber, maxLoops, scenarioResults) {
  const highOrCritical = scenarioResults.reduce((sum, result) => sum + result.highOrCriticalCount, 0);
  const patchRequests = scenarioResults.reduce((sum, result) => sum + result.patchRequestCount, 0);
  const expressionCraftAverage = scenarioResults.length
    ? scenarioResults.reduce((sum, result) => sum + (result.expressionCraft ?? 0), 0) / scenarioResults.length
    : 0;
  const informationDensityAverage = scenarioResults.length
    ? scenarioResults.reduce((sum, result) => sum + (result.informationDensity ?? 0), 0) / scenarioResults.length
    : 0;
  const designAmbitionAverage = scenarioResults.length
    ? scenarioResults.reduce((sum, result) => sum + (result.designAmbition ?? 0), 0) / scenarioResults.length
    : 0;
  const fingerprintCounts = countBy(scenarioResults.map((result) => result.expressionFingerprint).filter(Boolean));
  const repeatedFingerprintCount = Object.values(fingerprintCounts).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const repeatedFingerprintShare = scenarioResults.length ? repeatedFingerprintCount / scenarioResults.length : 0;
  const decision = loopNumber >= maxLoops ? "stop" : "continue";
  return {
    role: "QA Gatekeeper",
    model: "Opus4.8",
    loop: loopNumber,
    decision,
    exitCriteria: {
      type: "loop-count",
      current: loopNumber,
      target: maxLoops,
      met: loopNumber >= maxLoops
    },
    reasons: decision === "stop" ? [`Loop count reached ${maxLoops}.`] : [`Loop count ${loopNumber}/${maxLoops}; continue.`],
    patchRequestCount: patchRequests,
    highOrCriticalCount: highOrCritical,
    expressionCraft: {
      average: Number(expressionCraftAverage.toFixed(2)),
      repeatedFingerprintShare: Number(repeatedFingerprintShare.toFixed(2)),
      repeatedFingerprints: Object.fromEntries(Object.entries(fingerprintCounts).filter(([, count]) => count > 1))
    },
    informationDensity: { average: Number(informationDensityAverage.toFixed(2)) },
    designAmbition: { average: Number(designAmbitionAverage.toFixed(2)) },
    requiredNextWork: decision === "stop" ? [] : ["Apply dev-lead-plan.json to the next loop generation profile."],
    acceptedRisks: [
      ...(decision === "stop" && patchRequests > 0 ? ["Exit criterion is count-only for this run; outstanding PatchRequests remain for later development review."] : []),
      ...(repeatedFingerprintShare >= 0.5 ? ["Multiple scenarios share similar layout fingerprints; expression diversity should be improved in a future Dev Lead pass."] : [])
    ]
  };
}

function writeRunIndex(runDir, loops) {
  const lines = ["# Dev Loop Run", "", `Run directory: ${toPosixRelative(runDir)}`, "", "## Loops", ""];
  for (const loop of loops) {
    lines.push(`- [Loop ${String(loop.loop).padStart(2, "0")}](${path.posix.join(`loop-${String(loop.loop).padStart(2, "0")}`, "qa-report.json")}) - decision: ${loop.qa.decision}, patches: ${loop.qa.patchRequestCount}, high/critical: ${loop.qa.highOrCriticalCount}`);
  }
  lines.push("", "Review each loop directory to compare scenario outputs across iterations. Each scenario folder contains `deck.pptx`, `studio.html`, and `eval-summary.md`.", "");
  writeText(path.join(runDir, "index.md"), lines.join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = selectScenarios(readScenarios(), options.scenarios);
  const runDir = path.resolve(repoRoot, options.output);
  if (existsSync(runDir) && !options.force) {
    throw new Error(`Output directory already exists: ${runDir}. Use --force or choose another --output.`);
  }
  ensureDirectory(runDir);

  const runStartedAt = new Date().toISOString();
  const loopSummaries = [];
  let improvementState = initialImprovementState();
  writeJson(path.join(runDir, "run-config.json"), {
    startedAt: runStartedAt,
    loops: options.loops,
    scenarioCount: scenarios.length,
    scenarios: scenarios.map((scenario) => scenario.id),
    exitCriteria: { type: "loop-count", target: options.loops }
  });

  for (let loop = 1; loop <= options.loops; loop += 1) {
    const loopDir = path.join(runDir, `loop-${String(loop).padStart(2, "0")}`);
    ensureDirectory(loopDir);
    writeJson(path.join(loopDir, "input-improvement-state.json"), improvementState);
    const scenarioResults = scenarios.map((scenario) => runScenario(scenario, loop, loopDir, improvementState));
    const qa = createLoopQaReport(loop, options.loops, scenarioResults);
    const devLeadPlan = createDevLeadPlan(loop, options.loops, loopDir, qa, improvementState);
    const featureActions = (devLeadPlan.actions ?? []).filter((action) => action.kind === "feature-extension");
    const requiresProgramChange = options.stopOnFeatureActions && loop < options.loops && featureActions.length > 0;
    if (requiresProgramChange) {
      devLeadPlan.nextLoopWillApply = false;
      devLeadPlan.requiresProgramChange = true;
      devLeadPlan.stopReason = "feature-extension actions require pptcreater source changes before another generation loop.";
      devLeadPlan.requiredProgramChanges = featureActions.map((action) => ({
        id: action.id,
        reason: action.reason,
        suggestedScope: action.suggestedScope,
        developmentAgentPrompt: action.developmentAgentPrompt
      }));
    }
    const nextImprovementState = !requiresProgramChange && loop < options.loops ? applyDevLeadPlan(improvementState, devLeadPlan) : improvementState;
    writeJson(path.join(loopDir, "qa-report.json"), qa);
    writeJson(path.join(loopDir, "dev-lead-plan.json"), devLeadPlan);
    writeText(path.join(loopDir, "dev-lead-plan.md"), devLeadPlanMarkdown(devLeadPlan));
    writeJson(path.join(loopDir, "next-improvement-state.json"), nextImprovementState);
    writeJson(path.join(loopDir, "loop-summary.json"), { loop, scenarioResults, qa, devLeadPlan, nextImprovementState });
    loopSummaries.push({ loop, scenarioResults, qa, devLeadPlan, nextImprovementState });
    improvementState = nextImprovementState;
    console.log(`Loop ${loop}/${options.loops}: ${scenarioResults.length} scenarios, patches=${qa.patchRequestCount}, highOrCritical=${qa.highOrCriticalCount}, decision=${qa.decision}, actions=${devLeadPlan.actions.length}`);
    if (requiresProgramChange) {
      console.log(`Stopped after loop ${loop}: ${featureActions.length} feature-extension action(s) require Dev Lead source changes before continuing. Use --continue-with-feature-actions only for diagnostic runs.`);
      break;
    }
  }

  const finalQa = loopSummaries.at(-1)?.qa ?? null;
  writeJson(path.join(runDir, "final-qa-report.json"), finalQa);
  writeJson(path.join(runDir, "run-summary.json"), {
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
    loops: loopSummaries,
    finalQa,
    finalImprovementState: improvementState
  });
  writeRunIndex(runDir, loopSummaries);
  console.log(`Run artifacts written to ${toPosixRelative(runDir)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}

function isExpectedStructuredNonZero(command) {
  if (!command.json) {
    return false;
  }
  return command.command.includes(" review ") || command.command.includes(" finalize ");
}

function initialImprovementState() {
  return {
    forceExecutiveSummary: false,
    compactCopyLevel: 0,
    safeContrast: false,
    shortenTitles: false,
    reduceSlideDensity: false,
    expressionPolishLevel: 0,
    informationDensityLevel: 0,
    designAmbitionLevel: 0,
    experiments: {},
    appliedActions: []
  };
}

function collectBlockingCodes(loopDir) {
  const counts = new Map();
  for (const scenarioDir of readdirDirectories(loopDir)) {
    const reviewPath = path.join(scenarioDir, "review.txt");
    if (!existsSync(reviewPath)) {
      continue;
    }
    const review = parseJsonOutput(readFileSync(reviewPath, "utf8"));
    for (const issue of [...(review?.blocking ?? []), ...(review?.blockingIssues ?? [])]) {
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function collectQualityScores(loopDir) {
  const scores = [];
  for (const scenarioDir of readdirDirectories(loopDir)) {
    const reportPath = path.join(scenarioDir, "eval-report.json");
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    scores.push({
      informationDensity: report.deterministic?.informationDensity?.score ?? report.scores?.informationDensity ?? 0,
      designAmbition: report.deterministic?.designAmbition?.score ?? report.scores?.designAmbition ?? 0,
      expressionCraft: report.scores?.expressionCraft ?? 0
    });
  }
  return {
    informationDensityAverage: average(scores.map((score) => score.informationDensity)),
    designAmbitionAverage: average(scores.map((score) => score.designAmbition)),
    expressionCraftAverage: average(scores.map((score) => score.expressionCraft))
  };
}

function collectSlideCommentSynthesis(loopDir) {
  const comments = [];
  for (const scenarioDir of readdirDirectories(loopDir)) {
    const reportPath = path.join(scenarioDir, "eval-report.json");
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    for (const comment of report.slideComments ?? []) {
      comments.push({
        scenarioId: report.scenarioId ?? path.basename(scenarioDir),
        slideIndex: comment.slideIndex,
        slideId: comment.slideId,
        title: comment.title,
        layout: comment.layout,
        comment: comment.comment,
        wouldBeBetterIf: comment.wouldBeBetterIf,
        evidence: comment.evidence
      });
    }
  }

  const scenarioIds = new Set(comments.map((comment) => comment.scenarioId));
  const candidates = slideCommentThemes().map((theme) => {
    const matches = comments.filter((comment) => theme.pattern.test(slideCommentText(comment)));
    const scenarios = [...new Set(matches.map((comment) => comment.scenarioId))];
    return {
      id: theme.id,
      kind: "feature-extension",
      title: theme.title,
      priority: scenarios.length >= 5 || matches.length >= 10 ? "high" : matches.length >= 3 ? "medium" : "low",
      commentCount: matches.length,
      scenarioCount: scenarios.length,
      scenarioIds: scenarios.slice(0, 8),
      problemPattern: theme.problemPattern,
      proposedCapability: theme.proposedCapability,
      suggestedScope: theme.suggestedScope,
      developmentAgentPrompt: buildDevelopmentAgentPrompt(theme, matches),
      evidence: matches.slice(0, 5).map((comment) => ({
        scenarioId: comment.scenarioId,
        slideIndex: comment.slideIndex,
        slideId: comment.slideId,
        title: comment.title,
        comment: comment.comment,
        wouldBeBetterIf: comment.wouldBeBetterIf
      }))
    };
  }).filter((candidate) => candidate.commentCount > 0)
    .sort((a, b) => b.scenarioCount - a.scenarioCount || b.commentCount - a.commentCount || a.id.localeCompare(b.id));

  return {
    totalComments: comments.length,
    scenarioCount: scenarioIds.size,
    topCommentPatterns: candidates.slice(0, 6).map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      priority: candidate.priority,
      commentCount: candidate.commentCount,
      scenarioCount: candidate.scenarioCount,
      scenarioIds: candidate.scenarioIds
    })),
    featureExtensionCandidates: candidates.slice(0, 6),
    sampleComments: comments.slice(0, 10)
  };
}

function slideCommentText(comment) {
  return [comment.title, comment.layout, comment.comment, comment.wouldBeBetterIf, comment.evidence].filter(Boolean).join("\n");
}

function slideCommentThemes() {
  return [
    {
      id: "cover-audience-action-strip",
      title: "Cover slides need audience/action intent chips",
      pattern: /期待値|誰が何を判断|会議の緊張感/u,
      problemPattern: "Cover slides state the topic but do not make the audience, decision, or desired action visible in the first few seconds.",
      proposedCapability: "Add a cover/title-slide composition that extracts audience + desired action from ScenarioSpec/message-map and renders them as compact chips near the title.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/messageDeck.test.ts", "scripts/run-dev-loop.mjs"]
    },
    {
      id: "photo-annotation-overlay",
      title: "Photo-led slides need visible annotation overlays",
      pattern: /画像|写真|場面|何を見れば|写真主役|注目点/u,
      problemPattern: "Image/photo slides provide a visual entry point, but the image is not anchored to the argument with visible labels or captions.",
      proposedCapability: "Enhance photo-hero/focal-proof image layouts with an optional annotation badge, caption rail, or callout overlay derived from slide message/evidence.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/messageDeck.test.ts", "packages/core/src/layout.ts"]
    },
    {
      id: "claim-evidence-action-density",
      title: "Thin slides need claim/evidence/action scaffolds",
      pattern: /情報量が薄|要点だけ|判断するには|根拠、反証リスク、次の判断|中身のある/u,
      problemPattern: "Some slides are readable but too thin to support a decision on their own.",
      proposedCapability: "Introduce a compact claim/evidence/action scaffold for slides with low visible character density and no focal proof or large media.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/content.ts", "packages/core/src/messageDeck.test.ts"]
    },
    {
      id: "focal-card-hierarchy",
      title: "Card grids need one dominant focal card",
      pattern: /見慣れたカード|ステップの並び|大きな主役カード|視線の入口|無難な構成/u,
      problemPattern: "Card/step slides are structurally correct but visually generic because all cards have equal weight.",
      proposedCapability: "Add a focal-card variant that promotes one evidence or recommendation card to a larger dominant element while keeping supporting cards secondary.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/visualQuality.ts", "packages/core/src/messageDeck.test.ts"]
    },
    {
      id: "decision-axis-emphasis",
      title: "Structural diagrams need explicit decision emphasis",
      pattern: /構造を図解|図の軸|関係がさらに鋭く|どこを選ぶべき|何が対立|判断が分かれる/u,
      problemPattern: "Matrix/map/flow slides show structure, but the decisive axis or choice point is not highlighted enough.",
      proposedCapability: "Route structural visuals through a decision-emphasis layer that highlights the recommended zone, conflict line, or choice node with a visible label.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/figureSelector.ts", "packages/diagram/src/index.ts"]
    },
    {
      id: "oversized-proof-number",
      title: "Evidence slides need oversized proof numbers",
      pattern: /数字や比較の見せ方|数値を1つだけ大きく|数値や比較を主役化|focalProof=false/u,
      problemPattern: "KPI/comparison slides mention evidence but do not consistently create a memorable proof-number focal point.",
      proposedCapability: "Add or strengthen a focal-proof layout that selects the strongest numeric evidence and renders it as an oversized proof number with a short why-it-matters note.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/messageDeck.test.ts", "docs/dev-loop-evaluator-criteria.md"]
    },
    {
      id: "closing-action-checklist",
      title: "Closing slides need owner/date/artifact next-action checklists",
      pattern: /期限・担当|確認物が見える|次アクションを「担当|会議後にそのまま使えるチェック/u,
      problemPattern: "Closing slides ask for action but do not always expose owner, due date, and artifact/checkpoint structure.",
      proposedCapability: "Add a closing/action slide pattern that renders next actions as owner/date/artifact checklist rows when the deck has decision or business-plan intent.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/messageDeck.test.ts"]
    }
  ];
}

function buildDevelopmentAgentPrompt(theme, matches) {
  const examples = matches.slice(0, 3).map((comment) => `- ${comment.scenarioId} slide ${comment.slideIndex} (${comment.title}): ${comment.wouldBeBetterIf}`).join("\n") || "- No concrete examples captured.";
  return [
    `Implement feature extension: ${theme.title}.`,
    `Problem pattern: ${theme.problemPattern}`,
    `Desired capability: ${theme.proposedCapability}`,
    `Suggested scope: ${theme.suggestedScope.join(", ")}`,
    "Evidence from scenario slide comments:",
    examples,
    "Add or update focused tests that fail before the change, then run the dev-loop smoke for the affected scenario family."
  ].join("\n");
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(2)) : 0;
}

function shouldTryExperiment(state, id) {
  const experiment = state.experiments?.[id];
  return !experiment || experiment.status === "accepted" || (experiment.status === "active" && (experiment.loopsTried ?? 0) < 2);
}

function shouldRevertExperiment(state, id, currentScore) {
  const experiment = state.experiments?.[id];
  return experiment?.status === "active" && (experiment.loopsTried ?? 0) >= 2 && currentScore <= (experiment.startScore ?? 0) + 0.25;
}

function markExperiment(state, id, loopNumber, startScore) {
  const experiments = { ...(state.experiments ?? {}) };
  const existing = experiments[id];
  experiments[id] = {
    id,
    status: "active",
    startedAtLoop: existing?.startedAtLoop ?? loopNumber,
    startScore: existing?.status === "active" ? existing.startScore : startScore,
    loopsTried: (existing?.status === "active" ? existing.loopsTried ?? 0 : 0) + 1
  };
  return experiments;
}

function closeExperiment(state, id, status) {
  const experiments = { ...(state.experiments ?? {}) };
  experiments[id] = { ...(experiments[id] ?? { id }), status };
  return experiments;
}

function readdirDirectories(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name)) : [];
}

function createDevLeadPlan(loopNumber, maxLoops, loopDir, qa, currentState) {
  const blockingCodes = collectBlockingCodes(loopDir);
  const qualitySummary = collectQualityScores(loopDir);
  const slideCommentSynthesis = collectSlideCommentSynthesis(loopDir);
  const actions = [];

  if ((blockingCodes["business.executive-summary-missing"] ?? 0) > 0 && !currentState.forceExecutiveSummary) {
    actions.push({
      id: "force-executive-summary",
      kind: "bugfix",
      reason: "Business review repeatedly expects an early executive summary for important decks.",
      changes: { forceExecutiveSummary: true }
    });
  }

  if ((blockingCodes["visual.truncated-text"] ?? 0) > 0 || (blockingCodes["layout.compact-label-wrap"] ?? 0) > 0) {
    actions.push({
      id: "compact-copy-and-labels",
      kind: "bugfix+expression-improvement",
      reason: "Text truncation and label wrapping indicate the generated copy is too dense for the chosen visual grammar.",
      changes: {
        compactCopyLevel: Math.min(3, Math.max(currentState.compactCopyLevel ?? 0, 1) + 1),
        reduceSlideDensity: true
      }
    });
  }

  if ((blockingCodes["text.low-contrast"] ?? 0) > 0 && !currentState.safeContrast) {
    actions.push({
      id: "safe-contrast-style",
      kind: "bugfix",
      reason: "Low contrast findings mean the next loop should prefer a safer high-contrast style profile.",
      changes: { safeContrast: true }
    });
  }

  if ((blockingCodes["content.title-too-long"] ?? 0) > 0 && !currentState.shortenTitles) {
    actions.push({
      id: "shorten-slide-titles",
      kind: "bugfix+expression-improvement",
      reason: "Long titles reduce scanability and trigger content review blockers.",
      changes: { shortenTitles: true }
    });
  }

  if (qualitySummary.informationDensityAverage < 4.5 && shouldTryExperiment(currentState, "raise-information-density")) {
    actions.push({
      id: "raise-information-density",
      kind: "challenging-quality-experiment",
      reason: "Reference decks carry more visible substance per slide: claim, supporting detail, and next action. Try richer evidence and less over-compression.",
      changes: {
        informationDensityLevel: Math.min(2, (currentState.informationDensityLevel ?? 0) + 1),
        reduceSlideDensity: false,
        experiments: markExperiment(currentState, "raise-information-density", loopNumber, qualitySummary.informationDensityAverage)
      }
    });
  } else if (shouldRevertExperiment(currentState, "raise-information-density", qualitySummary.informationDensityAverage)) {
    actions.push({
      id: "revert-information-density-experiment",
      kind: "experiment-revert",
      reason: "Information-density experiment did not improve after repeated loops; revert to the previous density level.",
      changes: {
        informationDensityLevel: Math.max(0, (currentState.informationDensityLevel ?? 0) - 1),
        experiments: closeExperiment(currentState, "raise-information-density", "reverted")
      }
    });
  }

  if (qualitySummary.designAmbitionAverage < 4.75 && shouldTryExperiment(currentState, "raise-design-ambition")) {
    actions.push({
      id: "raise-design-ambition",
      kind: "challenging-quality-experiment",
      reason: "Reference decks use bolder moves: photo-led spreads, oversized proof numbers, dramatic scale contrast, and spatial metaphors. Try a more ambitious visual strategy next loop.",
      changes: {
        designAmbitionLevel: Math.min(3, (currentState.designAmbitionLevel ?? 0) + 1),
        expressionPolishLevel: Math.min(5, Math.max(currentState.expressionPolishLevel ?? 0, 3)),
        experiments: markExperiment(currentState, "raise-design-ambition", loopNumber, qualitySummary.designAmbitionAverage)
      }
    });
  } else if (shouldRevertExperiment(currentState, "raise-design-ambition", qualitySummary.designAmbitionAverage)) {
    actions.push({
      id: "revert-design-ambition-experiment",
      kind: "experiment-revert",
      reason: "Design-ambition experiment did not improve after repeated loops; revert rather than compounding ineffective stylistic churn.",
      changes: {
        designAmbitionLevel: Math.max(0, (currentState.designAmbitionLevel ?? 0) - 1),
        experiments: closeExperiment(currentState, "raise-design-ambition", "reverted")
      }
    });
  }

  actions.push({
    id: "increase-expression-polish",
    kind: "expression-improvement",
    reason: "Every loop should improve not just correctness but also clarity, scanability, and visual presentation.",
    changes: { expressionPolishLevel: Math.min(5, (currentState.expressionPolishLevel ?? 0) + 1) }
  });

  for (const candidate of slideCommentSynthesis.featureExtensionCandidates.filter((item) => item.priority !== "low").slice(0, 3)) {
    actions.push({
      id: `feature-${candidate.id}`,
      kind: "feature-extension",
      reason: `${candidate.title}: ${candidate.commentCount} slide comments across ${candidate.scenarioCount} scenarios indicate a reusable tool capability gap, not a one-off deck issue.`,
      changes: {},
      suggestedScope: candidate.suggestedScope,
      developmentAgentPrompt: candidate.developmentAgentPrompt,
      evidence: candidate.evidence.slice(0, 3)
    });
  }

  const developmentAgentHandoff = {
    targetAgent: "pptcreater Dev Lead",
    purpose: "Convert repeated scenario slide comments into concrete pptcreater feature-extension work items.",
    featureExtensionCandidates: slideCommentSynthesis.featureExtensionCandidates.slice(0, 5).map((candidate) => ({
      id: candidate.id,
      priority: candidate.priority,
      title: candidate.title,
      commentCount: candidate.commentCount,
      scenarioCount: candidate.scenarioCount,
      suggestedScope: candidate.suggestedScope,
      developmentAgentPrompt: candidate.developmentAgentPrompt
    }))
  };

  return {
    role: "Development Lead",
    loop: loopNumber,
    model: "host-selected",
    qaDecision: qa.decision,
    exitCriteriaMet: qa.exitCriteria.met,
    blockingCodes,
    qualitySummary,
    slideCommentSynthesis,
    featureExtensionCandidates: slideCommentSynthesis.featureExtensionCandidates,
    developmentAgentHandoff,
    actions,
    nextLoopWillApply: loopNumber < maxLoops,
    risks: actions.length === 0 ? ["No automatic improvement actions were selected."] : []
  };
}

function applyDevLeadPlan(currentState, plan) {
  const nextState = {
    ...currentState,
    appliedActions: [...(currentState.appliedActions ?? [])]
  };
  for (const action of plan.actions ?? []) {
    const changes = action.changes ?? {};
    if (changes.experiments) {
      nextState.experiments = { ...(nextState.experiments ?? {}), ...changes.experiments };
      const { experiments, ...rest } = changes;
      Object.assign(nextState, rest);
    } else {
      Object.assign(nextState, changes);
    }
    nextState.appliedActions.push({ loop: plan.loop, id: action.id, kind: action.kind, changes: action.changes });
  }
  return nextState;
}

function devLeadPlanMarkdown(plan) {
  const lines = ["# Dev Lead Plan", "", `Loop: ${plan.loop}`, "", "## Blocking Codes", ""];
  const entries = Object.entries(plan.blockingCodes ?? {});
  if (entries.length === 0) {
    lines.push("- none");
  } else {
    for (const [code, count] of entries) {
      lines.push(`- \`${code}\`: ${count}`);
    }
  }
  lines.push("", "## Actions", "");
  for (const action of plan.actions ?? []) {
    lines.push(`- **${action.kind}** \`${action.id}\`: ${action.reason}`);
    if (action.developmentAgentPrompt) {
      lines.push(`  - Dev handoff: ${action.developmentAgentPrompt.split("\n")[0]}`);
    }
  }
  lines.push("", "## Slide Comment Synthesis", "");
  const patterns = plan.slideCommentSynthesis?.topCommentPatterns ?? [];
  if (patterns.length === 0) {
    lines.push("- none");
  } else {
    for (const pattern of patterns) {
      lines.push(`- **${pattern.priority}** \`${pattern.id}\`: ${pattern.commentCount} comments / ${pattern.scenarioCount} scenarios`);
    }
  }
  lines.push("", "## Development Agent Handoff", "");
  const candidates = plan.developmentAgentHandoff?.featureExtensionCandidates ?? [];
  if (candidates.length === 0) {
    lines.push("- none");
  } else {
    for (const candidate of candidates) {
      lines.push(`### ${candidate.id}`);
      lines.push("");
      lines.push("```text");
      lines.push(candidate.developmentAgentPrompt);
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("", `Next loop will apply: ${plan.nextLoopWillApply}`, "");
  return `${lines.join("\n")}\n`;
}

function evaluateStandaloneClarity(deck) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for standalone clarity evaluation." };
  }

  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const weakSlides = [];
  for (const slide of bodySlides) {
    const visibleTexts = (slide.elements ?? []).filter((element) => element.type === "text").map((element) => element.text ?? "").filter(Boolean);
    const joined = visibleTexts.join(" ");
    const hasSentence = /[。.!?！？]/u.test(joined) || /(する|した|できる|ある|いる|なる|進める|示す|伝える|確認する|選ぶ)/u.test(joined);
    const hasSubstance = /[A-Za-z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]{4,}/u.test(joined);
    const vagueOnly = visibleTexts.some((text) => /^(対象|観点|表現|候補|比較|要約|現状|補完|Scene|SECTION)$/u.test(text.trim())) && visibleTexts.length <= 5;
    const cutOff = visibleTexts.some((text) => /…$/.test(text.trim()) || /(?:、|と|の|に|を|が|は|で|へ)$/.test(text.trim()));
    if (!hasSubstance || !hasSentence || vagueOnly || cutOff) {
      weakSlides.push(`${slide.id}:${slide.layout}`);
    }
  }
  const weakShare = bodySlides.length ? weakSlides.length / bodySlides.length : 1;
  const score = weakShare === 0 ? 5 : weakShare <= 0.15 ? 4 : weakShare <= 0.3 ? 3 : weakShare <= 0.5 ? 2 : 1;
  return {
    score,
    evidence: `standaloneClarity=${score}/5; bodySlides=${bodySlides.length}; weakSlides=${weakSlides.length}; weakShare=${weakShare.toFixed(2)}; examples=${weakSlides.slice(0, 6).join(", ") || "none"}`
  };
}

function evaluateTextCompleteness(deck) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for text completeness evaluation." };
  }

  const problems = [];
  for (const slide of deck.slides ?? []) {
    for (const element of slide.elements ?? []) {
      if (element.type !== "text") continue;
      const text = String(element.text ?? "").trim();
      if (!text) continue;
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const lineIssue = lines.some((line, index) => hasIncompleteLineText(line, { isLast: index === lines.length - 1 }));
      if (hasIncompleteVisibleText(text) || lineIssue) {
        problems.push(`${slide.id}:${element.id}:${text.replace(/\s+/g, " ")}`);
      }
    }
  }

  const score = problems.length === 0 ? 5 : problems.length <= 2 ? 3 : 1;
  return {
    score,
    evidence: `textCompleteness=${score}/5; problemTexts=${problems.length}; examples=${problems.slice(0, 6).join(" | ") || "none"}`
  };
}

function hasIncompleteVisibleText(text) {
  const normalized = normalizeVisibleTextForCompleteness(text);
  if (!normalized) return false;
  if (isStructuredLabelList(normalized)) return false;
  if (/…|\.\.\./u.test(normalized)) return true;
  if (/[、,，・／/:：]$/u.test(normalized)) return true;
  if (/[をにのへでがはと]$/u.test(normalized) && normalized.length > 4) return true;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(normalized) && /[、,，]/u.test(normalized) && normalized.length <= 24 && !/[。.!?！？]$/u.test(normalized)) {
    return /[経予承判移計検確対候施研責]$/u.test(normalized) && !/(計画|判断|承認|移行|検討|確認|候補|施策|研究|責任者)$/u.test(normalized);
  }
  return false;
}

function hasIncompleteLineText(text, options = {}) {
  const normalized = normalizeVisibleTextForCompleteness(text);
  if (!normalized) return false;
  if (isStructuredLabelList(normalized)) return false;
  if (/…|\.\.\./u.test(normalized)) return true;
  if (/[・／/:：]$/u.test(normalized)) return true;
  if (options.isLast && /[、,，]$/u.test(normalized)) return true;
  return false;
}

function normalizeVisibleTextForCompleteness(text) {
  return String(text)
    .trim()
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])\s+([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu, "$1$2");
}

function isStructuredLabelList(text) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return /[、,，・／/]/u.test(normalized) && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9]{2,}/u.test(normalized);
}