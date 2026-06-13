import { z } from "zod";

export const SkillPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.enum(["ja-JP", "en-US"]),
  description: z.string().min(1),
  designDirection: z.string().min(1),
  density: z.enum(["low", "medium", "high"]),
  rules: z.array(z.string().min(1)),
  forbidden: z.array(z.string().min(1)).default([])
});

export type SkillPack = z.infer<typeof SkillPackSchema>;

export const BUILTIN_SKILL_PACKS: SkillPack[] = [
  {
    id: "consulting-ja",
    name: "Consulting Japanese",
    locale: "ja-JP",
    description: "簡潔な結論タイトルと余白を重視する日本語コンサルティング資料向け方針。",
    designDirection: "minimal-consulting",
    density: "medium",
    rules: [
      "各スライドは1つの主張に絞る",
      "タイトルは結論型にする",
      "詳細はspeaker notesへ移す",
      "図表は要点を直接ラベル化する"
    ],
    forbidden: ["意味のない装飾アイコン", "赤/緑だけの状態表現", "小さすぎる注釈"]
  },
  {
    id: "accessibility-strict",
    name: "Accessibility Strict",
    locale: "en-US",
    description: "Strict WCAG-inspired slide checks for public or reusable decks.",
    designDirection: "accessible-minimal",
    density: "low",
    rules: [
      "Require unique slide titles",
      "Require alt text for every non-decorative visual",
      "Keep text contrast at or above WCAG AA thresholds",
      "Avoid color-only meaning",
      "Preserve explicit reading order"
    ],
    forbidden: ["decorative animation", "images of text", "ambiguous link text"]
  }
];

export function listSkillPacks(): SkillPack[] {
  return BUILTIN_SKILL_PACKS.map((skill) => SkillPackSchema.parse(skill));
}

export function getSkillPack(id: string): SkillPack | undefined {
  return listSkillPacks().find((skill) => skill.id === id);
}
