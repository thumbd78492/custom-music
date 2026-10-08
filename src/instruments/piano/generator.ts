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
export function proposeBar(plan: BarPlan): InstrumentIntent {
  return {
    accents: plan.groove.map(
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
  const activeLead = ensemble.leadActivity > 0.45;
  const avoidLow = ensemble.lowRegisterLoad > 0.04;
  const low = avoidLow ? 60 : 55,
    high = activeLead ? 72 : 79;
  const candidates = Array.from(
    { length: high - low + 1 },
    (_, i) => low + i,
  ).filter((midi) => plan.chordPitchClasses.includes(midi % 12));
  const inversions = candidates
    .map((_, i) => candidates.slice(i, i + 3))
    .filter((notes) => notes.length === 3 && notes[2]! - notes[0]! <= 12);
  const target = state.voicing ?? [60, 64, 67];
  const cost = (notes: number[]) =>
    notes.reduce((sum, midi, i) => sum + Math.abs(midi - target[i]!), 0);
  inversions.sort((a, b) => cost(a) - cost(b));
  const voicing =
    inversions[Math.min(inversions.length - 1, random.next() < 0.8 ? 0 : 1)]!;
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
  if (plan.density < 0.4) steps = [0, 8];
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
          activeLead ? 2.5 : arpeggio ? 2.1 : 3.5,
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
  if (!activeLead && plan.density >= 0.4) {
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
