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
const scenarioResearchPath = path.join(repoRoot, "docs", "dev-loop-scenario-research.json");

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

function readScenarioResearch() {
  if (!existsSync(scenarioResearchPath)) {
    return { scenarios: {} };
  }
  return JSON.parse(readFileSync(scenarioResearchPath, "utf8").replace(/^\uFEFF/u, ""));
}

function attachScenarioResearch(scenario, researchCatalog) {
  const research = researchCatalog?.scenarios?.[scenario.id];
  if (!research) return scenario;
  return {
    ...scenario,
    research,
    sourceHints: [...(scenario.sourceHints ?? []), ...(research.sourceUrls ?? [])]
  };
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
    ...(scenario.officialSources ?? []),
    ...(scenario.research?.sourceUrls ?? [])
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
      let visualType = visualTypeForExpression(expression, index, profile, scenario, topic);
      if (visualType === "image" && !shouldUseGeneratedImage(scenario, topic)) {
        visualType = nativeVisualFallbackForTopic(topic, index);
      }
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
  const layoutDiversityLevel = improvementState.layoutDiversityLevel ?? 0;
  const baseEvidenceMax = compactCopyLevel >= 2 ? 2 : compactCopyLevel >= 1 ? 3 : 4;
  return {
    name: [
      loopNumber <= 1 ? "baseline" : "adaptive",
      compactCopyLevel > 0 ? "compact-copy" : null,
      improvementState.forceExecutiveSummary ? "executive-summary" : null,
      improvementState.safeContrast ? "safe-contrast" : null,
      expressionPolishLevel > 0 ? `expression-polish-${expressionPolishLevel}` : null,
      informationDensityLevel > 0 ? `information-density-${informationDensityLevel}` : null,
      designAmbitionLevel > 0 ? `design-ambition-${designAmbitionLevel}` : null,
      layoutDiversityLevel > 0 ? `layout-diversity-${layoutDiversityLevel}` : null
    ].filter(Boolean).join("+"),
    includeExecutiveSummary: loopNumber >= 2 || Boolean(improvementState.forceExecutiveSummary),
    compactCopy: compactCopyLevel > 0,
    compactCopyLevel,
    informationDensityLevel,
    designAmbitionLevel,
    layoutDiversityLevel,
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
  if (String(topic).toLowerCase().includes("executive")) return "summary";
  const context = [scenario.userRequest, scenario.purpose, scenario.audience, topic, value].filter(Boolean).join(" ").toLowerCase();
  const localContext = [topic, value].filter(Boolean).join(" ").toLowerCase();
  const expectsRealism = /採用|会社|事例|顧客|製品|現場|患者|家族|旅館|不動産|小売|npo|office|customer|product|case|recruit|community|patient|family|hotel|retail/u.test(context);
  const expectsProof = /kpi|roi|売上|数字|指標|実績|成果|効果|予算|費用|gmv|budget|finance|traction|impact/u.test(localContext);
  if (/roadmap|timeline|gantt|calendar|step|checklist|ロードマップ|導入|実行|移行/u.test(localContext)) return "step";
  if (/risk|governance|architecture|diagram|map|stakeholder|dependency|リスク|構造|関係|判断/u.test(localContext)) return "native-diagram";
  if (expectsRealism && index === 1) return nativeVisualFallbackForTopic(topic, index);
  if (expectsProof && index % 3 === 0) return "summary";
  if (/case|事例|顧客|customer|product|製品|採用|現場/u.test(localContext)) return index <= 2 ? nativeVisualFallbackForTopic(topic, index) : "cards";
  if ((profile.layoutDiversityLevel ?? 0) >= 1) {
    const diverseRotation = ["summary", "matrix", "step", "native-diagram", "before-after", "cycle", "flow", "contrast", "cards"];
    return diverseRotation[(index + (profile.layoutDiversityLevel ?? 0)) % diverseRotation.length];
  }
  if ((profile.designAmbitionLevel ?? 0) >= 1) {
    const slot = (index + (profile.designAmbitionLevel ?? 0)) % 7;
    if (value.includes("section") || value.includes("chapter")) return "section";
    if (/写真|現場|顧客|事例|採用|会社|患者|家族|旅館|office|customer|case|recruit|photo/.test(context) || slot === 1) return nativeVisualFallbackForTopic(topic, index);
    if (expectsProof || slot === 2) return "summary";
    if (/関係|体験|循環|journey|concept|system|portfolio/.test(context) || slot === 3) return "cycle";
    if (/プロセス|構造|アーキテクチャ|移行|ロードマップ|workflow|architecture|roadmap|migration/.test(context) || slot === 4) return "native-diagram";
    if (slot === 5) return "matrix";
    if (slot === 6) return "flow";
  }
  if ((profile.expressionPolishLevel ?? 0) >= 1) {
    if (expectsRealism && index % 4 === 1) return nativeVisualFallbackForTopic(topic, index);
    if (expectsProof && index % 3 === 0) return "summary";
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

function shouldUseGeneratedImage(scenario, topic) {
  const imagePrompts = scenario.research?.imagePrompts ?? [];
  if (!Array.isArray(imagePrompts) || imagePrompts.length === 0) return false;
  const normalizedTopic = normalizeMatchText(topic);
  return imagePrompts.some((prompt) => normalizeMatchText(prompt.topic ?? prompt).includes(normalizedTopic) || normalizedTopic.includes(normalizeMatchText(prompt.topic ?? prompt)));
}

function visualAssetForScenario(scenario, topic, index) {
  const title = shorten(topic, 28);
  const audience = audienceLabel(scenario.audience);
  const visual = semanticVisualSpec(scenario, topic);
  const colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe"];
  const fill = colors[index % colors.length];
  const accent = ["#1860c5", "#0f7a43", "#8a5a0c", "#be185d", "#6d28d9"][index % 5];
  const labels = visual.labels.slice(0, 3);
  return {
    type: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640"><rect width="960" height="640" rx="44" fill="${fill}"/><rect x="70" y="74" width="820" height="492" rx="38" fill="#fff" opacity="0.9"/><rect x="104" y="112" width="350" height="112" rx="24" fill="${accent}" opacity="0.95"/><text x="132" y="178" font-family="Yu Gothic, Meiryo, sans-serif" font-size="42" font-weight="700" fill="#fff">${escapeSvg(visual.heading)}</text><text x="104" y="286" font-family="Yu Gothic, Meiryo, sans-serif" font-size="34" font-weight="700" fill="#111827">${escapeSvg(title)}</text><text x="106" y="336" font-family="Yu Gothic, Meiryo, sans-serif" font-size="24" fill="#374151">${escapeSvg(audience)}</text>${labels.map((label, labelIndex) => `<g transform="translate(${130 + labelIndex * 250} 420)"><rect width="210" height="76" rx="20" fill="${labelIndex === 0 ? accent : "#f8fafc"}" stroke="${accent}" stroke-width="4" opacity="${labelIndex === 0 ? "0.95" : "1"}"/><circle cx="38" cy="38" r="18" fill="${labelIndex === 0 ? "#fff" : accent}" opacity="0.9"/><text x="72" y="47" font-family="Yu Gothic, Meiryo, sans-serif" font-size="24" font-weight="700" fill="${labelIndex === 0 ? "#fff" : "#111827"}">${escapeSvg(label)}</text></g>`).join("")}<path d="M126 382h696" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.28"/></svg>`,
    altText: `${title} contextual visual`,
    placement: index % 2 === 0 ? "right" : "left",
    caption: `${visual.heading} / ${labels.join(" / ")}`
  };
}

function semanticVisualSpec(scenario, topic) {
  const context = [scenario.id, scenario.userRequest, scenario.purpose, scenario.audience, topic, ...(scenario.requiredExpressions ?? [])].filter(Boolean).join(" ").toLowerCase();
  if (/copilot|prompt|tips|プロンプト|便利tips|チーム/.test(context)) return { heading: "実践ワークフロー", labels: ["Prompt", "Review", "Team"] };
  if (/security|zero trust|ciso|脅威|セキュリティ/.test(context)) return { heading: "リスク低減", labels: ["Threat", "Identity", "Response"] };
  if (/ryokan|hakone|旅館|温泉/.test(context)) return { heading: "家族で選ぶ", labels: ["温泉", "食事", "アクセス"] };
  if (/startup|investor|pitch|seed|投資家/.test(context)) return { heading: "投資家の記憶", labels: ["Problem", "Traction", "Ask"] };
  if (/ai adoption|生成ai|copilot|governance/.test(context)) return { heading: "AI導入判断", labels: ["Use case", "Data", "Govern"] };
  if (/qbr|saas|customer success/.test(context)) return { heading: "顧客成果", labels: ["Usage", "Outcome", "Next"] };
  if (/onboarding|new hire|新入|オンボーディング/.test(context)) return { heading: "初週の動き", labels: ["環境", "レビュー", "初PR"] };
  if (/migration|cloud|クラウド|移行/.test(context)) return { heading: "移行ゲート", labels: ["現状", "リスク", "承認"] };
  if (/incident|postmortem|障害/.test(context)) return { heading: "学びへ変える", labels: ["検知", "復旧", "再発防止"] };
  if (/npo|fundraising|寄付|地域/.test(context)) return { heading: "支援の循環", labels: ["課題", "活動", "寄付"] };
  if (/roadmap|ロードマップ/.test(context)) return { heading: "優先順位", labels: ["顧客", "テーマ", "依存"] };
  if (/quality|manufacturing|不良|品質/.test(context)) return { heading: "品質改善", labels: ["不良", "原因", "対策"] };
  if (/healthcare|telehealth|患者|診療/.test(context)) return { heading: "安心して使う", labels: ["予約", "診察", "支払い"] };
  if (/real estate|住み替え|エリア/.test(context)) return { heading: "暮らし比較", labels: ["通勤", "学校", "価格"] };
  if (/research|conference|研究/.test(context)) return { heading: "研究の筋道", labels: ["問い", "方法", "結果"] };
  if (/retail|campaign|小売|キャンペーン/.test(context)) return { heading: "売場で動く", labels: ["商品", "販促", "店舗"] };
  if (/budget|finance|予算/.test(context)) return { heading: "予算判断", labels: ["差異", "要因", "打ち手"] };
  if (/policy|public sector|自治体|政策/.test(context)) return { heading: "合意形成", labels: ["影響", "選択肢", "費用"] };
  if (/mobile app|app launch|アプリ/.test(context)) return { heading: "ローンチ導線", labels: ["ターゲット", "機能", "KPI"] };
  if (/learning|学習/.test(context)) return { heading: "続く学習", labels: ["目標", "予定", "支援"] };
  return { heading: "要点の構造", labels: ["背景", "根拠", "次" ] };
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
  const researchSeed = researchSeedForTopic(scenario, topic);
  if (researchSeed?.message) {
    return trimTrailingFragment(shorten(normalizeResearchMessage(researchSeed.message), profile.compactCopy ? 34 : 44));
  }
  const subject = titleForTopic(topic, { titleMax: profile.compactCopy ? 20 : 28 });
  if (String(topic).toLowerCase().includes("executive")) {
    return "結論、重要性、次の判断を先に示す。";
  }
  if ((profile.informationDensityLevel ?? 0) >= 2) {
    return `${subject}の判断材料を短く示す。`;
  }
  if ((profile.informationDensityLevel ?? 0) >= 1) {
    return `${subject}の論点と根拠を示す。`;
  }
  if (profile.expressionPolishLevel >= 2) {
    return `${subject}の要点と判断軸を示す。`;
  }
  if (profile.compactCopy) {
    return `${subject}を判断に使える形にする。`;
  }
  return `${subject}を整理し、次の判断材料にする。`;
}

function normalizeResearchMessage(value) {
  return String(value ?? "")
    .replace(/だけでなく、/gu, "も含め、")
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])と([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu, "$1・$2")
    .replace(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])、([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/gu, "$1・$2");
}

function evidenceForTopic(topic, scenario, expression, profile) {
  const audience = trimTrailingFragment(profile.compactCopyLevel >= 2 ? audienceLabel(scenario.audience) : shorten(scenario.audience ?? "対象者", profile.compactCopy ? 18 : 28));
  const tone = trimTrailingFragment(shorten(scenario.tone ?? "標準", profile.compactCopy ? 12 : 20));
  const point = trimTrailingFragment(shorten(topic, profile.compactCopy ? 20 : 28));
  const researchSeed = researchSeedForTopic(scenario, topic);
  const researchedEvidence = (researchSeed?.evidence ?? []).map((item) => trimTrailingFragment(shorten(item, profile.compactCopy ? 28 : 42)));
  const isSummaryTopic = String(topic).toLowerCase().includes("executive");
  const summaryProof = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test([scenario.purpose, scenario.audience, topic].filter(Boolean).join(" ")) ? "3つの判断論点" : "3 decision points";
  if ((profile.informationDensityLevel ?? 0) >= 1) {
    const denseEvidence = [
      ...researchedEvidence,
      `材料: ${point}`,
      `読み手: ${audience}`,
      `行動: ${trimTrailingFragment(shorten(scenario.purpose ?? "判断", 24))}`,
      `表現: ${expressionLabel(expression)}`,
      `トーン: ${tone}`
    ];
    return (isSummaryTopic ? [summaryProof, ...denseEvidence] : denseEvidence).slice(0, profile.evidenceMax ?? 5);
  }
  const evidence = [
    ...researchedEvidence,
    `対象: ${audience}`,
    `観点: ${trimTrailingFragment(shorten(topic, profile.compactCopy ? 18 : 24))}`,
    `根拠: ${expressionLabel(expression)}`,
    `次判断: ${trimTrailingFragment(shorten(scenario.purpose ?? "判断", 18))}`,
    `口調: ${tone}`
  ];
  return (isSummaryTopic ? [summaryProof, ...evidence] : evidence).slice(0, profile.evidenceMax ?? 4);
}

function researchSeedForTopic(scenario, topic) {
  const seeds = scenario.research?.slideSeeds ?? [];
  if (!Array.isArray(seeds) || seeds.length === 0) return null;
  const normalizedTopic = normalizeMatchText(topic);
  return seeds.find((seed) => {
    const seedTopic = normalizeMatchText(seed.topic);
    const keywords = (seed.keywords ?? []).map(normalizeMatchText);
    return seedTopic.includes(normalizedTopic) || normalizedTopic.includes(seedTopic) || keywords.some((keyword) => keyword && (keyword.includes(normalizedTopic) || normalizedTopic.includes(keyword)));
  }) ?? null;
}

function normalizeMatchText(value) {
  return String(value ?? "").toLowerCase().replace(/[-_／/\s]+/g, "").trim();
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

  const visualEvidence = writeVisualSnapshots(reviewTarget, scenarioDir);

  const zip = existsSync(pptxFile) ? inspectZip(pptxFile) : { exists: false, zeroNonDir: null, entries: 0 };
  const hashes = {
    deckJson: fileHashIfExists(deckFile),
    polishedDeckJson: fileHashIfExists(polishedFile),
    pptx: fileHashIfExists(pptxFile)
  };
  const evalReport = evaluateScenario(scenario, loopNumber, commands, zip, hashes, visualEvidence);
  const userReport = {
    role: "User Simulator",
    scenarioId: scenario.id,
    loop: loopNumber,
    model: "host-selected",
    artifacts: artifactList(scenarioDir),
    commands: commands.map(({ command, exitCode, outputFile }) => ({ command, exitCode, outputFile })),
    fixRequests: evalReport.fixRequests,
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
    fixRequestCount: evalReport.fixRequests.length,
    openFixesCount: evalReport.fixRequests.length,
    expressionCraft: evalReport.scores.expressionCraft,
    informationDensity: evalReport.scores.informationDensity,
    designAmbition: evalReport.scores.designAmbition,
    expressionFingerprint: evalReport.deterministic.expressionCraft?.fingerprint,
    hashes
  };
}

function artifactList(dir) {
  const files = ["scenario.json", "message-map.json", "source-check.txt", "deck.json", "polished.deck.json", "deck.pptx", "studio.html", "visual-snapshots/contact-sheet.html", "visual-snapshots/visual-report.json", "review.txt", "finalize.txt", "tool-ledger.json", "eval-report.json"];
  return files.filter((file) => existsSync(path.join(dir, file))).map((file) => toPosixRelative(path.join(dir, file)));
}

function writeVisualSnapshots(deckFile, scenarioDir) {
  const deck = loadJsonIfExists(deckFile);
  const snapshotDir = path.join(scenarioDir, "visual-snapshots");
  ensureDirectory(snapshotDir);
  const reportFile = path.join(snapshotDir, "visual-report.json");
  if (!deck?.slides) {
    const result = {
      available: false,
      evidence: `No DeckSpec available for visual snapshots: ${toPosixRelative(deckFile)}`,
      directory: toPosixRelative(snapshotDir),
      contactSheet: null,
      slideImages: [],
      audit: { score: 1, blockingIssues: [], sampleQualityIssues: [] }
    };
    writeJson(reportFile, result);
    return result;
  }

  const slideImages = deck.slides.map((slide, index) => {
    const file = path.join(snapshotDir, `slide-${String(index + 1).padStart(2, "0")}.svg`);
    writeText(file, renderSlideSnapshotSvg(slide, index));
    return {
      slideIndex: index + 1,
      slideId: slide.id ?? `slide-${index + 1}`,
      title: slide.title ?? slide.id ?? `Slide ${index + 1}`,
      image: toPosixRelative(file)
    };
  });
  const audit = auditVisualSnapshots(deck, slideImages);
  const contactSheet = path.join(snapshotDir, "contact-sheet.html");
  writeText(contactSheet, renderVisualContactSheet(deck, slideImages, audit));
  const result = {
    available: true,
    evidence: `Visual snapshots generated: ${slideImages.length} SVG slide images plus contact sheet.`,
    directory: toPosixRelative(snapshotDir),
    contactSheet: toPosixRelative(contactSheet),
    slideImages,
    audit
  };
  writeJson(reportFile, result);
  return result;
}

function renderSlideSnapshotSvg(slide, index) {
  const width = 13.333;
  const height = 7.5;
  const background = slide.background?.color ?? "#ffffff";
  const elements = [...(slide.elements ?? [])].sort((a, b) => (a.readingOrder ?? 0) - (b.readingOrder ?? 0));
  const body = elements.map(renderSnapshotElement).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}"/>
  <text x="0.18" y="0.28" font-family="Segoe UI, Yu Gothic, Meiryo, sans-serif" font-size="0.13" fill="#6b7280">visual snapshot slide ${index + 1}: ${escapeXml(slide.title ?? slide.id ?? "untitled")}</text>
${body}
</svg>\n`;
}

function renderSnapshotElement(element) {
  if (element.type === "shape") return renderSnapshotShape(element);
  if (element.type === "text") return renderSnapshotText(element);
  if (element.type === "svg" || element.type === "diagram") return renderSnapshotSvgImage(element.svg, element, element.type);
  if (element.type === "image") return renderSnapshotImage(element);
  return `  <rect x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}" fill="none" stroke="#9ca3af" stroke-dasharray="0.06 0.06"/>`;
}

