import type { PhraseTask } from "./instrument";

export type MusicEvent =
  | {
      readonly kind: "note";
      readonly step: number;
      readonly durationSteps: number;
      readonly midi: number;
      readonly velocity: number;
      readonly articulation?: string;
      readonly microOffsetMs?: number;
    }
  | {
      readonly kind: "hit";
      readonly step: number;
      readonly sampleKey: string;
      readonly velocity: number;
      readonly microOffsetMs?: number;
    };

export type VariationMode = "Subtle" | "Balanced" | "Experimental";
export type SectionName =
  "Introduction" | "Main" | "Variation" | "Breakdown" | "Return";
export interface BarPlan {
  readonly barIndex: number;
  readonly rootSeed: string;
  readonly bpm: number;
  readonly meter: "4/4";
  readonly key: string;
  readonly chord: string;
  readonly nextChord: string;
  /** Pitch classes, calculated by the Director. Plugins choose their own register. */
  readonly chordPitchClasses: readonly number[];
  readonly nextChordPitchClasses: readonly number[];
  readonly scalePitchClasses: readonly number[];
  readonly tonic: number;
  readonly tonality: "major" | "minor";
  readonly harmonyFunction: string;
  readonly modulation?: "pivot" | "dominant" | "arrival";
  readonly section: SectionName;
  readonly sectionIndex: number;
  readonly sectionBar: number;
  readonly sectionLength: number;
  readonly phraseLength: number;
  readonly phrasePosition: number;
  readonly energy: number;
  readonly density: number;
  readonly complexity: number;
  readonly variationMode: VariationMode;
  readonly development: "repeat" | "vary" | "renew" | "recall";
  readonly groove: readonly number[];
}

export interface InstrumentIntent {
  readonly accents: readonly number[];
  readonly density: number;
  readonly register?: "low" | "mid" | "high" | "wide";
  readonly leadActivity?: number;
  /** Anonymous low-frequency percussive anchors, not plugin IDs or events. */
  readonly pulseAccents?: readonly number[];
  readonly rhythmic?: boolean;
}

export interface EnsembleIntent {
  readonly accents: readonly number[];
  readonly density: number;
  readonly lowRegisterLoad: number;
  readonly midRegisterLoad: number;
  readonly highRegisterLoad: number;
  readonly leadActivity: number;
  readonly pulseAccents?: readonly number[];
  /** Recipient's own task; occupancy fields above describe OTHER audible instances. */
  readonly assignment?: PhraseAssignment;
  readonly audibleLeadCount?: number;
}

export interface PhraseAssignment {
  readonly phraseStartBar: number;
  readonly task: PhraseTask;
  /** Allowed attacks and note ends in this bar, end exclusive. */
  readonly stepRange: readonly [number, number];
  readonly densityScale: number;
  readonly register?: readonly [number, number];
}
