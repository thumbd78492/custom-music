import * as Tone from "tone";

/** Owns only its callback IDs on the single shared Tone Transport. */
export class ToneClock {
  private readonly transport = Tone.getTransport();
  private readonly scheduled = new Set<number>();
  private bpm = 88;
  private running = false;
  private generation = 0;

  async unlock(): Promise<void> {
    await Tone.start();
  }

  schedule(beats: number, callback: (audioTime: number) => void): void {
    const generation = this.generation;
    const id = this.transport.scheduleOnce(
      (time) => {
        this.scheduled.delete(id);
        if (generation === this.generation) callback(time);
        // Tone's "i" syntax accepts integer ticks; musical steps are exact, optional
        // humanization is rounded to the Transport's tick resolution.
      },
      `${Math.round(beats * this.transport.PPQ)}i`,
    );
    this.scheduled.add(id);
  }

  /** Draw moves lifecycle/UI work out of the audio lookahead callback. */
  atBoundary(time: number, callback: () => void): void {
    const generation = this.generation;
    Tone.getDraw().schedule(() => {
      if (this.running && generation === this.generation) callback();
    }, time);
  }

  start(bpm: number): void {
    if (this.running) return;
    this.bpm = bpm;
    this.transport.bpm.value = bpm;
    this.transport.timeSignature = 4;
    this.running = true;
    this.transport.start(Tone.now() + 0.12, 0);
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    for (const id of this.scheduled) this.transport.clear(id);
    this.scheduled.clear();
    this.transport.stop(Tone.immediate());
  }

  currentBar(): number {
    if (!this.running) return 0;
    return Math.max(
      0,
      Math.floor(this.transport.seconds / ((60 / this.bpm) * 4)),
    );
  }
}
