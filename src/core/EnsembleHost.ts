import type {
  InstrumentPlugin,
  InstrumentSession,
  PluginDescriptor,
} from "../contracts/instrument";
import type { AudioEnginePort, PreparedBar } from "../audio/AudioEngine";
import { BarPlanner } from "./BarPlanner";
import { createPluginSession } from "./PluginSession";
import { MusicDirector } from "./MusicDirector";

interface Flags {
  active: boolean;
  muted: boolean;
  solo: boolean;
}
interface Entry {
  descriptor: PluginDescriptor;
  plugin?: InstrumentPlugin;
  session?: InstrumentSession;
  desired: Flags;
  actual: Flags;
  loading: boolean;
  voiceReady: boolean;
  error?: string;
  pendingAt?: number;
  request: number;
  voiceRequest: number;
}
export interface Operation {
  readonly type: "add" | "remove" | "mute" | "solo";
  readonly id: string;
  readonly value: boolean;
  readonly requestedAtBar: number;
  readonly effectiveAtBar: number;
}
export interface HostSnapshot {
  readonly seed: string;
  readonly running: boolean;
  readonly starting: boolean;
  readonly barIndex: number;
  readonly chord: string;
  readonly error?: string;
  readonly tracks: readonly {
    readonly manifest: PluginDescriptor["manifest"];
    readonly active: boolean;
    readonly muted: boolean;
    readonly solo: boolean;
    readonly loading: boolean;
    readonly loaded: boolean;
    readonly pendingAt?: number;
    readonly error?: string;
  }[];
}

export class EnsembleHost {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private planner?: BarPlanner;
  private timer?: ReturnType<typeof setInterval>;
  private seed = "ensemble-001";
  private running = false;
  private starting = false;
  private barIndex = 0;
  private chord = "Cmaj7";
  private error?: string;
  private disposed = false;
  private epoch = 0;
  private snapshot!: HostSnapshot;
  readonly operations: Operation[] = [];

