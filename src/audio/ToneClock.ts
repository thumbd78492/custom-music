import * as Tone from "tone";
import { PPQ, TICKS_PER_BAR } from "../core/GroovePlan";

/** Owns only its callback IDs on the single shared Tone Transport. */
export class ToneClock {
  private readonly transport = Tone.getTransport();
  private readonly scheduled = new Set<number>();
  private readonly boundaryTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly tempos = new Map<number, number>();
  private lastTempo?: number;
  private startTime = 0;
  private running = false;
  private generation = 0;

  constructor() {
    if (this.transport.PPQ !== PPQ)
      throw new Error(`Transport PPQ must remain ${PPQ}`);
  }

  async unlock(): Promise<void> {
    await Tone.start();
  }

  schedule(
    beats: number,
    callback: (audioTime: number) => void,
    allowLate = false,
  ): void {
    this.scheduleTick(beats * PPQ, callback, allowLate);
  }

  scheduleTick(
    tick: number,
    callback: (audioTime: number) => void,
    allowLate = false,
  ): void {
    if (!Number.isFinite(tick) || tick < 0)
      throw new Error("Invalid Transport tick");
    const generation = this.generation;
    const id = this.transport.scheduleOnce((time) => {
      this.scheduled.delete(id);
      if (generation !== this.generation) return;
      const now = Tone.immediate();
      if (time < now && !allowLate) return;
      callback(Math.max(time, now));
    }, Tone.Ticks(tick));
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
    this.transport.bpm.cancelScheduledValues(0);
    this.transport.bpm.setValueAtTime(bpm, 0);
    this.transport.timeSignature = 4;
    // Custom shared mapping is the only swing implementation.
    this.transport.swing = 0;
    this.startTime = Tone.now() + 0.12;
    let time = this.startTime;
    let previousBar = 0;
    let previousBpm = bpm;
    for (const [bar, tempo] of this.tempos) {
      time += ((bar - previousBar) * 240) / previousBpm;
      this.transport.bpm.setValueAtTime(tempo, time);
      previousBar = bar;
      previousBpm = tempo;
    }
    this.lastTempo = previousBpm;
    this.tempos.clear();
    this.running = true;
    this.transport.start(this.startTime, 0);
  }

  /** Install automation BEFORE the lookahead callbacks encounter this boundary. */
  scheduleTempo(barIndex: number, bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Invalid tempo");
    if (!this.running) {
      this.tempos.set(barIndex, bpm);
      return;
    }
    if (bpm === this.lastTempo) return;
    const now = Math.max(Tone.immediate(), this.startTime);
    const ticks = this.transport.getTicksAtTime(now);
    const remaining = barIndex * TICKS_PER_BAR - ticks;
    if (remaining <= 0) throw new Error("Cannot automate an elapsed bar");
    // TickParam integrates the already installed automation. No fixed-BPM
    // seconds-to-bars conversion and no BPM mutation inside an audio callback.
    const time = now + this.transport.bpm.getDurationOfTicks(remaining, now);
    this.transport.bpm.setValueAtTime(bpm, time);
    this.lastTempo = bpm;
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    for (const id of this.scheduled) this.transport.clear(id);
    this.scheduled.clear();
    for (const timer of this.boundaryTimers) clearTimeout(timer);
    this.boundaryTimers.clear();
    this.transport.stop(Tone.immediate());
    this.transport.bpm.cancelScheduledValues(Tone.immediate());
    this.tempos.clear();
    this.lastTempo = undefined;
  }

  currentBar(): number {
    return Math.floor((this.currentTick() + 1e-7) / TICKS_PER_BAR);
  }

  currentTick(): number {
    return this.running
      ? Math.max(0, this.transport.getTicksAtTime(Tone.immediate()))
      : 0;
  }
}
