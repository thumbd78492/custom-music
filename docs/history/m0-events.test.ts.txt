import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import type { PluginDescriptor } from "../../src/contracts/instrument";
import { MusicDirector } from "../../src/core/MusicDirector";
import { createPluginSession } from "../../src/core/PluginSession";
import { coordinate } from "../../src/core/EnsembleCoordinator";
import { validateEvents } from "../../src/core/BarPlanner";

const seeds = ["alpha", "beta", "音樂", "0"];
const bars = 12;
const descriptors = await discoverPlugins();
const subsets = Array.from(
  { length: 2 ** descriptors.length - 1 },
  (_, index) =>
    descriptors.filter((_, bit) => ((index + 1) & (1 << bit)) !== 0),
);

async function capture(order: readonly PluginDescriptor[], seed: string) {
  const sessions = await Promise.all(
    order.map(async (descriptor) => ({
      id: descriptor.manifest.id,
      session: createPluginSession((await descriptor.load()).plugin),
    })),
  );
  const director = new MusicDirector(seed);
  const result = Array.from({ length: bars }, (_, index) => {
    const plan = director.planBar(index);
    const proposals = new Map(
      sessions.map(({ id, session }) => [id, session.propose(plan)]),
    );
    const ensemble = coordinate(proposals);
    const tracks = sessions
      .map(({ id, session }) => {
        const own = proposals.get(id)!;
        const events = session.generate(plan, own, ensemble);
        validateEvents(events);
        return { id, own, events };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return { plan, ensemble, tracks };
  });
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

// Captured from the unchanged M0 generators, director and coordinator before M1
// sample integration. Hashes cover exact JSON: every BarPlan, proposal, ensemble
// intent and MusicEvent (including floating-point velocity), across 12 bars.
// The fixture contains all 15 nonempty subsets. Discovering only directories
// physically present lets this same regression run in single-plugin fixtures.
const golden = JSON.parse(
  readFileSync(new URL("./m0-events.json", import.meta.url), "utf8"),
) as {
  version: string;
  bars: number;
  seeds: string[];
  hashes: Record<string, Record<string, string>>;
};

it("keeps the frozen M0 musical version and golden coverage", () => {
  expect(golden.version).toBe("m0.1");
  expect(golden.bars).toBe(bars);
  expect(golden.seeds).toEqual(seeds);
  expect(descriptors.length).toBeGreaterThan(0);
});

for (const subset of subsets) {
  const key = subset
    .map(({ manifest }) => manifest.id)
    .sort()
    .join(",");
  for (const seed of seeds)
    it(`${key} preserves exact M0 music for seed ${JSON.stringify(seed)} in either plugin order`, async () => {
      const expected = golden.hashes[key]?.[seed];
      expect(expected).toMatch(/^[a-f\d]{64}$/);
      expect(await capture(subset, seed)).toBe(expected);
      expect(await capture([...subset].reverse(), seed)).toBe(expected);
    });
}