  constructor(
    descriptors: readonly PluginDescriptor[],
    private readonly audio: AudioEnginePort,
  ) {
    for (const descriptor of descriptors) {
      const id = descriptor.manifest.id;
      if (this.entries.has(id)) throw new Error(`Duplicate plugin id: ${id}`);
      this.entries.set(id, {
        descriptor,
        desired: { active: false, muted: false, solo: false },
        actual: { active: false, muted: false, solo: false },
        loading: false,
        voiceReady: false,
        request: 0,
        voiceRequest: 0,
      });
    }
    this.publish();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private publish() {
    this.snapshot = {
      seed: this.seed,
      running: this.running,
      starting: this.starting,
      barIndex: this.barIndex,
      chord: this.chord,
      error: this.error,
      tracks: [...this.entries.values()].map((entry) => ({
        manifest: entry.descriptor.manifest,
        ...entry.desired,
        loading: entry.loading,
        loaded: Boolean(entry.plugin),
        pendingAt: entry.pendingAt,
        error: entry.error,
      })),
    };
    this.listeners.forEach((listener) => listener());
  }
  private entry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown plugin: ${id}`);
    return entry;
  }
  setSeed(seed: string) {
    if (this.running || this.starting)
      throw new Error("Stop before changing the seed");
    this.seed = seed;
    this.publish();
  }
  private async ensureVoice(
    id: string,
    entry: Entry,
    epoch: number,
  ): Promise<boolean> {
    if (entry.voiceReady) return true;
    const voiceRequest = ++entry.voiceRequest;
    const services = this.audio.createTrack(id);
    try {
      const voice = await entry.plugin!.createVoice(services);
      if (
        this.disposed ||
        epoch !== this.epoch ||
        voiceRequest !== entry.voiceRequest
      ) {
        voice.dispose();
        if (voiceRequest === entry.voiceRequest) this.audio.removeTrack(id);
        return false;
      }
      this.audio.setVoice(id, voice);
      entry.voiceReady = true;
      return true;
    } catch (error) {
      if (voiceRequest === entry.voiceRequest) this.audio.removeTrack(id);
      if (
        this.disposed ||
        epoch !== this.epoch ||
        voiceRequest !== entry.voiceRequest
      )
        return false;
      throw error;
    }
  }
  async add(id: string): Promise<void> {
    const entry = this.entry(id);
    if (
      this.disposed ||
      this.starting ||
      entry.loading ||
      entry.desired.active ||
      entry.pendingAt !== undefined
    )
      return;
    entry.loading = true;
    entry.error = undefined;
    const request = ++entry.request;
    this.publish();
    try {
      const module = await entry.descriptor.load();
      if (this.disposed || request !== entry.request) return;
      if (module.plugin.manifest.id !== id)
        throw new Error("Plugin manifest id mismatch");
      entry.plugin = module.plugin;
      entry.session ??= createPluginSession(entry.plugin);
      if (!(await this.ensureVoice(id, entry, this.epoch))) return;
      if (this.disposed || request !== entry.request) return;
      this.command(id, "add", true);
    } catch (error) {
      if (request === entry.request && !this.disposed)
        entry.error = String(error);
    } finally {
      if (request === entry.request && !this.disposed) {
        entry.loading = false;
        this.publish();
      }
    }
  }
  remove(id: string) {
    const entry = this.entry(id);
    if (entry.loading) {
      ++entry.request;
      ++entry.voiceRequest;
      entry.loading = false;
      entry.voiceReady = false;
      entry.desired.active = false;
      entry.actual.active = false;
      entry.pendingAt = undefined;
      this.audio.removeTrack(id);
      this.publish();
      return;
    }
    this.command(id, "remove", false);
  }
  mute(id: string, value: boolean) {
    this.command(id, "mute", value);
  }
  solo(id: string, value: boolean) {
    this.command(id, "solo", value);
  }
  private command(id: string, type: Operation["type"], value: boolean) {
    const entry = this.entry(id);
    if (this.disposed || this.starting || entry.pendingAt !== undefined) return;
    if (type === "add" || type === "remove") entry.desired.active = value;
    if (type === "mute") entry.desired.muted = value;
    if (type === "solo") entry.desired.solo = value;
    const effectiveAtBar = this.running
      ? Math.max(this.planner!.nextBarIndex, this.audio.currentBar() + 1)
      : 0;
    this.operations.push({
      id,
      type,
      value,
      requestedAtBar: this.running ? this.audio.currentBar() : this.barIndex,
      effectiveAtBar,
    });
    if (this.running) entry.pendingAt = effectiveAtBar;
    else {
      entry.actual = { ...entry.desired };
      if (!entry.desired.active) {
        this.audio.removeTrack(id);
        entry.voiceReady = false;
      }
    }
    this.publish();
  }
  async start(): Promise<void> {
    if (
      this.running ||
      this.starting ||
      this.disposed ||
      [...this.entries.values()].some((entry) => entry.loading)
    )
      return;
    const epoch = ++this.epoch;
    this.starting = true;
    this.error = undefined;
    this.publish();
    try {
      await this.audio.unlock();
      if (epoch !== this.epoch || this.disposed) return;
      for (const [id, entry] of this.entries) {
        if (!entry.desired.active) continue;
        try {
          if (!(await this.ensureVoice(id, entry, epoch))) return;
          if (epoch !== this.epoch || this.disposed) return;
          entry.session = createPluginSession(entry.plugin!);
        } catch (error) {
          if (epoch !== this.epoch || this.disposed) return;
          entry.error = String(error);
          entry.desired.active = false;
        }
      }
      this.barIndex = 0;
      this.chord = "Cmaj7";
      this.planner = new BarPlanner(new MusicDirector(this.seed));
      this.running = true;
      this.refill(2, true);
      this.audio.start(88);
      this.timer = setInterval(
        () => this.refill(this.audio.currentBar() + 2),
        100,
      );
    } catch (error) {
      if (epoch === this.epoch && !this.disposed) {
        this.error = String(error);
        this.stop();
      }
    } finally {
      if (epoch === this.epoch && !this.disposed) {
        this.starting = false;
        this.publish();
      }
    }
  }
  private refill(throughBar: number, initial = false) {
    if (!this.running || !this.planner) return;
    // Preserve each generator's state without an unbounded synchronous catch-up.
    let remaining = 32;
    while (this.planner.nextBarIndex <= throughBar && remaining-- > 0) {
      const index = this.planner.nextBarIndex;
      const tracks = [...this.entries]
        .filter(([, entry]) => entry.session)
        .map(([id, entry]) => ({
          id,
          ...(entry.pendingAt !== undefined && index < entry.pendingAt
            ? entry.actual
            : entry.desired),
          session: entry.session!,
        }));
      const prepared = this.planner.prepare(tracks, (id, error) => {
        const entry = this.entry(id);
        entry.error = String(error);
        entry.desired.active = false;
      });
      if (!initial && index <= this.audio.currentBar()) {
        // Omit stale attacks, but reconcile controls and cleanup even offscreen.
        this.onBoundary(prepared);
      } else {
        this.audio.scheduleBar(prepared, (bar) => this.onBoundary(bar));
      }
    }
  }
  private onBoundary(bar: PreparedBar) {
    if (!this.running || bar.plan.barIndex < this.barIndex) return;
    this.barIndex = bar.plan.barIndex;
    this.chord = bar.plan.chord;
    for (const track of bar.tracks) {
      const entry = this.entry(track.id);
      entry.actual = {
        active: track.active,
        muted: track.muted,
        solo: track.solo,
      };
      if (entry.pendingAt !== undefined && entry.pendingAt <= this.barIndex)
        entry.pendingAt = undefined;
      if (!track.active && !entry.desired.active && entry.voiceReady) {
        this.audio.removeTrack(track.id);
        entry.voiceReady = false;
      }
    }
    this.publish();
  }
  stop() {
    ++this.epoch;
    this.running = false;
    this.starting = false;
    clearInterval(this.timer);
    this.timer = undefined;
    this.audio.stop();
    for (const [id, entry] of this.entries) {
      ++entry.request;
      ++entry.voiceRequest;
      entry.loading = false;
      this.audio.removeTrack(id);
      entry.voiceReady = false;
      entry.pendingAt = undefined;
      entry.actual = { ...entry.desired };
    }
    this.publish();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.audio.dispose();
    this.listeners.clear();
  }
}
