import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface DrumsState {
  readonly barsPlayed: number;
}
function groove(plan: BarPlan) {
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - plan.phrasePosition,
      "drums",
      "groove",
    ),
  );
  const kicks =
    plan.density < 0.4
      ? [0, 8]
      : [
          [0, 6, 8],
          [0, 8, 11],
          [0, 7, 10],
          [0, 6, 10],
        ][random.integer(4)]!;
  // Variants belong to the phrase; the downbeat and backbeat remain recognisable.
  return { kicks, hatOffset: random.integer(2) };
}
/** A phrase owns its kit pattern. Only small, prescribed changes occur inside it. */
function livePattern(plan: BarPlan) {
  const shared = plan.groovePlan!;
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - shared.cyclePosition,
      "drums",
      `pattern:${shared.patternVariantId}`,
    ),
  );
  const variant = random.integer(2);
  const half = shared.familyId === "half-time";
  const families = {
    straight: [
      [0, 6, 8],
      [0, 8, 11],
    ],
    "light-swing": [
      [0, 6, 10],
      [0, 7, 10],
    ],
    "half-time": [
      [0, 10],
      [0, 6],
    ],
  };
  let kicks = [...families[shared.familyId][variant]!];
  if (shared.cyclePosition === 2 && plan.density >= 0.4)
    kicks.push(half ? 12 : shared.familyId === "light-swing" ? 14 : 10);
  if (shared.cyclePosition === 3 && shared.syncopation > 0.2)
    kicks.push(half ? 14 : 15);
  if (plan.density < 0.4) kicks = half ? [0] : [0, 8];
  if (shared.break) kicks = kicks.filter((step) => step < 12);
  kicks = [...new Set(kicks)].sort((a, b) => a - b);
  return {
    kicks,
    snares: half ? [8] : shared.break ? [4] : [4, 12],
    hatOffset: variant,
    ghost:
      shared.cyclePosition === 1
        ? [half ? 6 : shared.familyId === "light-swing" ? 10 : 7]
        : shared.cyclePosition === 2 && !shared.break
          ? [half ? 14 : 15]
          : [],
  };
}
export function proposeBar(plan: BarPlan): InstrumentIntent {
  const { kicks } = plan.groovePlan ? livePattern(plan) : groove(plan);
  const snares = plan.groovePlan?.familyId === "half-time" ? [8] : [4, 12];
  const pulseAccents = Array.from({ length: 16 }, (_, step) =>
    kicks.includes(step) ? 1 : 0,
  );
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      kicks.includes(step)
        ? 1
        : snares.includes(step)
          ? 0.8
          : step % 2 === 0
            ? 0.25
            : 0,
    ),
    pulseAccents,
    density: 0.35 + plan.density * 0.4,
    rhythmic: true,
    leadActivity: 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<DrumsState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "drums", "touch"),
  );
  const pattern = plan.groovePlan ? livePattern(plan) : undefined;
  const { kicks, hatOffset } = pattern ?? groove(plan);
  const events: MusicEvent[] = [];
  const hit = (step: number, sampleKey: string, level: number) =>
    events.push({
      kind: "hit",
      step,
      sampleKey,
      velocity: Math.min(0.95, level + random.next() * 0.06),
    });
  kicks.forEach((step) => hit(step, "kick", 0.58 + plan.energy * 0.18));
  (pattern?.snares ?? (plan.section === "Breakdown" ? [12] : [4, 12])).forEach(
    (step) => hit(step, "snare", 0.4 + plan.energy * 0.16),
  );
  const sparse =
    plan.density < 0.4 ||
    ensemble.leadActivity > 0.8 ||
    ensemble.density > 0.65 ||
    plan.groovePlan?.familyId === "half-time";
  for (let step = 0; step < 16; step += sparse ? 4 : 2)
    if (
      !(plan.phrasePosition % 2 === 1 && step === 14) &&
      !(plan.groovePlan?.break && step >= 12)
    )
      hit(step, "hat", 0.2 + (step % 4 === hatOffset * 2 ? 0.08 : 0));
  const ending = plan.sectionBar === plan.sectionLength - 1;
  if (
    plan.groovePlan
      ? plan.groovePlan.fill && !plan.groovePlan.break
      : ending ||
        (plan.phrasePosition === plan.phraseLength - 1 && plan.energy > 0.4)
  ) {
    const fill =
      ensemble.leadActivity > 0.6 ? [14] : ending ? [13, 14, 15] : [14, 15];
    fill.forEach((step, i) => hit(step, "snare", 0.3 + i * 0.08));
  } else if (pattern && !plan.groovePlan?.break)
    pattern.ghost.forEach((step) => hit(step, "snare", 0.15));
  else if (!pattern && !sparse && plan.phrasePosition % 2 === 1)
    hit(10, "snare", 0.2);
  events.sort((a, b) => a.step - b.step);
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
