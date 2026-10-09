import { expect, it } from "vitest";
import { BarPlanner } from "../../src/core/BarPlanner";
import { MusicDirector } from "../../src/core/MusicDirector";
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
