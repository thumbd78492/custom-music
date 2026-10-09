import { expect, it } from "vitest";
import { BarPlanner } from "../../src/core/BarPlanner";
import { MusicDirector } from "../../src/core/MusicDirector";
import { PhraseCoordinator } from "../../src/core/PhraseCoordinator";
import type { CharacterDefinition } from "../../src/contracts/instrument";
import type { EnsembleIntent } from "../../src/contracts/music";

it("excludes self lead/register occupancy while retaining the recipient's own task", () => {
  const heard: EnsembleIntent[] = [];
  const character: CharacterDefinition = {
    id: "arbitrary-character",
    displayName: "Generic",
    capabilities: [],
    phrase: { tasks: ["lead", "respond", "support", "rest"], leadWeight: 1 },
  };
  const session = {
    character,
    propose: () => ({
      accents: Array(16).fill(1),
      density: 1,
      register: "high" as const,
      leadActivity: 1,
    }),
    generate: (_plan: unknown, _own: unknown, ensemble: EnsembleIntent) => {
      heard.push(ensemble);
      return [];
    },
  };
  new BarPlanner(new MusicDirector("self")).prepare(
    [{ id: "independent:7", active: true, muted: false, solo: false, session }],
    () => {},
  );
  expect(heard[0]).toMatchObject({
    leadActivity: 0,
    highRegisterLoad: 0,
    audibleLeadCount: 1,
    assignment: { task: "lead" },
  });
});

const performers: CharacterDefinition = {
  id: "generic-performer",
  displayName: "Generic performer",
  capabilities: [],
  phrase: { tasks: ["lead", "respond", "support", "rest"], leadWeight: 1 },
};
const pair = new Map([
  ["a", performers],
  ["b", performers],
]);

it("retains a deterministic answer layout for a whole phrase and varies only at phrase boundaries", () => {
  const capture = () => {
    const director = new MusicDirector("phrase-layouts");
    const coordinator = new PhraseCoordinator();
    return Array.from({ length: 48 }, (_, bar) =>
      [...coordinator.assign(director.planBar(bar), pair)].map(
        ([id, assignment]) => ({ id, ...assignment }),
      ),
    );
  };
  const bars = capture();
  expect(capture()).toEqual(bars);
  expect(
    new Set(bars.flatMap((bar) => bar.map((a) => a.layoutId))).size,
  ).toBeGreaterThan(1);
  for (let start = 0; start < bars.length; start += 4) {
    expect(
      new Set(
        bars
          .slice(start, start + 4)
          .flatMap((bar) => bar.map((a) => a.layoutId)),
      ).size,
    ).toBe(1);
    expect(bars[start]!.filter((a) => a.task === "lead")).toHaveLength(1);
    expect(bars[start]!.filter((a) => a.task === "rest")).toHaveLength(1);
    expect(bars[start + 2]!.filter((a) => a.task === "respond")).toHaveLength(
      1,
    );
  }
});

it("keeps phrase layout after a midphrase roster change and restores fair history transactionally", () => {
  const director = new MusicDirector("phrase-transaction");
  const coordinator = new PhraseCoordinator();
  const first = coordinator.assign(director.planBar(0), pair);
  const checkpoint = coordinator.checkpoint();
  const survivor = new Map([["b", performers]]);
  const changed = coordinator.assign(director.planBar(1), survivor);
  expect(changed.get("b")?.layoutId).toBe(first.get("b")?.layoutId);
  expect(changed.get("b")?.task).toBe("lead");
  coordinator.restore(checkpoint);
  const unchanged = coordinator.assign(director.planBar(1), pair);
  const fresh = new PhraseCoordinator();
  fresh.assign(director.planBar(0), pair);
  expect(unchanged).toEqual(fresh.assign(director.planBar(1), pair));
});
