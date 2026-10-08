import * as Tone from "tone";

/** Owns only its callback IDs on the single shared Tone Transport. */
export class ToneClock {
  private readonly transport = Tone.getTransport();
  private readonly scheduled = new Set<number>();
  private readonly boundaryTimers = new Set<ReturnType<typeof setTimeout>>();
  private bpm = 88;
  private running = false;
  private generation = 0;

  async unlock(): Promise<void> {
    await Tone.start();
  }

  schedule(
    beats: number,
    callback: (audioTime: number) => void,
    allowLate = false,
  ): void {
    const generation = this.generation;
    const id = this.transport.scheduleOnce(
      (time) => {
        this.scheduled.delete(id);
        if (generation !== this.generation) return;
        const now = Tone.immediate();
        if (time < now && !allowLate) return;
        callback(Math.max(time, now));
        // Tone's "i" syntax accepts integer ticks; musical steps are exact, optional
        // humanization is rounded to the Transport's tick resolution.
      },
      `${Math.round(beats * this.transport.PPQ)}i`,
    );
    this.scheduled.add(id);
  }

  /** Only lifecycle/UI work; never schedules sound or depends on animation frames. */
  atBoundary(time: number, callback: () => void): void {
    const generation = this.generation;
    const dispatch = () => {
      const timer = setTimeout(
        () => {
          this.boundaryTimers.delete(timer);
          if (!this.running || generation !== this.generation) return;
          if (Tone.immediate() < time) dispatch();
          else callback();
        },
        Math.max(1, (time - Tone.immediate()) * 1000),
      );
      this.boundaryTimers.add(timer);
    };
    dispatch();
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
    for (const timer of this.boundaryTimers) clearTimeout(timer);
    this.boundaryTimers.clear();
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
