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
export function proposeBar(): InstrumentIntent {
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      step % 4 === 0 ? 1 : step % 2 === 0 ? 0.3 : 0,
    ),
    density: 0.75,
    register: "wide",
    leadActivity: 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  _ensemble: EnsembleIntent,
  state: Readonly<DrumsState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "drums", "hits"),
  );
  const events: MusicEvent[] = [];
  for (let step = 0; step < 16; step += 2) {
    if (step % 8 === 0)
      events.push({
        kind: "hit",
        step,
        sampleKey: "kick",
        velocity: 0.72 + random.next() * 0.12,
      });
    if (step % 8 === 4)
      events.push({
        kind: "hit",
        step,
        sampleKey: "snare",
        velocity: 0.55 + random.next() * 0.12,
      });
    events.push({
      kind: "hit",
      step,
      sampleKey: "hat",
      velocity: 0.24 + random.next() * 0.12,
    });
  }
  return { events, nextState: { barsPlayed: state.barsPlayed + 1 } };
}
