import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_ICON_NAMES, BUILTIN_SVG_ASSETS, createSimpleIconSvg, listIconSourceCatalogs, registerSvgAsset, resolveIconForKeyword, sanitizeSvg, searchAllSvgAssets, suggestIconForKeyword } from "./index.js";

describe("SVG assets", () => {
  it("removes active and external SVG content", () => {
    const svg = sanitizeSvg(
      '<svg><path onclick="bad()" href="https://example.com/icon.svg" style="fill:url(https://example.com/x)" d="M0 0" /></svg>'
    );

    expect(svg).not.toContain("onclick");
    expect(svg).not.toContain("https://example.com");
    expect(svg).not.toContain("style=");
  });

  it("keeps safe paint values such as fill none", () => {
    const svg = sanitizeSvg('<svg viewBox="0 0 10 10" fill="none" stroke="#123456"><path d="M1 5h8" /></svg>');

    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#123456"');
  });

  it("bundles a broad icon set for slide UI patterns", () => {
    expect(BUILTIN_ICON_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(BUILTIN_ICON_NAMES).toEqual(expect.arrayContaining(["table", "tree", "list", "lock", "key", "laptop"]));
  });

  it("bundles Microsoft, AWS, and Google cloud preset assets", async () => {
    expect(BUILTIN_SVG_ASSETS.length).toBeGreaterThanOrEqual(85);

    const [azureAssets, entraAssets, awsAssets, googleAssets, awsAiAssets, googleIdentityAssets] = await Promise.all([
      searchAllSvgAssets("azure"),
      searchAllSvgAssets("entra"),
      searchAllSvgAssets("aws"),
      searchAllSvgAssets("google cloud"),
      searchAllSvgAssets("aws ai"),
      searchAllSvgAssets("google cloud identity")
    ]);

    expect(azureAssets.map((asset) => asset.id)).toEqual(expect.arrayContaining(["preset-azure-architecture", "preset-azure-compute", "preset-azure-ai"]));
    expect(entraAssets.map((asset) => asset.id)).toEqual(expect.arrayContaining(["preset-entra-identity", "preset-entra-privileged-access"]));
    expect(awsAssets.map((asset) => asset.id)).toEqual(expect.arrayContaining(["preset-aws-cloud", "preset-aws-compute", "preset-aws-analytics"]));
    expect(googleAssets.map((asset) => asset.id)).toEqual(expect.arrayContaining(["preset-google-cloud", "preset-google-data-analytics", "preset-google-kubernetes"]));
    expect(awsAiAssets.map((asset) => asset.id)).toContain("preset-aws-ai-ml");
    expect(googleIdentityAssets.map((asset) => asset.id)).toContain("preset-google-identity");
    expect(awsAssets.find((asset) => asset.id === "preset-aws-cloud")?.license).toContain("not an official vendor icon");
  });

  it("lists official icon source catalogs for vendor assets", () => {
    const sourceIds = listIconSourceCatalogs().map((source) => source.id);

    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "fluentui-system-icons",
        "google-material-symbols",
        "aws-architecture-icons",
        "azure-architecture-icons",
        "entra-architecture-icons",
        "microsoft-365-architecture-icons",
        "dynamics-365-icons",
        "power-platform-icons",
        "google-cloud-icons"
      ])
    );
  });

  it("keeps repository preset SVG files in sync with built-ins", async () => {
    await Promise.all(
      BUILTIN_SVG_ASSETS.map(async (asset) => {
        const fileName = asset.id.startsWith("icon-") ? asset.id.slice("icon-".length) : asset.id;
        const svg = await readFile(join(process.cwd(), "assets", "svg", "presets", `${fileName}.svg`), "utf8");

        expect(svg.replace(/^\uFEFF/, "").trim()).toBe(asset.svg);
      })
    );
  });

  it("keeps safe SVG pattern fills", () => {
    const svg = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><defs><pattern id="dots" patternUnits="userSpaceOnUse" width="4" height="4"><circle cx="1" cy="1" r="1" fill="#123456" /></pattern></defs><rect width="10" height="10" fill="url(#dots)" /></svg>'
    );

    expect(svg).toContain("<pattern");
    expect(svg).toContain('fill="url(#dots)"');
  });

  it("preserves the root SVG namespace", () => {
    const svg = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 5h8" /></svg>');

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("rejects disallowed elements and namespaced script variants", () => {
    expect(() => sanitizeSvg("<svg><script>alert(1)</script></svg>")).toThrow(/not allowed/);
    expect(() => sanitizeSvg("<svg:script>alert(1)</svg:script>")).toThrow(/Namespaced SVG elements/);
  });

  it("rejects invalid generated icon colors", () => {
    expect(() => createSimpleIconSvg("check", '" onload="bad')).toThrow(/Invalid SVG color/);
  });

  it("rejects unsupported built-in icon names", () => {
    expect(() => createSimpleIconSvg("typo-icon")).toThrow(/Unsupported built-in icon name/);
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

describe("keyword icon auto-mapping", () => {
  it("maps English business keywords to relevant builtin icons", () => {
    expect(suggestIconForKeyword("Security posture")).toBe("shield");
    expect(suggestIconForKeyword("Cost reduction")).toBe("cash");
    expect(suggestIconForKeyword("Automation workflow")).toBe("workflow");
    expect(suggestIconForKeyword("Team collaboration")).toBe("user-group");
  });

  it("maps Japanese keywords to relevant builtin icons", () => {
    expect(suggestIconForKeyword("セキュリティ強化")).toBe("shield");
    expect(suggestIconForKeyword("コスト削減")).toBe("cash");
    expect(suggestIconForKeyword("運用の自動化")).toBe("workflow");
    expect(suggestIconForKeyword("ガバナンス")).toBe("settings");
  });

  it("prefers longer, more specific synonyms over short generic tokens", () => {
    expect(suggestIconForKeyword("Zero Trust access")).toBe("shield");
  });

  it("returns null when nothing matches and resolves matched icons to a valid asset", () => {
    expect(suggestIconForKeyword("xyzzy qwerty")).toBeNull();
    expect(suggestIconForKeyword("   ")).toBeNull();

    const asset = resolveIconForKeyword("データベース", "#0f766e");
    expect(asset).not.toBeNull();
    expect(asset?.id).toBe("icon-database");
    expect(asset?.svg).toContain("#0f766e");
    expect(BUILTIN_ICON_NAMES).toContain(suggestIconForKeyword("database") as string);
    expect(resolveIconForKeyword("xyzzy qwerty")).toBeNull();
  });
});
