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
export function proposeBar(): InstrumentIntent {
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      step % 4 === 0 ? 0.7 : 0,
    ),
    density: 0.25,
    register: "low",
    leadActivity: 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  _ensemble: EnsembleIntent,
  state: Readonly<BassState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "bass", "notes"),
  );
  const root = plan.chordPitchClasses[0]!;
  const fifth = plan.chordPitchClasses[2] ?? root;
  const events: MusicEvent[] = [0, 4, 8, 12].map((step) => ({
    kind: "note",
    step,
    durationSteps: 3.2,
    midi: 36 + (step === 0 || random.next() < 0.5 ? root : fifth),
    velocity: 0.55 + random.next() * 0.15,
    articulation: "pluck",
  }));
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
