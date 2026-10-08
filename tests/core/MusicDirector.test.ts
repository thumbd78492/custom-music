import { expect, it } from "vitest";
import { MusicDirector } from "../../src/core/MusicDirector";
import { harmony, scale } from "../../src/core/HarmonyPlan";

it("replays tempo, harmony and conditional sections independently of query order", () => {
  for (const mode of ["Subtle", "Balanced", "Experimental"] as const) {
    const a = new MusicDirector("alpha", mode);
    const forward = Array.from({ length: 280 }, (_, i) => a.planBar(i));
    const b = new MusicDirector("alpha", mode);
    expect(
      Array.from({ length: 280 }, (_, i) => b.planBar(279 - i)).reverse(),
    ).toEqual(forward);
    expect(new Set(forward.map((x) => x.section)).size).toBeGreaterThanOrEqual(
      4,
    );
    expect(new Set(forward.map((x) => x.bpm)).size).toBeGreaterThan(2);
    expect(new Set(forward.map((x) => x.key)).size).toBeGreaterThan(1);
    expect(forward.reduce((s, x) => s + 240 / x.bpm, 0)).toBeGreaterThan(600);
  }
});

it("changes tempo only on section boundaries, using bounded energy-driven steps", () => {
  for (let seed = 0; seed < 30; seed++) {
    const director = new MusicDirector(String(seed));
    let previous = director.planBar(0);
    for (let i = 1; i < 280; i++) {
      const plan = director.planBar(i);
      expect(plan.bpm).toBeGreaterThanOrEqual(80);
      expect(plan.bpm).toBeLessThanOrEqual(105);
      if (plan.bpm !== previous.bpm) {
        expect(plan.sectionBar).toBe(0);
        expect(Math.abs(plan.bpm - previous.bpm)).toBeLessThanOrEqual(4);
        expect(Math.sign(plan.bpm - previous.bpm)).toBe(
          Math.sign(plan.energy - previous.energy),
        );
      }
      expect(plan.chordPitchClasses.length).toBe(4);
      expect(previous.nextChord).toBe(plan.chord);
      expect(previous.nextChordPitchClasses).toEqual(plan.chordPitchClasses);
      previous = plan;
    }
  }
});

it("modulates via a shared pivot, destination dominant and tonic arrival", () => {
  let changes = 0;
  for (const seed of ["alpha", "beta", "音樂", "0"]) {
    const director = new MusicDirector(seed);
    for (let i = 2; i < 280; i++) {
      const plan = director.planBar(i),
        previous = director.planBar(i - 1),
        pivot = director.planBar(i - 2);
      if (plan.key === previous.key) continue;
      changes++;
      expect(plan.sectionBar).toBe(0);
      const interval = (plan.tonic - previous.tonic + 12) % 12;
      if (plan.tonality === previous.tonality)
        expect([5, 7]).toContain(interval);
      else expect(interval).toBe(previous.tonality === "major" ? 9 : 3);
      const destination = { tonic: plan.tonic, mode: plan.tonality };
      expect(pivot.modulation).toBe("pivot");
      for (const pc of pivot.chordPitchClasses) {
        expect(scale(destination)).toContain(pc);
        expect(
          scale({ tonic: previous.tonic, mode: previous.tonality }),
        ).toContain(pc);
      }
      expect(previous.chord).toBe(harmony(destination, 4).chord);
      expect(plan.chord).toBe(harmony(destination, 0).chord);
      expect(plan.modulation).toBe("arrival");
    }
  }
  expect(changes).toBeGreaterThan(12);
});

it("uses substantive seed variation and accepts generic offline creative context", () => {
  const plans = Array.from({ length: 20 }, (_, seed) =>
    new MusicDirector(String(seed)).planBar(0),
  );
  expect(new Set(plans.map((x) => x.bpm)).size).toBeGreaterThan(8);
  expect(new Set(plans.map((x) => x.key)).size).toBeGreaterThan(5);
  const director = new MusicDirector("creative", "Balanced", {
    energyTarget: 0.8,
    densityTarget: 0.7,
    sectionRequest: "breakdown",
  });
  expect(director.planBar(8)).toMatchObject({
    density: 0.7,
    section: "Breakdown",
  });
});
