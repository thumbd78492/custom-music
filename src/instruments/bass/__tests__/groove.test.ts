import { describe, expect, it } from "vitest";
import type { BarPlan, GrooveId } from "../../../contracts/music";
import { coordinate } from "../../../core/EnsembleCoordinator";
import { createGroovePlan } from "../../../core/GroovePlan";
import { MusicDirector } from "../../../core/MusicDirector";
import { generateBar, proposeBar } from "../generator";

function context(family: GrooveId, barIndex = 0): BarPlan {
  const plan = {
    ...new MusicDirector("bass-groove").planBar(barIndex),
    density: 0.55,
    energy: 0.55,
    bpm: 92,
  };
  return { ...plan, groovePlan: createGroovePlan(plan, family) };
}
const empty = coordinate(new Map());
function generate(plan: BarPlan, ensemble = empty) {
  return generateBar(plan, proposeBar(plan), ensemble, { barsPlayed: 0 });
}
function rhythm(plan: BarPlan) {
  return generate(plan).events.map((event) =>
    event.kind === "note" ? [event.step, event.durationSteps] : [],
  );
}

describe("owned bass groove families", () => {
  it("plays different rhythms at the same BPM without needing a drum plugin", () => {
    expect(rhythm(context("straight"))).not.toEqual(
      rhythm(context("light-swing")),
    );
    expect(rhythm(context("straight"))).not.toEqual(
      rhythm(context("half-time")),
    );
    expect(generate(context("half-time")).events[0]).toMatchObject({
      step: 0,
      durationSteps: 7.5,
    });
    expect(rhythm(context("straight"))).toEqual(rhythm(context("straight", 1)));
  });
  it("answers an anonymous pulse once inside its phrase and clears a congested register", () => {
    const plan = context("straight", 2);
    const quiet = {
      ...plan,
      groovePlan: { ...plan.groovePlan!, pulseAccents: Array(16).fill(0) },
    };
    const before = generate(quiet).events.map((event) => event.step);
    const response = Array.from({ length: 10 }, (_, i) => i + 4).find((step) =>
      before.every((other) => Math.abs(other - step) >= 3),
    )!;
    expect(response).toBeDefined();
    const pulse = Array.from({ length: 16 }, (_, step) =>
      step === response ? 1 : 0,
    );
    const after = generate(quiet, { ...empty, pulseAccents: pulse }).events;
    expect(after.map((event) => event.step)).toContain(response);
    expect(after.length).toBe(before.length + 1);
    expect(
      generate(quiet, { ...empty, lowRegisterLoad: 0.8 }).events,
    ).toHaveLength(2);
  });
  it("bounds the phrase pickup and note ends and only returns the next private state", () => {
    for (const family of ["straight", "light-swing", "half-time"] as const)
      for (let bar = 0; bar < 16; bar++) {
        const plan = context(family, bar),
          result = generate(plan);
        expect(generate(plan)).toEqual(result);
        expect(result.nextState.barsPlayed).toBe(1);
        expect(result.events.length).toBeLessThanOrEqual(4);
        for (const event of result.events)
          if (event.kind === "note") {
            expect(event.durationSteps).toBeGreaterThan(0);
            expect(event.step + event.durationSteps).toBeLessThanOrEqual(16);
            expect(event.midi).toBeGreaterThanOrEqual(36);
            expect(event.midi).toBeLessThanOrEqual(55);
          }
      }
  });
});
