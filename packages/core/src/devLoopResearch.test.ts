import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ConcreteCase = {
  name?: string;
  sourceUrl?: string;
  facts?: string[];
  keywords?: string[];
};

type ResearchScenario = {
  sourceUrls?: string[];
  concreteCases?: ConcreteCase[];
  slideSeeds?: unknown[];
};

type ResearchCatalog = {
  scenarios: Record<string, ResearchScenario>;
};

function readResearchCatalog(): ResearchCatalog {
  const raw = readFileSync("docs/dev-loop-scenario-research.json", "utf8").replace(/^\uFEFF/u, "");
  return JSON.parse(raw) as ResearchCatalog;
}

function readScenarioIds(): string[] {
  const markdown = readFileSync("docs/dev-loop-test-scenarios.md", "utf8").replace(/^\uFEFF/u, "");
  return [...markdown.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
}

describe("dev-loop scenario research asset", () => {
  it("covers every dev-loop scenario with concrete sourced cases", () => {
    const research = readResearchCatalog();
    const scenarioIds = readScenarioIds();

    expect(scenarioIds).toHaveLength(20);
    expect(Object.keys(research.scenarios).sort()).toEqual([...scenarioIds].sort());

    for (const scenarioId of scenarioIds) {
      const scenario = research.scenarios[scenarioId];
      expect(scenario.sourceUrls?.length, `${scenarioId} source URLs`).toBeGreaterThan(0);
      expect(scenario.slideSeeds?.length, `${scenarioId} slide seeds`).toBeGreaterThan(0);
      expect(scenario.concreteCases?.length, `${scenarioId} concrete cases`).toBeGreaterThanOrEqual(2);

      for (const concreteCase of scenario.concreteCases ?? []) {
        expect(concreteCase.name, `${scenarioId} concrete case name`).toBeTruthy();
        expect(concreteCase.sourceUrl, `${scenarioId} ${concreteCase.name} source URL`).toMatch(/^https:\/\//u);
        expect(concreteCase.facts?.length, `${scenarioId} ${concreteCase.name} facts`).toBeGreaterThan(0);
        expect(concreteCase.keywords?.length, `${scenarioId} ${concreteCase.name} keywords`).toBeGreaterThan(0);
      }
    }
  });
});