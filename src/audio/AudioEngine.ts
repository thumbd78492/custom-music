import * as Tone from "tone";
import type { AudioServices, InstrumentVoice } from "../contracts/instrument";
import type { BarPlan, MusicEvent } from "../contracts/music";
import { TrackAudioServices } from "./AudioServices";
import { MasterMixer } from "./MasterMixer";
import { ToneClock } from "./ToneClock";

export interface PreparedBar {
  readonly plan: BarPlan;
  readonly tracks: readonly {
    readonly id: string;
    readonly active: boolean;
    readonly muted: boolean;
    readonly solo: boolean;
    readonly events: readonly MusicEvent[];
  }[];
}

export interface AudioEnginePort {
  unlock(): Promise<void>;
  createTrack(id: string): AudioServices;
  setVoice(id: string, voice: InstrumentVoice): void;
  removeTrack(id: string): void;
  start(bpm: number): void;
  stop(): void;
  dispose(): void;
  scheduleBar(bar: PreparedBar, onBoundary: (bar: PreparedBar) => void): void;
  currentBar(): number;
}

interface Track {
  readonly services: TrackAudioServices;
  voice?: InstrumentVoice;
  audible: boolean;
}

/** Converts already-generated MusicEvents into audio-time callbacks. */
export class AudioEngine implements AudioEnginePort {
  private readonly clock = new ToneClock();
  private readonly mixer = new MasterMixer();
  private readonly tracks = new Map<string, Track>();
  private lastSubmittedBar = -1;

  unlock(): Promise<void> {
    return this.clock.unlock();
  }

  createTrack(id: string): AudioServices {
    if (this.tracks.has(id)) throw new Error(`Track already exists: ${id}`);
    const services = new TrackAudioServices(this.mixer.addTrack(id));
    this.tracks.set(id, { services, audible: false });
    return services;
  }

  setVoice(id: string, voice: InstrumentVoice): void {
    const track = this.tracks.get(id);
    if (!track) {
      voice.dispose();
      throw new Error(`Unknown track: ${id}`);
    }
    track.voice?.dispose();
    track.voice = voice;
  }

  removeTrack(id: string): void {
    const track = this.tracks.get(id);
    track?.voice?.dispose();
    track?.services.dispose();
    this.tracks.delete(id);
    this.mixer.removeTrack(id);
  }

  start(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0)
      throw new Error("BPM must be positive");
    this.clock.start(bpm);
  }

  scheduleBar(bar: PreparedBar, onBoundary: (bar: PreparedBar) => void): void {
    if (bar.plan.barIndex <= this.lastSubmittedBar)
      throw new Error(
        `Bar ${bar.plan.barIndex} was already scheduled or is out of order`,
      );
    this.lastSubmittedBar = bar.plan.barIndex;
    const secondsPerStep = 60 / bar.plan.bpm / 4;
    const startBeat = bar.plan.barIndex * 4;
    const anySolo = bar.tracks.some((track) => track.active && track.solo);
    const audible = (track: PreparedBar["tracks"][number]) =>
      track.active && !track.muted && (!anySolo || track.solo);

    this.clock.schedule(startBeat, (time) => {
      for (const state of bar.tracks) {
        const track = this.tracks.get(state.id);
        if (!track) continue;
        const nextAudible = audible(state);
        this.mixer.setAudible(state.id, nextAudible, time);
        if (track.audible && !nextAudible) track.voice?.releaseAll(time);
        track.audible = nextAudible;
      }
      this.clock.atBoundary(time, () => onBoundary(bar));
    });
    for (const state of bar.tracks) {
      if (!audible(state)) continue;
      for (const event of state.events) {
        // A negative humanization cannot precede this bar's mixing boundary.
        const offsetBeats = Math.max(
          0,
          event.step / 4 +
            (((event.microOffsetMs ?? 0) / 1000) * bar.plan.bpm) / 60,
        );
        this.clock.schedule(startBeat + offsetBeats, (time) => {
          this.tracks.get(state.id)?.voice?.play(event, time, secondsPerStep);
        });
      }
    }
  }

  currentBar(): number {
    return this.clock.currentBar();
  }

  stop(): void {
    this.clock.stop();
    const now = Tone.immediate();
    this.mixer.silence(now);
    for (const track of this.tracks.values()) {
      track.voice?.releaseAll(now);
      track.audible = false;
    }
    this.lastSubmittedBar = -1;
    // Host removes/recreates voices on restart to discard attacks already passed to Web Audio.
  }

  dispose(): void {
    this.stop();
    for (const id of this.tracks.keys()) this.removeTrack(id);
    this.mixer.dispose();
  }
}
