import { vi } from "vitest";
import type { AudioEnginePort, PreparedBar } from "../../src/audio/AudioEngine";
import type {
  AudioServices,
  InstrumentVoice,
} from "../../src/contracts/instrument";

export function fakeVoice(): InstrumentVoice {
  return { play: vi.fn(), releaseAll: vi.fn(), dispose: vi.fn() };
}

/** A deterministic transport boundary driver; it does not claim audio output. */
export class FakeAudioEngine implements AudioEnginePort {
  readonly bars: PreparedBar[] = [];
  readonly callbacks = new Map<number, (bar: PreparedBar) => void>();
  readonly voices = new Map<string, InstrumentVoice>();
  readonly createdVoices: InstrumentVoice[] = [];
  readonly tracks = new Set<string>();
  bar = 0;
  unlock = vi.fn(async () => {});
  start = vi.fn<(bpm: number) => void>();
  dispose = vi.fn(() => {
    this.stop();
  });
  createTrack = vi.fn((id: string): AudioServices => {
    if (this.tracks.has(id)) throw new Error(`Duplicate track ${id}`);
    this.tracks.add(id);
    const make = () => {
      const voice = fakeVoice();
      this.createdVoices.push(voice);
      return voice;
    };
    return {
      createSynthVoice: make,
      createPercussionVoice: make,
      createSampleVoice: async () => make(),
    };
  });
  setVoice(id: string, voice: InstrumentVoice) {
    this.voices.set(id, voice);
  }
  removeTrack = vi.fn((id: string) => {
    this.voices.get(id)?.dispose();
    this.voices.delete(id);
    this.tracks.delete(id);
  });
  stop = vi.fn(() => {
    for (const voice of this.voices.values()) voice.releaseAll(0);
    this.callbacks.clear();
  });
  scheduleBar(bar: PreparedBar, onBoundary: (bar: PreparedBar) => void) {
    if (this.callbacks.has(bar.plan.barIndex)) throw new Error("Duplicate bar");
    this.bars.push(bar);
    this.callbacks.set(bar.plan.barIndex, onBoundary);
  }
  currentBar() {
    return this.bar;
  }
  boundary(index: number) {
    this.bar = index;
    const prepared = [...this.bars]
      .reverse()
      .find((bar) => bar.plan.barIndex === index);
    const callback = this.callbacks.get(index);
    if (!prepared || !callback)
      throw new Error(`Bar ${index} has not been prepared`);
    callback(prepared);
  }
}
