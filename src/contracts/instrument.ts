import type {
  BarPlan,
  EnsembleIntent,
  InstrumentIntent,
  MusicEvent,
} from "./music";

export interface InstrumentControlDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: "range";
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
}

export interface InstrumentManifest {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly controls: readonly InstrumentControlDefinition[];
  readonly sound: {
    readonly kind: "synth-placeholder" | "samples";
    readonly label: string;
  };
}

export interface InstrumentVoice {
  play(event: MusicEvent, audioTimeSec: number, secondsPerStep: number): void;
  releaseAll(audioTimeSec: number): void;
  dispose(): void;
}

/** Owned by one plugin. URLs are module-relative imports supplied by that plugin. */
export interface SampleBank {
  readonly kind: "pitched" | "percussion";
  readonly urls: Readonly<Record<string, string>>;
  readonly releaseSeconds: number;
  readonly licenseRecord: string;
}

export interface SynthVoiceOptions {
  readonly waveform: "sine" | "triangle" | "sawtooth" | "square";
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly volumeDb: number;
}

export interface PercussionEnvelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

/** A plugin selects its sound keys and primitive configuration. */
export type PercussionSound = {
  readonly envelope: PercussionEnvelope;
  readonly volumeDb: number;
  readonly durationSeconds: number;
} & (
  | {
      readonly kind: "membrane";
      readonly pitch: string | number;
      readonly pitchDecay: number;
      readonly octaves: number;
    }
  | {
      readonly kind: "noise";
      readonly noise: "white" | "pink" | "brown";
      readonly highpassHz?: number;
    }
);

/** Injected track-scoped factories: plugins cannot access another track. */
export interface AudioServices {
  createSynthVoice(options: SynthVoiceOptions): InstrumentVoice;
  createPercussionVoice(
    kit: Readonly<Record<string, PercussionSound>>,
  ): InstrumentVoice;
  createSampleVoice(bank: SampleBank): Promise<InstrumentVoice>;
}

export interface InstrumentPlugin<State = unknown> {
  readonly manifest: InstrumentManifest;
  createInitialState(): State;
  proposeBar(plan: BarPlan, state: Readonly<State>): InstrumentIntent;
  generateBar(
    plan: BarPlan,
    ownIntent: InstrumentIntent,
    ensemble: EnsembleIntent,
    state: Readonly<State>,
  ): { readonly events: readonly MusicEvent[]; readonly nextState: State };
  createVoice(audio: AudioServices): Promise<InstrumentVoice>;
}

/** Closure captures State so Host never casts or inspects plugin-private state. */
export interface InstrumentSession {
  propose(plan: BarPlan): InstrumentIntent;
  generate(
    plan: BarPlan,
    own: InstrumentIntent,
    ensemble: EnsembleIntent,
  ): readonly MusicEvent[];
}
export interface PluginModule {
  readonly plugin: InstrumentPlugin;
}
export interface PluginDescriptor {
  readonly manifest: InstrumentManifest;
  readonly load: () => Promise<PluginModule>;
}
