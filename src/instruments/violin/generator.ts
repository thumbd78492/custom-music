import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";
import { material, pitch } from "./motif";
import type { ViolinState } from "./motif";
export type { ViolinState } from "./motif";

export function proposeBar(
  plan: BarPlan,
  state: Readonly<ViolinState>,
): InstrumentIntent {
  const { notes } = material(plan, state);
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      notes.some((note) => note.step === step) ? 0.65 : 0,
    ),
    density: notes.length / 8,
    register: "high",
    leadActivity: notes.length ? Math.min(1, 0.45 + notes.length * 0.1) : 0,
  };
}
export function generateBar(
  plan: BarPlan,
  _own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<ViolinState>,
) {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "violin", "performance"),
  );
  const { theme, startedAt, notes } = material(plan, state);
  let previous = state.previousMidi;
  const events: MusicEvent[] = [];
  notes.forEach((note, index) => {
    // A crowded upper register leaves a breathing space; never split the saved theme.
    if (ensemble.highRegisterLoad > 0.55 && index === notes.length - 1) return;
    const midi = pitch(plan, note.degree, note.step, previous);
    previous = midi;
    events.push({
      kind: "note",
      step: note.step,
      durationSteps: Math.min(note.duration, 16 - note.step),
      midi,
      velocity: Math.min(
        0.76,
        0.48 +
          plan.energy * 0.16 +
          random.next() * 0.08 -
          ensemble.density * 0.025,
      ),
      articulation: "sustain",
    });
  });
  return {
    events,
    nextState: {
      barsPlayed: state.barsPlayed + 1,
      theme,
      homeTheme: state.homeTheme ?? theme,
      themeStartedAt: startedAt,
      previousMidi: previous,
    },
  };
}
