import { afterEach, expect, it, vi } from "vitest";
import type {
  InstrumentPlugin,
  PluginDescriptor,
} from "../../src/contracts/instrument";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { FakeAudioEngine, fakeVoice } from "../helpers/FakeAudioEngine";

const hosts: EnsembleHost[] = [];
function setup() {
  const generated: number[] = [];
  const plugin: InstrumentPlugin = {
    manifest: {
      id: "independent",
      displayName: "Independent",
      version: "test",
      capabilities: [],
      controls: [],
      sound: { kind: "samples", label: "test" },
    },
    createInitialState: () => 0,
    proposeBar: () => ({ accents: Array<number>(16).fill(0.5), density: 0.5 }),
    generateBar: (plan, _own, _ensemble, state) => {
      generated.push(plan.barIndex);
      return {
        events: [
          {
            kind: "note",
            step: 0,
            midi: 60 + (Number(state) % 12),
            durationSteps: 1,
            velocity: 0.5,
          },
        ],
        nextState: Number(state) + 1,
      };
    },
    createVoice: async () => fakeVoice(),
  };
  const descriptor: PluginDescriptor = {
    manifest: plugin.manifest,
    load: async () => ({ plugin }),
  };
  const audio = new FakeAudioEngine();
  const host = new EnsembleHost([descriptor], audio);
  hosts.push(host);
  return { host, audio, generated };
}
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  vi.useRealTimers();
});

it("catches up in bounded batches with all generator states preserved and no old attacks submitted", async () => {
  vi.useFakeTimers();
  const { host, audio, generated } = setup();
  await host.add("independent");
  await host.start();
  audio.bar = 100;
  await vi.advanceTimersByTimeAsync(100);
  expect(generated).toHaveLength(35);
  expect(audio.bars.map((bar) => bar.plan.barIndex)).toEqual([0, 1, 2]);
  await vi.advanceTimersByTimeAsync(300);
  expect(generated).toEqual(Array.from({ length: 103 }, (_, i) => i));
  expect(audio.bars.map((bar) => bar.plan.barIndex)).toEqual([
    0, 1, 2, 101, 102,
  ]);
  expect(audio.bars.at(-2)?.tracks[0]?.events[0]).toMatchObject({ midi: 65 });
  expect(host.getSnapshot().barIndex).toBe(100);
  // A callback delayed since before background recovery cannot move the UI back.
  audio.callbacks.get(2)!(audio.bars[2]!);
  expect(host.getSnapshot().barIndex).toBe(100);
});

it("places a command during throttling at a future boundary and clears pending removals on recovery", async () => {
  vi.useFakeTimers();
  const { host, audio, generated } = setup();
  await host.add("independent");
  await host.start();
  audio.bar = 10;
  host.remove("independent");
  expect(host.getSnapshot().tracks[0]?.pendingAt).toBe(11);
  expect(host.operations.at(-1)).toMatchObject({
    requestedAtBar: 10,
    effectiveAtBar: 11,
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(generated).toEqual(Array.from({ length: 11 }, (_, i) => i));
  expect(host.getSnapshot().tracks[0]?.pendingAt).toBe(11);
  expect(audio.tracks.has("independent")).toBe(true);
  audio.boundary(11);
  expect(host.getSnapshot().tracks[0]?.pendingAt).toBeUndefined();
  expect(audio.tracks.size).toBe(0);
});

it("reconciles an already committed removal when animation frames never arrive", async () => {
  vi.useFakeTimers();
  const { host, audio } = setup();
  await host.add("independent");
  await host.start();
  host.remove("independent");
  audio.bar = 12;
  await vi.advanceTimersByTimeAsync(100);
  expect(host.getSnapshot().tracks[0]?.pendingAt).toBeUndefined();
  expect(audio.tracks.size).toBe(0);
  expect(audio.bars.slice(3).every((bar) => bar.plan.barIndex > 12)).toBe(true);
});

it("keeps tempo/harmony plans and safe operations intact across a section transition", async () => {
  vi.useFakeTimers();
  const { host, audio } = setup();
  host.setSeed("alpha");
  await host.add("independent");
  await host.start();
  const initialBpm = host.getSnapshot().music.bpm;
  for (let bar = 1; bar <= 7; bar++) {
    audio.boundary(bar);
    await vi.advanceTimersByTimeAsync(100);
  }
  host.mute("independent", true);
  const effective = host.operations.at(-1)!.effectiveAtBar;
  expect(effective).toBeGreaterThanOrEqual(9);
  audio.boundary(8);
  expect(host.getSnapshot().music.bpm).not.toBe(initialBpm);
  expect(host.getSnapshot().tracks[0]!.pendingAt).toBe(effective);
  for (let bar = 9; bar <= effective; bar++) {
    await vi.advanceTimersByTimeAsync(100);
    audio.boundary(bar);
  }
  expect(host.getSnapshot().tracks[0]!.pendingAt).toBeUndefined();
  expect(
    audio.bars.find((bar) => bar.plan.barIndex === effective)!.tracks[0]!.muted,
  ).toBe(true);
  expect(() => host.setVariationMode("Subtle")).toThrow("Stop");
  host.stop();
  host.setVariationMode("Subtle");
  expect(host.getSnapshot().variationMode).toBe("Subtle");
});
