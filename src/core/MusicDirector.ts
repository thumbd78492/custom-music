import { Chord, Note } from "@tonaljs/tonal";
import type { BarPlan } from "../contracts/music";

export const ENGINE_VERSION = "m0.1";
export const HARMONY = ["Cmaj7", "Am7", "Dm7", "G7"] as const;
export class MusicDirector {
  constructor(readonly seed: string) {}
  planBar(barIndex: number): BarPlan {
    const chord = HARMONY[barIndex % HARMONY.length]!;
    return Object.freeze({
      barIndex,
      rootSeed: this.seed,
      bpm: 88,
      meter: "4/4",
      key: "C Major",
      chord,
      nextChord: HARMONY[(barIndex + 1) % HARMONY.length]!,
      chordPitchClasses: Object.freeze(
        Chord.get(chord).notes.map((note) => Note.chroma(note)!),
      ),
      section: "m0",
      phrasePosition: barIndex % 4,
      energy: 0.5,
      groove: Object.freeze(
        Array.from({ length: 16 }, (_, step) =>
          step % 4 === 0 ? 1 : step % 2 === 0 ? 0.45 : 0.15,
        ),
      ),
    });
  }
}
