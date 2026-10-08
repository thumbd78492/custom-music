import { expect, it, vi } from "vitest";
import { BarPlanner, validateEvents } from "../../src/core/BarPlanner";
import { MusicDirector } from "../../src/core/MusicDirector";
import { coordinate } from "../../src/core/EnsembleCoordinator";
import type { MusicEvent } from "../../src/contracts/music";

it("uses the fixed shared M0 harmonic plan and immutable structures", () => {
  const director = new MusicDirector("test");
  expect(
    Array.from({ length: 5 }, (_, index) => director.planBar(index).chord),
  ).toEqual(["Cmaj7", "Am7", "Dm7", "G7", "Cmaj7"]);
  const plan = director.planBar(0);
  expect(plan).toMatchObject({
    bpm: 88,
    meter: "4/4",
    key: "C Major",
    rootSeed: "test",
  });
  expect(plan.groove).toHaveLength(16);
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.chordPitchClasses)).toBe(true);
});

it("collects every proposal before generating and freezes submitted events", () => {
  const calls: string[] = [];
  const tracks = ["z", "a"].map((id) => ({
    id,
    active: true,
    muted: false,
    solo: false,
    session: {
      propose: () => {
        calls.push(`propose:${id}`);
        return { accents: Array(16).fill(0.5), density: 0.5 };
      },
      generate: () => {
        calls.push(`generate:${id}`);
        return [
          { kind: "hit", step: 0, sampleKey: "local", velocity: 0.5 },
        ] as const;
      },
    },
  }));
  const onError = vi.fn();
  const bar = new BarPlanner(new MusicDirector("test")).prepare(
    tracks,
    onError,
  );
  expect(calls).toEqual(["propose:a", "propose:z", "generate:a", "generate:z"]);
  expect(Object.isFrozen(bar)).toBe(true);
  expect(Object.isFrozen(bar.tracks[0]!.events[0])).toBe(true);
  expect(onError).not.toHaveBeenCalled();
});

it("aggregates no instruments to neutral intent", () => {
  expect(coordinate(new Map())).toEqual({
    accents: Array(16).fill(0),
    density: 0,
    lowRegisterLoad: 0,
    midRegisterLoad: 0,
    highRegisterLoad: 0,
    leadActivity: 0,
  });
});

it.each([
  [{ kind: "note", step: -1, durationSteps: 1, midi: 60, velocity: 0.5 }],
  [{ kind: "note", step: 16, durationSteps: 1, midi: 60, velocity: 0.5 }],
  [{ kind: "note", step: 0.5, durationSteps: 1, midi: 60, velocity: 0.5 }],
  [{ kind: "note", step: 0, durationSteps: 0, midi: 60, velocity: 0.5 }],
  [{ kind: "note", step: 0, durationSteps: 1, midi: 128, velocity: 0.5 }],
  [{ kind: "hit", step: 0, sampleKey: "test", velocity: Number.NaN }],
  [{ kind: "hit", step: 0, sampleKey: "test", velocity: 1.1 }],
  [{ kind: "hit", step: 0, sampleKey: "", velocity: 0.5 }],
  [
    {
      kind: "hit",
      step: 0,
      sampleKey: "test",
      velocity: 0.5,
      microOffsetMs: -1,
    },
  ],
] as MusicEvent[][])("rejects an unsafe event %j", (event) => {
  expect(() => validateEvents([event])).toThrow();
});
