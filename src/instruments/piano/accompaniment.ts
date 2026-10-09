import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface PianoState {
  readonly barsPlayed: number;
  readonly voicing?: readonly number[];
}
function liveComping(plan: BarPlan, activeLead: boolean, dualLead: boolean) {
  const shared = plan.groovePlan!;
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - shared.cyclePosition,
      "piano",
      `comping:${shared.patternVariantId}`,
    ),
  );
  const variant = random.integer(2);
  const families = {
    straight: activeLead
      ? [
          [0, 7],
          [2, 10],
        ]
      : [
          [0, 4, 7, 10],
          [0, 3, 8, 12],
        ],
    "light-swing": activeLead
      ? [
          [2, 6],
          [6, 14],
        ]
      : [
          [2, 6, 10, 14],
          [0, 6, 10],
        ],
    "half-time": activeLead
      ? [[0], [0, 10]]
      : [
          [0, 10],
          [0, 8],
        ],
  };
  let steps = [...families[shared.familyId][variant]!];
  if (shared.cyclePosition === 2 && !dualLead)
    steps =
      shared.familyId === "half-time"
        ? [0, 8]
        : steps.map((step, i) =>
            i === steps.length - 1 && step < 14 ? step + 1 : step,
          );
  if (shared.cyclePosition === 3 && shared.fill && !activeLead)
    steps = [...steps.filter((step) => step < 14), 14];
  if (plan.density < 0.4)
    steps = shared.familyId === "light-swing" ? [2, 10] : [0, 8];
  if (shared.break) steps = steps.slice(0, 1);
  return steps;
}
export function proposeBar(plan: BarPlan): InstrumentIntent {
  return {
    accents: (plan.groovePlan?.accents ?? plan.groove).map(
      (value, step) => value * (step % 4 === 0 ? 0.6 : 0.3),
    ),
    density: plan.density * 0.55,
    register: "mid",
    leadActivity: 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<PianoState>,
) {
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - plan.phrasePosition,
      "piano",
      "comping",
    ),
  );
  const activeLead =
    (ensemble.audibleLeadCount ?? 0) > 0 || ensemble.leadActivity > 0.45;
  const dualLead = (ensemble.audibleLeadCount ?? 0) > 1;
  // Any audible low-register partner supplies the foundation. The aggregate
  // load is averaged across the ensemble, so a sparse bass line may be tiny.
  const avoidLow = ensemble.lowRegisterLoad > 0;
  const low = avoidLow ? 60 : 55,
    high = dualLead ? 69 : activeLead ? 72 : 79;
  let candidates = Array.from(
    { length: high - low + 1 },
    (_, i) => low + i,
  ).filter((midi) => plan.chordPitchClasses.includes(midi % 12));
  if (avoidLow) {
    const rootless = candidates.filter(
      (midi) => midi % 12 !== plan.chordPitchClasses[0],
    );
    if (rootless.length >= 2) candidates = rootless;
  }
  const voices = avoidLow || dualLead ? 2 : 3;
  const inversions = candidates
    .map((_, i) => candidates.slice(i, i + voices))
    .filter(
      (notes) => notes.length === voices && notes.at(-1)! - notes[0]! <= 12,
    );
  const target = state.voicing ?? [60, 64, 67];
  const cost = (notes: number[]) =>
    notes.reduce(
      (sum, midi, i) => sum + Math.abs(midi - (target[i] ?? target.at(-1)!)),
      0,
    );
  inversions.sort((a, b) => cost(a) - cost(b));
  const voicing =
    inversions[Math.min(inversions.length - 1, random.next() < 0.8 ? 0 : 1)] ??
    candidates.slice(0, voices);
  const patterns = activeLead
    ? [
        [0, 7],
        [2, 10],
        [0, 6, 12],
      ]
    : [
        [0, 4, 7, 10, 14],
        [0, 3, 6, 10, 12],
        [2, 6, 8, 11, 14],
      ];
  let steps = patterns[random.integer(patterns.length)]!;
  if (dualLead)
    steps = plan.phrasePosition === plan.phraseLength - 1 ? [0, 9] : [2, 10];
  if (plan.density < 0.4) steps = [0, 8];
  if (plan.groovePlan) steps = liveComping(plan, activeLead, dualLead);
  const arpeggio = !activeLead && random.next() < 0.55;
  const performance = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "piano", "touch"),
  );
  const events: MusicEvent[] = [];
  steps.forEach((step, index) => {
    const pitches = arpeggio ? [voicing[index % voicing.length]!] : voicing;
    pitches.forEach((midi) =>
      events.push({
        kind: "note",
        step,
        durationSteps: Math.min(
          plan.groovePlan?.familyId === "half-time"
            ? activeLead
              ? 4
              : 6
            : activeLead
              ? 2.5
              : arpeggio
                ? 2.1
                : 3.5,
          16 - step,
        ),
        midi,
        velocity:
          (arpeggio ? 0.49 : 0.36) +
          plan.energy * 0.08 +
          performance.next() * 0.09,
      }),
    );
  });
  if (
    !activeLead &&
    plan.density >= 0.4 &&
    !plan.groovePlan?.break &&
    plan.groovePlan?.familyId !== "half-time"
  ) {
    const upper = candidates.filter((midi) => midi >= 72);
    if (upper.length)
      events.push({
        kind: "note",
        step: 14,
        durationSteps: 1.7,
        midi: upper[performance.integer(upper.length)]!,
        velocity: 0.46,
      });
  }
  events.sort((a, b) => a.step - b.step);
  return { events, nextState: { barsPlayed: state.barsPlayed + 1, voicing } };
}
