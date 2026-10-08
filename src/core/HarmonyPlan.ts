import { Chord, Note } from "@tonaljs/tonal";
import type { SeededRandom } from "./SeededRandom";

export interface Tonality {
  readonly tonic: number;
  readonly mode: "major" | "minor";
}
const names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const keyName = (key: Tonality) =>
  `${names[key.tonic]} ${key.mode === "major" ? "Major" : "Minor"}`;
export function scale(key: Tonality): number[] {
  return (
    key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  ).map((pc) => (pc + key.tonic) % 12);
}
export function harmony(key: Tonality, degree: number) {
  const qualities =
    key.mode === "major"
      ? ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"]
      : ["m7", "m7b5", "maj7", "m7", "7", "maj7", "7"];
  const chord = `${names[scale(key)[degree]!]}${qualities[degree]}`;
  return {
    chord,
    chordPitchClasses: Chord.get(chord).notes.map((note) => Note.chroma(note)!),
    harmonyFunction: ["I", "ii", "iii", "IV", "V", "vi", "vii"][degree]!,
  };
}
export function progression(key: Tonality, random: SeededRandom): number[] {
  const paths =
    key.mode === "major"
      ? [
          [0, 5, 1, 4],
          [0, 2, 3, 4],
          [0, 3, 1, 4],
          [0, 5, 3, 4],
          [0, 1, 4, 0],
        ]
      : [
          [0, 5, 3, 4],
          [0, 3, 1, 4],
          [0, 6, 5, 4],
          [0, 5, 1, 4],
        ];
  return paths[random.integer(paths.length)]!;
}
export function relatedKey(key: Tonality, random: SeededRandom): Tonality {
  if (random.next() < 0.4)
    return {
      tonic: (key.tonic + (key.mode === "major" ? 9 : 3)) % 12,
      mode: key.mode === "major" ? "minor" : "major",
    };
  return {
    tonic: (key.tonic + (random.next() < 0.5 ? 7 : 5)) % 12,
    mode: key.mode,
  };
}
export function pivot(from: Tonality, to: Tonality) {
  const candidates = [1, 3, 5, 0, 2].map((degree) => harmony(from, degree));
  const destination = Array.from(
    { length: 7 },
    (_, degree) => harmony(to, degree).chord,
  );
  return candidates.find((candidate) => destination.includes(candidate.chord));
}
