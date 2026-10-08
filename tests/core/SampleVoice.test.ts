import { afterEach, expect, it, vi } from "vitest";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type { SampleContext } from "../../src/audio/SampleVoice";
import type { SampleBank } from "../../src/contracts/instrument";

const bank: SampleBank = {
  kind: "pitched",
  urls: { "60": "/recorded.wav" },
  releaseSeconds: 0.4,
  attackSeconds: 0.01,
  licenseRecord: "CC0 evidence",
};
const note = {
  kind: "note",
  step: 0,
  midi: 60,
  durationSteps: 4,
  velocity: 0.8,
} as const;
function param() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  };
}
function setup() {
  const sources: ReturnType<typeof source>[] = [];
  const gains: ReturnType<typeof gain>[] = [];
  function source() {
    return {
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: param(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as null | (() => void),
    };
  }
  function gain() {
    return { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
  }
  const context = {
    currentTime: 1,
    createBufferSource: vi.fn(() => {
      const item = source();
      sources.push(item);
      return item;
    }),
    createGain: vi.fn(() => {
      const item = gain();
      gains.push(item);
      return item;
    }),
    decodeAudioData: vi.fn(
      async () => ({ length: 441000, duration: 10 }) as AudioBuffer,
    ),
  };
  const fetcher = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const load = (spec = bank) =>
    loadSampleVoice(
      context as unknown as SampleContext,
      {} as AudioNode,
      spec,
      controller.signal,
    );
  return { sources, gains, context, fetcher, controller, load };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("fails visibly on HTTP errors and aborts sibling fetches, never creates a partial voice", async () => {
  const s = setup();
  const fetcher = vi.fn(async () => ({ ok: false, status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    s.load({ ...bank, urls: { "60": "/missing.wav", "64": "/sibling.wav" } }),
  ).rejects.toThrow("404");
  expect(s.context.createBufferSource).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const options = (
    fetcher.mock.calls as unknown as [string, { signal: AbortSignal }][]
  )[1]![1];
  expect(options.signal.aborted).toBe(true);
});

it("cancels an in-flight decode promptly and cannot resurrect a voice afterwards", async () => {
  const s = setup();
  let finish!: (buffer: AudioBuffer) => void;
  s.context.decodeAudioData.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = s.load();
  const rejected = expect(pending).rejects.toThrow("cancelled");
  await vi.waitFor(() =>
    expect(s.context.decodeAudioData).toHaveBeenCalledOnce(),
  );
  s.controller.abort();
  await rejected;
  finish({ length: 441000, duration: 10 } as AudioBuffer);
  await Promise.resolve();
  expect(s.sources).toHaveLength(0);
});

it("bounds a hung loading request and reports timeout", async () => {
  vi.useFakeTimers();
  const s = setup();
  s.fetcher.mockImplementation(() => new Promise(() => {}));
  const pending = expect(s.load()).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20000);
  await pending;
});

it("propagates corrupt audio and rejects invalid sustain loop metadata", async () => {
  const s = setup();
  s.context.decodeAudioData.mockRejectedValueOnce(new Error("decode failed"));
  await expect(s.load()).rejects.toThrow("decode failed");
  await expect(
    s.load({ ...bank, regions: { "60": { loopStart: 2, loopEnd: 11 } } }),
  ).rejects.toThrow("Invalid sustain loop");
});

it("schedules polyphonic recorded notes, individual velocity envelopes and natural release in audio time", async () => {
  const s = setup();
  const voice = await s.load();
  voice.play(note, 2, 0.25);
  voice.play({ ...note, midi: 64, velocity: 0.4 }, 2, 0.25);
  expect(s.sources).toHaveLength(2);
  expect(s.sources[0]!.start).toHaveBeenCalledWith(2);
  expect(s.sources[0]!.stop).toHaveBeenCalledWith(3.4);
  expect(s.sources[1]!.playbackRate.setValueAtTime).toHaveBeenCalledWith(
    2 ** (4 / 12),
    2,
  );
  expect(s.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0.8,
    2.01,
  );
  expect(s.gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0.4,
    2.01,
  );
  s.sources[0]!.onended!();
  expect(s.sources[0]!.disconnect).toHaveBeenCalledOnce();
  voice.dispose();
  voice.dispose();
  expect(s.sources[1]!.disconnect).toHaveBeenCalledOnce();
  voice.play(note, 4, 0.25);
  expect(s.sources).toHaveLength(2);
});

it("Stop cancels future attacks and fades an already releasing note without increasing its gain", async () => {
  const s = setup();
  const voice = await s.load();
  voice.play(note, 1, 0.25);
  voice.play(note, 5, 0.25);
  s.context.currentTime = 2.2;
  voice.releaseAll(2.2);
  expect(s.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(
    expect.closeTo(0.4),
    2.2,
  );
  expect(s.sources[1]!.stop).toHaveBeenLastCalledWith(2.2);
  voice.dispose();
});

it("sustains a loop past the recording length and crossfades monophonic changes", async () => {
  const s = setup();
  const voice = await s.load({
    ...bank,
    monophonic: true,
    transitionSeconds: 0.08,
    regions: { "60": { loopStart: 1, loopEnd: 3 } },
  });
  voice.play({ ...note, durationSteps: 80 }, 1, 0.25);
  expect(s.sources[0]!.loop).toBe(true);
  expect(s.sources[0]!.stop).toHaveBeenCalledWith(21.4);
  voice.play({ ...note, midi: 62 }, 3, 0.25);
  expect(s.sources[0]!.stop).toHaveBeenLastCalledWith(3.08);
  voice.dispose();
});

it("repeated percussion hits own separate gains and preserve recorded tails", async () => {
  const s = setup();
  const voice = await s.load({
    ...bank,
    kind: "percussion",
    urls: { hit: "/hit.wav" },
  });
  voice.play(
    { kind: "hit", step: 0, sampleKey: "hit", velocity: 0.8 },
    1,
    0.25,
  );
  voice.play(
    { kind: "hit", step: 1, sampleKey: "hit", velocity: 0.2 },
    1.25,
    0.25,
  );
  expect(s.sources).toHaveLength(2);
  expect(s.sources[0]!.stop).toHaveBeenCalledWith(11);
  expect(s.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0.8,
    1.01,
  );
  voice.dispose();
});

it("does not burst stale notes and bounds voices under excessive simultaneous events", async () => {
  const s = setup();
  const voice = await s.load({ ...bank, maxVoices: 4 });
  voice.play(note, 0.5, 0.25);
  expect(s.sources).toHaveLength(0);
  for (let i = 0; i < 1000; i++) voice.play(note, 1, 0.25);
  expect(
    s.sources.filter((source) => source.disconnect.mock.calls.length === 0)
      .length,
  ).toBeLessThanOrEqual(8);
  voice.dispose();
});
