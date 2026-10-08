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
export function proposeBar(plan: BarPlan): InstrumentIntent {
  const { kicks } = groove(plan);
  const pulseAccents = Array.from({ length: 16 }, (_, step) =>
    kicks.includes(step) ? 1 : 0,
  );
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      kicks.includes(step)
        ? 1
        : step === 4 || step === 12
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
  const { kicks, hatOffset } = groove(plan);
  const events: MusicEvent[] = [];
  const hit = (step: number, sampleKey: string, level: number) =>
    events.push({
      kind: "hit",
      step,
      sampleKey,
      velocity: Math.min(0.95, level + random.next() * 0.06),
    });
  kicks.forEach((step) => hit(step, "kick", 0.58 + plan.energy * 0.18));
  (plan.section === "Breakdown" ? [12] : [4, 12]).forEach((step) =>
    hit(step, "snare", 0.4 + plan.energy * 0.16),
  );
  const sparse =
    plan.density < 0.4 ||
    ensemble.leadActivity > 0.8 ||
    ensemble.density > 0.65;
  for (let step = 0; step < 16; step += sparse ? 4 : 2)
    if (!(plan.phrasePosition % 2 === 1 && step === 14))
      hit(step, "hat", 0.2 + (step % 4 === hatOffset * 2 ? 0.08 : 0));
  const ending = plan.sectionBar === plan.sectionLength - 1;
  if (
    ending ||
    (plan.phrasePosition === plan.phraseLength - 1 && plan.energy > 0.4)
  ) {
    const fill =
      ensemble.leadActivity > 0.6 ? [14] : ending ? [13, 14, 15] : [14, 15];
    fill.forEach((step, i) => hit(step, "snare", 0.3 + i * 0.08));
  } else if (!sparse && plan.phrasePosition % 2 === 1) hit(10, "snare", 0.2);
  events.sort((a, b) => a.step - b.step);
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
