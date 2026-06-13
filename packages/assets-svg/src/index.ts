import { SaxesParser, type SaxesTag } from "saxes";
import { z } from "zod";

export const SvgAssetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  license: z.string().default("custom"),
  decorative: z.boolean().default(false),
  altText: z.string().optional(),
  svg: z.string().min(1)
});

export type SvgAsset = z.infer<typeof SvgAssetSchema>;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const FORBIDDEN_XML_PATTERN = /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i;
const SAFE_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "defs",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask"
]);
const SAFE_ATTRIBUTES = new Set([
  "aria-label",
  "cx",
  "cy",
  "d",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "height",
  "id",
  "marker-end",
  "marker-mid",
  "marker-start",
  "markerHeight",
  "markerWidth",
  "offset",
  "opacity",
  "orient",
  "points",
  "r",
  "refX",
  "refY",
  "role",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "xmlns",
  "y",
  "y1",
  "y2"
]);
const URL_ATTRIBUTES = new Set(["clip-path", "fill", "href", "marker-end", "marker-mid", "marker-start", "mask", "stroke", "xlink:href"]);

function assertHexColor(color: string): void {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error(`Invalid SVG color: ${color}`);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeElementName(name: string): string {
  if (name.includes(":")) {
    throw new Error(`Namespaced SVG elements are not allowed: ${name}`);
  }

  return name;
}

function isSafeUrlValue(value: string): boolean {
  const trimmed = value.trim();
  return /^#[-_a-zA-Z0-9:.]+$/.test(trimmed) || /^url\(\s*#[-_a-zA-Z0-9:.]+\s*\)$/.test(trimmed);
}

function isSafeAttributeValue(name: string, value: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }

  if (/url\s*\(/i.test(value)) {
    return isSafeUrlValue(value);
  }

  if (URL_ATTRIBUTES.has(name)) {
    return !/(?:https?:|file:|javascript:|data:|\/\/)/i.test(value) && (value.startsWith("#") || isSafeUrlValue(value));
  }

  return !/(?:https?:|file:|javascript:|data:|\/\/|@import)/i.test(value);
}

function safeAttributeName(attributeName: string): string | undefined {
  const normalized = attributeName.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("on") || lower === "style") {
    return undefined;
  }

  if (lower === "href" || lower === "xlink:href") {
    return lower;
  }

  if (normalized.includes(":")) {
    return undefined;
  }

  return SAFE_ATTRIBUTES.has(normalized) ? normalized : undefined;
}

function serializeSafeAttributes(tag: SaxesTag): string {
  return Object.entries(tag.attributes)
    .map(([rawName, rawAttribute]) => {
      const attribute =
        typeof rawAttribute === "string"
          ? { name: rawName, value: rawAttribute }
          : { name: rawAttribute.name, value: rawAttribute.value };
      const name = safeAttributeName(attribute.name);
      if (!name || !isSafeAttributeValue(name, attribute.value)) {
        return "";
      }

      return ` ${name}="${escapeXml(attribute.value)}"`;
    })
    .join("");
}

export function sanitizeSvg(svg: string): string {
  if (FORBIDDEN_XML_PATTERN.test(svg)) {
    throw new Error("SVG contains forbidden XML declarations.");
  }

  const parser = new SaxesParser({ xmlns: false });
  const output: string[] = [];
  const stack: string[] = [];

  parser.on("opentag", (tag) => {
    const name = normalizeElementName(tag.name);
    if (!SAFE_ELEMENTS.has(name)) {
      throw new Error(`SVG element is not allowed: ${name}`);
    }

    output.push(`<${name}${serializeSafeAttributes(tag)}>`);
    stack.push(name);
  });

  parser.on("closetag", (tag) => {
    const name = normalizeElementName(typeof tag === "string" ? tag : tag.name);
    const expected = stack.pop();
    if (expected !== name) {
      throw new Error(`Unexpected SVG closing tag: ${name}`);
    }

    output.push(`</${name}>`);
  });

  parser.on("text", (text) => {
    if (text.trim()) {
      output.push(escapeXml(text));
    }
  });

  parser.on("cdata", () => {
    throw new Error("SVG CDATA sections are not allowed.");
  });

  parser.write(svg).close();

  const sanitized = output.join("");
  if (!sanitized.startsWith("<svg")) {
    throw new Error("SVG root element is required.");
  }

  return sanitized;
}

export function recolorSvg(svg: string, color: string): string {
  assertHexColor(color);
  const sanitized = sanitizeSvg(svg);
  return sanitized.replace(/\b(fill|stroke)="(?!none)[^"]*"/g, `$1="${color}"`);
}

export function createSimpleIconSvg(name: string, color = "#1d4ed8"): SvgAsset {
  assertHexColor(color);
  const normalizedName = name.trim().toLowerCase();
  const path =
    normalizedName === "check"
      ? "<path d=\"M4 10.5 8.2 14.7 16.5 5.8\" />"
      : normalizedName === "warning"
        ? "<path d=\"M10 3 18 17H2L10 3Z\" /><path d=\"M10 8v4\" /><path d=\"M10 15h.01\" />"
        : "<circle cx=\"10\" cy=\"10\" r=\"7\" /><path d=\"M10 6v5\" /><path d=\"M10 14h.01\" />";

  return SvgAssetSchema.parse({
    id: `icon-${normalizedName || "info"}`,
    title: `${normalizedName || "info"} icon`,
    description: `Simple ${normalizedName || "info"} icon for slide use.`,
    tags: ["icon", normalizedName || "info"],
    license: "generated",
    decorative: false,
    altText: `${normalizedName || "info"} icon`,
    svg: sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
    )
  });
}

export const BUILTIN_SVG_ASSETS: SvgAsset[] = [
  createSimpleIconSvg("check", "#047857"),
  createSimpleIconSvg("warning", "#b91c1c"),
  createSimpleIconSvg("info", "#1d4ed8")
];

export function searchSvgAssets(query: string, assets: SvgAsset[] = BUILTIN_SVG_ASSETS): SvgAsset[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return assets;
  }

  return assets.filter((asset) => {
    const haystack = [asset.id, asset.title, asset.description, ...asset.tags].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}
