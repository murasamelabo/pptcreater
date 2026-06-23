import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "design-packs/zukai/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const titlesByComponent = JSON.parse(await readFile(resolve(root, "generated/member-titles.json"), "utf8"));

// Per-component exclusions: patterns whose curated layout is decorative/special (diagonal
// lines, triangles, dotted rings, alternating central-bus) and which a generic cluster
// engine cannot relayout cleanly. These remain text-editable only (no node add/remove).
// Verified by rendering the node-edit gallery to PNG via PowerPoint.
const EXCLUDE = new Set([
  "cycle-p3", // 5-step number ring (badges + text scattered)
  "cycle-p4", // dotted-circle hub with text-only nodes
  "step-p2", // diagonal dotted line
  "step-p3", // triangle climb
  "step-p5", // 3D shadow blocks (shadow layer drifts)
  "step-p6", // diagonal rising timeline
  "flow-horizontal-p5" // alternating up/down with central-bus number circles
]);

// Per-component layout overrides (the curated pattern differs from its kind default).
const LAYOUT_OVERRIDE = {
  "cycle-p5": { layout: "linear-x", connectorBetween: false, dropAcronymHub: false }
};

// Per-kind node-edit configuration. Only sequence/list/cycle/timeline figures whose
// members form a single clean series are enabled. Fixed-geometry (matrix, venn, formula,
// scale) and multi-axis table/grid figures (comparison, before-after, list-enumeration)
// are left as text-editable only — their "nodes" are not a single resizable series.
const KIND_CONFIG = {
  "flow-horizontal": { layout: "linear-x", connectorBetween: true, renumber: true },
  "flow-vertical": { layout: "linear-y", renumber: true },
  cycle: { layout: "radial", connectorBetween: true, dropAcronymHub: true },
  step: { layout: "staircase-x" },
  gantt: { layout: "linear-y" },
  "list-vertical": { layout: "linear-y", renumber: true },
  "list-horizontal": { layout: "linear-x", dropMarkers: true }
};

function isMarker(t) {
  // single non-word glyph markers like ◆ ▲ ● ■ ✕ ○ ✓
  return /^[\p{P}\p{S}]{1,2}$/u.test(t);
}
function isOperator(t) {
  return /^[×\+\-=＝]$/.test(t.trim());
}
function isAcronym(t) {
  return /^[A-Za-z]{2,6}$/.test(t.trim());
}

function buildMembers(cfg, titles) {
  if (!cfg) return null;
  let members = titles.slice();
  if (cfg.dropMarkers) members = members.filter((t) => !isMarker(t));
  if (cfg.dropOperators) members = members.filter((t) => !isOperator(t));
  if (cfg.dropAcronymHub) members = members.filter((t) => !isAcronym(t));
  if (cfg.dropSummary) members = members.filter((t) => !/倍|拡大|に拡大|縮小/.test(t));
  if (cfg.firstIsHeader) members = members.slice(1);
  members = [...new Set(members.map((t) => t.trim()))].filter((t) => t.length > 0);
  return members;
}

let applied = 0;
for (const component of manifest.components) {
  const info = titlesByComponent[component.id];
  const baseCfg = KIND_CONFIG[component.kind];
  if (!info || !baseCfg || EXCLUDE.has(component.id)) {
    component.editableGroups = [];
    continue;
  }
  const cfg = { ...baseCfg, ...(LAYOUT_OVERRIDE[component.id] ?? {}) };
  const members = buildMembers(cfg, info.titles);
  if (!members || members.length < 2) {
    component.editableGroups = [];
    continue;
  }
  const group = {
    id: "items",
    axis: cfg.layout === "linear-y" ? "y" : "x",
    layout: cfg.layout,
    members
  };
  if (cfg.connectorBetween) group.connectorBetween = true;
  if (cfg.renumber) group.renumber = true;
  component.editableGroups = [group];
  applied++;
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Applied editableGroups to ${applied}/${manifest.components.length} components`);
const byKind = {};
for (const c of manifest.components) {
  byKind[c.kind] = byKind[c.kind] || { total: 0, withGroups: 0 };
  byKind[c.kind].total++;
  if (c.editableGroups.length) byKind[c.kind].withGroups++;
}
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k}: ${v.withGroups}/${v.total}`);