function renderSnapshotShape(element) {
  const fill = element.fill === "none" ? "none" : escapeXml(element.fill ?? "none");
  const stroke = escapeXml(element.line?.color ?? element.fill ?? "#d1d5db");
  const opacity = element.fillOpacity == null ? "" : ` fill-opacity="${num(element.fillOpacity)}"`;
  if (element.shape === "line") {
    return `  <line x1="${num(element.x)}" y1="${num(element.y)}" x2="${num(element.x + element.w)}" y2="${num(element.y + element.h)}" stroke="${stroke}" stroke-width="${num((element.line?.width ?? 1) / 72)}"/>`;
  }
  if (element.shape === "ellipse" || element.shape === "oval") {
    return `  <ellipse cx="${num(element.x + element.w / 2)}" cy="${num(element.y + element.h / 2)}" rx="${num(element.w / 2)}" ry="${num(element.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="0.01"${opacity}/>`;
  }
  if (element.shape === "rightArrow" || element.shape === "arrow") {
    const x = element.x;
    const y = element.y;
    const w = element.w;
    const h = element.h;
    const points = `${num(x)},${num(y)} ${num(x + w * 0.72)},${num(y)} ${num(x + w)},${num(y + h / 2)} ${num(x + w * 0.72)},${num(y + h)} ${num(x)},${num(y + h)}`;
    return `  <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="0.01"${opacity}/>`;
  }
  const radius = element.radius ?? 0.06;
  return `  <rect x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}" rx="${num(radius)}" fill="${fill}" stroke="${stroke}" stroke-width="0.01"${opacity}/>`;
}

