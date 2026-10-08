import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface PianoState {
  readonly barsPlayed: number;
}
export function proposeBar(plan: BarPlan): InstrumentIntent {
  return {
    accents: plan.groove,
    density: 0.5,
    register: "mid",
    leadActivity: 0.2,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  _ensemble: EnsembleIntent,
  state: Readonly<PianoState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "piano", "notes"),
  );
  const rotation = random.integer(plan.chordPitchClasses.length);
  const events: MusicEvent[] = Array.from({ length: 8 }, (_, index) => ({
    kind: "note",
    step: index * 2,
    durationSteps: 1.8,
    midi:
      60 +
      plan.chordPitchClasses[
        (index + rotation) % plan.chordPitchClasses.length
      ]!,
    velocity: 0.45 + random.next() * 0.2,
  }));
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
