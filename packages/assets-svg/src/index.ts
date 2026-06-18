import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { homedir } from "node:os";
import { lstat, mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SaxesParser, type SaxesTag } from "saxes";
import { z } from "zod";

const SvgAssetIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/, "Use 1-80 letters, numbers, dots, underscores, or hyphens.");

export const SvgAssetSchema = z.object({
  id: SvgAssetIdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  license: z.string().default("custom"),
  decorative: z.boolean().default(false),
  altText: z.string().optional(),
  svg: z.string().min(1).max(200_000)
});

export type SvgAsset = z.infer<typeof SvgAssetSchema>;

export const SvgAssetRegistrySchema = z.object({
  version: z.literal("0.1"),
  assets: z.array(SvgAssetSchema).default([])
});

export type SvgAssetRegistry = z.infer<typeof SvgAssetRegistrySchema>;

export const BUILTIN_ICON_NAMES = [
  "check",
  "warning",
  "info",
  "plus",
  "minus",
  "x",
  "arrow-right",
  "arrow-down",
  "upload",
  "download",
  "link",
  "cloud",
  "database",
  "server",
  "user-group",
  "user",
  "lock",
  "key",
  "settings",
  "search",
  "document",
  "folder",
  "table",
  "tree",
  "list",
  "layers",
  "target",
  "flag",
  "star",
  "heart",
  "home",
  "building",
  "globe",
  "mail",
  "calendar",
  "clock",
  "bell",
  "phone",
  "laptop",
  "chart-up",
  "chart-bar",
  "pie-chart",
  "map",
  "eye",
  "edit",
  "trash",
  "filter",
  "code",
  "branch",
  "cash",
  "scale",
  "shield",
  "lightbulb",
  "workflow",
  "spark",
  "rocket",
  "presentation"
] as const;

export type BuiltinIconName = (typeof BUILTIN_ICON_NAMES)[number];

type BuiltinIconDefinition = {
  title: string;
  description: string;
  tags: string[];
  path: string;
};

