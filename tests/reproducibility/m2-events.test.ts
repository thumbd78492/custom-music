import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import { createPluginSession } from "../../src/core/PluginSession";
import { MusicDirector } from "../../src/core/MusicDirector";
import { BarPlanner } from "../../src/core/BarPlanner";
import type { VariationMode } from "../../src/contracts/music";

const descriptors = await discoverPlugins();
async function capture(seed: string, mode: VariationMode, order = descriptors) {
  const tracks = await Promise.all(
    order.map(async (descriptor) => ({
      id: descriptor.manifest.id,
      active: true,
      muted: false,
      solo: false,
      session: createPluginSession((await descriptor.load()).plugin),
    })),
  );
  const planner = new BarPlanner(new MusicDirector(seed, mode));
  const bars = Array.from({ length: 280 }, () =>
    planner.prepare(tracks, (id, error) => {
      throw new Error(`${id}: ${String(error)}`);
    }),
  );
  return {
    hash: createHash("sha256").update(JSON.stringify(bars)).digest("hex"),
    bars,
  };
}
for (const mode of ["Subtle", "Balanced", "Experimental"] as const)
  it(`${mode}: replays every event and tempo/harmony plan for over ten minutes, regardless of discovery order`, async () => {
    const hashes = new Set<string>();
    for (const seed of ["alpha", "beta", "音樂", "0"]) {
      const a = await capture(seed, mode);
      expect((await capture(seed, mode, [...descriptors].reverse())).hash).toBe(
        a.hash,
      );
      expect(
        a.bars.reduce((sum, bar) => sum + 240 / bar.plan.bpm, 0),
      ).toBeGreaterThan(600);
      // Ignore velocities: the notes, harmony and actual attack grids must evolve.
      for (const descriptor of descriptors) {
        const patterns = a.bars.map((bar) =>
          JSON.stringify(
            bar.tracks
              .find((track) => track.id === descriptor.manifest.id)!
              .events.map((event) =>
                event.kind === "note"
                  ? [event.step, event.midi, event.durationSteps]
                  : [event.step, event.sampleKey],
              ),
          ),
        );
        expect(new Set(patterns).size, descriptor.manifest.id).toBeGreaterThan(
          8,
        );
      }
      hashes.add(a.hash);
    }
    expect(hashes.size).toBe(4);
  });

it("replays all available plugin subsets with immutable per-plugin state", async () => {
  for (let mask = 1; mask < 2 ** descriptors.length; mask++) {
    const selected = descriptors.filter((_, bit) => mask & (1 << bit));
    expect((await capture("subset", "Balanced", selected)).hash).toBe(
      (await capture("subset", "Balanced", [...selected].reverse())).hash,
    );
  }
});
