import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface BassState {
  readonly barsPlayed: number;
}
function liveSteps(plan: BarPlan, ensemble: EnsembleIntent) {
  const shared = plan.groovePlan!;
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - shared.cyclePosition,
      "bass",
      `pattern:${shared.patternVariantId}`,
    ),
  );
  const variant = random.integer(2);
  const patterns = {
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
      [0, 8],
    ],
  };
  let steps = [...patterns[shared.familyId][variant]!];
  // The anonymous pulse can answer the middle of a phrase without replacing
  // the saved family or requiring another rhythmic plugin to be present.
  if (shared.cyclePosition === 2 && plan.density >= 0.4) {
    const pulse = ensemble.pulseAccents?.some((level) => level > 0)
      ? ensemble.pulseAccents
      : shared.pulseAccents;
    const response = Array.from({ length: 10 }, (_, i) => i + 4)
      .filter((step) => steps.every((other) => Math.abs(other - step) >= 3))
      .sort((a, b) => (pulse[b] ?? 0) - (pulse[a] ?? 0) || a - b)[0];
    if (response !== undefined && (pulse[response] ?? 0) >= 0.7)
      steps.push(response);
  }
  if (plan.density < 0.4 || ensemble.lowRegisterLoad > 0.4)
    steps = [steps[0]!, steps.at(-1)!];
  if (shared.break) steps = steps.filter((step) => step < 12);
  if (
    shared.fill &&
    plan.complexity >= 0.4 &&
    !shared.break &&
    steps.every((step) => step <= 11)
  )
    steps.push(14);
  return steps.sort((a, b) => a - b);
}
export function proposeBar(plan: BarPlan): InstrumentIntent {
  return {
    accents: (plan.groovePlan?.pulseAccents ?? plan.groove).map(
      (value, step) => (step % 8 === 0 ? value * 0.7 : 0),
    ),
    density: 0.15 + plan.density * 0.2,
    register: "low",
    leadActivity: 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<BassState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "bass", "line"),
  );
  const pulse = ensemble.pulseAccents?.some((value) => value > 0)
    ? ensemble.pulseAccents
    : plan.groove;
  const ranked = Array.from({ length: 15 }, (_, i) => i + 1).sort(
    (a, b) => (pulse[b] ?? 0) - (pulse[a] ?? 0) || a - b,
  );
  const count = plan.density < 0.4 || ensemble.lowRegisterLoad > 0.4 ? 2 : 3;
  const steps = plan.groovePlan ? liveSteps(plan, ensemble) : [0];
  if (!plan.groovePlan)
    for (const step of ranked) {
      if (steps.every((other) => Math.abs(other - step) >= 3)) steps.push(step);
      if (steps.length >= count) break;
    }
  const passing = plan.groovePlan
    ? plan.groovePlan.fill && steps.includes(14)
    : plan.density > 0.45 &&
      plan.phrasePosition % 2 === 1 &&
      random.next() < plan.complexity;
  if (!plan.groovePlan && passing && steps.every((step) => step < 12))
    steps.push(14);
  steps.sort((a, b) => a - b);
  const root = plan.chordPitchClasses[0]!;
  const events: MusicEvent[] = steps.map((step, index) => {
    let midi =
      36 +
      (index === 0
        ? root
        : plan.chordPitchClasses[random.next() < 0.65 ? 0 : 2]!);
    if (
      index > 0 &&
      !passing &&
      plan.energy > 0.6 &&
      random.next() < 0.2 &&
      midi + 12 <= 55
    )
      midi += 12;
    if (passing && step === 14) {
      const target = 36 + plan.nextChordPitchClasses[0]!;
      const approaches = [
        target - 2,
        target - 1,
        target + 1,
        target + 2,
      ].filter(
        (note) =>
          note >= 36 &&
          note <= 55 &&
          plan.scalePitchClasses.includes(note % 12),
      );
      midi =
        approaches.sort(
          (a, b) => Math.abs(a - target) - Math.abs(b - target),
        )[0] ?? midi;
    }
    return {
      kind: "note",
      step,
      durationSteps: Math.min(
        plan.groovePlan?.familyId === "half-time" ? 7.5 : 3.8,
        (steps[index + 1] ?? 16) - step - 0.35,
      ),
      midi,
      velocity: 0.5 + plan.energy * 0.12 + random.next() * 0.08,
      articulation: "pluck",
    };
  });
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
