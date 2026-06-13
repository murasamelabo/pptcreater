import type { DesignTokens, TextElement } from "./schema.js";

export function defaultFontSizeForRole(role: TextElement["role"], tokens: DesignTokens): number {
  if (role === "title" || role === "subtitle") {
    return tokens.typography.titleSize;
  }

  if (role === "caption") {
    return tokens.typography.captionSize;
  }

  return tokens.typography.bodySize;
}
