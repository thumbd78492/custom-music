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
  readonly section: string;
  readonly phrasePosition: number;
  readonly energy: number;
  readonly groove: readonly number[];
}

export interface InstrumentIntent {
  readonly accents: readonly number[];
  readonly density: number;
  readonly register?: "low" | "mid" | "high" | "wide";
  readonly leadActivity?: number;
}

export interface EnsembleIntent {
  readonly accents: readonly number[];
  readonly density: number;
  readonly lowRegisterLoad: number;
  readonly midRegisterLoad: number;
  readonly highRegisterLoad: number;
  readonly leadActivity: number;
}
