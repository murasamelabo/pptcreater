import type { DesignTokens } from "./schema.js";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

export function expandHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return hex;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = expandHex(hex).slice(1);
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function defaultTokens(locale: "ja-JP" | "en-US"): DesignTokens {
  return {
    colors: {
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#111827",
      mutedText: "#475569",
      accent: "#1d4ed8",
      danger: "#b91c1c",
      success: "#047857"
    },
    typography: {
      headingFont: locale === "ja-JP" ? "Yu Gothic" : "Aptos Display",
      bodyFont: locale === "ja-JP" ? "Yu Gothic" : "Aptos",
      fallbackFonts: locale === "ja-JP" ? ["Meiryo", "Arial", "sans-serif"] : ["Arial", "sans-serif"],
      titleSize: 36,
      bodySize: 24,
      captionSize: 14
    },
    spacing: {
      margin: 0.5,
      gutter: 0.24,
      radius: 0.08
    }
  };
}
