import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioEngine } from "../../src/audio/AudioEngine";
import type { PreparedBar } from "../../src/audio/AudioEngine";
import { MusicDirector } from "../../src/core/MusicDirector";
import { createGroovePlan, mapPlaybackEvents } from "../../src/core/GroovePlan";
import { fakeVoice } from "../helpers/FakeAudioEngine";

const mock = vi.hoisted(() => {
  const scheduled: {
    id: number;
    callback: (time: number) => void;
    ticks: string;
  }[] = [];
  const transport = {
    PPQ: 192,
    bpm: {
      value: 120,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      getDurationOfTicks: vi.fn((ticks: number) => ((ticks / 192) * 60) / 88),
    },
    timeSignature: 4,
    seconds: 0,
    getTicksAtTime: vi.fn(() => 0),
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
    retireTrack: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
  };
  return { scheduled, transport, mixer, now: 10 };
});
vi.mock("tone", () => ({
  getTransport: () => mock.transport,
  Ticks: (ticks: number) => `${ticks}i`,
  start: async () => {},
  now: () => mock.now,
  immediate: () => mock.now,
}));
vi.mock("../../src/audio/MasterMixer", () => ({
  TRACK_FADE_SECONDS: 0.03,
  MasterMixer: class {
    constructor() {
      return mock.mixer;
    }
  },
}));
vi.mock("../../src/audio/AudioServices", () => ({
  TrackAudioServices: class {
    dispose = vi.fn();
    cancelPending = vi.fn();
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.scheduled.length = 0;
  mock.now = 10;
  mock.transport.bpm.value = 120;
  mock.transport.seconds = 0;
  mock.transport.getTicksAtTime.mockReturnValue(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
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
  return {
    plan: { ...new MusicDirector("audio-test").planBar(index), bpm: 88 },
    tracks,
  };
}
function fireThrough(ticks: number) {
  for (const entry of mock.scheduled.filter(
    (entry) => Number.parseInt(entry.ticks) <= ticks,
  )) {
    entry.callback(
      10 + ((Number.parseFloat(entry.ticks) / mock.transport.PPQ) * 60) / 88,
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
  expect(mock.transport.bpm.setValueAtTime).toHaveBeenCalledWith(88, 0);
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
  mock.now = 20;
  vi.advanceTimersByTime(10_000);
  expect(onBoundary).toHaveBeenCalledTimes(2);
  engine.dispose();
});

it("schedules fractional swing attacks and exact warped durations with unchanged mixing and tempo boundaries", () => {
  const engine = new AudioEngine();
  const voice = fakeVoice();
  engine.createTrack("test");
  engine.setVoice("test", voice);
  const bar = prepared(0, [track("test")]);
  const plan = {
    ...bar.plan,
    groovePlan: createGroovePlan(bar.plan, "light-swing", 2),
  };
  const events = [
    { ...note, step: 0, durationSteps: 2 },
    { ...note, step: 2, durationSteps: 2 },
  ];
  const playbackEvents = mapPlaybackEvents(events, plan);
  engine.scheduleBar(
    { plan, tracks: [track("test", { events, playbackEvents })] },
    () => {},
  );
  expect(mock.scheduled.map((entry) => Number.parseFloat(entry.ticks))).toEqual(
    [0, 0, expect.closeTo(115.2, 12)],
  );
  engine.start(88);
  expect(mock.transport).toMatchObject({ PPQ: 192, swing: 0 });
  fireThrough(192);
  expect(voice.play).toHaveBeenNthCalledWith(
    1,
    events[0],
    10,
    expect.closeTo((60 / 88 / 4) * 1.2),
  );
  expect(voice.play).toHaveBeenNthCalledWith(
    2,
    events[1],
    10 + (0.6 * 60) / 88,
    expect.closeTo((60 / 88 / 4) * 0.8),
  );
  expect(mock.mixer.setAudible).toHaveBeenCalledWith("test", true, 10, 1);
  expect(mock.transport.bpm.setValueAtTime).toHaveBeenCalledWith(88, 10.12);
  engine.dispose();
});

it("does not move boundary flags or old callbacks when consecutive bars use different frozen groove mappings", () => {
  const engine = new AudioEngine();
  const voice = fakeVoice();
  engine.createTrack("test");
  engine.setVoice("test", voice);
  const first = prepared(0, [
    track("test", { events: [{ ...note, step: 2 }] }),
  ]);
  const second = prepared(1, [
    track("test", { events: [{ ...note, step: 2 }] }),
  ]);
  engine.scheduleBar(
    {
      ...first,
      plan: {
        ...first.plan,
        groovePlan: createGroovePlan(first.plan, "light-swing", 1),
      },
    },
    () => {},
  );
  const submitted = mock.scheduled.map((entry) => entry.ticks);
  engine.scheduleBar(
    {
      ...second,
      plan: {
        ...second.plan,
        groovePlan: createGroovePlan(second.plan, "half-time", 2),
      },
    },
    () => {},
  );
  expect(
    mock.scheduled.slice(0, submitted.length).map((entry) => entry.ticks),
  ).toEqual(submitted);
  expect(mock.scheduled.map((entry) => Number.parseFloat(entry.ticks))).toEqual(
    [0, expect.closeTo(115.2, 12), 768, 864],
  );
  engine.start(88);
  mock.transport.getTicksAtTime.mockReturnValue(785.2);
  expect(engine.currentTick()).toBe(785.2);
  expect(engine.currentBar()).toBe(1);
  engine.dispose();
});

it("uses current audio ticks despite seconds/BPM disagreement and installs future tempo before callbacks", () => {
  const engine = new AudioEngine();
  engine.scheduleBar(prepared(0, []), () => {});
  engine.start(88);
  mock.now = 20;
  mock.transport.seconds = 900;
  mock.transport.getTicksAtTime.mockReturnValue(8 * 4 * 192 - 1);
  expect(engine.currentBar()).toBe(7);
  expect(mock.transport.getTicksAtTime).toHaveBeenLastCalledWith(20);
  const next = prepared(8, []);
  engine.scheduleBar({ ...next, plan: { ...next.plan, bpm: 100 } }, () => {});
  expect(mock.transport.bpm.getDurationOfTicks).toHaveBeenCalledWith(1, 20);
  expect(mock.transport.bpm.setValueAtTime).toHaveBeenLastCalledWith(
    100,
    20 + 60 / 88 / 192,
  );
  mock.transport.getTicksAtTime.mockReturnValue(8 * 4 * 192);
  expect(engine.currentBar()).toBe(8);
  engine.stop();
  expect(mock.transport.bpm.cancelScheduledValues).toHaveBeenLastCalledWith(20);
  expect(engine.currentBar()).toBe(0);
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
  expect(mock.mixer.setAudible).toHaveBeenCalledWith("two", false, 20, 1);
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
  vi.advanceTimersByTime(1);
  expect(voice.play).not.toHaveBeenCalled();
  expect(boundary).not.toHaveBeenCalled();
  expect(voice.releaseAll).toHaveBeenCalledWith(10);
  expect(mock.transport.clear).toHaveBeenCalled();
  expect(() => engine.scheduleBar(bar, boundary)).not.toThrow();
  engine.dispose();
  vi.advanceTimersByTime(50);
  expect(voice.dispose).toHaveBeenCalledTimes(1);
});

it("drops late notes after throttling but reconciles the mix and boundary offscreen", () => {
  const engine = new AudioEngine();
  const voice = fakeVoice();
  const boundary = vi.fn();
  engine.createTrack("test");
  engine.setVoice("test", voice);
  engine.scheduleBar(prepared(0, [track("test")]), boundary);
  engine.start(88);
  mock.now = 15;
  fireThrough(192);
  vi.advanceTimersByTime(1);
  expect(voice.play).not.toHaveBeenCalled();
  expect(mock.mixer.setAudible).toHaveBeenCalledWith("test", true, 15, 1);
  expect(boundary).toHaveBeenCalledTimes(1);
  engine.dispose();
});

it("waits for the audio deadline before lifecycle callbacks, even if wall timers advance", () => {
  const engine = new AudioEngine();
  const boundary = vi.fn();
  engine.scheduleBar(prepared(0, []), boundary);
  engine.start(88);
  mock.scheduled[0]!.callback(10.1);
  vi.advanceTimersByTime(200);
  expect(boundary).not.toHaveBeenCalled();
  mock.now = 10.11;
  vi.advanceTimersByTime(101);
  expect(boundary).toHaveBeenCalledTimes(1);
  engine.dispose();
});

it("retires the old track after fading without disposing or playing through its replacement", () => {
  const engine = new AudioEngine();
  const oldVoice = fakeVoice();
  const newVoice = fakeVoice();
  const oldServices = engine.createTrack("same");
  engine.setVoice("same", oldVoice);
  engine.scheduleBar(prepared(0, [track("same")]), () => {});
  engine.start(88);
  engine.removeTrack("same");
  expect(oldVoice.releaseAll).toHaveBeenCalledWith(10);
  expect(oldVoice.dispose).not.toHaveBeenCalled();
  expect(oldServices).toMatchObject({ cancelPending: expect.any(Function) });
  engine.createTrack("same");
  engine.setVoice("same", newVoice);
  fireThrough(192);
  expect(oldVoice.play).not.toHaveBeenCalled();
  expect(newVoice.play).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(oldVoice.dispose).toHaveBeenCalledTimes(1);
  expect(newVoice.dispose).not.toHaveBeenCalled();
  expect(mock.mixer.retireTrack).toHaveBeenCalledTimes(1);
  engine.scheduleBar(prepared(1, [track("same")]), () => {});
  mock.scheduled.at(-1)!.callback(20);
  expect(newVoice.play).toHaveBeenCalledTimes(1);
  engine.dispose();
  expect(mock.mixer.dispose).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(newVoice.dispose).toHaveBeenCalledTimes(1);
  expect(mock.mixer.dispose).toHaveBeenCalledTimes(1);
});
