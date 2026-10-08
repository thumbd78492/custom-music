import type { BarPlan } from "../../contracts/music";
import { deriveSeed, SeededRandom } from "../../core/SeededRandom";

export interface MotifNote {
  readonly step: number;
  readonly duration: number;
  readonly degree: number;
  readonly rebow?: boolean;
}
export interface Motif {
  readonly id: string;
  readonly bars: readonly (readonly MotifNote[])[];
}
export interface ViolinState {
  readonly barsPlayed: number;
  readonly theme?: Motif;
  readonly homeTheme?: Motif;
  readonly themeStartedAt?: number;
  readonly previousMidi?: number;
  readonly previousEndStep?: number;
  readonly phraseVelocity?: number;
}
const rhythms = [
  [0, 4, 8, 12],
  [0, 6, 10],
  [2, 6, 10, 13],
  [0, 6, 12],
  [0, 4, 10],
  [2, 8, 12],
];
function createMotif(plan: BarPlan): Motif {
  const random = new SeededRandom(
    deriveSeed(plan.rootSeed, plan.barIndex, "violin", "theme"),
  );
  const length = random.next() < 0.55 ? 2 : 4;
  let degree = random.integer(3);
  const bars = Array.from({ length }, (_, bar) => {
    const rhythm = rhythms[random.integer(rhythms.length)]!;
    return rhythm.map((step, index) => {
      // Mostly adjacent scale degrees with an occasional third/fourth, followed
      // by a reversal. The resulting contour is stored, not redrawn each bar.
      let direction = bar < length / 2 ? 1 : -1;
      if (degree >= 4) direction = -1;
      if (degree <= -1) direction = 1;
      degree = Math.max(
        -1,
        Math.min(
          5,
          degree + (random.next() < 0.12 ? 2 * direction : direction),
        ),
      );
      // Approach the ending instead of forcing a large jump to the tonic.
      if (bar === length - 1) degree += degree > 0 ? -1 : degree < 0 ? 1 : 0;
      const next = rhythm[index + 1] ?? 16;
      const nextRebows = (index + 1) % 3 === 0 && index + 1 < rhythm.length;
      return {
        step,
        duration: Math.max(2.5, next - step - (nextRebows ? 0.6 : 0)),
        degree,
        rebow: index === 0 || index % 3 === 0,
      };
    });
  });
  return { id: `${plan.rootSeed}:${plan.barIndex}`, bars };
}
export function material(plan: BarPlan, state: Readonly<ViolinState>) {
  const age = plan.barIndex - (state.themeStartedAt ?? plan.barIndex);
  const maxAge =
    plan.variationMode === "Subtle"
      ? 64
      : plan.variationMode === "Experimental"
        ? 16
        : 32;
  const renew =
    plan.phrasePosition === 0 &&
    ((plan.development === "renew" && age >= 8) || age >= maxAge);
  const theme =
    plan.development === "recall" && state.homeTheme
      ? state.homeTheme
      : !state.theme || renew
        ? createMotif(plan)
        : state.theme;
  const changed = theme.id !== state.theme?.id;
  const startedAt = changed
    ? plan.barIndex
    : (state.themeStartedAt ?? plan.barIndex);
  const original = theme.bars[(plan.barIndex - startedAt) % theme.bars.length]!;
  const rest =
    (plan.section === "Breakdown" && plan.phrasePosition % 2 === 1) ||
    (plan.density < 0.4 && plan.phrasePosition === 3);
  let notes = rest ? [] : [...original];
  if (plan.development === "vary" && notes.length) {
    // Keep the rhythmic identity while changing the phrase ending/one interval.
    notes = notes.map((note, i) =>
      i === notes.length - 1
        ? {
            ...note,
            degree: note.degree + (plan.sectionIndex % 2 ? -1 : 1),
            duration: Math.max(2.5, note.duration - 0.5),
          }
        : note,
    );
  }
  if (plan.phrasePosition === plan.phraseLength - 1 && notes.length) {
    notes = notes.map((note, index) =>
      index === notes.length - 1
        ? {
            ...note,
            duration: Math.max(2.5, Math.min(note.duration, 15 - note.step)),
          }
        : note,
    );
  }
  return { theme, startedAt, notes };
}

export function pitch(
  plan: BarPlan,
  degree: number,
  step: number,
  previous?: number,
): number {
  const scale = plan.scalePitchClasses;
  const octaveDegree = Math.floor(degree / scale.length);
  const pc = scale[((degree % scale.length) + scale.length) % scale.length]!;
  const tonicMidi = plan.tonic + (plan.tonic < 9 ? 72 : 60);
  const target = Math.max(
    69,
    Math.min(84, tonicMidi + ((pc - plan.tonic + 12) % 12) + octaveDegree * 12),
  );
  const strong = step % 4 === 0;
  // Harmony is a preference, not a compulsory jump on every strong beat.
  const allowed = [...new Set([...scale, ...plan.chordPitchClasses])];
  const candidates = Array.from({ length: 16 }, (_, i) => 69 + i).filter(
    (midi) => allowed.includes(midi % 12),
  );
  return candidates.sort((a, b) => {
    const score = (midi: number) =>
      Math.abs(midi - target) +
      (strong && !plan.chordPitchClasses.includes(midi % 12) ? 1.2 : 0) +
      (!scale.includes(midi % 12) ? 1 : 0) +
      (previous === undefined
        ? 0
        : Math.abs(midi - previous) * 0.18 +
          Math.max(0, Math.abs(midi - previous) - 4) * 5);
    return score(a) - score(b) || a - b;
  })[0]!;
}
