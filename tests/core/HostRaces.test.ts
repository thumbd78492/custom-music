import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InstrumentPlugin,
  InstrumentVoice,
  PluginDescriptor,
} from "../../src/contracts/instrument";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { FakeAudioEngine, fakeVoice } from "../helpers/FakeAudioEngine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function descriptor(
  id: string,
  createVoice = vi.fn<InstrumentPlugin["createVoice"]>(async () => fakeVoice()),
): PluginDescriptor {
  const plugin: InstrumentPlugin = {
    manifest: {
      id,
      displayName: id,
      version: "test",
      capabilities: [],
      controls: [],
      sound: { kind: "synth-placeholder", label: "test voice" },
    },
    createInitialState: () => ({}),
    proposeBar: () => ({ accents: Array<number>(16).fill(0.5), density: 0.5 }),
    generateBar: () => ({
      events: [
        { kind: "note", step: 0, midi: 60, durationSteps: 1, velocity: 0.5 },
      ],
      nextState: {},
    }),
    createVoice,
  };
  return { manifest: plugin.manifest, load: async () => ({ plugin }) };
}

const hosts: EnsembleHost[] = [];
function setup(plugins: readonly PluginDescriptor[] = []) {
  const audio = new FakeAudioEngine();
  const host = new EnsembleHost(plugins, audio);
  hosts.push(host);
  return { host, audio };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  vi.useRealTimers();
});

