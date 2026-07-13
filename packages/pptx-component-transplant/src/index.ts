import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { type DrawCommand } from "@pptcreater/authoring-contracts";
import JSZip from "jszip";

export type ComponentSource = {
  componentId: string;
  templatePath: string;
  sourceSlideIndex: number;
};

export type ComponentResolver = (componentId: string) => Promise<ComponentSource | undefined>;

export type ComponentImport = {
  targetSlideIndex: number;
  command: Extract<DrawCommand, { kind: "importPptxComponent" }>;
};

function decodeXml(value: string): string {
  return value.replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&amp;/gu, "&");
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function shapeText(block: string): string {
  return [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)].map((match) => decodeXml(match[1])).join("");
}

function spTreeParts(xml: string): { prefix: string; children: string; suffix: string } {
  const match = /([\s\S]*?<p:spTree\b[^>]*>[\s\S]*?<\/p:nvGrpSpPr>\s*(?:<p:grpSpPr\b[^>]*\/>|<p:grpSpPr\b[\s\S]*?<\/p:grpSpPr>))([\s\S]*?)(<\/p:spTree>[\s\S]*)/u.exec(xml);
  if (!match) throw new Error("Slide shape tree could not be parsed.");
  return { prefix: match[1], children: match[2], suffix: match[3] };
}

function topLevelBlocks(children: string): string[] {
  if (/<p:(grpSp|graphicFrame|pic)\b/u.test(children)) throw new Error("Initial component transplant supports shape-only slides; grouped shapes, graphic frames, and pictures require the full transplant engine.");
  const blocks = [...children.matchAll(/<p:(sp|cxnSp)\b[\s\S]*?<\/p:\1>/gu)].map((match) => match[0]);
  const residue = children.replace(/<p:(sp|cxnSp)\b[\s\S]*?<\/p:\1>/gu, "").trim();
  if (residue) throw new Error("Source slide contains unsupported shape-tree content.");
  return blocks;
}

function replaceText(block: string, replacements: Record<string, string>): string {
  return block.replace(/<a:t>([\s\S]*?)<\/a:t>/gu, (raw, encoded: string) => {
    const decoded = decodeXml(encoded);
    return Object.hasOwn(replacements, decoded) ? `<a:t>${escapeXml(replacements[decoded])}</a:t>` : raw;
  });
}

function applyOperations(blocks: string[], operations: Extract<DrawCommand, { kind: "importPptxComponent" }>["operations"]): string[] {
  const next = [...blocks];
  for (const operation of operations) {
    const index = next.findIndex((block) => shapeText(block) === operation.target || shapeText(block).includes(operation.target));
    if (operation.op === "remove") {
      if (index >= 0) next.splice(index, 1);
      continue;
    }
    if (operation.op === "reorder") {
      if (index < 0 || operation.at === undefined) continue;
      const [block] = next.splice(index, 1);
      next.splice(Math.min(operation.at, next.length), 0, block);
      continue;
    }
    throw new Error("Initial shape-only transplant does not support add operations.");
  }
  return next;
}

function maxShapeId(xml: string): number {
  return Math.max(0, ...[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/gu)].map((match) => Number(match[1])));
}

function renumber(blocks: string[], start: number): string[] {
  let nextId = start;
  return blocks.map((block) => block.replace(/(<p:cNvPr\b[^>]*\bid=")\d+("[^>]*>)/u, (_raw, before: string, after: string) => `${before}${nextId++}${after}`));
}

async function safeTemplatePath(templatePath: string, workspaceRoot: string): Promise<string> {
  if (templatePath.includes("\0")) throw new Error("Component template path cannot contain null bytes.");
  if (!['.pptx', '.potx', '.pptm', '.potm'].includes(extname(templatePath).toLowerCase())) throw new Error("Component template must be a PowerPoint package.");
  const root = await realpath(workspaceRoot);
  const candidate = await realpath(resolve(workspaceRoot, templatePath));
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel === ".." || resolve(root, rel) !== candidate) throw new Error("Component template must stay inside the workspace.");
  const stats = await lstat(candidate);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Component template must be a regular non-symlink file.");
  if (stats.size > 25 * 1024 * 1024) throw new Error("Component template exceeds the 25 MiB limit.");
  return candidate;
}

export async function applyComponentImports(pptxPath: string, imports: ComponentImport[], resolver: ComponentResolver, options: { workspaceRoot?: string } = {}): Promise<void> {
  if (!imports.length) return;
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const targetZip = await JSZip.loadAsync(await readFile(pptxPath));
  for (const item of imports) {
    const source = await resolver(item.command.componentId);
    if (!source) throw new Error(`Unknown figure component ${item.command.componentId}.`);
    const templatePath = await safeTemplatePath(source.templatePath, workspaceRoot);
    const sourceZip = await JSZip.loadAsync(await readFile(templatePath));
    const sourceEntry = sourceZip.file(`ppt/slides/slide${source.sourceSlideIndex}.xml`);
    const targetEntry = targetZip.file(`ppt/slides/slide${item.targetSlideIndex + 1}.xml`);
    if (!sourceEntry || !targetEntry) throw new Error("Source or target slide XML is missing.");
    const sourceXml = await sourceEntry.async("string");
    if (/\br:(?:embed|link|id)="/u.test(sourceXml)) throw new Error(`Component ${source.componentId} has relationships; use the full relationship-aware transplant engine.`);
    const targetXml = await targetEntry.async("string");
    const sourceTree = spTreeParts(sourceXml);
    let blocks = topLevelBlocks(sourceTree.children);
    blocks = applyOperations(blocks, item.command.operations).map((block) => replaceText(block, item.command.replacements));
    blocks = renumber(blocks, maxShapeId(targetXml) + 1);
    const targetTree = spTreeParts(targetXml);
    targetZip.file(`ppt/slides/slide${item.targetSlideIndex + 1}.xml`, `${targetTree.prefix}${blocks.join("")}${targetTree.children}${targetTree.suffix}`);
  }
  await writeFile(pptxPath, await targetZip.generateAsync({ type: "nodebuffer" }));
}
