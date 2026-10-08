import type { SectionName, VariationMode } from "../contracts/music";
import type { CreativeIntent } from "../contracts/creativity";
import { deriveSeed, SeededRandom } from "./SeededRandom";
import { pivot, progression, relatedKey } from "./HarmonyPlan";
import type { Tonality } from "./HarmonyPlan";

export const modeSettings = {
  Subtle: { modulation: 0.22, tempoStep: 2, complexity: 0.3, renewal: 0.12 },
  Balanced: { modulation: 0.55, tempoStep: 4, complexity: 0.55, renewal: 0.3 },
  Experimental: {
    modulation: 0.8,
    tempoStep: 7,
    complexity: 0.8,
    renewal: 0.55,
  },
} as const;
export interface SectionPlan {
  readonly index: number;
  readonly start: number;
  readonly length: number;
  readonly name: SectionName;
  readonly key: Tonality;
  readonly bpm: number;
  readonly energy: number;
  readonly path: readonly number[];
  readonly sinceBreak: number;
}
const energy: Record<SectionName, number> = {
  Introduction: 0.34,
  Main: 0.56,
  Variation: 0.73,
  Breakdown: 0.28,
  Return: 0.62,
};
export function nextSection(
  seed: string,
  mode: VariationMode,
  previous?: SectionPlan,
  intent: CreativeIntent = {},
): SectionPlan {
  const index = previous ? previous.index + 1 : 0;
  const random = new SeededRandom(deriveSeed(seed, index, "director", mode));
  let name: SectionName = "Introduction";
  if (previous) {
    const transitions: Record<SectionName, SectionName[]> = {
      Introduction: ["Main", "Main", "Variation"],
      Main: ["Variation", "Main", "Breakdown"],
      Variation: ["Main", "Breakdown", "Return"],
      Breakdown: ["Return", "Main"],
      Return: ["Main", "Variation", "Breakdown"],
    };
    const options = transitions[previous.name];
    name =
      previous.sinceBreak >= 3
        ? "Breakdown"
        : options[random.integer(options.length)]!;
    if (intent.sectionRequest === "breakdown") name = "Breakdown";
    if (intent.sectionRequest === "build") name = "Variation";
    if (intent.sectionRequest === "return") name = "Return";
    if (intent.sectionRequest === "continue") name = previous.name;
  }
  let key: Tonality = previous?.key ?? {
    tonic: [0, 2, 3, 5, 7, 9, 10][random.integer(7)]!,
    mode: random.next() < 0.3 ? "minor" : "major",
  };
  if (
    previous &&
    name !== "Breakdown" &&
    random.next() < modeSettings[mode].modulation
  ) {
    const candidate = relatedKey(key, random);
    if (pivot(key, candidate)) key = candidate;
  }
  const target = Math.max(
    0.18,
    Math.min(
      0.85,
      energy[name] +
        (intent.energyTarget === undefined
          ? 0
          : (intent.energyTarget - 0.5) * 0.4) +
        (random.next() - 0.5) * 0.08,
    ),
  );
  const delta = previous
    ? Math.sign(target - previous.energy) *
      (1 + random.integer(modeSettings[mode].tempoStep))
    : 0;
  const bpm = previous
    ? Math.max(80, Math.min(105, previous.bpm + delta))
    : 80 + random.integer(26);
  return Object.freeze({
    index,
    start: previous ? previous.start + previous.length : 0,
    length:
      name === "Introduction" || name === "Breakdown"
        ? 8
        : [8, 12, 16][random.integer(3)]!,
    name,
    key: Object.freeze(key),
    bpm,
    energy: target,
    path: Object.freeze(progression(key, random)),
    sinceBreak: name === "Breakdown" ? 0 : (previous?.sinceBreak ?? 0) + 1,
  });
}
