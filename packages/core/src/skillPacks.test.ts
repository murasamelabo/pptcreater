import { describe, expect, it } from "vitest";
import { BUILTIN_SKILL_PACKS, getSkillPack, listSkillPacks, SkillPackSchema } from "./index.js";

describe("skill packs", () => {
  it("every built-in pack validates against the schema", () => {
    for (const pack of listSkillPacks()) {
      expect(() => SkillPackSchema.parse(pack)).not.toThrow();
      expect(pack.rules.length).toBeGreaterThan(0);
    }
  });

  it("exposes the message-first slide-craft packs in both locales", () => {
    const ja = getSkillPack("slide-craft-ja");
    const en = getSkillPack("slide-craft-en");

    expect(ja?.locale).toBe("ja-JP");
    expect(en?.locale).toBe("en-US");
    // Each carries the craft method (multiple rules) and the deck anti-patterns.
    expect((ja?.rules.length ?? 0)).toBeGreaterThanOrEqual(10);
    expect((en?.rules.length ?? 0)).toBeGreaterThanOrEqual(10);
    expect(ja?.rules.join("\n")).toContain("Slidelandのcool/minimal/trust系事例");
    expect(en?.rules.join("\n")).toContain("Slideland-style cool/minimal/trust references");
    expect(ja?.forbidden.join("\n")).toContain("色付きライン付きカード");
    expect(en?.forbidden.join("\n")).toContain("colored accent-bar cards");
    expect((ja?.forbidden.length ?? 0)).toBeGreaterThan(0);
    expect((en?.forbidden.length ?? 0)).toBeGreaterThan(0);
  });

  it("keeps skill pack ids unique", () => {
    const ids = BUILTIN_SKILL_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
