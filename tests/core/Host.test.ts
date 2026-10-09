import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import type { PluginDescriptor } from "../../src/contracts/instrument";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { instances } from "../../src/core/CharacterInstances";
import { FakeAudioEngine } from "../helpers/FakeAudioEngine";

const descriptors = await discoverPlugins();
const first = descriptors[0]!;
const firstInstance = instances(first.manifest).find(
  (role) => role.character.default,
)!.identity.instanceId;
const firstTrack = (host: EnsembleHost) =>
  host
    .getSnapshot()
    .tracks.find((track) => track.identity.instanceId === firstInstance)!;
const hosts: EnsembleHost[] = [];
function setup(selected = descriptors) {
  const audio = new FakeAudioEngine();
  const host = new EnsembleHost(selected, audio);
  hosts.push(host);
  return { audio, host };
}
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  vi.useRealTimers();
});

describe("Host lifecycle and committed bars", () => {
  it("starts and stops with zero plugins", async () => {
    const { host, audio } = setup([]);
    await host.start();
    expect(host.getSnapshot().running).toBe(true);
    expect(audio.bars.every((bar) => bar.tracks.length === 0)).toBe(true);
    host.stop();
    expect(host.getSnapshot().running).toBe(false);
  });

  it("is lazy until add and rejects duplicate plugin IDs", async () => {
    const load = vi.fn(first.load);
    const { host } = setup([{ ...first, load }]);
    expect(load).not.toHaveBeenCalled();
    await host.add(first.manifest.id);
    expect(load).toHaveBeenCalledTimes(1);
    await host.add(first.manifest.id);
    expect(load).toHaveBeenCalledTimes(1);
    expect(
      () => new EnsembleHost([first, first], new FakeAudioEngine()),
    ).toThrow("Duplicate");
  });

  it("applies mute, solo and removal after frozen bars at the indicated boundary", async () => {
    vi.useFakeTimers();
    const { host, audio } = setup([first]);
    await host.add(first.manifest.id);
    await host.start();
    const initial = structuredClone(audio.bars);
    const effective = audio.bars.length;
    host.mute(first.manifest.id, true);
    expect(firstTrack(host)?.pendingAt).toBe(effective);
    expect(host.operations.at(-1)).toMatchObject({
      type: "mute",
      effectiveAtBar: effective,
    });
    expect(() => host.setSeed("blocked")).toThrow("Stop");
    audio.boundary(effective - 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(audio.bars.slice(0, initial.length)).toEqual(initial);
    expect(
      audio.bars.find((bar) => bar.plan.barIndex === effective)?.tracks[0]
        ?.muted,
    ).toBe(true);
    expect(firstTrack(host)?.pendingAt).toBe(effective);
    audio.boundary(effective);
    expect(firstTrack(host)?.pendingAt).toBeUndefined();

    host.solo(first.manifest.id, true);
    const soloAt = firstTrack(host)!.pendingAt!;
    audio.boundary(soloAt - 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(
      audio.bars.find((bar) => bar.plan.barIndex === soloAt)?.tracks[0]?.solo,
    ).toBe(true);
    audio.boundary(soloAt);

    const voice = audio.voices.get(firstTrack(host)!.identity.instanceId)!;
    host.remove(first.manifest.id);
    const removeAt = firstTrack(host)!.pendingAt!;
    expect(voice.dispose).not.toHaveBeenCalled();
    audio.boundary(removeAt - 1);
    await vi.advanceTimersByTimeAsync(100);
    audio.boundary(removeAt);
    expect(voice.dispose).toHaveBeenCalledTimes(1);
    expect(audio.tracks.size).toBe(0);
  });

  it("restarts with the same events and releases/disposes old voices", async () => {
    const { host, audio } = setup([first]);
    host.setSeed("replay");
    await host.add(first.manifest.id);
    await host.start();
    const initial = structuredClone(audio.bars);
    const oldVoice = audio.createdVoices[0]!;
    host.stop();
    expect(oldVoice.releaseAll).toHaveBeenCalled();
    expect(oldVoice.dispose).toHaveBeenCalledTimes(1);
    await host.start();
    expect(audio.bars.slice(initial.length)).toEqual(initial);
    expect(audio.createdVoices).toHaveLength(2);
    host.dispose();
    host.dispose();
    expect(audio.dispose).toHaveBeenCalledTimes(1);
    expect(audio.tracks.size).toBe(0);
  });

  it("shows loader and voice errors without preventing an empty ensemble from running", async () => {
    const failed: PluginDescriptor = {
      ...first,
      load: async () => {
        throw new Error("download failed");
      },
    };
    const { host, audio } = setup([failed]);
    await host.add(first.manifest.id);
    expect(firstTrack(host)).toMatchObject({
      active: false,
      loading: false,
      error: expect.stringContaining("download failed"),
    });
    await host.start();
    expect(host.getSnapshot().running).toBe(true);
    expect(audio.tracks.size).toBe(0);
    const { plugin } = await first.load();
    const brokenVoice = setup([
      {
        ...first,
        load: async () => ({
          plugin: {
            ...plugin,
            createVoice: async () => {
              throw new Error("voice failed");
            },
          },
        }),
      },
    ]);
    await brokenVoice.host.add(first.manifest.id);
    expect(firstTrack(brokenVoice.host)?.error).toContain("voice failed");
    expect(brokenVoice.audio.tracks.size).toBe(0);
  });

  it("surfaces generator errors while keeping the transport usable", async () => {
    const { plugin } = await first.load();
    const { host, audio } = setup([
      {
        ...first,
        load: async () => ({
          plugin: {
            ...plugin,
            generateBar: () => {
              throw new Error("generator failed");
            },
          },
        }),
      },
    ]);
    await host.add(first.manifest.id);
    await host.start();
    expect(host.getSnapshot().running).toBe(true);
    expect(firstTrack(host)?.error).toContain("generator failed");
    expect(
      audio.bars.every((bar) =>
        bar.tracks.every((track) => !track.active && !track.events.length),
      ),
    ).toBe(true);
  });

  it("keeps a healthy plugin generating when a neighboring plugin fails", async () => {
    const { plugin } = await first.load();
    const brokenManifest = {
      ...plugin.manifest,
      id: "fault-injection",
      characters: undefined,
    };
    const broken: PluginDescriptor = {
      manifest: brokenManifest,
      load: async () => ({
        plugin: {
          ...plugin,
          manifest: brokenManifest,
          generateBar: () => {
            throw new Error("isolated failure");
          },
        },
      }),
    };
    const { host, audio } = setup([first, broken]);
    await host.add(first.manifest.id);
    await host.add(brokenManifest.id);
    await host.start();
    expect(host.getSnapshot().running).toBe(true);
    expect(
      host
        .getSnapshot()
        .tracks.find((track) => track.manifest.id === brokenManifest.id)?.error,
    ).toContain("isolated failure");
    expect(
      audio.bars.every(
        (bar) =>
          (bar.tracks.find(
            (track) => track.id === firstTrack(host)!.identity.instanceId,
          )?.events.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("does not install a lazy module that finishes after dispose", async () => {
    let finish!: (value: Awaited<ReturnType<PluginDescriptor["load"]>>) => void;
    const module = await first.load();
    const { host, audio } = setup([
      {
        ...first,
        load: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
    ]);
    const loading = host.add(first.manifest.id);
    host.dispose();
    finish(module);
    await loading;
    expect(audio.createTrack).not.toHaveBeenCalled();
    expect(host.getSnapshot().running).toBe(false);
  });

  it("invalidates a pending audio unlock when stopped", async () => {
    let finish!: () => void;
    const { host, audio } = setup([]);
    audio.unlock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const starting = host.start();
    host.stop();
    finish();
    await starting;
    expect(audio.start).not.toHaveBeenCalled();
    expect(host.getSnapshot().running).toBe(false);
  });
});
