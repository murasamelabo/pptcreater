import { describe, expect, it } from "vitest";
import { planSourceVisualStrategy } from "./sourceVisuals.js";

describe("source visual strategy", () => {
  it("recommends inspiration when usage rights are unclear", () => {
    const plan = planSourceVisualStrategy({
      sourceTitle: "Architecture article",
      visualDescription: "Layered enterprise access model diagram"
    });

    expect(plan.recommendation).toBe("inspiration");
    expect(plan.choices.map((choice) => choice.strategy)).toContain("quote");
  });

  it("recommends recreating when permissions are clear and exact fidelity is not needed", () => {
    const plan = planSourceVisualStrategy({
      sourceTitle: "Architecture article",
      visualDescription: "Layered enterprise access model diagram",
      hasPermission: true
    });

    expect(plan.recommendation).toBe("recreate");
  });

  it("allows quoting when exact fidelity and permissions are clear", () => {
    const plan = planSourceVisualStrategy({
      sourceTitle: "Architecture article",
      sourceUrl: "https://example.com/article",
      visualDescription: "Official reference diagram",
      hasPermission: true,
      needsExactFidelity: true
    });

    expect(plan.recommendation).toBe("quote");
  });
});
