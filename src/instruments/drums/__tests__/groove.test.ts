import { describe, expect, it } from "vitest";
import type { BarPlan, GrooveId } from "../../../contracts/music";
import { coordinate } from "../../../core/EnsembleCoordinator";
import { createGroovePlan } from "../../../core/GroovePlan";
import { MusicDirector } from "../../../core/MusicDirector";
import { generateBar, proposeBar } from "../generator";

function context(family: GrooveId, barIndex = 0): BarPlan {
  const plan = {
    ...new MusicDirector("kit-groove").planBar(barIndex),
    density: 0.55,
    energy: 0.55,
    bpm: 92,
  };
  return { ...plan, groovePlan: createGroovePlan(plan, family) };
}
function generate(plan: BarPlan, leadActivity = 0) {
  return generateBar(
    plan,
    proposeBar(plan),
    { ...coordinate(new Map()), leadActivity },
    { barsPlayed: 0 },
  );
}
function grid(plan: BarPlan) {
  return generate(plan).events.map((event) =>
    event.kind === "hit" ? `${event.sampleKey}:${event.step}` : "",
  );
}

describe("owned kit groove families", () => {
  it("changes the attack grid at one BPM and puts the half-time backbeat on beat three", () => {
    const straight = context("straight"),
      swing = context("light-swing"),
      half = context("half-time");
    expect(grid(straight)).not.toEqual(grid(swing));
    expect(grid(half)).not.toEqual(grid(straight));
    const backbeats = generate(half).events.filter(
      (event) =>
        event.kind === "hit" &&
        event.sampleKey === "snare" &&
        event.velocity > 0.3,
    );
    expect(backbeats.map((event) => event.step)).toEqual([8]);
    expect([straight.bpm, swing.bpm, half.bpm]).toEqual([92, 92, 92]);
  });
  it("keeps a four-bar family, adds bounded ghosts, fills and a real break", () => {
    for (const family of ["straight", "light-swing", "half-time"] as const) {
      const first = context(family),
        second = context(family, 1);
      const kicks = (plan: BarPlan) =>
        generate(plan)
          .events.filter(
            (event) => event.kind === "hit" && event.sampleKey === "kick",
          )
          .map((event) => event.step);
      expect(kicks(first)).toEqual(kicks(second));
      expect(kicks(context(family, 2))).not.toEqual(kicks(first));
      const ghosts = generate(second).events.filter(
        (event) =>
          event.kind === "hit" &&
          event.sampleKey === "snare" &&
          event.velocity < 0.3,
      );
      expect(ghosts).toHaveLength(1);
      const ending = context(family, 3);
      const filled = {
        ...ending,
        groovePlan: { ...ending.groovePlan!, fill: true },
      };
      expect(
        generate(filled).events.filter((event) => event.step >= 13).length,
      ).toBeGreaterThan(
        generate(filled, 0.95).events.filter((event) => event.step >= 13)
          .length,
      );
      const broken = {
        ...context(family, 2),
        groovePlan: { ...context(family, 2).groovePlan!, break: true },
      };
      expect(generate(broken).events.every((event) => event.step < 12)).toBe(
        true,
      );
    }
  });
  it("replays the same pure inputs and declares exactly the kick anchors it emits", () => {
    for (const family of ["straight", "light-swing", "half-time"] as const)
      for (let bar = 0; bar < 16; bar++) {
        const plan = context(family, bar),
          result = generate(plan);
        expect(generate(plan)).toEqual(result);
        expect(result.nextState.barsPlayed).toBe(1);
        expect(result.events.length).toBeLessThanOrEqual(20);
        const kicks = result.events
          .filter((event) => event.kind === "hit" && event.sampleKey === "kick")
          .map((event) => event.step);
        expect(
          proposeBar(plan).pulseAccents!.flatMap((level, step) =>
            level ? [step] : [],
          ),
        ).toEqual(kicks);
        for (const event of result.events) {
          expect(Number.isInteger(event.step)).toBe(true);
          expect(event.step).toBeGreaterThanOrEqual(0);
          expect(event.step).toBeLessThan(16);
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThan(1);
        }
      }
  });
});
