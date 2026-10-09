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
  /** Declarative performers owned by this module; absent only for legacy plugins. */
  readonly characters?: readonly CharacterDefinition[];
  readonly sound: {
    readonly kind: "synth-placeholder" | "samples";
    readonly label: string;
  };
}

export type PhraseTask = "lead" | "respond" | "support" | "rest";
export interface CharacterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly string[];
  readonly default?: boolean;
  readonly phrase: {
    readonly tasks: readonly PhraseTask[];
    readonly leadWeight: number;
    readonly register?: readonly [number, number];
  };
}
export interface InstrumentInstance {
  readonly pluginId: string;
  readonly characterId: string;
  readonly instanceId: string;
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
  /** Keys correspond to urls; omitted MIDI values use the numeric URL key. */
  readonly regions?: Readonly<Record<string, SampleRegion>>;
  readonly attackSeconds?: number;
  readonly gainDb?: number;
  readonly maxVoices?: number;
  readonly monophonic?: boolean;
  readonly transitionSeconds?: number;
}

export interface SampleRegion {
  readonly midi?: number;
  readonly tuneCents?: number;
  readonly minVelocity?: number;
  readonly maxVelocity?: number;
  /** Calibration of one recording relative to its bank, before performance gain. */
  readonly gainDb?: number;
  /** Seconds in the source recording; both values must be supplied together. */
  readonly loopStart?: number;
  readonly loopEnd?: number;
}

/** Instrument-neutral primitives; articulation decisions belong to the plugin. */
export interface SamplePlayback {
  readonly layers?: readonly {
    readonly key: string;
    readonly weight: number;
  }[];
  /** Source-recording seconds, independent of the requested pitch/playback rate. */
  readonly offsetSeconds?: number;
  readonly attackSeconds?: number;
  readonly transitionSeconds?: number;
  readonly equalPowerTransition?: boolean;
  /** Extend matching sources without restarting their recording or changing pitch. */
  readonly continueMatching?: boolean;
}
export type SamplePerformance = (
  event: MusicEvent,
  audioTimeSec: number,
  secondsPerStep: number,
) => SamplePlayback;

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
  createSampleVoice(
    bank: SampleBank,
    performance?: SamplePerformance,
  ): Promise<InstrumentVoice>;
}

export interface InstrumentPlugin<State = unknown> {
  readonly manifest: InstrumentManifest;
  createInitialState(instance?: InstrumentInstance): State;
  proposeBar(
    plan: BarPlan,
    state: Readonly<State>,
    instance?: InstrumentInstance,
  ): InstrumentIntent;
  generateBar(
    plan: BarPlan,
    ownIntent: InstrumentIntent,
    ensemble: EnsembleIntent,
    state: Readonly<State>,
    instance?: InstrumentInstance,
  ): { readonly events: readonly MusicEvent[]; readonly nextState: State };
  createVoice(audio: AudioServices): Promise<InstrumentVoice>;
}

/** Closure captures State so Host never casts or inspects plugin-private state. */
export interface InstrumentSession {
  readonly instance?: InstrumentInstance;
  readonly character?: CharacterDefinition;
  /** Opaque transaction state; Host can retain it but never inspect it. */
  checkpoint?(): unknown;
  restore?(checkpoint: unknown): void;
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
