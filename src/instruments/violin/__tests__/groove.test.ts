import { describe, expect, it } from "vitest";
import type { BarPlan, GrooveId } from "../../../contracts/music";
import { coordinate } from "../../../core/EnsembleCoordinator";
import { createGroovePlan } from "../../../core/GroovePlan";
import { MusicDirector } from "../../../core/MusicDirector";
import { generateBar, proposeBar } from "../generator";
import type { Motif, ViolinState } from "../motif";

function context(family: GrooveId, barIndex = 0): BarPlan {
  const plan = {
    ...new MusicDirector("violin-groove").planBar(barIndex),
    density: 0.55,
    energy: 0.55,
    bpm: 92,
  };
  return { ...plan, groovePlan: createGroovePlan(plan, family) };
}
const empty = coordinate(new Map());

describe("bounded violin groove adaptation", () => {
  it("keeps its private motif and connected boundary while half-time omits one interior attack", () => {
    const theme: Motif = {
      id: "retained-arco",
      bars: [
        [
          { step: 0, degree: 0, duration: 4, rebow: true },
          { step: 4, degree: 1, duration: 4 },
          { step: 8, degree: 2, duration: 4 },
          { step: 12, degree: 1, duration: 4 },
        ],
      ],
    };
    const state: ViolinState = {
      barsPlayed: 4,
      theme,
      homeTheme: theme,
      themeStartedAt: 0,
    };
    const plan = context("half-time");
    const result = generateBar(plan, proposeBar(plan, state), empty, state);
    expect(result.events.map((event) => event.step)).toEqual([0, 8, 12]);
    expect(result.events[0]).toMatchObject({ durationSteps: 8 });
    expect(result.events[1]).toMatchObject({ articulation: "legato" });
    expect(result.nextState.theme).toEqual(theme);
    expect(result.nextState.homeTheme).toEqual(theme);
    expect(state.barsPlayed).toBe(4);
  });
  it("preserves the material during swing and keeps natural bows bounded without an ensemble", () => {
    for (const family of ["straight", "light-swing", "half-time"] as const) {
      let state: ViolinState = { barsPlayed: 0 };
      for (let bar = 0; bar < 32; bar++) {
        const plan = context(family, bar),
          own = proposeBar(plan, state);
        const result = generateBar(plan, own, empty, state);
        expect(generateBar(plan, own, empty, state)).toEqual(result);
        for (const event of result.events)
          if (event.kind === "note") {
            expect(event.durationSteps).toBeGreaterThanOrEqual(2.5);
            expect(event.step + event.durationSteps).toBeLessThanOrEqual(16);
            expect(event.midi).toBeGreaterThanOrEqual(69);
            expect(event.midi).toBeLessThanOrEqual(84);
          }
        state = result.nextState;
      }
    }
  });
});