describe("Host async lifecycle ownership", () => {
  it("a stop while awaiting an already-ready voice cannot restart hidden audio", async () => {
    const { host, audio } = setup([descriptor("generic")]);
    await host.add("generic");
    const starting = host.start();
    // unlock completes, then start awaits ensureVoice's already-ready result.
    await Promise.resolve();
    host.stop();
    await starting;

    expect(host.getSnapshot()).toMatchObject({
      running: false,
      starting: false,
    });
    expect(audio.start).not.toHaveBeenCalled();
    expect(audio.bars).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an obsolete unlock cannot clear the current starting flag or allow a third start", async () => {
    const obsolete = deferred<void>();
    const current = deferred<void>();
    const { host, audio } = setup();
    audio.unlock
      .mockImplementationOnce(() => obsolete.promise)
      .mockImplementationOnce(() => current.promise);

    const oldStart = host.start();
    host.stop();
    const newStart = host.start();
    obsolete.resolve();
    await oldStart;

    expect(host.getSnapshot()).toMatchObject({
      starting: true,
      running: false,
    });
    await host.start();
    expect(audio.unlock).toHaveBeenCalledTimes(2);

    current.resolve();
    await newStart;
    expect(host.getSnapshot()).toMatchObject({
      starting: false,
      running: true,
    });
    expect(audio.start).toHaveBeenCalledTimes(1);
  });

  it("a rejected obsolete unlock cannot stop or report an error in the new session", async () => {
    const obsolete = deferred<void>();
    const { host, audio } = setup();
    audio.unlock.mockImplementationOnce(() => obsolete.promise);
    const oldStart = host.start();
    host.stop();
    await host.start();
    const stopCalls = audio.stop.mock.calls.length;

    obsolete.reject(new Error("obsolete unlock failure"));
    await oldStart;

    expect(host.getSnapshot()).toMatchObject({
      running: true,
      starting: false,
      error: undefined,
    });
    expect(audio.stop).toHaveBeenCalledTimes(stopCalls);
  });

  it("disposes an obsolete voice without installing it into or removing the new track", async () => {
    const obsolete = deferred<InstrumentVoice>();
    const current = deferred<InstrumentVoice>();
    const createVoice = vi
      .fn<InstrumentPlugin["createVoice"]>(async () => fakeVoice())
      .mockResolvedValueOnce(fakeVoice())
      .mockImplementationOnce(() => obsolete.promise)
      .mockImplementationOnce(() => current.promise);
    const { host, audio } = setup([descriptor("generic", createVoice)]);
    const setVoice = vi.spyOn(audio, "setVoice");
    await host.add("generic");
    host.stop();

    const oldStart = host.start();
    await Promise.resolve();
    expect(createVoice).toHaveBeenCalledTimes(2);
    host.stop();
    const newStart = host.start();
    await Promise.resolve();
    expect(createVoice).toHaveBeenCalledTimes(3);
    const removeCalls = audio.removeTrack.mock.calls.length;
    const obsoleteVoice = fakeVoice();

    obsolete.resolve(obsoleteVoice);
    await oldStart;

    expect(obsoleteVoice.dispose).toHaveBeenCalledTimes(1);
    expect(setVoice).not.toHaveBeenCalledWith("generic", obsoleteVoice);
    expect(audio.removeTrack).toHaveBeenCalledTimes(removeCalls);
    expect(audio.tracks.has("generic")).toBe(true);
    expect(host.getSnapshot().starting).toBe(true);

    const currentVoice = fakeVoice();
    current.resolve(currentVoice);
    await newStart;
    expect(audio.voices.get("generic")).toBe(currentVoice);
    expect(currentVoice.dispose).not.toHaveBeenCalled();
    expect(host.getSnapshot()).toMatchObject({
      running: true,
      error: undefined,
    });
  });

  it("a rejected obsolete voice cannot dispose or stop a newer running track", async () => {
    const obsolete = deferred<InstrumentVoice>();
    const createVoice = vi
      .fn<InstrumentPlugin["createVoice"]>(async () => fakeVoice())
      .mockResolvedValueOnce(fakeVoice())
      .mockImplementationOnce(() => obsolete.promise);
    const { host, audio } = setup([descriptor("generic", createVoice)]);
    await host.add("generic");
    host.stop();
    const oldStart = host.start();
    await Promise.resolve();
    host.stop();
    await host.start();
    const currentVoice = audio.voices.get("generic")!;
    const removeCalls = audio.removeTrack.mock.calls.length;
    const stopCalls = audio.stop.mock.calls.length;

    obsolete.reject(new Error("obsolete sample load failure"));
    await oldStart;

    expect(audio.removeTrack).toHaveBeenCalledTimes(removeCalls);
    expect(audio.stop).toHaveBeenCalledTimes(stopCalls);
    expect(audio.voices.get("generic")).toBe(currentVoice);
    expect(currentVoice.dispose).not.toHaveBeenCalled();
    expect(host.getSnapshot()).toMatchObject({
      running: true,
      error: undefined,
    });
    expect(host.getSnapshot().tracks[0]?.error).toBeUndefined();
  });

  it("a voice failure on restart disables only that plugin and starts the healthy plugin", async () => {
    const brokenVoice = vi
      .fn<InstrumentPlugin["createVoice"]>(async () => fakeVoice())
      .mockResolvedValueOnce(fakeVoice())
      .mockRejectedValueOnce(new Error("sample unavailable on restart"));
    const healthyVoice = vi.fn<InstrumentPlugin["createVoice"]>(async () =>
      fakeVoice(),
    );
    const { host, audio } = setup([
      descriptor("broken", brokenVoice),
      descriptor("healthy", healthyVoice),
    ]);
    await host.add("broken");
    await host.add("healthy");
    await host.start();
    host.stop();
    const priorBarCount = audio.bars.length;

    await host.start();

    expect(host.getSnapshot()).toMatchObject({
      running: true,
      starting: false,
      error: undefined,
    });
    expect(
      host.getSnapshot().tracks.find((track) => track.manifest.id === "broken"),
    ).toMatchObject({
      active: false,
      error: expect.stringContaining("sample unavailable on restart"),
    });
    expect(
      host
        .getSnapshot()
        .tracks.find((track) => track.manifest.id === "healthy"),
    ).toMatchObject({ active: true, error: undefined });
    expect(audio.tracks.has("broken")).toBe(false);
    expect(audio.tracks.has("healthy")).toBe(true);
    expect(audio.start).toHaveBeenCalledTimes(2);
    expect(healthyVoice).toHaveBeenCalledTimes(2);
    const restartBars = audio.bars.slice(priorBarCount);
    expect(restartBars).toHaveLength(3);
    for (const bar of restartBars) {
      expect(bar.tracks.find((track) => track.id === "broken")).toMatchObject({
        active: false,
        events: [],
      });
      expect(
        bar.tracks.find((track) => track.id === "healthy")?.events.length,
      ).toBeGreaterThan(0);
    }
  });
});