const BUILTIN_ICON_DEFINITIONS: Record<BuiltinIconName, BuiltinIconDefinition> = {
  check: {
    title: "Check icon",
    description: "Check mark for completion or approval.",
    tags: ["icon", "check", "success", "approval"],
    path: '<path d="M4 10.5 8.2 14.7 16.5 5.8" />'
  },
  warning: {
    title: "Warning icon",
    description: "Warning triangle for risks or cautions.",
    tags: ["icon", "warning", "risk", "caution"],
    path: '<path d="M10 3 18 17H2L10 3Z" /><path d="M10 8v4" /><path d="M10 15h.01" />'
  },
  info: {
    title: "Info icon",
    description: "Information icon for notes or context.",
    tags: ["icon", "info", "note", "context"],
    path: '<circle cx="10" cy="10" r="7" /><path d="M10 9v5" /><path d="M10 6h.01" />'
  },
  plus: {
    title: "Plus icon",
    description: "Plus sign for adding or expansion.",
    tags: ["icon", "plus", "add", "expand"],
    path: '<path d="M10 4v12" /><path d="M4 10h12" />'
  },
  minus: {
    title: "Minus icon",
    description: "Minus sign for removal or reduction.",
    tags: ["icon", "minus", "remove", "reduce"],
    path: '<path d="M4 10h12" />'
  },
  x: {
    title: "X icon",
    description: "X mark for close, cancel, or negative states.",
    tags: ["icon", "x", "close", "cancel", "negative"],
    path: '<path d="M5 5l10 10" /><path d="M15 5 5 15" />'
  },
  "arrow-right": {
    title: "Arrow right icon",
    description: "Right arrow for flow or next step.",
    tags: ["icon", "arrow", "flow", "next"],
    path: '<path d="M4 10h11" /><path d="M11 6l4 4-4 4" />'
  },
  "arrow-down": {
    title: "Arrow down icon",
    description: "Down arrow for vertical flows or next sections.",
    tags: ["icon", "arrow", "flow", "down"],
    path: '<path d="M10 4v11" /><path d="M6 11l4 4 4-4" />'
  },
  upload: {
    title: "Upload icon",
    description: "Upload arrow for import or publishing.",
    tags: ["icon", "upload", "import", "publish"],
    path: '<path d="M10 15V4" /><path d="M6 8l4-4 4 4" /><path d="M4 16h12" />'
  },
  download: {
    title: "Download icon",
    description: "Download arrow for export or retrieval.",
    tags: ["icon", "download", "export", "retrieve"],
    path: '<path d="M10 4v11" /><path d="M6 11l4 4 4-4" /><path d="M4 16h12" />'
  },
  link: {
    title: "Link icon",
    description: "Link chain for connections and references.",
    tags: ["icon", "link", "connection", "reference"],
    path: '<path d="M8.5 6.5 7 5a3 3 0 0 0-4.2 4.2l2 2a3 3 0 0 0 4.2 0" /><path d="M11.5 13.5 13 15a3 3 0 0 0 4.2-4.2l-2-2a3 3 0 0 0-4.2 0" /><path d="M7.5 12.5l5-5" />'
  },
  cloud: {
    title: "Cloud icon",
    description: "Cloud icon for cloud platforms or remote services.",
    tags: ["icon", "cloud", "platform", "infrastructure"],
    path: '<path d="M7 15h8.3A3.7 3.7 0 0 0 16 7.7 5.2 5.2 0 0 0 6.2 6 4.5 4.5 0 0 0 7 15Z" />'
  },
  database: {
    title: "Database icon",
    description: "Database cylinder for storage or data sources.",
    tags: ["icon", "database", "data", "storage"],
    path: '<ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" /><path d="M4 9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />'
  },
  server: {
    title: "Server icon",
    description: "Server rack for compute or backend components.",
    tags: ["icon", "server", "compute", "backend"],
    path: '<rect x="4" y="4" width="12" height="5" rx="1.2" /><rect x="4" y="11" width="12" height="5" rx="1.2" /><path d="M7 6.5h.01M7 13.5h.01M10 6.5h3M10 13.5h3" />'
  },
  "user-group": {
    title: "User group icon",
    description: "User group for audience, customers, or teams.",
    tags: ["icon", "user", "group", "audience", "team"],
    path: '<circle cx="7.5" cy="7" r="2.5" /><circle cx="14" cy="8" r="2" /><path d="M3 16c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" /><path d="M11.5 13.3c1.9.2 3.2 1.2 4 2.7" />'
  },
  user: {
    title: "User icon",
    description: "Single user for a person, role, or customer.",
    tags: ["icon", "user", "person", "customer"],
    path: '<circle cx="10" cy="7" r="3" /><path d="M4.5 17c1-3 2.8-4.5 5.5-4.5S14.5 14 15.5 17" />'
  },
  lock: {
    title: "Lock icon",
    description: "Lock for security, access, and protected states.",
    tags: ["icon", "lock", "security", "access"],
    path: '<rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V6a3 3 0 0 1 6 0v2" /><path d="M10 12v2" />'
  },
  key: {
    title: "Key icon",
    description: "Key for authentication, access, or permissions.",
    tags: ["icon", "key", "auth", "permission", "access"],
    path: '<circle cx="7" cy="10" r="3" /><path d="M10 10h7" /><path d="M14 10v3" /><path d="M16 10v2" />'
  },
  settings: {
    title: "Settings icon",
    description: "Sliders for settings or tuning.",
    tags: ["icon", "settings", "configuration", "tuning"],
    path: '<path d="M4 6h12" /><path d="M4 14h12" /><circle cx="8" cy="6" r="1.8" /><circle cx="13" cy="14" r="1.8" />'
  },
  search: {
    title: "Search icon",
    description: "Magnifying glass for search and discovery.",
    tags: ["icon", "search", "find", "discovery"],
    path: '<circle cx="8.5" cy="8.5" r="4.5" /><path d="M12 12l4 4" />'
  },
  document: {
    title: "Document icon",
    description: "Document page for files, policies, and reports.",
    tags: ["icon", "document", "file", "report", "policy"],
    path: '<path d="M6 3h5l4 4v10H6Z" /><path d="M11 3v5h4" /><path d="M8 12h5" /><path d="M8 15h4" />'
  },
  folder: {
    title: "Folder icon",
    description: "Folder for collections and repositories.",
    tags: ["icon", "folder", "collection", "repository"],
    path: '<path d="M3 6.5h5l1.5 2H17v7.5H3Z" /><path d="M3 8.5h14" />'
  },
  table: {
    title: "Table icon",
    description: "Grid table for matrix and comparison layouts.",
    tags: ["icon", "table", "matrix", "comparison"],
    path: '<rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14" /><path d="M3 12h14" /><path d="M8 4v12" /><path d="M13 4v12" />'
  },
  tree: {
    title: "Tree icon",
    description: "Tree diagram for hierarchy or branching.",
    tags: ["icon", "tree", "hierarchy", "branch"],
    path: '<rect x="7" y="3" width="6" height="4" rx="1" /><rect x="3" y="13" width="5" height="4" rx="1" /><rect x="12" y="13" width="5" height="4" rx="1" /><path d="M10 7v3" /><path d="M5.5 13v-3h9v3" />'
  },
  list: {
    title: "List icon",
    description: "List for ordered points and checklists.",
    tags: ["icon", "list", "enumeration", "checklist"],
    path: '<path d="M8 5h9" /><path d="M8 10h9" /><path d="M8 15h9" /><circle cx="4" cy="5" r="1" /><circle cx="4" cy="10" r="1" /><circle cx="4" cy="15" r="1" />'
  },
  layers: {
    title: "Layers icon",
    description: "Stacked layers for architecture or levels.",
    tags: ["icon", "layers", "stack", "architecture"],
    path: '<path d="M10 3 18 7l-8 4-8-4Z" /><path d="M4 10l6 3 6-3" /><path d="M4 13l6 3 6-3" />'
  },
  target: {
    title: "Target icon",
    description: "Target for goals and focus areas.",
    tags: ["icon", "target", "goal", "focus"],
    path: '<circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="4" /><circle cx="10" cy="10" r="1.4" />'
  },
  flag: {
    title: "Flag icon",
    description: "Flag for milestones and priorities.",
    tags: ["icon", "flag", "milestone", "priority"],
    path: '<path d="M5 17V4" /><path d="M5 5h9l-1.5 3L14 11H5" />'
  },
  star: {
    title: "Star icon",
    description: "Star for highlights or excellence.",
    tags: ["icon", "star", "highlight", "quality"],
    path: '<path d="m10 3 2 4 4.5.6-3.2 3.1.8 4.4-4.1-2.1-4.1 2.1.8-4.4-3.2-3.1L8 7Z" />'
  },
  heart: {
    title: "Heart icon",
    description: "Heart for care, value, or customer love.",
    tags: ["icon", "heart", "care", "value"],
    path: '<path d="M10 16s-6-3.5-6-8a3.2 3.2 0 0 1 5.7-2l.3.4.3-.4A3.2 3.2 0 0 1 16 8c0 4.5-6 8-6 8Z" />'
  },
  home: {
    title: "Home icon",
    description: "Home for base, landing, or location.",
    tags: ["icon", "home", "base", "location"],
    path: '<path d="M3 9.5 10 4l7 5.5" /><path d="M5 8.8V17h10V8.8" /><path d="M8 17v-5h4v5" />'
  },
  building: {
    title: "Building icon",
    description: "Building for organizations and facilities.",
    tags: ["icon", "building", "company", "facility"],
    path: '<rect x="4" y="3" width="8" height="14" rx="1" /><path d="M12 8h4v9h-4" /><path d="M7 6h2M7 9h2M7 12h2" />'
  },
  globe: {
    title: "Globe icon",
    description: "Globe for global, web, and network contexts.",
    tags: ["icon", "globe", "global", "web", "network"],
    path: '<circle cx="10" cy="10" r="7" /><path d="M3 10h14" /><path d="M10 3c2 2 3 4.3 3 7s-1 5-3 7" /><path d="M10 3c-2 2-3 4.3-3 7s1 5 3 7" />'
  },
  mail: {
    title: "Mail icon",
    description: "Envelope for email and messages.",
    tags: ["icon", "mail", "email", "message"],
    path: '<rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="m4 7 6 4 6-4" />'
  },
  calendar: {
    title: "Calendar icon",
    description: "Calendar for schedules and dates.",
    tags: ["icon", "calendar", "schedule", "date"],
    path: '<rect x="3" y="5" width="14" height="12" rx="1.5" /><path d="M6 3v4M14 3v4M3 9h14" />'
  },
  clock: {
    title: "Clock icon",
    description: "Clock for time and duration.",
    tags: ["icon", "clock", "time", "duration"],
    path: '<circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" />'
  },
  bell: {
    title: "Bell icon",
    description: "Bell for notifications and alerts.",
    tags: ["icon", "bell", "notification", "alert"],
    path: '<path d="M6 9a4 4 0 0 1 8 0v3l2 2H4l2-2Z" /><path d="M8.5 16a1.8 1.8 0 0 0 3 0" />'
  },
  phone: {
    title: "Phone icon",
    description: "Phone for mobile or communication.",
    tags: ["icon", "phone", "mobile", "communication"],
    path: '<rect x="6" y="3" width="8" height="14" rx="2" /><path d="M9 14h2" />'
  },
  laptop: {
    title: "Laptop icon",
    description: "Laptop for applications and workstations.",
    tags: ["icon", "laptop", "app", "workstation"],
    path: '<rect x="5" y="5" width="10" height="7" rx="1" /><path d="M3 15h14l-2-3H5Z" />'
  },
  "chart-up": {
    title: "Chart up icon",
    description: "Rising chart for growth or improvement.",
    tags: ["icon", "chart", "growth", "analytics"],
    path: '<path d="M4 16h12" /><path d="M5 14l3.4-3.4 2.6 2.1L16 6" /><path d="M12.5 6H16v3.5" />'
  },
  "chart-bar": {
    title: "Bar chart icon",
    description: "Bar chart for metrics and comparisons.",
    tags: ["icon", "chart", "bar", "metrics", "comparison"],
    path: '<path d="M4 16h12" /><rect x="5" y="10" width="2.5" height="6" /><rect x="9" y="6" width="2.5" height="10" /><rect x="13" y="8" width="2.5" height="8" />'
  },
  "pie-chart": {
    title: "Pie chart icon",
    description: "Pie chart for share or composition.",
    tags: ["icon", "chart", "pie", "composition", "share"],
    path: '<path d="M10 3v7h7a7 7 0 1 1-7-7Z" /><path d="M12 3.4A7 7 0 0 1 16.6 8H12Z" />'
  },
  map: {
    title: "Map icon",
    description: "Map for geography, routes, or coverage.",
    tags: ["icon", "map", "route", "location"],
    path: '<path d="M3 5.5 7.5 4l5 1.5L17 4v10.5L12.5 16l-5-1.5L3 16Z" /><path d="M7.5 4v10.5" /><path d="M12.5 5.5V16" />'
  },
  eye: {
    title: "Eye icon",
    description: "Eye for visibility and monitoring.",
    tags: ["icon", "eye", "visibility", "monitoring"],
    path: '<path d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" /><circle cx="10" cy="10" r="2.2" />'
  },
  edit: {
    title: "Edit icon",
    description: "Pencil for editing or authoring.",
    tags: ["icon", "edit", "author", "write"],
    path: '<path d="M4 14.5V17h2.5L15 8.5 12.5 6Z" /><path d="m11.5 7 2.5 2.5" />'
  },
  trash: {
    title: "Trash icon",
    description: "Trash can for delete and cleanup.",
    tags: ["icon", "trash", "delete", "cleanup"],
    path: '<path d="M4 6h12" /><path d="M8 6V4h4v2" /><path d="M6 6l.8 11h6.4L14 6" /><path d="M9 9v5M11 9v5" />'
  },
  filter: {
    title: "Filter icon",
    description: "Filter funnel for narrowing and segmentation.",
    tags: ["icon", "filter", "segment", "narrow"],
    path: '<path d="M4 5h12l-5 6v4l-2 1v-5Z" />'
  },
  code: {
    title: "Code icon",
    description: "Code brackets for engineering and APIs.",
    tags: ["icon", "code", "engineering", "api"],
    path: '<path d="M7 6 3 10l4 4" /><path d="m13 6 4 4-4 4" /><path d="m11 4-2 12" />'
  },
  branch: {
    title: "Branch icon",
    description: "Branching nodes for decisions and versioning.",
    tags: ["icon", "branch", "decision", "version"],
    path: '<circle cx="6" cy="5" r="2" /><circle cx="14" cy="15" r="2" /><circle cx="6" cy="15" r="2" /><path d="M6 7v6" /><path d="M8 5h2a4 4 0 0 1 4 4v4" />'
  },
  cash: {
    title: "Cash icon",
    description: "Cash for cost, revenue, and financial topics.",
    tags: ["icon", "cash", "money", "cost", "revenue"],
    path: '<rect x="3" y="6" width="14" height="9" rx="1.5" /><circle cx="10" cy="10.5" r="2" /><path d="M5 8h1M14 13h1" />'
  },
  scale: {
    title: "Scale icon",
    description: "Balance scale for governance and tradeoffs.",
    tags: ["icon", "scale", "governance", "tradeoff", "compliance"],
    path: '<path d="M10 4v13" /><path d="M5 7h10" /><path d="M5 7l-3 5h6Z" /><path d="M15 7l-3 5h6Z" /><path d="M7 17h6" />'
  },
  shield: {
    title: "Shield icon",
    description: "Shield for security, governance, or reliability.",
    tags: ["icon", "shield", "security", "governance"],
    path: '<path d="M10 3 16 5v4.7c0 3.4-2.2 5.9-6 7.3-3.8-1.4-6-3.9-6-7.3V5l6-2Z" /><path d="M7.5 10.3 9.3 12 12.8 8" />'
  },
  lightbulb: {
    title: "Lightbulb icon",
    description: "Lightbulb for ideas or insights.",
    tags: ["icon", "idea", "insight", "innovation"],
    path: '<path d="M7 9a3 3 0 1 1 6 0c0 1.2-.6 2-1.4 2.8-.5.5-.8 1.1-.8 1.7H9.2c0-.6-.3-1.2-.8-1.7C7.6 11 7 10.2 7 9Z" /><path d="M8.8 16h2.4" /><path d="M9 13.5h2" />'
  },
  workflow: {
    title: "Workflow icon",
    description: "Connected nodes for process or architecture flows.",
    tags: ["icon", "workflow", "process", "architecture"],
    path: '<rect x="3" y="4" width="5" height="4" rx="1" /><rect x="12" y="4" width="5" height="4" rx="1" /><rect x="7.5" y="13" width="5" height="4" rx="1" /><path d="M8 6h4" /><path d="M10 8v5" />'
  },
  spark: {
    title: "Spark icon",
    description: "Spark for emphasis, quality, or AI moments.",
    tags: ["icon", "spark", "quality", "ai"],
    path: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3Z" /><path d="M16 14l.6 1.4L18 16l-1.4.6L16 18l-.6-1.4L14 16l1.4-.6L16 14Z" />'
  },
  rocket: {
    title: "Rocket icon",
    description: "Rocket for launch, acceleration, or growth.",
    tags: ["icon", "rocket", "launch", "growth"],
    path: '<path d="M11 4c2.5-.7 4.2-.3 5 1-.7 3.1-2.4 5.8-5 8l-4-4c2.2-2.6 4.9-4.3 8-5Z" /><path d="M7 9 4 10l-1 3 3-1" /><path d="M11 13l-1 3-3 1 1-3" /><circle cx="12.8" cy="7.2" r="1" />'
  },
  presentation: {
    title: "Presentation icon",
    description: "Presentation screen for slide decks or reporting.",
    tags: ["icon", "presentation", "slides", "report"],
    path: '<rect x="3" y="4" width="14" height="9" rx="1.5" /><path d="M10 13v4" /><path d="M7 17h6" /><path d="M6.5 10.5 9 8l2 1.5 2.5-3" />'
  }
};

