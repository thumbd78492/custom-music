import * as Tone from "tone";

export const TRACK_FADE_SECONDS = 0.03;

/** One output chain, with an isolated gain node for every plugin instance. */
export class MasterMixer {
  private readonly master = new Tone.Gain(0.65);
  private readonly limiter = new Tone.Limiter(-1).toDestination();
  private readonly tracks = new Map<string, Tone.Gain>();

  constructor() {
    this.master.connect(this.limiter);
  }

  addTrack(id: string): Tone.Gain {
    if (this.tracks.has(id)) throw new Error(`Track already exists: ${id}`);
    const gain = new Tone.Gain(0).connect(this.master);
    this.tracks.set(id, gain);
    return gain;
  }

  setAudible(id: string, audible: boolean, time: number, volume = 1): void {
    const track = this.tracks.get(id);
    if (!track) return;
    track.gain.cancelAndHoldAtTime(time);
    track.gain.linearRampToValueAtTime(
      audible ? volume : 0,
      time + TRACK_FADE_SECONDS,
    );
  }

  silence(time: number): void {
    for (const track of this.tracks.values()) {
      track.gain.cancelAndHoldAtTime(time);
      track.gain.linearRampToValueAtTime(0, time + TRACK_FADE_SECONDS);
    }
  }

  removeTrack(id: string): void {
    this.tracks.get(id)?.dispose();
    this.tracks.delete(id);
  }

  /** Detach identity now; later cleanup cannot touch a replacement with this id. */
  retireTrack(id: string, time: number): () => void {
    const track = this.tracks.get(id);
    this.tracks.delete(id);
    if (!track) return () => {};
    track.gain.cancelAndHoldAtTime(time);
    track.gain.linearRampToValueAtTime(0, time + TRACK_FADE_SECONDS);
    return () => {
      track.dispose();
    };
  }

  dispose(): void {
    for (const id of this.tracks.keys()) this.removeTrack(id);
    this.master.dispose();
    this.limiter.dispose();
  }
}
