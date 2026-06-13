import { describe, expect, it } from "vitest";
import { createSimpleIconSvg, sanitizeSvg } from "./index.js";

describe("SVG assets", () => {
  it("removes active and external SVG content", () => {
    const svg = sanitizeSvg(
      '<svg><path onclick="bad()" href="https://example.com/icon.svg" style="fill:url(https://example.com/x)" d="M0 0" /></svg>'
    );

    expect(svg).not.toContain("onclick");
    expect(svg).not.toContain("https://example.com");
    expect(svg).not.toContain("style=");
  });

  it("rejects disallowed elements and namespaced script variants", () => {
    expect(() => sanitizeSvg("<svg><script>alert(1)</script></svg>")).toThrow(/not allowed/);
    expect(() => sanitizeSvg("<svg:script>alert(1)</svg:script>")).toThrow(/Namespaced SVG elements/);
  });

  it("rejects invalid generated icon colors", () => {
    expect(() => createSimpleIconSvg("check", '" onload="bad')).toThrow(/Invalid SVG color/);
  });
});