export type IconSourceCatalog = {
  id: string;
  name: string;
  url: string;
  licenseNote: string;
  registrationNote: string;
};

export const ICON_SOURCE_CATALOGS: IconSourceCatalog[] = [
  {
    id: "fluentui-system-icons",
    name: "Microsoft Fluent UI System Icons",
    url: "https://github.com/microsoft/fluentui-system-icons",
    licenseNote: "Use according to the upstream repository license.",
    registrationNote: "Good source for general UI icons. Register selected SVGs with register_svg_asset."
  },
  {
    id: "google-material-symbols",
    name: "Google Material Symbols",
    url: "https://fonts.google.com/icons",
    licenseNote: "Use according to Google Fonts / Material Symbols license terms.",
    registrationNote: "Good source for generic product, action, and object icons."
  },
  {
    id: "aws-architecture-icons",
    name: "AWS Architecture Icons",
    url: "https://aws.amazon.com/jp/architecture/icons/",
    licenseNote: "Use according to AWS architecture icon terms and brand guidelines.",
    registrationNote: "Use for AWS architecture diagrams after confirming the intended brand usage."
  },
  {
    id: "azure-architecture-icons",
    name: "Azure Architecture Icons",
    url: "https://learn.microsoft.com/ja-jp/azure/architecture/icons/",
    licenseNote: "Use according to Microsoft architecture icon terms and brand guidelines.",
    registrationNote: "Use for Azure architecture diagrams after confirming the intended brand usage."
  },
  {
    id: "entra-architecture-icons",
    name: "Microsoft Entra Architecture Icons",
    url: "https://learn.microsoft.com/ja-jp/entra/architecture/architecture-icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for identity/security architecture diagrams."
  },
  {
    id: "microsoft-365-architecture-icons",
    name: "Microsoft 365 Architecture Icons and Templates",
    url: "https://learn.microsoft.com/ja-jp/previous-versions/microsoft-365/solutions/architecture-icons-templates",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Microsoft 365 solution diagrams."
  },
  {
    id: "dynamics-365-icons",
    name: "Dynamics 365 Icons",
    url: "https://learn.microsoft.com/ja-jp/dynamics365/get-started/icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Dynamics 365 solution slides."
  },
  {
    id: "power-platform-icons",
    name: "Power Platform Icons",
    url: "https://learn.microsoft.com/ja-jp/power-platform/guidance/icons",
    licenseNote: "Use according to Microsoft icon terms and brand guidelines.",
    registrationNote: "Use for Power Platform architecture and governance slides."
  },
  {
    id: "google-cloud-icons",
    name: "Google Cloud Icons",
    url: "https://cloud.google.com/icons?hl=ja",
    licenseNote: "Use according to Google Cloud icon terms and brand guidelines.",
    registrationNote: "Use for Google Cloud architecture diagrams after confirming the intended brand usage."
  }
];

