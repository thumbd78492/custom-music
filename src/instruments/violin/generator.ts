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
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - plan.phrasePosition,
      "violin",
      "dynamics",
    ),
  );
  const { theme, startedAt, notes: original } = material(plan, state);
  const assignment = ensemble.assignment;
  const [start, end] = assignment?.stepRange ?? [0, 16];
  let notes =
    assignment?.task === "rest"
      ? []
      : original.filter(
          (note) =>
            note.step >= start && end - note.step >= (assignment ? 2.5 : 0),
        );
  if (
    !notes.length &&
    assignment &&
    assignment.task !== "rest" &&
    end > start
  ) {
    const source =
      theme.bars[(plan.barIndex - startedAt) % theme.bars.length]![0]!;
    notes = [
      {
        ...source,
        step: start,
        duration: Math.min(5, end - start),
        rebow: true,
      },
    ];
  }
  if (assignment?.task === "support")
    notes = notes.slice(0, 1).map((note) => ({
      ...note,
      duration: Math.min(6, end - note.step),
      rebow: true,
    }));
  if (plan.groovePlan?.familyId === "half-time" && notes.length >= 4) {
    // Omit one interior attack and sustain its neighbour. The motif remains
    // untouched, and the next saved rebow still determines the breath.
    notes = notes.filter((_, index) => index !== 1);
    notes = notes.map((note, index) =>
      index === 0
        ? {
            ...note,
            duration: notes[1]!.step - note.step - (notes[1]!.rebow ? 0.6 : 0),
          }
        : note,
    );
  }
  let previous = state.previousMidi;
  let previousEnd = state.previousEndStep ?? -100;
  const targetVelocity =
    0.5 + plan.energy * 0.13 + random.next() * 0.035 - ensemble.density * 0.02;
  const phraseVelocity =
    state.phraseVelocity === undefined
      ? targetVelocity
      : plan.phrasePosition === 0
        ? state.phraseVelocity + (targetVelocity - state.phraseVelocity) * 0.35
        : state.phraseVelocity;
  const events: MusicEvent[] = [];
  notes.forEach((note, index) => {
    // A crowded upper register leaves a breathing space; never split the saved theme.
    if (
      !assignment &&
      ensemble.highRegisterLoad > 0.55 &&
      index === notes.length - 1
    )
      return;
    const midi = pitch(plan, note.degree, note.step, previous);
    const absoluteStep = plan.barIndex * 16 + note.step;
    const connected =
      absoluteStep - previousEnd <= 0.1 &&
      previous !== undefined &&
      Math.abs(midi - previous) <= 4 &&
      !note.rebow;
    const durationSteps = Math.min(note.duration, end - note.step);
    previous = midi;
    events.push({
      kind: "note",
      step: note.step,
      durationSteps,
      midi,
      velocity: Math.min(
        0.74,
        phraseVelocity +
          Math.sin(
            ((plan.phrasePosition + index / Math.max(1, notes.length - 1)) /
              plan.phraseLength) *
              Math.PI,
          ) *
            0.018 -
          (index === notes.length - 1 &&
          plan.phrasePosition === plan.phraseLength - 1
            ? 0.015
            : 0),
      ),
      articulation: connected ? "legato" : note.rebow ? "rebow" : "detached",
    });
    previousEnd = absoluteStep + durationSteps;
  });
  return {
    events,
    nextState: {
      barsPlayed: state.barsPlayed + 1,
      theme,
      homeTheme: state.homeTheme ?? theme,
      themeStartedAt: startedAt,
      previousMidi: previous,
      previousEndStep: previousEnd,
      phraseVelocity,
    },
  };
}
