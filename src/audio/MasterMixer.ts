import * as Tone from "tone";

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

  setAudible(id: string, audible: boolean, time: number): void {
    this.tracks.get(id)?.gain.setValueAtTime(audible ? 1 : 0, time);
  }

  silence(time: number): void {
    for (const track of this.tracks.values()) {
      track.gain.cancelScheduledValues(time);
      track.gain.setValueAtTime(0, time);
    }
  }

  removeTrack(id: string): void {
    this.tracks.get(id)?.dispose();
    this.tracks.delete(id);
  }

  dispose(): void {
    for (const id of this.tracks.keys()) this.removeTrack(id);
    this.master.dispose();
    this.limiter.dispose();
  }
}