export function listIconSourceCatalogs(): IconSourceCatalog[] {
  return [...ICON_SOURCE_CATALOGS];
}

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
  "pattern",
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
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
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
const PAINT_ATTRIBUTES = new Set(["fill", "stroke"]);
const REGISTRY_LOCK_STALE_MS = 30_000;
const REGISTRY_LOCK_OWNER_FILE = "owner.json";

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

  if (name === "xmlns") {
    return value === "http://www.w3.org/2000/svg";
  }

  if (/url\s*\(/i.test(value)) {
    return isSafeUrlValue(value);
  }

  if (URL_ATTRIBUTES.has(name)) {
    const hasUnsafeProtocol = /(?:https?:|file:|javascript:|data:|\/\/)/i.test(value);
    if (hasUnsafeProtocol) {
      return false;
    }

    if (PAINT_ATTRIBUTES.has(name) && !/url\s*\(/i.test(value)) {
      return /^[#a-zA-Z0-9(),.%\s-]+$/.test(value);
    }

    return value.startsWith("#") || isSafeUrlValue(value);
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
  if (!BUILTIN_ICON_NAMES.includes(normalizedName as BuiltinIconName)) {
    throw new Error(`Unsupported built-in icon name: ${name}`);
  }

  const iconName = normalizedName as BuiltinIconName;
  const definition = BUILTIN_ICON_DEFINITIONS[iconName];

  return SvgAssetSchema.parse({
    id: `icon-${iconName}`,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    license: "generated-free",
    decorative: false,
    altText: definition.title,
    svg: sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${definition.path}</svg>`
    )
  });
}

const ICON_COLOR_BY_NAME: Partial<Record<BuiltinIconName, string>> = {
  check: "#047857",
  warning: "#b91c1c",
  info: "#1d4ed8",
  shield: "#0f766e",
  "chart-up": "#047857",
  spark: "#7c3aed",
  rocket: "#ea580c",
  cloud: "#0284c7"
};

type VendorPresetDefinition = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  iconName: BuiltinIconName;
  color: string;
  accentColor: string;
  backgroundColor: string;
};

const VENDOR_PRESET_DEFINITIONS: VendorPresetDefinition[] = [
  {
    id: "preset-microsoft-cloud",
    title: "Microsoft cloud preset",
    description: "Generated generic pictogram for Microsoft cloud platform slides. Not an official Microsoft logo or product icon.",
    tags: ["preset", "cloud", "microsoft", "azure", "architecture", "generic", "not-official"],
    iconName: "cloud",
    color: "#2563eb",
    accentColor: "#60a5fa",
    backgroundColor: "#eff6ff"
  },
  {
    id: "preset-azure-architecture",
    title: "Azure architecture preset",
    description: "Generated generic pictogram for Azure architecture diagrams. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "architecture", "cloud", "generic", "not-official"],
    iconName: "layers",
    color: "#1d4ed8",
    accentColor: "#38bdf8",
    backgroundColor: "#eef6ff"
  },
  {
    id: "preset-entra-identity",
    title: "Microsoft Entra identity preset",
    description: "Generated generic pictogram for Entra ID, identity, access, and authentication slides. Not an official Entra icon.",
    tags: ["preset", "microsoft", "entra", "identity", "access", "authentication", "security", "generic", "not-official"],
    iconName: "key",
    color: "#334155",
    accentColor: "#7c3aed",
    backgroundColor: "#f5f3ff"
  },
  {
    id: "preset-entra-privileged-access",
    title: "Microsoft Entra privileged access preset",
    description: "Generated generic pictogram for privileged identity, admin roles, and access governance slides. Not an official Entra icon.",
    tags: ["preset", "microsoft", "entra", "privileged-access", "identity-governance", "admin", "pam", "pim", "security", "generic", "not-official"],
    iconName: "lock",
    color: "#312e81",
    accentColor: "#a78bfa",
    backgroundColor: "#f5f3ff"
  },
  {
    id: "preset-azure-compute",
    title: "Azure compute preset",
    description: "Generated generic pictogram for Azure virtual machines, app hosting, containers, and compute workloads. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "compute", "virtual-machine", "container", "app-service", "server", "generic", "not-official"],
    iconName: "server",
    color: "#1e40af",
    accentColor: "#38bdf8",
    backgroundColor: "#eff6ff"
  },
  {
    id: "preset-azure-storage",
    title: "Azure storage preset",
    description: "Generated generic pictogram for Azure storage, backup, and data persistence slides. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "storage", "blob", "backup", "database", "data", "generic", "not-official"],
    iconName: "database",
    color: "#0369a1",
    accentColor: "#60a5fa",
    backgroundColor: "#f0f9ff"
  },
  {
    id: "preset-azure-networking",
    title: "Azure networking preset",
    description: "Generated generic pictogram for Azure networking, connectivity, and perimeter architecture slides. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "network", "networking", "vnet", "firewall", "connectivity", "generic", "not-official"],
    iconName: "globe",
    color: "#0f766e",
    accentColor: "#38bdf8",
    backgroundColor: "#ecfeff"
  },
  {
    id: "preset-azure-security",
    title: "Azure security preset",
    description: "Generated generic pictogram for Azure security, governance, and compliance slides. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "security", "governance", "compliance", "defender", "shield", "generic", "not-official"],
    iconName: "shield",
    color: "#0f766e",
    accentColor: "#22c55e",
    backgroundColor: "#f0fdfa"
  },
  {
    id: "preset-azure-ai",
    title: "Azure AI preset",
    description: "Generated generic pictogram for Azure AI, Foundry, and machine learning slides. Not an official Azure architecture icon.",
    tags: ["preset", "azure", "microsoft", "ai", "foundry", "machine-learning", "openai", "spark", "generic", "not-official"],
    iconName: "spark",
    color: "#6d28d9",
    accentColor: "#60a5fa",
    backgroundColor: "#faf5ff"
  },
  {
    id: "preset-microsoft-365-collaboration",
    title: "Microsoft 365 collaboration preset",
    description: "Generated generic pictogram for Microsoft 365 collaboration and productivity slides. Not an official Microsoft 365 icon.",
    tags: ["preset", "microsoft", "microsoft-365", "m365", "collaboration", "productivity", "generic", "not-official"],
    iconName: "user-group",
    color: "#2563eb",
    accentColor: "#22c55e",
    backgroundColor: "#f0fdf4"
  },
  {
    id: "preset-power-platform-automation",
    title: "Power Platform automation preset",
    description: "Generated generic pictogram for Power Platform automation, apps, and workflow slides. Not an official Power Platform icon.",
    tags: ["preset", "microsoft", "power-platform", "powerapps", "power-automate", "automation", "workflow", "generic", "not-official"],
    iconName: "workflow",
    color: "#7c3aed",
    accentColor: "#a78bfa",
    backgroundColor: "#faf5ff"
  },
  {
    id: "preset-dynamics-365-business-apps",
    title: "Dynamics 365 business apps preset",
    description: "Generated generic pictogram for Dynamics 365 business application slides. Not an official Dynamics 365 icon.",
    tags: ["preset", "microsoft", "dynamics-365", "business-apps", "crm", "erp", "generic", "not-official"],
    iconName: "building",
    color: "#0f766e",
    accentColor: "#2dd4bf",
    backgroundColor: "#f0fdfa"
  },
  {
    id: "preset-aws-cloud",
    title: "AWS cloud preset",
    description: "Generated generic pictogram for AWS cloud architecture slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "cloud", "architecture", "generic", "not-official"],
    iconName: "cloud",
    color: "#b45309",
    accentColor: "#f59e0b",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-aws-database",
    title: "AWS database preset",
    description: "Generated generic pictogram for AWS managed databases and data persistence slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "database", "rds", "dynamodb", "data", "storage", "generic", "not-official"],
    iconName: "database",
    color: "#854d0e",
    accentColor: "#f59e0b",
    backgroundColor: "#fffbeb"
  },
  {
    id: "preset-aws-analytics",
    title: "AWS analytics preset",
    description: "Generated generic pictogram for AWS analytics, BI, and data pipeline slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "analytics", "data-pipeline", "bi", "chart", "generic", "not-official"],
    iconName: "chart-bar",
    color: "#a16207",
    accentColor: "#facc15",
    backgroundColor: "#fefce8"
  },
  {
    id: "preset-aws-ai-ml",
    title: "AWS AI/ML preset",
    description: "Generated generic pictogram for AWS AI, machine learning, and generative AI slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "ai", "ml", "machine-learning", "bedrock", "sagemaker", "generic", "not-official"],
    iconName: "spark",
    color: "#7c2d12",
    accentColor: "#fb923c",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-aws-containers",
    title: "AWS containers preset",
    description: "Generated generic pictogram for AWS container and orchestration slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "containers", "eks", "ecs", "orchestration", "layers", "generic", "not-official"],
    iconName: "layers",
    color: "#92400e",
    accentColor: "#f97316",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-aws-integration",
    title: "AWS integration preset",
    description: "Generated generic pictogram for AWS messaging, eventing, and integration slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "integration", "messaging", "eventbridge", "queue", "workflow", "generic", "not-official"],
    iconName: "workflow",
    color: "#7c2d12",
    accentColor: "#f59e0b",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-aws-observability",
    title: "AWS observability preset",
    description: "Generated generic pictogram for AWS monitoring, logging, and operational visibility slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "observability", "monitoring", "logging", "cloudwatch", "visibility", "generic", "not-official"],
    iconName: "eye",
    color: "#0369a1",
    accentColor: "#f59e0b",
    backgroundColor: "#f0f9ff"
  },
  {
    id: "preset-aws-compute",
    title: "AWS compute preset",
    description: "Generated generic pictogram for AWS compute workloads. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "compute", "ec2", "container", "server", "generic", "not-official"],
    iconName: "server",
    color: "#92400e",
    accentColor: "#fb923c",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-aws-storage",
    title: "AWS storage preset",
    description: "Generated generic pictogram for AWS storage and data services. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "storage", "s3", "database", "data", "generic", "not-official"],
    iconName: "database",
    color: "#854d0e",
    accentColor: "#fbbf24",
    backgroundColor: "#fffbeb"
  },
  {
    id: "preset-aws-networking",
    title: "AWS networking preset",
    description: "Generated generic pictogram for AWS networking and connectivity slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "network", "networking", "vpc", "connectivity", "generic", "not-official"],
    iconName: "globe",
    color: "#0369a1",
    accentColor: "#38bdf8",
    backgroundColor: "#f0f9ff"
  },
  {
    id: "preset-aws-security",
    title: "AWS security preset",
    description: "Generated generic pictogram for AWS security and governance slides. Not an official AWS architecture icon.",
    tags: ["preset", "aws", "amazon-web-services", "security", "governance", "iam", "shield", "generic", "not-official"],
    iconName: "shield",
    color: "#0f766e",
    accentColor: "#2dd4bf",
    backgroundColor: "#f0fdfa"
  },
  {
    id: "preset-google-cloud",
    title: "Google Cloud preset",
    description: "Generated generic pictogram for Google Cloud architecture slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "cloud", "architecture", "generic", "not-official"],
    iconName: "cloud",
    color: "#1d4ed8",
    accentColor: "#f59e0b",
    backgroundColor: "#f8fafc"
  },
  {
    id: "preset-google-compute",
    title: "Google Cloud compute preset",
    description: "Generated generic pictogram for Google Cloud compute workloads. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "compute", "container", "server", "generic", "not-official"],
    iconName: "server",
    color: "#2563eb",
    accentColor: "#22c55e",
    backgroundColor: "#eff6ff"
  },
  {
    id: "preset-google-storage",
    title: "Google Cloud storage preset",
    description: "Generated generic pictogram for Google Cloud storage and object data slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "storage", "cloud-storage", "database", "data", "generic", "not-official"],
    iconName: "database",
    color: "#1d4ed8",
    accentColor: "#facc15",
    backgroundColor: "#eff6ff"
  },
  {
    id: "preset-google-networking",
    title: "Google Cloud networking preset",
    description: "Generated generic pictogram for Google Cloud networking, load balancing, and connectivity slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "network", "networking", "load-balancing", "connectivity", "generic", "not-official"],
    iconName: "globe",
    color: "#1d4ed8",
    accentColor: "#22c55e",
    backgroundColor: "#f8fafc"
  },
  {
    id: "preset-google-security",
    title: "Google Cloud security preset",
    description: "Generated generic pictogram for Google Cloud security, IAM, and governance slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "security", "iam", "governance", "shield", "generic", "not-official"],
    iconName: "shield",
    color: "#166534",
    accentColor: "#60a5fa",
    backgroundColor: "#f0fdf4"
  },
  {
    id: "preset-google-kubernetes",
    title: "Google Kubernetes preset",
    description: "Generated generic pictogram for Google Kubernetes Engine and container platform slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "kubernetes", "gke", "containers", "orchestration", "generic", "not-official"],
    iconName: "layers",
    color: "#1d4ed8",
    accentColor: "#22c55e",
    backgroundColor: "#eff6ff"
  },
  {
    id: "preset-google-serverless",
    title: "Google Cloud serverless preset",
    description: "Generated generic pictogram for Google Cloud serverless and event-driven application slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "serverless", "cloud-run", "functions", "event-driven", "generic", "not-official"],
    iconName: "rocket",
    color: "#b45309",
    accentColor: "#60a5fa",
    backgroundColor: "#fff7ed"
  },
  {
    id: "preset-google-identity",
    title: "Google Cloud identity preset",
    description: "Generated generic pictogram for Google Cloud identity and access management slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "identity", "iam", "access", "key", "generic", "not-official"],
    iconName: "key",
    color: "#334155",
    accentColor: "#22c55e",
    backgroundColor: "#f8fafc"
  },
  {
    id: "preset-google-data-analytics",
    title: "Google Cloud data analytics preset",
    description: "Generated generic pictogram for Google Cloud data, analytics, and BI slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "data", "analytics", "database", "bigquery", "generic", "not-official"],
    iconName: "chart-bar",
    color: "#166534",
    accentColor: "#60a5fa",
    backgroundColor: "#f0fdf4"
  },
  {
    id: "preset-google-ai",
    title: "Google Cloud AI preset",
    description: "Generated generic pictogram for Google Cloud AI and machine learning slides. Not an official Google Cloud icon.",
    tags: ["preset", "google", "google-cloud", "gcp", "ai", "machine-learning", "vertex-ai", "spark", "generic", "not-official"],
    iconName: "spark",
    color: "#7c3aed",
    accentColor: "#facc15",
    backgroundColor: "#faf5ff"
  },
  {
    id: "preset-google-workspace",
    title: "Google Workspace preset",
    description: "Generated generic pictogram for Google Workspace collaboration slides. Not an official Google Workspace icon.",
    tags: ["preset", "google", "google-workspace", "workspace", "collaboration", "productivity", "generic", "not-official"],
    iconName: "folder",
    color: "#1d4ed8",
    accentColor: "#22c55e",
    backgroundColor: "#f8fafc"
  }
];

function createVendorPresetSvgAsset(definition: VendorPresetDefinition): SvgAsset {
  const iconPath = BUILTIN_ICON_DEFINITIONS[definition.iconName].path;

  return SvgAssetSchema.parse({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    license: "generated-free; not an official vendor icon; verify upstream brand terms for official logos/icons",
    decorative: false,
    altText: definition.title,
    svg: sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="4" y="4" width="56" height="56" rx="14" fill="${definition.backgroundColor}" stroke="#cbd5e1" stroke-width="1.5"/><circle cx="48" cy="16" r="5" fill="${definition.accentColor}" opacity="0.24"/><path d="M14 49h36" stroke="${definition.accentColor}" stroke-width="4" stroke-linecap="round" opacity="0.88"/><g transform="translate(12 12) scale(2)" stroke="${definition.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</g></svg>`
    )
  });
}

export const VENDOR_PRESET_SVG_ASSETS: SvgAsset[] = VENDOR_PRESET_DEFINITIONS.map(createVendorPresetSvgAsset);

export const BUILTIN_SVG_ASSETS: SvgAsset[] = [
  ...BUILTIN_ICON_NAMES.map((name) => createSimpleIconSvg(name, ICON_COLOR_BY_NAME[name] ?? "#1d4ed8")),
  ...VENDOR_PRESET_SVG_ASSETS
];

function defaultConfigRoot(): string {
  if (process.env.PPTCREATER_HOME) {
    return resolve(process.env.PPTCREATER_HOME);
  }

  if (process.platform === "win32") {
    return resolve(process.env.APPDATA ?? homedir(), "pptcreater");
  }

  if (process.platform === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "pptcreater");
  }

  return resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config"), "pptcreater");
}

export function getDefaultSvgRegistryPath(): string {
  return process.env.PPTCREATER_SVG_REGISTRY_PATH ?? resolve(defaultConfigRoot(), "assets", "svg", "registry.json");
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function readSvgAssetRegistry(registryPath = getDefaultSvgRegistryPath()): Promise<SvgAssetRegistry> {
  const registry = await readJsonFile(registryPath);
  if (!registry) {
    return { version: "0.1", assets: [] };
  }

  const parsed = SvgAssetRegistrySchema.parse(registry);
  return {
    version: parsed.version,
    assets: parsed.assets.map((asset) =>
      SvgAssetSchema.parse({
        ...asset,
        svg: sanitizeSvg(asset.svg)
      })
    )
  };
}

async function getPathStats(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function ensureSafeDirectoryPath(targetDirectory: string): Promise<void> {
  const resolvedDirectory = resolve(targetDirectory);
  const parsed = parse(resolvedDirectory);
  const segments = resolvedDirectory.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;

  for (const segment of segments) {
    current = resolve(current, segment);
    const stats = await getPathStats(current);

    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error(`Registry directory cannot contain symbolic links: ${current}`);
      }

      if (!stats.isDirectory()) {
        throw new Error(`Registry path component must be a directory: ${current}`);
      }
    } else {
      await mkdir(current).catch(async (error: Error & { code?: string }) => {
        if (error.code !== "EEXIST") {
          throw error;
        }

        const statsAfterRace = await getPathStats(current);
        if (statsAfterRace?.isSymbolicLink()) {
          throw new Error(`Registry directory cannot contain symbolic links: ${current}`);
        }

        if (!statsAfterRace?.isDirectory()) {
          throw new Error(`Registry path component must be a directory: ${current}`);
        }
      });
    }
  }
}

async function safeWriteRegistryFile(path: string, contents: string): Promise<void> {
  const directory = dirname(path);
  await ensureSafeDirectoryPath(directory);
  const targetStats = await getPathStats(path);
  if (targetStats?.isSymbolicLink()) {
    throw new Error(`Refusing to write registry through a symbolic link: ${path}`);
  }

  const tempPath = resolve(directory, `.registry-${process.pid}-${Date.now()}-${randomUUID()}.tmp`);
  await writeFile(tempPath, contents, { flag: "wx" });
  await rename(tempPath, path);
}

type RegistryLockMetadata = {
  pid: number;
  token: string;
  createdAt: number;
};

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    return nodeError.code === "EPERM";
  }
}