function renderSnapshotText(element) {
  const fontSize = element.fontSize ?? (element.role === "title" ? 31 : element.role === "caption" ? 12 : 18);
  const fontInches = fontSize / 72;
  const lineHeight = fontInches * 1.18;
  const lines = snapshotTextLines(element, fontSize);
  const align = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
  const x = element.align === "center" ? element.x + element.w / 2 : element.align === "right" ? element.x + element.w : element.x;
  const y = element.y + fontInches;
  const weight = element.bold ? "700" : "400";
  const color = escapeXml(element.color ?? "#111827");
  const tspans = lines.map((line, index) => `<tspan x="${num(x)}" dy="${index === 0 ? 0 : num(lineHeight)}">${escapeXml(line)}</tspan>`).join("");
  return [
    `  <clipPath id="clip-${escapeXml(element.id)}"><rect x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}"/></clipPath>`,
    `  <text clip-path="url(#clip-${escapeXml(element.id)})" x="${num(x)}" y="${num(y)}" font-family="Segoe UI, Yu Gothic, Meiryo, sans-serif" font-size="${num(fontInches)}" font-weight="${weight}" text-anchor="${align}" fill="${color}">${tspans}</text>`
  ].join("\n");
}

function renderSnapshotSvgImage(svg, element, label) {
  if (!svg) {
    return renderSnapshotPlaceholder(element, label);
  }
  const href = `data:image/svg+xml;base64,${Buffer.from(String(svg), "utf8").toString("base64")}`;
  return `  <image x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}" href="${href}" preserveAspectRatio="xMidYMid meet"/>`;
}

