import { beforeEach, expect, it, vi } from "vitest";
import { AudioEngine } from "../../src/audio/AudioEngine";
import type { PreparedBar } from "../../src/audio/AudioEngine";
import { MusicDirector } from "../../src/core/MusicDirector";
import { fakeVoice } from "../helpers/FakeAudioEngine";

const mock = vi.hoisted(() => {
  const scheduled: {
    id: number;
    callback: (time: number) => void;
    ticks: string;
  }[] = [];
  const draws: (() => void)[] = [];
  const transport = {
    PPQ: 192,
    bpm: { value: 120 },
    timeSignature: 4,
    seconds: 0,
    scheduleOnce: vi.fn((callback: (time: number) => void, ticks: string) => {
      const id = scheduled.length + 1;
      scheduled.push({ id, callback, ticks });
      return id;
    }),
    start: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
  };
  const mixer = {
    addTrack: vi.fn(() => ({})),
    setAudible: vi.fn(),
    silence: vi.fn(),
    removeTrack: vi.fn(),
    dispose: vi.fn(),
  };
  return { scheduled, draws, transport, mixer };
});
vi.mock("tone", () => ({
  getTransport: () => mock.transport,
  getDraw: () => ({
    schedule: (callback: () => void) => {
      mock.draws.push(callback);
    },
  }),
  start: async () => {},
  now: () => 10,
  immediate: () => 10,
}));
vi.mock("../../src/audio/MasterMixer", () => ({
  MasterMixer: class {
    constructor() {
      return mock.mixer;
    }
  },
}));
vi.mock("../../src/audio/AudioServices", () => ({
  TrackAudioServices: class {
    dispose = vi.fn();
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.scheduled.length = 0;
  mock.draws.length = 0;
  mock.transport.bpm.value = 120;
  mock.transport.seconds = 0;
});

const note = {
  kind: "note",
  step: 4,
  durationSteps: 2,
  midi: 60,
  velocity: 0.7,
} as const;
const track = (id: string, flags = {}) => ({
  id,
  active: true,
  muted: false,
  solo: false,
  events: [note],
  ...flags,
});
function prepared(index: number, tracks: PreparedBar["tracks"]): PreparedBar {
  return { plan: new MusicDirector("audio-test").planBar(index), tracks };
}
function fireThrough(ticks: number) {
  for (const entry of mock.scheduled.filter(
    (entry) => Number.parseInt(entry.ticks) <= ticks,
  )) {
    entry.callback(
      10 + ((Number.parseInt(entry.ticks) / mock.transport.PPQ) * 60) / 88,
    );
  }
}

it("schedules in PPQ ticks before starting at 88 BPM, then dispatches MusicEvents at audio time", () => {
  const engine = new AudioEngine();
  const voice = fakeVoice();
  engine.createTrack("test");
  engine.setVoice("test", voice);
  const onBoundary = vi.fn();
  engine.scheduleBar(prepared(0, [track("test")]), onBoundary);
  engine.scheduleBar(prepared(1, [track("test")]), onBoundary);
  expect(mock.transport.bpm.value).toBe(120);
  expect(mock.scheduled.map((entry) => entry.ticks)).toEqual([
    "0i",
    "192i",
    "768i",
    "960i",
  ]);
  expect(voice.play).not.toHaveBeenCalled();
  engine.start(88);
  expect(mock.transport.bpm.value).toBe(88);
  expect(mock.transport.start).toHaveBeenCalledWith(10.12, 0);
  fireThrough(960);
  expect(voice.play).toHaveBeenNthCalledWith(
    1,
    note,
    10 + 60 / 88,
    60 / 88 / 4,
  );
  expect(voice.play).toHaveBeenNthCalledWith(
    2,
    note,
    10 + (5 * 60) / 88,
    60 / 88 / 4,
  );
  expect(onBoundary).not.toHaveBeenCalled();
  mock.draws.forEach((callback) => callback());
  expect(onBoundary).toHaveBeenCalledTimes(2);
  engine.dispose();
});

it("uses anonymous active/mute/solo flags to gate every track", () => {
  const engine = new AudioEngine();
  const voices = ["one", "two", "three"].map((id) => {
    const voice = fakeVoice();
    engine.createTrack(id);
    engine.setVoice(id, voice);
    return voice;
  });
  engine.scheduleBar(
    prepared(0, [
      track("one"),
      track("two", { solo: true }),
      track("three", { muted: true }),
    ]),
    () => {},
  );
  engine.start(88);
  fireThrough(192);
  expect(voices[0]!.play).not.toHaveBeenCalled();
  expect(voices[1]!.play).toHaveBeenCalledTimes(1);
  expect(voices[2]!.play).not.toHaveBeenCalled();
  engine.scheduleBar(prepared(1, [track("two", { muted: true })]), () => {});
  mock.scheduled.find((entry) => entry.ticks === "768i")!.callback(20);
  expect(voices[1]!.releaseAll).toHaveBeenCalledWith(20);
  expect(mock.mixer.setAudible).toHaveBeenCalledWith("two", false, 20);
  engine.dispose();
});

it("rejects duplicate/out-of-order bars and cancels stale callbacks across stop/restart", () => {
  const engine = new AudioEngine();
  const voice = fakeVoice();
  engine.createTrack("test");
  engine.setVoice("test", voice);
  const bar = prepared(0, [track("test")]);
  const boundary = vi.fn();
  engine.scheduleBar(bar, boundary);
  expect(() => engine.scheduleBar(bar, boundary)).toThrow("already scheduled");
  engine.scheduleBar(prepared(2, []), boundary);
  expect(() => engine.scheduleBar(prepared(1, []), boundary)).toThrow(
    "out of order",
  );
  engine.start(88);
  mock.scheduled[0]!.callback(10);
  engine.stop();
  mock.scheduled.forEach((entry) => entry.callback(11));
  mock.draws.forEach((callback) => callback());
  expect(voice.play).not.toHaveBeenCalled();
  expect(boundary).not.toHaveBeenCalled();
  expect(voice.releaseAll).toHaveBeenCalledWith(10);
  expect(mock.transport.clear).toHaveBeenCalled();
  expect(() => engine.scheduleBar(bar, boundary)).not.toThrow();
  engine.dispose();
  expect(voice.dispose).toHaveBeenCalledTimes(1);
});