async function readRegistryLockMetadata(lockDir: string): Promise<RegistryLockMetadata | undefined> {
  const stats = await getPathStats(lockDir);
  if (!stats) {
    return undefined;
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`Registry lock cannot be a symbolic link: ${lockDir}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Registry lock path must be a directory: ${lockDir}`);
  }

  try {
    const metadata = JSON.parse((await readFile(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE), "utf8")).replace(/^\uFEFF/, "")) as Partial<RegistryLockMetadata>;
    if (typeof metadata.pid === "number" && typeof metadata.token === "string" && typeof metadata.createdAt === "number") {
      return {
        pid: metadata.pid,
        token: metadata.token,
        createdAt: metadata.createdAt
      };
    }
  } catch {
    return {
      pid: 0,
      token: "",
      createdAt: stats.mtimeMs
    };
  }

  return {
    pid: 0,
    token: "",
    createdAt: stats.mtimeMs
  };
}

async function removeStaleLock(lockDir: string): Promise<boolean> {
  const metadata = await readRegistryLockMetadata(lockDir);
  if (!metadata) {
    return true;
  }

  if (isProcessAlive(metadata.pid) || Date.now() - metadata.createdAt <= REGISTRY_LOCK_STALE_MS) {
    return false;
  }

  const staleDir = `${lockDir}.stale-${process.pid}-${Date.now()}-${randomUUID()}`;
  try {
    await rename(lockDir, staleDir);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return true;
    }

    throw error;
  }

  await rm(staleDir, { recursive: true, force: true });
  return true;
}

