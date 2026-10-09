import type { InstrumentInstance } from "../../contracts/instrument";
import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
} from "../../contracts/music";
import {
  generateBar as accompany,
  proposeBar as proposeAccompaniment,
} from "./accompaniment";
import type { PianoState as AccompanimentState } from "./accompaniment";
import { generateMelody, proposeMelody } from "./melody";
import type { MelodyState } from "./melody";

export interface PianoState extends AccompanimentState, MelodyState {}
export function proposeBar(
  plan: BarPlan,
  state: Readonly<PianoState>,
  instance?: InstrumentInstance,
): InstrumentIntent {
  return instance?.characterId === "piano-melody"
    ? proposeMelody(plan, state)
    : proposeAccompaniment(plan);
}
export function generateBar(
  plan: BarPlan,
  own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<PianoState>,
  instance?: InstrumentInstance,
) {
  return instance?.characterId === "piano-melody"
    ? generateMelody(plan, own, ensemble, state)
    : accompany(plan, own, ensemble, state);
}
