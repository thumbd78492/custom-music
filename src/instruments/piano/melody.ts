import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

interface ThemeNote {
  readonly step: number;
  readonly degree: number;
  readonly duration: number;
}
export interface PianoTheme {
  readonly id: string;
  readonly bars: readonly (readonly ThemeNote[])[];
}
export interface MelodyState {
  readonly barsPlayed: number;
  readonly theme?: PianoTheme;
  readonly homeTheme?: PianoTheme;
  readonly themeStartedAt?: number;
  readonly previousMidi?: number;
  readonly leadPhrases?: readonly number[];
}

export function themeMaterial(plan: BarPlan, state: Readonly<MelodyState>) {
  const age = plan.barIndex - (state.themeStartedAt ?? plan.barIndex);
  const renew =
    plan.phrasePosition === 0 &&
    age >= (plan.variationMode === "Subtle" ? 48 : 24) &&
    plan.development === "renew";
  let theme = plan.development === "recall" ? state.homeTheme : state.theme;
  if (!theme || renew) {
    const random = new SeededRandom(
      deriveSeed(plan.rootSeed, plan.barIndex, "piano", "melody-theme"),
    );
    const contours = [
      [0, 1, 3, 2, 1, 2, 1, 0],
      [2, 1, 0, 1, 3, 2, 1, 0],
      [0, 2, 1, 3, 2, 1, 0, 0],
    ];
    const contour = contours[random.integer(contours.length)]!;
    const rhythms = [
      [0, 4, 7, 10],
      [0, 3, 8, 11],
      [1, 5, 8, 12],
    ];
    const rhythm = rhythms[random.integer(rhythms.length)]!;
    theme = {
      id: `${plan.rootSeed}:${plan.barIndex}:melody`,
      bars: Array.from({ length: 2 }, (_, bar) =>
        rhythm.map((step, i) => ({
          step,
          degree: contour[bar * 4 + i]!,
          duration: (rhythm[i + 1] ?? 15) - step - 0.6,
        })),
      ),
    };
  }
  const startedAt =
    theme.id === state.theme?.id
      ? (state.themeStartedAt ?? plan.barIndex)
      : plan.barIndex;
  let notes = [...theme.bars[(plan.barIndex - startedAt) % theme.bars.length]!];
  if (plan.development === "vary")
    notes = notes.map((note, i) =>
      i === 2
        ? { ...note, degree: note.degree + (plan.sectionIndex % 2 ? -1 : 1) }
        : note,
    );
  if (plan.phrasePosition === plan.phraseLength - 1)
    notes = notes
      .filter((n) => n.step < 12)
      .map((note, i, all) =>
        i === all.length - 1
          ? { ...note, degree: 0, duration: Math.min(3, 14 - note.step) }
          : note,
      );
  return { theme, startedAt, notes };
}

function pitch(
  plan: BarPlan,
  note: ThemeNote,
  previous: number | undefined,
  range: readonly [number, number],
) {
  const scale = plan.scalePitchClasses;
  const degree = ((note.degree % scale.length) + scale.length) % scale.length;
  const pc = scale[degree]!;
  const target =
    60 +
    plan.tonic +
    ((pc - plan.tonic + 12) % 12) +
    Math.floor(note.degree / scale.length) * 12;
  const candidates = Array.from(
    { length: range[1] - range[0] + 1 },
    (_, i) => range[0] + i,
  ).filter(
    (midi) =>
      scale.includes(midi % 12) || plan.chordPitchClasses.includes(midi % 12),
  );
  const score = (midi: number) =>
    Math.abs(midi - target) +
    (note.step % 4 === 0 && !plan.chordPitchClasses.includes(midi % 12)
      ? 2.5
      : 0) +
    (previous === undefined
      ? 0
      : Math.max(0, Math.abs(midi - previous) - 5) * 3);
  return candidates.sort((a, b) => score(a) - score(b) || a - b)[0]!;
}

export function proposeMelody(
  plan: BarPlan,
  state: Readonly<MelodyState>,
): InstrumentIntent {
  const { notes } = themeMaterial(plan, state);
  return {
    accents: Array.from({ length: 16 }, (_, step) =>
      notes.some((n) => n.step === step) ? 0.7 : 0,
    ),
    density: notes.length / 8,
    register: "high",
    leadActivity: 0.85,
  };
}

export function generateMelody(
  plan: BarPlan,
  _own: InstrumentIntent,
  ensemble: EnsembleIntent,
  state: Readonly<MelodyState>,
) {
  const { theme, startedAt, notes: original } = themeMaterial(plan, state);
  const assignment = ensemble.assignment;
  const [start, end] = assignment?.stepRange ?? [0, 16];
  let notes =
    assignment?.task === "rest"
      ? []
      : original.filter((n) => n.step >= start && n.step < end);
  if (!notes.length && end > start && assignment?.task !== "rest")
    notes = [
      { ...original[0]!, step: start, duration: Math.min(4, end - start) },
    ];
  if (assignment?.task === "support")
    notes = notes
      .slice(0, 1)
      .map((n) => ({ ...n, duration: Math.min(5, end - n.step) }));
  if (plan.groovePlan?.familyId === "half-time" && notes.length >= 3) {
    // Keep the theme and contour; one interior attack becomes a longer breath.
    // This is a performance view, never a replacement for the saved material.
    notes = notes.filter((_, i) => i !== 1);
    notes = notes.map((note, i) =>
      i === 0
        ? {
            ...note,
            duration: Math.min(8, notes[i + 1]!.step - note.step - 0.6),
          }
        : note,
    );
  }
  if (
    plan.groovePlan?.familyId === "light-swing" &&
    assignment?.task === "respond" &&
    notes.length
  )
    notes = notes.map((note, i) =>
      i === notes.length - 1
        ? { ...note, duration: Math.max(1.2, note.duration - 0.5) }
        : note,
    );
  const random = new SeededRandom(
    deriveSeed(
      plan.rootSeed,
      plan.barIndex - plan.phrasePosition,
      "piano",
      "melody-touch",
    ),
  );
  const touch = 0.64 + plan.energy * 0.04 + random.next() * 0.015;
  let previous = state.previousMidi;
  const events: MusicEvent[] = notes.map((note, i) => {
    const midi = pitch(plan, note, previous, assignment?.register ?? [62, 76]);
    previous = midi;
    return {
      kind: "note",
      step: note.step,
      durationSteps: Math.min(note.duration, end - note.step),
      midi,
      velocity:
        touch +
        (i === 0 ? 0.015 : 0) -
        (assignment?.task === "support" ? 0.08 : 0),
      articulation: "melody",
    };
  });
  const leadPhrases =
    assignment?.task === "lead" &&
    !state.leadPhrases?.includes(assignment.phraseStartBar)
      ? [...(state.leadPhrases ?? []), assignment.phraseStartBar].slice(-16)
      : state.leadPhrases;
  return {
    events,
    nextState: {
      ...state,
      barsPlayed: state.barsPlayed + 1,
      theme,
      homeTheme: state.homeTheme ?? theme,
      themeStartedAt: startedAt,
      previousMidi: previous,
      leadPhrases,
    },
  };
}