async function releaseRegistryLock(lockDir: string, token: string): Promise<void> {
  const metadata = await readRegistryLockMetadata(lockDir).catch(() => undefined);
  if (metadata?.token !== token) {
    return;
  }

  await unlink(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE)).catch((error: Error & { code?: string }) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
  await rmdir(lockDir).catch((error: Error & { code?: string }) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") {
      throw error;
    }
  });
}

async function withRegistryLock<T>(registryPath: string, operation: () => Promise<T>): Promise<T> {
  const lockDir = `${registryPath}.lock`;
  await ensureSafeDirectoryPath(dirname(registryPath));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    let token = "";
    try {
      await mkdir(lockDir);
      try {
        token = randomUUID();
        await writeFile(resolve(lockDir, REGISTRY_LOCK_OWNER_FILE), JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }), {
          flag: "wx"
        });
        return await operation();
      } finally {
        if (token) {
          await releaseRegistryLock(lockDir, token);
        } else {
          await rmdir(lockDir).catch(() => undefined);
        }
      }
    } catch (error) {
      const nodeError = error as Error & { code?: string };
      if (nodeError.code !== "EEXIST") {
        throw error;
      }

      await removeStaleLock(lockDir);
      await delay(25);
    }
  }

  throw new Error(`Timed out waiting for SVG registry lock: ${registryPath}`);
}

