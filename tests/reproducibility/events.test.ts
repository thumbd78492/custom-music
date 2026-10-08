import { expect, it, vi } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { deriveSeed, SeededRandom } from "../../src/core/SeededRandom";
import { FakeAudioEngine } from "../helpers/FakeAudioEngine";

it("separates derived random streams and reproduces their values", () => {
  const key = deriveSeed("seed", 1, "test", "notes");
  const a = new SeededRandom(key);
  const b = new SeededRandom(key);
  expect(Array.from({ length: 100 }, () => a.next())).toEqual(
    Array.from({ length: 100 }, () => b.next()),
  );
  expect(key).not.toBe(deriveSeed("seed", 1, "test", "velocity"));
  expect(deriveSeed("a", 12, "3", "x")).not.toBe(deriveSeed("a1", 2, "3", "x"));
});

it("produces identical events regardless of plugin discovery/add order", async () => {
  const descriptors = await discoverPlugins();
  const capture = async (reverse: boolean) => {
    const order = reverse ? [...descriptors].reverse() : descriptors;
    const audio = new FakeAudioEngine();
    const host = new EnsembleHost(order, audio);
    try {
      host.setSeed("ordered-ensemble");
      for (const descriptor of order) await host.add(descriptor.manifest.id);
      await host.start();
      expect(audio.bars[0]?.tracks).toHaveLength(descriptors.length);
      return audio.bars;
    } finally {
      host.dispose();
    }
  };
  expect(await capture(true)).toEqual(await capture(false));
});

it("replays a fixed boundary operation sequence with identical committed events and receipts", async () => {
  vi.useFakeTimers();
  const descriptors = await discoverPlugins();
  const id = descriptors[0]!.manifest.id;
  const capture = async () => {
    const audio = new FakeAudioEngine();
    const host = new EnsembleHost(descriptors, audio);
    try {
      host.setSeed("operations");
      for (const descriptor of descriptors)
        await host.add(descriptor.manifest.id);
      await host.start();
      for (const command of [
        () => host.mute(id, true),
        () => host.mute(id, false),
        () => host.solo(id, true),
        () => host.remove(id),
      ]) {
        command();
        const boundary = host
          .getSnapshot()
          .tracks.find((track) => track.manifest.id === id)!.pendingAt!;
        audio.boundary(boundary - 1);
        await vi.advanceTimersByTimeAsync(100);
        audio.boundary(boundary);
      }
      return { bars: audio.bars, operations: [...host.operations] };
    } finally {
      host.dispose();
    }
  };
  try {
    expect(await capture()).toEqual(await capture());
  } finally {
    vi.useRealTimers();
  }
});
