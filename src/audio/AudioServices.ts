import * as Tone from "tone";
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
    if (Object.keys(bank.urls).length === 0)
      throw new Error("Sample bank has no sample URLs");
    if (!bank.licenseRecord.trim())
      throw new Error("Sample bank needs a license record");
    if (!Number.isFinite(bank.releaseSeconds) || bank.releaseSeconds < 0)
      throw new Error("Invalid sample release duration");

    return new Promise<InstrumentVoice>((resolve, reject) => {
      let node: Tone.Sampler | Tone.Players | undefined;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.pending.delete(cancel);
        node?.dispose();
        reject(error);
      };
      const cancel = () =>
        fail(new Error("Audio track disposed while loading samples"));
      this.pending.add(cancel);
      // Defer completion in case an already-cached buffer invokes onload in construction.
      const loaded = () =>
        queueMicrotask(() => {
          if (settled || !node) return;
          settled = true;
          this.pending.delete(cancel);
          try {
            const voice: InstrumentVoice =
              node instanceof Tone.Sampler
                ? this.sampleNotes(node)
                : this.sampleHits(node);
            resolve(this.own(voice));
          } catch (error) {
            node.dispose();
            reject(error);
          }
        });
      try {
        node =
          bank.kind === "pitched"
            ? new Tone.Sampler({
                urls: { ...bank.urls },
                release: bank.releaseSeconds,
                onload: loaded,
                onerror: fail,
              })
            : new Tone.Players({
                urls: { ...bank.urls },
                fadeOut: bank.releaseSeconds,
                onload: loaded,
                onerror: fail,
              });
        if (settled) node.dispose();
        else node.connect(this.destination);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private sampleNotes(sampler: Tone.Sampler): InstrumentVoice {
    return {
      play(event, time, secondsPerStep) {
        if (event.kind === "note")
          sampler.triggerAttackRelease(
            Tone.Frequency(event.midi, "midi").toFrequency(),
            event.durationSteps * secondsPerStep,
            time,
            event.velocity,
          );
      },
      releaseAll: (time) => {
        sampler.releaseAll(time);
      },
      dispose: () => {
        sampler.dispose();
      },
    };
  }

  private sampleHits(players: Tone.Players): InstrumentVoice {
    return {
      play(event, time) {
        if (event.kind !== "hit" || !players.has(event.sampleKey)) return;
        const player = players.player(event.sampleKey);
        player.volume.setValueAtTime(
          Tone.gainToDb(Math.max(event.velocity, 0.0001)),
          time,
        );
        player.start(time);
      },
      releaseAll: (time) => {
        players.stopAll(time);
      },
      dispose: () => {
        players.dispose();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pending) cancel();
    for (const voice of this.voices) voice.dispose();
  }
}
