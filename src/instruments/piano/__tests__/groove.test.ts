import { describe, expect, it } from "vitest";
import type { BarPlan, GrooveId } from "../../../contracts/music";
import { coordinate } from "../../../core/EnsembleCoordinator";
import { createGroovePlan } from "../../../core/GroovePlan";
import { MusicDirector } from "../../../core/MusicDirector";
import { generateBar, proposeBar } from "../accompaniment";
import { generateMelody, proposeMelody } from "../melody";
import type { MelodyState, PianoTheme } from "../melody";

function context(family: GrooveId, barIndex = 0): BarPlan {
  const plan = {
    ...new MusicDirector("piano-groove").planBar(barIndex),
    density: 0.55,
    energy: 0.55,
    bpm: 92,
  };
  return { ...plan, groovePlan: createGroovePlan(plan, family) };
}
const empty = coordinate(new Map());
function comp(plan: BarPlan, ensemble = empty) {
  return generateBar(plan, proposeBar(plan), ensemble, { barsPlayed: 0 });
}
function attacks(plan: BarPlan) {
  return [...new Set(comp(plan).events.map((event) => event.step))];
}

describe("owned piano groove phrasing", () => {
  it("changes chord entrances at one BPM with independent two/four-bar variants", () => {
    expect(attacks(context("straight"))).not.toEqual(
      attacks(context("light-swing")),
    );
    expect(attacks(context("straight"))).not.toEqual(
      attacks(context("half-time")),
    );
    expect(attacks(context("straight"))).toEqual(
      attacks(context("straight", 1)),
    );
    expect(attacks(context("straight", 2))).not.toEqual(
      attacks(context("straight")),
    );
    for (const family of ["straight", "light-swing", "half-time"] as const) {
      const plan = context(family, 2);
      const broken = {
        ...plan,
        groovePlan: { ...plan.groovePlan!, break: true },
      };
      expect(new Set(comp(broken).events.map((event) => event.step)).size).toBe(
        1,
      );
    }
  });
  it("retains sparse rootless support for both lead roles and all mapped note bounds", () => {
    for (const family of ["straight", "light-swing", "half-time"] as const)
      for (let bar = 0; bar < 16; bar++) {
        const plan = context(family, bar);
        const backing = {
          ...empty,
          audibleLeadCount: 2,
          leadActivity: 0.9,
          lowRegisterLoad: 0.01,
        };
        const result = comp(plan, backing);
        expect(comp(plan, backing)).toEqual(result);
        expect(result.nextState.barsPlayed).toBe(1);
        expect(
          new Set(result.events.map((event) => event.step)).size,
        ).toBeLessThanOrEqual(2);
        for (const event of result.events)
          if (event.kind === "note") {
            expect(event.midi).toBeGreaterThanOrEqual(60);
            expect(event.midi).toBeLessThanOrEqual(69);
            expect(event.midi % 12).not.toBe(plan.chordPitchClasses[0]);
            expect(event.durationSteps).toBeGreaterThan(0);
            expect(event.step + event.durationSteps).toBeLessThanOrEqual(16);
          }
      }
  });
  it("preserves the melody theme when half-time makes one interior attack a longer breath", () => {
    const theme: PianoTheme = {
      id: "retained-theme",
      bars: [
        [
          { step: 0, degree: 0, duration: 3.4 },
          { step: 4, degree: 1, duration: 3.4 },
          { step: 8, degree: 3, duration: 3.4 },
          { step: 12, degree: 2, duration: 3 },
        ],
      ],
    };
    const state: MelodyState = {
      barsPlayed: 4,
      theme,
      homeTheme: theme,
      themeStartedAt: 0,
    };
    const straight = context("straight"),
      half = context("half-time");
    const full = generateMelody(
      straight,
      proposeMelody(straight, state),
      empty,
      state,
    );
    const breathing = generateMelody(
      half,
      proposeMelody(half, state),
      empty,
      state,
    );
    expect(full.events).toHaveLength(4);
    expect(breathing.events.map((event) => event.step)).toEqual([0, 8, 12]);
    expect(breathing.events[0]).toMatchObject({ durationSteps: 7.4 });
    expect(breathing.nextState.theme).toEqual(theme);
    expect(breathing.nextState.homeTheme).toEqual(theme);
    expect(breathing.nextState.themeStartedAt).toBe(0);
    expect(state.barsPlayed).toBe(4);
  });
});