function renderSnapshotImage(element) {
  if (element.dataUri) {
    return `  <image x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}" href="${escapeXml(element.dataUri)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return renderSnapshotPlaceholder(element, "image");
}

function renderSnapshotPlaceholder(element, label) {
  return [
    `  <rect x="${num(element.x)}" y="${num(element.y)}" width="${num(element.w)}" height="${num(element.h)}" fill="#f3f4f6" stroke="#9ca3af" stroke-dasharray="0.06 0.06"/>`,
    `  <text x="${num(element.x + element.w / 2)}" y="${num(element.y + element.h / 2)}" font-family="Segoe UI, sans-serif" font-size="0.16" text-anchor="middle" fill="#6b7280">${escapeXml(label)}</text>`
  ].join("\n");
}

function renderVisualContactSheet(deck, slideImages, audit) {
  const cards = slideImages.map((image) => {
    const issues = [...audit.blockingIssues, ...audit.sampleQualityIssues].filter((issue) => issue.slideId === image.slideId);
    const issueList = issues.length ? `<ul>${issues.map((issue) => `<li>${escapeHtml(issue.kind)}: ${escapeHtml(issue.message)}</li>`).join("")}</ul>` : "<p>No image-audit issues.</p>";
    return `<section><h2>${image.slideIndex}. ${escapeHtml(image.title)}</h2><img src="${path.basename(image.image)}" alt="${escapeHtml(image.title)} visual snapshot"/>${issueList}</section>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Visual snapshot contact sheet</title><style>body{font-family:Segoe UI,Yu Gothic,sans-serif;margin:24px;background:#f8fafc;color:#111827}section{break-inside:avoid;background:white;border:1px solid #d1d5db;border-radius:8px;margin:0 0 18px;padding:14px;box-shadow:0 1px 2px #0001}img{width:640px;max-width:100%;border:1px solid #e5e7eb}li{margin:4px 0}</style></head><body><h1>${escapeHtml(deck.title ?? "Deck")} visual snapshot contact sheet</h1>${cards}</body></html>\n`;
}

function evaluateVisualImageEvidence(deck, visualEvidence) {
  if (visualEvidence?.audit) {
    return {
      available: Boolean(visualEvidence.available),
      evidence: visualEvidence.evidence ?? "visual evidence unavailable",
      score: visualEvidence.audit.score,
      contactSheet: visualEvidence.contactSheet,
      blockingIssues: visualEvidence.audit.blockingIssues ?? [],
      sampleQualityIssues: visualEvidence.audit.sampleQualityIssues ?? []
    };
  }
  if (!deck?.slides) {
    return { available: false, evidence: "No deck or visual snapshots were available.", score: 1, contactSheet: null, blockingIssues: [], sampleQualityIssues: [] };
  }
  const audit = auditVisualSnapshots(deck, []);
  return { available: false, evidence: "No generated visual snapshot artifacts were available.", score: audit.score, contactSheet: null, blockingIssues: audit.blockingIssues, sampleQualityIssues: audit.sampleQualityIssues };
}

function auditVisualSnapshots(deck, slideImages) {
  const imageBySlide = new Map(slideImages.map((image) => [image.slideId, image.image]));
  const blockingIssues = [];
  const sampleQualityIssues = [];
  for (const [index, slide] of (deck.slides ?? []).entries()) {
    const slideId = slide.id ?? `slide-${index + 1}`;
    const image = imageBySlide.get(slideId) ?? `visual-snapshots/slide-${String(index + 1).padStart(2, "0")}.svg`;
    const textElements = (slide.elements ?? []).filter((element) => element.type === "text" && !element.decorative);
    for (const element of textElements) {
      const overflow = estimateSnapshotTextOverflow(element);
      if (overflow.overflows) {
        blockingIssues.push({ kind: "overflow", slideId, image, message: `Text "${shorten(String(element.text ?? ""), 34)}" is likely clipped or wrapped beyond its visible box (${overflow.estimatedLines}/${overflow.maxLines} lines).` });
      }
      if ((element.fontSize ?? 12) < 11.5 && String(element.text ?? "").length > 8) {
        blockingIssues.push({ kind: "tiny-text", slideId, image, message: `Text "${shorten(String(element.text ?? ""), 34)}" is visually too small for reliable screenshot reading.` });
      }
    }
    for (const issue of overlappingTextIssues(textElements, slideId, image)) {
      blockingIssues.push(issue);
    }
    for (const issue of overlappingVisualObjectIssues(slide, slideId, image)) {
      blockingIssues.push(issue);
    }
    if (!isNonBodySlide(slide)) {
      const largeMedia = hasLargeMedia(slide);
      const focalProof = hasFocalProof(slide);
      const spatialModel = hasSpatialModel(slide);
      const dominant = hasDominantFocalElement(slide);
      const textCount = textElements.length;
      if (!largeMedia && !focalProof && !dominant && !(spatialModel && hasDramaticScaleContrast(slide))) {
        sampleQualityIssues.push({ kind: "no-focal-visual", slideId, image, message: "Rendered snapshot lacks a clear visual focal point; it reads like generic text/cards rather than a sample-grade slide." });
      }
      if (textCount >= 14 && !largeMedia && !focalProof) {
        sampleQualityIssues.push({ kind: "crowded", slideId, image, message: `Rendered snapshot has ${textCount} text elements without a strong visual anchor, making it hard to scan.` });
      }
      const equalCards = equalCardCount(slide);
      if (equalCards >= 5 && !dominant) {
        sampleQualityIssues.push({ kind: "equal-card-grid", slideId, image, message: `Rendered snapshot uses ${equalCards} similarly sized cards without a dominant card or visual hierarchy.` });
      }
      for (const issue of simpleShapeSvgIssues(slide, slideId, image)) {
        sampleQualityIssues.push(issue);
      }
    }
  }
  const score = blockingIssues.length > 0 ? 2 : sampleQualityIssues.length > 0 ? 3 : 5;
  return { score, blockingIssues, sampleQualityIssues };
}

function isNonBodySlide(slide) {
  return ["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? "");
}

function estimateSnapshotTextOverflow(element) {
  const fontSize = element.fontSize ?? (element.role === "title" ? 31 : element.role === "caption" ? 12 : 18);
  const lines = snapshotTextLines(element, fontSize);
  const maxLines = Math.max(1, Math.floor((element.h * 72) / (fontSize * 1.18)));
  return { overflows: lines.length > maxLines, estimatedLines: lines.length, maxLines };
}

function snapshotTextLines(element, fontSize) {
  const maxUnits = Math.max(2, (element.w * 72) / (fontSize * 0.54));
  const result = [];
  for (const hardLine of String(element.text ?? "").split(/\r?\n/)) {
    let current = "";
    let units = 0;
    for (const char of Array.from(hardLine)) {
      const charUnits = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(char) ? 1.0 : /\s/u.test(char) ? 0.35 : 0.56;
      if (current && units + charUnits > maxUnits) {
        result.push(current);
        current = char;
        units = charUnits;
      } else {
        current += char;
        units += charUnits;
      }
    }
    result.push(current || " ");
  }
  return result;
}

function overlappingTextIssues(textElements, slideId, image) {
  const issues = [];
  for (let leftIndex = 0; leftIndex < textElements.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < textElements.length; rightIndex += 1) {
      const left = textElements[leftIndex];
      const right = textElements[rightIndex];
      if (isTinyGeneratedLabel(left) || isTinyGeneratedLabel(right)) continue;
      const area = intersectionArea(left, right);
      const smaller = Math.max(0.01, Math.min(left.w * left.h, right.w * right.h));
      if (area / smaller > 0.18) {
        issues.push({ kind: "overlap", slideId, image, message: `Text "${shorten(left.text, 24)}" visually overlaps "${shorten(right.text, 24)}" in the rendered snapshot.` });
      }
    }
  }
  return issues;
}

function overlappingVisualObjectIssues(slide, slideId, image) {
  const elements = slide.elements ?? [];
  const mediaElements = elements.filter(isRenderedMediaElement);
  const issues = [];
  for (const media of mediaElements) {
    for (const other of elements) {
      if (other === media || other.decorative || isIntentionalMediaOverlay(media, other)) continue;
      if (other.type !== "text" && !isRenderedMediaElement(other)) continue;
      const area = intersectionArea(media, other);
      if (area <= 0) continue;
      const smaller = Math.max(0.01, Math.min(media.w * media.h, other.w * other.h));
      const ratio = area / smaller;
      if (other.type === "text" && ratio > 0.12) {
        issues.push({ kind: "media-text-overlap", slideId, image, message: `Rendered media "${media.id}" overlaps text "${shorten(other.text, 28)}"; image placement makes the slide hard to read.` });
      } else if (isRenderedMediaElement(other) && ratio > 0.08) {
        issues.push({ kind: "media-overlap", slideId, image, message: `Rendered media "${media.id}" overlaps "${other.id}"; visual objects are colliding in the slide image.` });
      }
    }
  }
  return issues;
}

function simpleShapeSvgIssues(slide, slideId, image) {
  const issues = [];
  for (const element of slide.elements ?? []) {
    if (element.type !== "svg" || element.decorative || element.w < 3.5 || element.h < 2.5) continue;
    const svg = String(element.svg ?? "");
    const rects = (svg.match(/<rect\b/giu) ?? []).length;
    const circles = (svg.match(/<circle\b|<ellipse\b/giu) ?? []).length;
    const texts = (svg.match(/<text\b/giu) ?? []).length;
    const richerChartOrImage = /<image\b|<defs\b|linearGradient|radialGradient|<polygon\b|<polyline\b|data-allow-raster-visual/iu.test(svg);
    if (!richerChartOrImage && rects + circles >= 3 && texts >= 2) {
      issues.push({ kind: "simple-shape-svg", slideId, image, message: `Large SVG "${element.id}" is composed of simple shapes/text; prefer editable native PPTX objects unless the generated image is materially richer than native shapes.` });
    }
  }
  return issues;
}

function isRenderedMediaElement(element) {
  return ["svg", "image", "diagram", "smartart"].includes(element.type) && !element.decorative && element.w >= 0.5 && element.h >= 0.5;
}

function isIntentionalMediaOverlay(media, other) {
  const mediaId = String(media.id ?? "");
  const otherId = String(other.id ?? "");
  const mediaRoot = mediaId.replace(/-(?:photo|visual-asset|image|diagram|svg).*$/u, "");
  if (!mediaRoot || !otherId.startsWith(mediaRoot)) return false;
  return /annotation|caption|badge|label|kicker|proof|title/u.test(otherId);
}

function isTinyGeneratedLabel(element) {
  return /eyebrow|kicker|index|number|step-label|flow-label|focal-label|relation/u.test(element.id ?? "") || /^(SLIDE|STEP|FOCUS|SCENE|NEXT ACTION|FIRST DECISION|FOCAL PROOF)/iu.test(String(element.text ?? ""));
}

function intersectionArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function equalCardCount(slide) {
  const cards = (slide.elements ?? []).filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.3 && element.h >= 0.55);
  const buckets = countBy(cards.map((card) => `${Math.round(card.w * 10)}x${Math.round(card.h * 10)}`));
  return Math.max(0, ...Object.values(buckets));
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function escapeHtml(value) {
  return escapeXml(value);
}

function num(value) {
  return Number(value).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

function evaluateScenario(scenario, loopNumber, commands, zip, hashes, visualEvidence) {
  const fixRequests = [];
  const failedCommands = commands.filter((command) => command.exitCode !== 0 && !isExpectedStructuredNonZero(command));
  for (const failed of failedCommands) {
    fixRequests.push({
      problem: "A required pptcreater CLI command failed during scenario generation.",
      evidence: `${failed.command} exited ${failed.exitCode}; see ${failed.outputFile}`,
      expected: "Scenario artifacts should be generated without command failures.",
      suggestedScope: ["packages/cli", "packages/core", "packages/render-pptx"]
    });
  }

  if (zip.exists && zip.zeroNonDir !== 0) {
    fixRequests.push({
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
  const sampleQuality = evaluateSampleQuality(deckJson, scenario);
  const standaloneClarity = evaluateStandaloneClarity(deckJson);
  const textCompleteness = evaluateTextCompleteness(deckJson);
  const visualImageReview = evaluateVisualImageEvidence(deckJson, visualEvidence);
  const slideComments = buildSlideComments(deckJson, scenario, finalizeJson, reviewJson);
  const reviewBlocking = reviewJson?.blocking?.length ?? reviewJson?.blockingIssues?.length ?? 0;
  const reviewOk = reviewJson?.ok ?? (reviewBlocking === 0);
  if (!reviewOk || reviewBlocking > 0) {
    fixRequests.push({
      problem: "Aggregated review found blocking issues.",
      evidence: `blocking=${reviewBlocking}; see review.txt`,
      expected: "Review should report ok=true with no blocking issues for generated scenarios.",
      suggestedScope: ["packages/core/src/lint.ts", "packages/core/src/director.ts", "packages/core/src/messageDeck.ts"]
    });
  }

  const badLineBreaks = lintIssuesByCode(finalizeJson, reviewJson, "layout.bad-line-break");
  if (badLineBreaks.length > 0) {
    fixRequests.push({
      problem: "Generated slides contain broken line breaks or visually cut-off text.",
      evidence: badLineBreaks.slice(0, 6).map((issue) => `${issue.path ?? "unknown"}: ${issue.message ?? issue.code}`).join(" | "),
      expected: "Evaluator should fail slides whose visible text breaks into orphan particles, dangling continuations, or cutoff-looking lines.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/layout.ts", "scripts/run-dev-loop.mjs"]
    });
  }

  if (!visualImageReview.available) {
    fixRequests.push({
      problem: "Rendered slide images were not available for visual evaluation.",
      evidence: visualImageReview.evidence,
      expected: "Evaluator must inspect rendered slide images or visual snapshots, not only DeckSpec object presence, before accepting visual quality.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "packages/studio", "packages/render-pptx"]
    });
  }

  if (visualImageReview.blockingIssues.length > 0) {
    fixRequests.push({
      problem: "Rendered slide images show readability blockers such as overlap, overflow, clipping, or visually crowded text.",
      evidence: visualImageReview.blockingIssues.slice(0, 8).map((issue) => `${issue.slideId}: ${issue.message} (${issue.image})`).join(" | "),
      expected: "Any visible overlap, clipping, text overflow, or hard-to-read crowding seen in rendered images must be treated as a required fix.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/layout.ts", "scripts/run-dev-loop.mjs"]
    });
  }

  if (visualImageReview.sampleQualityIssues.length > 0) {
    fixRequests.push({
      problem: "Rendered slide images do not look close enough to sample-slide quality.",
      evidence: visualImageReview.sampleQualityIssues.slice(0, 8).map((issue) => `${issue.slideId}: ${issue.message} (${issue.image})`).join(" | "),
      expected: "Rendered images should show professional hierarchy, intentional visual focal points, varied compositions, and enough polish to avoid generic template feel.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/templates.ts", "design-packs", "scripts/run-dev-loop.mjs"]
    });
  }

  const requiredTools = new Set(scenario.requiredTools ?? []);
  const commandText = commands.map((command) => command.command).join("\n");
  const missingRequiredTools = [...requiredTools].filter((tool) => !toolCovered(tool, commandText));
  if (missingRequiredTools.length > 0) {
    fixRequests.push({
      problem: "Scenario required tools were not fully exercised by the deterministic runner.",
      evidence: `missing=${missingRequiredTools.join(", ")}`,
      expected: "The loop runner or User Simulator should exercise every ScenarioSpec.requiredTools entry or record a justified waiver.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md", ".github/agents/pptcreater-dev-user.agent.md"]
    });
  }

  const sourceExpected = requiredTools.has("source-check") || (scenario.requiredExpressions ?? []).some((expression) => String(expression).includes("source"));
  const sourceCheckFile = findScenarioArtifact(commands, "source-check", "source-check.txt");
  if (sourceExpected && !sourceCheckFile) {
    fixRequests.push({
      problem: "Source-backed scenario needs live source verification that the deterministic runner cannot infer from placeholders.",
      evidence: "Scenario expects source-check or source-note; source-check.txt was not recorded.",
      expected: "User Simulator should collect official source URLs or record a deterministic source-check waiver for source-backed decks.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md"]
    });
  }

  if (expressionCraft.score < 3) {
    fixRequests.push({
      problem: "Generated deck lacks scenario-specific expressive craft.",
      evidence: expressionCraft.evidence,
      expected: "Decks should vary their expressive strategy by scenario, using sample-derived tactics such as anchored realism, focal proof, spatial models, deliberate repetition, deck rhythm, or brand materiality.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/visualQuality.ts", "scripts/run-dev-loop.mjs", ".github/agents/pptcreater-dev-evaluator.agent.md"]
    });
  }

  if (informationDensity.score < 3) {
    fixRequests.push({
      problem: "Generated deck is too thin in visible information density.",
      evidence: informationDensity.evidence,
      expected: "Slides should carry enough visible context, evidence, and next-action information to feel substantive, like the reference decks that combine claim, support, and visual proof on one slide.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "packages/core/src/messageDeck.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (designAmbition.score < 3) {
    fixRequests.push({
      problem: "Generated deck is visually safe but not ambitious enough.",
      evidence: designAmbition.evidence,
      expected: "The loop should attempt bolder visual strategies such as photo-led spreads, oversized proof numbers, strong spatial models, deliberate repetition, and dramatic scale contrast; ineffective attempts should be reverted after comparison.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "packages/core/src/messageDeck.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (standaloneClarity.score < 3) {
    fixRequests.push({
      problem: "Generated slides are not understandable from visible output alone.",
      evidence: standaloneClarity.evidence,
      expected: "Each slide should be understandable from visible title, message, labels, and visual content without reading generation scripts, scenario files, speaker notes, or quiet metadata.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/content.ts", "docs/dev-loop-evaluator-criteria.md"]
    });
  }

  if (textCompleteness.score < 5) {
    fixRequests.push({
      problem: "Generated visible text contains incomplete or meaning-breaking fragments.",
      evidence: textCompleteness.evidence,
      expected: "Every visible text element, including cover titles and labels, should read as a complete understandable phrase or sentence rather than ending mid-word, mid-phrase, or after dangling punctuation.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/layout.ts", "scripts/run-dev-loop.mjs"]
    });
  }

  for (const item of sampleQuality.fixItems) {
    fixRequests.push({
      problem: item.problem,
      evidence: item.evidence,
      expected: item.expected,
      suggestedScope: item.suggestedScope
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
      sampleQuality,
      visualImageReview,
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
      sampleQuality: Math.min(sampleQuality.score, visualImageReview.score),
      editability: Math.min(reviewScore, zipScore),
      accessibility: reviewJson?.scores?.accessibility ? Math.round(reviewJson.scores.accessibility / 20) : reviewScore,
      toolDiscipline: Math.min(toolCoverage, commandScore)
    },
    slideComments,
    fixRequests,
    reviewNotes: fixRequests.length === 0 ? [] : ["Every fix request is expected to be addressed by generator, template, diagram, icon, preset, guidance, or related pptcreater program changes before the loop is considered improved."]
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
  const largeVisual = bodySlides.filter(hasLargeVisualAnchor).length;
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

function evaluateSampleQuality(deck, scenario) {
  if (!deck?.slides) {
    return {
      score: 1,
      evidence: "deck.json was not available for sample-quality evaluation.",
      axes: {},
      fixItems: [sampleQualityFix("artifact-unavailable", "Generated deck artifact is unavailable for sample-quality review.", "deck.json was not available.", ["scripts/run-dev-loop.mjs"])]
    };
  }

  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const allElements = deck.slides.flatMap((slide) => slide.elements ?? []);
  const bodyElements = bodySlides.flatMap((slide) => slide.elements ?? []);
  const fills = allElements.filter((element) => element.type === "shape" && typeof element.fill === "string" && element.fill !== "none").map((element) => String(element.fill).toLowerCase());
  const uniqueFills = new Set(fills);
  const paleDefaultFills = fills.filter((fill) => ["#f6f8fb", "#eeece1", "#d9eaf7", "#eaf2dd", "#fff2cc", "#f2dcdb", "#e4dfec"].includes(fill)).length;
  const defaultFillShare = fills.length ? paleDefaultFills / fills.length : 1;
  const layouts = bodySlides.map((slide) => slide.layout ?? "unknown");
  const layoutCounts = countBy(layouts);
  const dominantLayoutShare = bodySlides.length ? Math.max(...Object.values(layoutCounts)) / bodySlides.length : 1;
  const largeMedia = bodySlides.filter(hasLargeMedia).length;
  const largeVisual = bodySlides.filter(hasLargeVisualAnchor).length;
  const focalProof = bodySlides.filter(hasFocalProof).length;
  const spatialModel = bodySlides.filter(hasSpatialModel).length;
  const deliberateRepetition = bodySlides.filter(hasDeliberateRepetition).length;
  const dramaticScale = bodySlides.filter(hasDramaticScaleContrast).length;
  const titleTexts = bodyElements.filter((element) => element.type === "text" && element.role === "title").map((element) => String(element.text ?? ""));
  const genericTitleShare = titleTexts.length ? titleTexts.filter((text) => /^(overview|current state|target state|risk|cost|features|summary|要約|比較|現状|課題|効果)$/iu.test(text.trim())).length / titleTexts.length : 1;
  const shapeCount = bodyElements.filter((element) => element.type === "shape").length;
  const svgCount = bodyElements.filter((element) => element.type === "svg" || element.type === "image" || element.type === "diagram").length;
  const scenarioText = [scenario.userRequest, scenario.purpose, scenario.audience, ...(scenario.requiredExpressions ?? [])].filter(Boolean).join(" ").toLowerCase();
  const expectsRealism = /採用|会社|事例|顧客|製品|現場|患者|旅館|不動産|小売|npo|community|customer|product|case|recruit|patient|hotel|real estate|retail/.test(scenarioText);

  const axes = {
    colorSophistication: scoreAxis(uniqueFills.size >= 6 && defaultFillShare <= 0.72, `uniqueFills=${uniqueFills.size}; defaultFillShare=${defaultFillShare.toFixed(2)}`),
    diagramVariety: scoreAxis(new Set(layouts).size >= Math.min(5, bodySlides.length) && dominantLayoutShare <= 0.45, `layoutDiversity=${new Set(layouts).size}; dominantLayoutShare=${dominantLayoutShare.toFixed(2)}`),
    storyClarity: scoreAxis(genericTitleShare <= 0.25 && deck.slides.some((slide) => slide.layout === "cover") && deck.slides.some((slide) => slide.layout === "closing"), `genericTitleShare=${genericTitleShare.toFixed(2)}; hasCover=${deck.slides.some((slide) => slide.layout === "cover")}; hasClosing=${deck.slides.some((slide) => slide.layout === "closing")}`),
    shapeCraft: scoreAxis(dramaticScale >= 2 && deliberateRepetition >= 2 && spatialModel >= Math.min(3, bodySlides.length), `dramaticScale=${dramaticScale}; deliberateRepetition=${deliberateRepetition}; spatialModel=${spatialModel}; shapeCount=${shapeCount}`),
    typographyMateriality: scoreAxis(bodyElements.some((element) => element.type === "text" && (element.fontSize ?? 0) >= 31) && bodyElements.some((element) => element.type === "text" && (element.fontSize ?? 0) <= 13), `hasLargeType=${bodyElements.some((element) => element.type === "text" && (element.fontSize ?? 0) >= 31)}; hasSmallType=${bodyElements.some((element) => element.type === "text" && (element.fontSize ?? 0) <= 13)}`),
    templateFreshness: scoreAxis((largeVisual > 0 || !expectsRealism) && (focalProof > 0 || /kpi|roi|予算|費用|売上|数字|finance|budget/.test(scenarioText)) && svgCount >= Math.max(1, Math.floor(bodySlides.length * 0.4)), `largeVisual=${largeVisual}; largeMedia=${largeMedia}; focalProof=${focalProof}; svgOrImage=${svgCount}; expectsRealism=${expectsRealism}`)
  };

  const fixItems = [];
  if (axes.colorSophistication.score < 5) {
    fixItems.push(sampleQualityFix("color-sophistication", "Colors look generic, pale, or unsophisticated compared with the sample slides.", axes.colorSophistication.evidence, ["packages/core/src/messageDeck.ts", "packages/core/src/templates.ts", "design-packs"]));
  }
  if (axes.diagramVariety.score < 5) {
    fixItems.push(sampleQualityFix("diagram-variety", "Diagrams do not vary enough across scenarios and still feel like the same card/table/flow template.", axes.diagramVariety.evidence, ["packages/core/src/messageDeck.ts", "packages/core/src/figureSelector.ts", "packages/diagram/src/index.ts", "design-packs"]));
  }
  if (axes.storyClarity.score < 5) {
    fixItems.push(sampleQualityFix("story-clarity", "The story does not carry a clear setup, tension, proof, and action arc like the sample decks.", axes.storyClarity.evidence, ["packages/core/src/messageDeck.ts", "packages/core/src/content.ts", "docs/dev-loop-test-scenarios.md"]));
  }
  if (axes.shapeCraft.score < 5) {
    fixItems.push(sampleQualityFix("shape-craft", "The slide still reads like amateur rectangles/icons rather than a professionally composed visual system.", axes.shapeCraft.evidence, ["packages/core/src/messageDeck.ts", "packages/diagram/src/index.ts", "packages/assets-svg", "design-packs"]));
  }
  if (axes.typographyMateriality.score < 5) {
    fixItems.push(sampleQualityFix("typography-materiality", "Typography and material feel remain flat or low-quality; the deck lacks deliberate type hierarchy and texture.", axes.typographyMateriality.evidence, ["packages/core/src/messageDeck.ts", "packages/core/src/typography.ts", "packages/core/src/templates.ts"]));
  }
  if (axes.templateFreshness.score < 5) {
    fixItems.push(sampleQualityFix("template-freshness", "The deck still feels template-like instead of scenario-specific and sample-quality.", axes.templateFreshness.evidence, ["packages/core/src/messageDeck.ts", "templates", "design-packs", "packages/core/src/figureSelector.ts"]));
  }

  const score = Math.max(1, Math.round(Object.values(axes).reduce((sum, axis) => sum + axis.score, 0) / Object.keys(axes).length));
  return {
    score,
    axes,
    fixItems,
    evidence: `sampleQuality=${score}/5; ${Object.entries(axes).map(([key, axis]) => `${key}=${axis.score} (${axis.evidence})`).join("; ")}`
  };
}

function scoreAxis(pass, evidence) {
  return { score: pass ? 5 : 2, evidence };
}

function sampleQualityFix(id, problem, evidence, suggestedScope) {
  return {
    id: `sample-quality-${id}`,
    problem,
    evidence,
    expected: "Bring generated slides closer to the sample-slide quality: stylish color discipline, non-generic diagrams, clear narrative arc, professional shape composition, deliberate typography/material feel, and scenario-specific visual strategy.",
    suggestedScope
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
  const textElements = (slide.elements ?? []).filter((element) => element.type === "text");
  const blockingHints = issueHints.filter(isBlockingSlideIssue);
  const issueSummary = blockingHints.slice(0, 2).map((issue) => `${issue.code ?? "issue"}: ${issue.message ?? issue.path ?? "review finding"}`).join(" / ");
  const hasBlockingIssue = blockingHints.length > 0;
  const largeMedia = hasLargeMedia(slide);
  const focalProof = hasFocalProof(slide);
  const spatialModel = hasSpatialModel(slide);
  const dramaticScale = hasDramaticScaleContrast(slide);
  const cards = (slide.elements ?? []).filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.5 && element.h >= 0.8).length;
  const scenarioNeed = [scenario.userRequest, scenario.purpose, scenario.audience, ...(scenario.requiredExpressions ?? [])].filter(Boolean).join(" ").toLowerCase();
  const slideText = proofCandidateText(textElements).toLowerCase();
  const slideHasNumericProof = /\d[\d,.]*(?:\.\d+)?\s*(?:%|倍|億|万|円|pt|ポイント|件|人|社|年|ヶ月|月|日)?|[一二三四五六七八九十]割|半減|倍増|削減|増加|減少/u.test(slideText);

  if (hasBlockingIssue) {
    return {
      comment: `${topic}は重大な表示品質の問題があり、読者が内容へ入る前に可読性や信頼感で止まる可能性があります。`,
      wouldBeBetterIf: `該当箇所を修正したうえで、同じスライドに主張・根拠・次の判断が一目で残るように再配置するともっと良くなります。`,
      evidence: `${blockingHints.length} blocking-like issue(s): ${issueSummary}`
    };
  }

  if (layout === "cover") {
    const hasIntentChips = hasCoverIntentChips(slide);
    if (hasIntentChips) {
      return {
        comment: `表紙はテーマに加えて読者と到達行動が見え、会議用途の入口として成立しています。`,
        wouldBeBetterIf: `タグの文言をさらに短くし、主題語と判断行動の対比を強めると、初見の読み取りがさらに速くなります。`,
        evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}; intentChips=${hasIntentChips}`
      };
    }
    return {
      comment: `表紙はテーマを示していますが、聞き手が最初の3秒で期待値を持つには、読者と到達行動の見せ方がまだ控えめです。`,
      wouldBeBetterIf: `タイトルの横に「誰が何を判断する資料か」を短いタグで置き、表紙から会議の緊張感や用途が伝わるともっと良くなります。`,
      evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}`
    };
  }

  if (layout === "closing") {
    const hasChecklist = hasClosingActionChecklist(slide);
    if (hasChecklist) {
      return {
        comment: `締めスライドは担当・期限・確認物がカード化され、会議後の行動に移しやすい構成です。`,
        wouldBeBetterIf: `各カードの値をシナリオ固有の担当名、具体日付、確認資料名に寄せると、さらに実務で使いやすくなります。`,
        evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}; actionChecklist=${hasChecklist}`
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

  const dominantFocalElement = hasDominantFocalElement(slide);
  if (/message-statement|message-table|message-flow|message-steps/u.test(layout) && cards >= 3 && !dominantFocalElement && !largeMedia && !focalProof && !dramaticScale) {
    return {
      comment: `${topic}は情報整理として成立していますが、見慣れたカードやステップの並びに寄っており、発見や驚きは弱めです。`,
      wouldBeBetterIf: `1つだけ大きな主役カードを作る、または写真・大きな数値・対立構図のどれかを加えて視線の入口を作るともっと良くなります。`,
      evidence: `layout=${layout}; cards=${cards}; dominantFocalElement=${dominantFocalElement}; dramaticScale=${dramaticScale}; spatialModel=${spatialModel}`
    };
  }

  const decisionEmphasis = hasDecisionEmphasis(slide);
  if (/message-matrix|message-hub-map|message-concept|message-before-after/u.test(layout) && !decisionEmphasis) {
    return {
      comment: `${topic}は構造を図解で示せていますが、図の軸や関係がさらに鋭くなる余地があります。`,
      wouldBeBetterIf: `単なる分類ではなく、「どこを選ぶべきか」「何が対立しているか」「どこで判断が分かれるか」を図の中に1つ強調するともっと良くなります。`,
      evidence: `layout=${layout}; spatialModel=${spatialModel}; decisionEmphasis=${decisionEmphasis}; visibleChars=${visibleChars}`
    };
  }

  const photoAnnotation = hasPhotoAnnotation(slide);
  if (largeMedia && !photoAnnotation) {
    return {
      comment: `${topic}は視覚の入口がありますが、画像や場面が資料の論点とより強く結びつく余地があります。`,
      wouldBeBetterIf: `画像の上に短いキャプションや注目点を重ね、読者が「何を見ればよいか」まで分かる写真主役スライドにするともっと良くなります。`,
      evidence: `layout=${layout}; largeMedia=${largeMedia}; photoAnnotation=${photoAnnotation}; visibleChars=${visibleChars}`
    };
  }

  if (!focalProof && /kpi|roi|売上|数字|指標|実績|効果|比較|予算|費用|gmv|budget|finance/u.test(scenarioNeed) && slideHasNumericProof) {
    return {
      comment: `${topic}は判断材料を示していますが、数字や比較の見せ方をさらに主役化できます。`,
      wouldBeBetterIf: `最も重要な数値を1つだけ大きく置き、その横に「なぜ重要か」を短く添えると、記憶に残るスライドになります。`,
      evidence: `layout=${layout}; focalProof=${focalProof}; dramaticScale=${dramaticScale}; slideHasNumericProof=${slideHasNumericProof}`
    };
  }

  if (dominantFocalElement || largeMedia || focalProof || (spatialModel && dramaticScale)) {
    return {
      comment: `${topic}は視覚的な核があり、スライド単体でも構造を追いやすい状態です。`,
      wouldBeBetterIf: `核となる要素と補助情報の距離、余白、色の強弱をさらに詰めると、サンプルスライドに近い完成度になります。`,
      evidence: `layout=${layout}; dominantFocalElement=${dominantFocalElement}; largeMedia=${largeMedia}; focalProof=${focalProof}; spatialModel=${spatialModel}; dramaticScale=${dramaticScale}`
    };
  }

  return {
    comment: `${topic}は主張と最低限の根拠が見えますが、まだ無難な構成に収まっています。`,
    wouldBeBetterIf: `読み手が思わず立ち止まる主役要素を1つ決め、写真・数値・比喩図・章扉のどれかへ大胆に寄せるともっと良くなります。`,
    evidence: `layout=${layout}; visibleChars=${visibleChars}; textElements=${textCount}; largeMedia=${largeMedia}; focalProof=${focalProof}; spatialModel=${spatialModel}`
  };
}

function proofCandidateText(textElements) {
  return textElements
    .filter((element) => {
      const id = String(element.id ?? "");
      const value = String(element.text ?? "").trim();
      if (/eyebrow|kicker|index|number|step-label|flow-label|focal-label|relation|decision-callout/u.test(id)) return false;
      if (/^(?:SLIDE|STEP|FOCUS|SCENE|NEXT ACTION|FIRST DECISION|FOCAL PROOF)\s*\d*$/iu.test(value)) return false;
      if (/^\d{1,2}$/u.test(value)) return false;
      return ["title", "subtitle", "body", "callout"].includes(String(element.role ?? ""));
    })
    .map((element) => String(element.text ?? ""))
    .join(" ");
}

function hasCoverIntentChips(slide) {
  const elements = slide.elements ?? [];
  const hasAudience = elements.some((element) => element.id === "cover-audience-chip" && element.type === "shape" && element.w >= 2.4 && element.h >= 0.34);
  const hasAction = elements.some((element) => element.id === "cover-action-chip" && element.type === "shape" && element.w >= 2.4 && element.h >= 0.34);
  const hasReadableText = elements.some((element) => element.type === "text" && element.id === "cover-audience-chip-text" && /対象|Audience/u.test(element.text ?? ""))
    && elements.some((element) => element.type === "text" && element.id === "cover-action-chip-text" && /行動|Action/u.test(element.text ?? ""));
  return hasAudience && hasAction && hasReadableText;
}

function hasClosingActionChecklist(slide) {
  const elements = slide.elements ?? [];
  const labels = elements.filter((element) => element.type === "text").map((element) => String(element.text ?? ""));
  const labelSet = new Set(labels);
  const hasJapaneseLabels = ["担当", "期限", "確認物"].every((label) => labelSet.has(label));
  const hasEnglishLabels = ["Owner", "Due", "Item"].every((label) => labelSet.has(label));
  const cards = elements.filter((element) => element.type === "shape" && /^closing-check-\d+$/u.test(element.id ?? "") && element.w >= 3.0 && element.h >= 1.0).length;
  return cards >= 3 && (hasJapaneseLabels || hasEnglishLabels);
}

function hasDominantFocalElement(slide) {
  const elements = slide.elements ?? [];
  if (elements.some((element) => /focal|hero|proof/u.test(element.id ?? "") && ((element.type === "shape" && element.w * element.h >= 2.2) || element.type === "text"))) {
    return true;
  }
  const cards = elements.filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.5 && element.h >= 0.8);
  if (cards.length < 2) return false;
  const areas = cards.map((card) => card.w * card.h).sort((a, b) => b - a);
  return areas[0] >= 1.8 * (areas[1] || 1);
}

function hasDecisionEmphasis(slide) {
  return (slide.elements ?? []).some((element) => /decision-(zone|callout|badge)|decision-emphasis|decision-line/u.test(element.id ?? ""));
}

function hasPhotoAnnotation(slide) {
  const elements = slide.elements ?? [];
  const annotation = elements.some((element) => element.type === "shape" && /photo-annotation$/u.test(element.id ?? "") && element.w >= 3.6 && element.h >= 0.6);
  const captionRail = elements.some((element) => element.type === "shape" && /photo-caption-rail$/u.test(element.id ?? "") && element.w >= 4.5 && element.h >= 0.4);
  return annotation && captionRail;
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
  return (slide.elements ?? []).some((element) => {
    if (element.decorative) return false;
    if (["image", "svg", "diagram"].includes(element.type)) return element.w >= 3.5 && element.h >= 2.2;
    if (slide.layout === "message-editorial-board") return element.type === "shape" && /editorial-hero$/u.test(element.id ?? "") && element.w >= 4.5 && element.h >= 3.5;
    if (slide.layout === "message-concept") return element.type === "shape" && /concept-core$/u.test(element.id ?? "") && element.w >= 4.0 && element.h >= 1.5;
    if (slide.layout === "message-focal-proof") return element.type === "shape" && /proof-band$/u.test(element.id ?? "") && element.w >= 4.5 && element.h >= 4.5;
    return false;
  });
}

function hasFocalProof(slide) {
  return (
    slide.layout === "message-focal-proof" ||
    (slide.elements ?? []).some((element) => element.type === "text" && (element.fontSize ?? 0) >= 28 && /\d|%|倍|億|万|円|pt|ポイント/u.test(element.text ?? ""))
  );
}

function hasSpatialModel(slide) {
  const layout = slide.layout ?? "";
  return /flow|matrix|map|diagram|step|journey|architecture|before-after|concept/u.test(layout);
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
  lines.push("", "## Fix Requests", "");
  if (report.fixRequests.length === 0) {
    lines.push("- None");
  } else {
    report.fixRequests.forEach((request, index) => {
      lines.push(`${index + 1}. **Fix** ${request.problem}`);
      lines.push(`   Evidence: ${request.evidence}`);
      lines.push(`   Expected: ${request.expected}`);
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createLoopQaReport(loopNumber, maxLoops, scenarioResults) {
  const openFixes = scenarioResults.reduce((sum, result) => sum + result.openFixesCount, 0);
  const fixRequests = scenarioResults.reduce((sum, result) => sum + result.fixRequestCount, 0);
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
  const reachedLoopLimit = loopNumber >= maxLoops;
  const decision = reachedLoopLimit && openFixes === 0 ? "stop" : "continue";
  return {
    role: "QA Gatekeeper",
    model: "Opus4.8",
    loop: loopNumber,
    decision,
    exitCriteria: {
      type: "loop-count",
      current: loopNumber,
      target: maxLoops,
      met: reachedLoopLimit
    },
    reasons: decision === "stop"
      ? [`Loop count reached ${maxLoops} and no open FixRequests remain.`]
      : [
          reachedLoopLimit
            ? `Loop count reached ${maxLoops}, but ${openFixes} open FixRequests remain; continue with program changes before completion.`
            : `Loop count ${loopNumber}/${maxLoops}; continue.`
        ],
    fixRequestCount: fixRequests,
    openFixesCount: openFixes,
    expressionCraft: {
      average: Number(expressionCraftAverage.toFixed(2)),
      repeatedFingerprintShare: Number(repeatedFingerprintShare.toFixed(2)),
      repeatedFingerprints: Object.fromEntries(Object.entries(fingerprintCounts).filter(([, count]) => count > 1))
    },
    informationDensity: { average: Number(informationDensityAverage.toFixed(2)) },
    designAmbition: { average: Number(designAmbitionAverage.toFixed(2)) },
    requiredNextWork: decision === "stop" ? [] : ["Apply dev-lead-plan.json as code, template, diagram, icon, preset, or guidance changes before the next generation loop."],
    acceptedRisks: [
      ...(repeatedFingerprintShare >= 0.5 ? ["Multiple scenarios share similar layout fingerprints; expression diversity should be improved in a future Dev Lead pass."] : [])
    ]
  };
}

function writeRunIndex(runDir, loops) {
  const lines = ["# Dev Loop Run", "", `Run directory: ${toPosixRelative(runDir)}`, "", "## Loops", ""];
  for (const loop of loops) {
    lines.push(`- [Loop ${String(loop.loop).padStart(2, "0")}](${path.posix.join(`loop-${String(loop.loop).padStart(2, "0")}`, "qa-report.json")}) - decision: ${loop.qa.decision}, fixes: ${loop.qa.fixRequestCount}, open fixes: ${loop.qa.openFixesCount}`);
  }
  lines.push("", "Review each loop directory to compare scenario outputs across iterations. Each scenario folder contains `deck.pptx`, `studio.html`, and `eval-summary.md`.", "");
  writeText(path.join(runDir, "index.md"), lines.join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const researchCatalog = readScenarioResearch();
  const scenarios = selectScenarios(readScenarios().map((scenario) => attachScenarioResearch(scenario, researchCatalog)), options.scenarios);
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
    console.log(`Loop ${loop}/${options.loops}: ${scenarioResults.length} scenarios, fixes=${qa.fixRequestCount}, openFixes=${qa.openFixesCount}, decision=${qa.decision}, actions=${devLeadPlan.actions.length}`);
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
    layoutDiversityLevel: 0,
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

function collectFixRequestGroups(loopDir) {
  const counts = new Map();
  for (const scenarioDir of readdirDirectories(loopDir)) {
    const reportPath = path.join(scenarioDir, "eval-report.json");
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    for (const request of report.fixRequests ?? []) {
      const problem = String(request.problem ?? "unknown");
      counts.set(problem, (counts.get(problem) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
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
      pattern: /画像の上に短いキャプション|何を見ればよいか|写真主役|注目点を重ね|場面が資料の論点/u,
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
      pattern: /数字や比較の見せ方|数値を1つだけ大きく|数値や比較を主役化|記憶に残るスライド/u,
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
    "Important: if a similar capability already exists, treat the repeated comments as evidence that the implementation is insufficient. Do not close the work by filtering or weakening evaluation; redesign the generation so future artifacts visibly satisfy the critique.",
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
  const fixRequestGroups = collectFixRequestGroups(loopDir);
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

  const diagramVarietyFixes = fixRequestGroups["Diagrams do not vary enough across scenarios and still feel like the same card/table/flow template."] ?? 0;
  const templateFreshnessFixes = fixRequestGroups["The deck still feels template-like instead of scenario-specific and sample-quality."] ?? 0;
  if (diagramVarietyFixes > 0 || templateFreshnessFixes > 0) {
    actions.push({
      id: "diversify-visual-archetypes",
      kind: "program-quality-improvement",
      reason: "Sample-quality review still sees repetitive diagrams or template-like decks; increase scenario-level layout rotation and force stronger expressive archetypes in later loops.",
      changes: {
        layoutDiversityLevel: Math.min(3, (currentState.layoutDiversityLevel ?? 0) + 1),
        designAmbitionLevel: Math.min(3, Math.max(currentState.designAmbitionLevel ?? 0, 1)),
        expressionPolishLevel: Math.min(5, Math.max(currentState.expressionPolishLevel ?? 0, 4))
      }
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
    if (candidate.id === "claim-evidence-action-density") {
      actions.push({
        id: "increase-claim-evidence-action-density",
        kind: "program-quality-improvement",
        reason: `${candidate.title}: ${candidate.commentCount} slide comments across ${candidate.scenarioCount} scenarios show thin slides; apply denser evidence/action scaffolding in the next loop instead of stopping for manual feature work.`,
        changes: {
          informationDensityLevel: Math.min(2, Math.max(currentState.informationDensityLevel ?? 0, 1) + 1),
          reduceSlideDensity: false
        },
        suggestedScope: candidate.suggestedScope,
        evidence: candidate.evidence.slice(0, 3)
      });
      continue;
    }
    if (candidate.id === "oversized-proof-number") {
      actions.push({
        id: "increase-proof-slide-routing",
        kind: "program-quality-improvement",
        reason: `${candidate.title}: ${candidate.commentCount} slide comments across ${candidate.scenarioCount} scenarios show numeric/comparison evidence that should be routed to stronger focal-proof treatment in the next loop.`,
        changes: {
          designAmbitionLevel: Math.min(3, Math.max(currentState.designAmbitionLevel ?? 0, 1)),
          expressionPolishLevel: Math.min(5, Math.max(currentState.expressionPolishLevel ?? 0, 4))
        },
        suggestedScope: candidate.suggestedScope,
        evidence: candidate.evidence.slice(0, 3)
      });
      continue;
    }
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
    fixRequestGroups,
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

function nativeVisualFallbackForTopic(topic, index) {
  const text = String(topic ?? "").toLowerCase();
  if (/risk|cost|budget|費用|リスク|予算|比較|tradeoff|option/u.test(text)) return "matrix";
  if (/roadmap|timeline|schedule|phase|step|導入|移行|手順|予約|週間/u.test(text)) return "step";
  if (/root|cause|原因|impact|outcome|before|after|改善|変化/u.test(text)) return "before-after";
  if (/governance|architecture|stakeholder|repo|map|関係|構造/u.test(text)) return "native-diagram";
  if (/concept|theme|mission|value|insight|課題|価値|方針/u.test(text)) return "cycle";
  return ["matrix", "before-after", "cycle", "flow"][index % 4];
}

function hasLargeVisualAnchor(slide) {
  return hasLargeMedia(slide) || hasDominantFocalElement(slide) || hasFocalProof(slide) || (hasSpatialModel(slide) && hasDramaticScaleContrast(slide));
}