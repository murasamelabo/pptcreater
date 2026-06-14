import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSimpleIconSvg, registerSvgAsset, sanitizeSvg, searchAllSvgAssets } from "./index.js";

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

  it("registers sanitized SVG assets for later search", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");
    await registerSvgAsset(
      {
        id: "custom-flow",
        title: "Custom flow icon",
        description: "A reusable flow icon.",
        tags: ["flow", "custom"],
        license: "custom",
        decorative: false,
        altText: "Flow icon",
        svg: '<svg viewBox="0 0 10 10"><path onclick="bad()" d="M1 5h8" /></svg>'
      },
      { registryPath }
    );

    const assets = await searchAllSvgAssets("flow", { registryPath });

    expect(assets.some((asset) => asset.id === "custom-flow")).toBe(true);
    expect(assets.find((asset) => asset.id === "custom-flow")?.svg).not.toContain("onclick");
  });

  it("sanitizes manually edited registry SVGs on read", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({
        version: "0.1",
        assets: [
          {
            id: "manual-asset",
            title: "Manual asset",
            description: "Manually edited asset.",
            tags: ["manual"],
            license: "custom",
            decorative: false,
            altText: "Manual asset",
            svg: '<svg viewBox="0 0 10 10"><path onclick="bad()" d="M1 5h8" /></svg>'
          }
        ]
      })
    );

    const assets = await searchAllSvgAssets("manual", { registryPath });

    expect(assets.find((asset) => asset.id === "manual-asset")?.svg).not.toContain("onclick");
  });

  it("rejects custom assets that collide with built-in IDs", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");

    await expect(
      registerSvgAsset(
        {
          id: "icon-check",
          title: "Override check",
          description: "Should not replace built-in check icon.",
          tags: [],
          license: "custom",
          decorative: false,
          altText: "Check",
          svg: '<svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>'
        },
        { registryPath }
      )
    ).rejects.toThrow(/built in/);
  });

  it("preserves concurrent registrations", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");

    await Promise.all(
      ["concurrent-one", "concurrent-two"].map((id) =>
        registerSvgAsset(
          {
            id,
            title: id,
            description: `Asset ${id}.`,
            tags: ["concurrent"],
            license: "custom",
            decorative: false,
            altText: id,
            svg: '<svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>'
          },
          { registryPath }
        )
      )
    );

    const assets = await searchAllSvgAssets("concurrent", { registryPath });

    expect(assets.some((asset) => asset.id === "concurrent-one")).toBe(true);
    expect(assets.some((asset) => asset.id === "concurrent-two")).toBe(true);
  });

  it("recovers stale registry locks", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");
    await mkdir(`${registryPath}.lock`);
    await writeFile(join(`${registryPath}.lock`, "owner.json"), JSON.stringify({ pid: 0, token: "stale", createdAt: 0 }));

    await registerSvgAsset(
      {
        id: "stale-lock-asset",
        title: "Stale lock asset",
        description: "Asset registered after stale lock recovery.",
        tags: ["stale"],
        license: "custom",
        decorative: false,
        altText: "Stale lock asset",
        svg: '<svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>'
      },
      { registryPath }
    );

    const assets = await searchAllSvgAssets("stale", { registryPath });

    expect(assets.some((asset) => asset.id === "stale-lock-asset")).toBe(true);
  });

  it("recovers malformed stale registry locks", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-assets-")), "registry.json");
    const lockDir = `${registryPath}.lock`;
    await mkdir(lockDir);
    await writeFile(join(lockDir, "owner.json"), JSON.stringify({ broken: true }));
    await utimes(lockDir, new Date(0), new Date(0));

    await registerSvgAsset(
      {
        id: "malformed-lock-asset",
        title: "Malformed lock asset",
        description: "Asset registered after malformed stale lock recovery.",
        tags: ["malformed"],
        license: "custom",
        decorative: false,
        altText: "Malformed lock asset",
        svg: '<svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>'
      },
      { registryPath }
    );

    const assets = await searchAllSvgAssets("malformed", { registryPath });

    expect(assets.some((asset) => asset.id === "malformed-lock-asset")).toBe(true);
  });
});