async function writeSvgAssetRegistryUnlocked(registry: SvgAssetRegistry, registryPath = getDefaultSvgRegistryPath()): Promise<void> {
  await safeWriteRegistryFile(registryPath, `${JSON.stringify(SvgAssetRegistrySchema.parse(registry), null, 2)}\n`);
}

export async function writeSvgAssetRegistry(registry: SvgAssetRegistry, registryPath = getDefaultSvgRegistryPath()): Promise<void> {
  await withRegistryLock(registryPath, async () => writeSvgAssetRegistryUnlocked(registry, registryPath));
}

export async function registerSvgAsset(
  input: unknown,
  options: { overwrite?: boolean; registryPath?: string } = {}
): Promise<{ asset: SvgAsset; registryPath: string }> {
  const candidate = SvgAssetSchema.parse(input);
  const asset = SvgAssetSchema.parse({
    ...candidate,
    svg: sanitizeSvg(candidate.svg)
  });
  const registryPath = options.registryPath ?? getDefaultSvgRegistryPath();

  await withRegistryLock(registryPath, async () => {
    const existingBuiltin = BUILTIN_SVG_ASSETS.some((item) => item.id === asset.id);
    const registry = await readSvgAssetRegistry(registryPath);
    const existingIndex = registry.assets.findIndex((item) => item.id === asset.id);

    if (existingBuiltin) {
      throw new Error(`SVG asset "${asset.id}" is built in. Register custom assets with a different id.`);
    }

    if (existingIndex >= 0 && !options.overwrite) {
      throw new Error(`SVG asset "${asset.id}" already exists. Use overwrite to replace it.`);
    }

    const nextAssets = [...registry.assets];
    if (existingIndex >= 0) {
      nextAssets[existingIndex] = asset;
    } else {
      nextAssets.push(asset);
    }

    await writeSvgAssetRegistryUnlocked({ version: "0.1", assets: nextAssets }, registryPath);
  });

  return { asset, registryPath };
}

export async function listSvgAssets(options: { includeBuiltins?: boolean; registryPath?: string } = {}): Promise<SvgAsset[]> {
  const includeBuiltins = options.includeBuiltins ?? true;
  const registry = await readSvgAssetRegistry(options.registryPath);
  return includeBuiltins ? [...BUILTIN_SVG_ASSETS, ...registry.assets] : registry.assets;
}

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

export async function searchAllSvgAssets(query: string, options: { registryPath?: string } = {}): Promise<SvgAsset[]> {
  return searchSvgAssets(query, await listSvgAssets({ registryPath: options.registryPath }));
}
