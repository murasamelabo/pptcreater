import { z } from "zod";

export const SourceVisualStrategySchema = z.object({
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  visualDescription: z.string().min(1),
  recommendation: z.enum(["quote", "recreate", "inspiration"]),
  rationale: z.string().min(1),
  choices: z.array(
    z.object({
      strategy: z.enum(["quote", "recreate", "inspiration"]),
      label: z.string().min(1),
      whenToUse: z.string().min(1),
      requiredDeckSpecMetadata: z.array(z.string()).default([])
    })
  )
});

export type SourceVisualStrategy = z.infer<typeof SourceVisualStrategySchema>;

export function planSourceVisualStrategy(input: {
  sourceTitle: string;
  sourceUrl?: string;
  visualDescription: string;
  hasPermission?: boolean;
  needsExactFidelity?: boolean;
}): SourceVisualStrategy {
  const recommendation = input.hasPermission ? (input.needsExactFidelity ? "quote" : "recreate") : "inspiration";
  return SourceVisualStrategySchema.parse({
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    visualDescription: input.visualDescription,
    recommendation,
    rationale:
      recommendation === "quote"
        ? "Use quoted source visuals only when exact fidelity is required and usage rights are clear."
        : recommendation === "recreate"
          ? "Recreate a clearer editable diagram when rights are clear and the source concept needs adaptation."
          : "Use the source only as inspiration when rights are unclear; do not copy the original visual.",
    choices: [
      {
        strategy: "quote",
        label: "Quote the original figure",
        whenToUse: "Use when the original figure must be preserved exactly and the user confirms usage rights.",
        requiredDeckSpecMetadata: ["metadata.sources[].usage = quote", "metadata.sources[].attribution", "element.sourceId", "element.citation"]
      },
      {
        strategy: "recreate",
        label: "Recreate as editable PowerPoint objects",
        whenToUse: "Use when the goal is explanation, localization, simplification, or later editing in PowerPoint.",
        requiredDeckSpecMetadata: ["metadata.sources[].usage = recreate", "metadata.sources[].attribution", "element.sourceId", "element.citation"]
      },
      {
        strategy: "inspiration",
        label: "Use only as design/content inspiration",
        whenToUse: "Use when rights are unclear or the source visual is too detailed for the target audience.",
        requiredDeckSpecMetadata: ["metadata.sources[].usage = inspiration"]
      }
    ]
  });
}
