import * as Tone from "tone";
import { loadSampleVoice } from "./SampleVoice";
import type {
  AudioServices,
  InstrumentVoice,
  PercussionSound,
  SampleBank,
  SynthVoiceOptions,
} from "../contracts/instrument";

/** Generic sound primitives, injected into one plugin with no access to other tracks. */
export class TrackAudioServices implements AudioServices {
  private readonly voices = new Set<InstrumentVoice>();
  private readonly pending = new Set<() => void>();
  private disposed = false;

  constructor(private readonly destination: Tone.Gain) {}

  private own(voice: InstrumentVoice): InstrumentVoice {
    let disposed = false;
    const managed: InstrumentVoice = {
      play: (event, time, secondsPerStep) => {
        if (!disposed) voice.play(event, time, secondsPerStep);
      },
      releaseAll: (time) => {
        if (!disposed) voice.releaseAll(time);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        voice.dispose();
        this.voices.delete(managed);
      },
    };
    if (this.disposed) {
      managed.dispose();
      throw new Error("Audio track has been disposed");
    }
    this.voices.add(managed);
    return managed;
  }

  createSynthVoice(options: SynthVoiceOptions): InstrumentVoice {
    if (this.disposed) throw new Error("Audio track has been disposed");
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: options.waveform },
      envelope: {
        attack: options.attack,
        decay: options.decay,
        sustain: options.sustain,
        release: options.release,
      },
      volume: options.volumeDb,
    }).connect(this.destination);
    return this.own({
      play(event, time, secondsPerStep) {
        if (event.kind === "note") {
          synth.triggerAttackRelease(
            Tone.Frequency(event.midi, "midi").toFrequency(),
            event.durationSteps * secondsPerStep,
            time,
            event.velocity,
          );
        }
      },
      releaseAll: (time) => {
        synth.releaseAll(time);
      },
      dispose: () => {
        synth.dispose();
      },
    });
  }

  /** The plugin owns its kit mapping; this factory understands only audio primitives. */
  createPercussionVoice(
    kit: Readonly<Record<string, PercussionSound>>,
  ): InstrumentVoice {
    if (this.disposed) throw new Error("Audio track has been disposed");
    const sounds = new Map<
      string,
      {
        play(time: number, velocity: number): void;
        release(time: number): void;
      }
    >();
    const cleanup: (() => void)[] = [];
    try {
      for (const [key, spec] of Object.entries(kit)) {
        if (spec.kind === "membrane") {
          const synth = new Tone.MembraneSynth({
            pitchDecay: spec.pitchDecay,
            octaves: spec.octaves,
            volume: spec.volumeDb,
            envelope: { ...spec.envelope },
          });
          cleanup.push(() => {
            synth.dispose();
          });
          synth.connect(this.destination);
          sounds.set(key, {
            play: (time, velocity) => {
              synth.triggerAttackRelease(
                spec.pitch,
                spec.durationSeconds,
                time,
                velocity,
              );
            },
            release: (time) => {
              synth.triggerRelease(time);
            },
          });
        } else {
          const synth = new Tone.NoiseSynth({
            noise: { type: spec.noise },
            volume: spec.volumeDb,
            envelope: { ...spec.envelope },
          });
          cleanup.push(() => {
            synth.dispose();
          });
          if (spec.highpassHz !== undefined) {
            const filter = new Tone.Filter(spec.highpassHz, "highpass");
            cleanup.push(() => {
              filter.dispose();
            });
            synth.connect(filter);
            filter.connect(this.destination);
          } else synth.connect(this.destination);
          sounds.set(key, {
            play: (time, velocity) => {
              synth.triggerAttackRelease(spec.durationSeconds, time, velocity);
            },
            release: (time) => {
              synth.triggerRelease(time);
            },
          });
        }
      }
    } catch (error) {
      cleanup.forEach((dispose) => dispose());
      throw error;
    }
    return this.own({
      play(event, time) {
        if (event.kind === "hit")
          sounds.get(event.sampleKey)?.play(time, event.velocity);
      },
      releaseAll(time) {
        sounds.forEach((sound) => sound.release(time));
      },
      dispose() {
        cleanup.forEach((dispose) => dispose());
      },
    });
  }

  async createSampleVoice(bank: SampleBank): Promise<InstrumentVoice> {
    if (this.disposed) throw new Error("Audio track has been disposed");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    this.pending.add(cancel);
    try {
      const voice = await loadSampleVoice(
        Tone.getContext(),
        this.destination.input,
        bank,
        controller.signal,
      );
      if (controller.signal.aborted || this.disposed) {
        voice.dispose();
        throw new Error("Audio track disposed while loading samples");
      }
      return this.own(voice);
    } finally {
      this.pending.delete(cancel);
    }
  }

  cancelPending(): void {
    for (const cancel of this.pending) cancel();
    this.pending.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
    for (const voice of this.voices) voice.dispose();
  }
}
