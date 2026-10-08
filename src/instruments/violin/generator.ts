import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface ViolinState {
  readonly barsPlayed: number;
}
export function proposeBar(): InstrumentIntent {
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      step % 8 === 0 ? 0.6 : 0,
    ),
    density: 0.125,
    register: "high",
    leadActivity: 0.5,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  _ensemble: EnsembleIntent,
  state: Readonly<ViolinState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "violin", "notes"),
  );
  const events: MusicEvent[] = [0, 8].map((step) => ({
    kind: "note",
    step,
    durationSteps: 7.5,
    midi:
      72 +
      plan.chordPitchClasses[random.integer(plan.chordPitchClasses.length)]!,
    velocity: 0.42 + random.next() * 0.16,
    articulation: "sustain",
  }));
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
