import { describe, expect, it } from "vitest";
import type { BarPlan, GrooveId, MusicEvent } from "../../src/contracts/music";
import { MusicDirector } from "../../src/core/MusicDirector";
import {
  createGroovePlan,
  mapPlaybackEvents,
  mapStepToTick,
  playbackSecondsPerStep,
  PPQ,
  TICKS_PER_BAR,
} from "../../src/core/GroovePlan";

function plan(familyId: GrooveId = "straight", barIndex = 0): BarPlan {
  const base = {
    ...new MusicDirector("timing-same-seed").planBar(barIndex),
    bpm: 90,
  };
  return Object.freeze({
    ...base,
    groovePlan: createGroovePlan(base, familyId, 7),
  });
}
const note = (step: number, durationSteps = 2, midi = 72): MusicEvent => ({
  kind: "note",
  step,
  durationSteps,
  midi,
  velocity: 0.65,
  articulation: "legato",
});

it("maps Straight and Half-time identically at the same BPM and preserves fractional nominal durations", () => {
  const events = [note(0, 1.8), note(2, 1.9), note(4, 12)];
  for (const family of ["straight", "half-time"] as const) {
    const current = plan(family, 4);
    for (const playback of mapPlaybackEvents(events, current)) {
      expect(playback.onTick).toBe(
        4 * TICKS_PER_BAR + (playback.event.step * PPQ) / 4,
      );
      if (playback.event.kind === "note") {
        expect(playback.offTick).toBe(
          4 * TICKS_PER_BAR +
            ((playback.event.step + playback.event.durationSteps) * PPQ) / 4,
        );
        expect(playbackSecondsPerStep(playback, current.bpm)).toBeCloseTo(
          60 / 90 / 4,
          12,
        );
      }
    }
    expect(current.bpm).toBe(90);
  }
});

it("moves eighth offbeats and both note boundaries while quarters, bars, chords and shared endpoints stay aligned", () => {
  const current = plan("light-swing", 2);
  const events = [note(0), note(2), note(2, 2, 76), note(4, 12)];
  const mapped = mapPlaybackEvents(events, current);
  expect(mapped.map((event) => event.onTick - 2 * TICKS_PER_BAR)).toEqual([
    0,
    expect.closeTo(115.2, 12),
    expect.closeTo(115.2, 12),
    192,
  ]);
  expect(mapped[0]!.offTick).toBe(mapped[1]!.onTick);
  expect(mapped[1]!.offTick).toBe(mapped[3]!.onTick);
  expect(mapped[3]!.offTick).toBe(3 * TICKS_PER_BAR);
  expect(playbackSecondsPerStep(mapped[0]!, 90) * 2).toBeCloseTo(0.4);
  expect(playbackSecondsPerStep(mapped[1]!, 90) * 2).toBeCloseTo(
    (60 / 90) * 0.4,
  );
  expect(events.map((event) => event.step)).toEqual([0, 2, 2, 4]);
  for (const step of [0, 4, 8, 12, 16])
    expect(mapStepToTick(step, 0.6)).toBe((step / 4) * PPQ);
});

it("preserves strictly positive durations, detached gaps and ordering over the continuous warp", () => {
  for (const ratio of [0.5, 0.58, 0.6, 0.62, 0.66]) {
    let previous = -1;
    for (let index = 0; index <= 1600; index++) {
      const tick = mapStepToTick(index / 100, ratio);
      expect(tick).toBeGreaterThan(previous);
      previous = tick;
    }
    const current = plan("light-swing");
    const changed = {
      ...current,
      groovePlan: { ...current.groovePlan!, swingRatio: ratio },
    };
    const mapped = mapPlaybackEvents(
      [note(0, 1.8), note(2, 1.8), note(4, 1.8)],
      changed,
    );
    for (const event of mapped)
      expect(event.offTick! - event.onTick).toBeGreaterThan(0);
    expect(mapped[0]!.offTick).toBeLessThan(mapped[1]!.onTick);
    expect(mapped[1]!.offTick).toBeLessThan(mapped[2]!.onTick);
  }
});

it("keeps hit identity without inventing note-offs and freezes playback snapshots", () => {
  const event: MusicEvent = {
    kind: "hit",
    step: 2,
    sampleKey: "owned-hit",
    velocity: 0.2,
  };
  const mapped = mapPlaybackEvents([event], plan("light-swing"));
  expect(mapped[0]).toMatchObject({
    eventIndex: 0,
    grooveRevision: 7,
    onTick: expect.closeTo(115.2, 12),
    event,
  });
  expect(mapped[0]).not.toHaveProperty("offTick");
  expect(Object.isFrozen(mapped)).toBe(true);
  expect(Object.isFrozen(mapped[0])).toBe(true);
  expect(Object.isFrozen(mapped[0]!.event)).toBe(true);
});

describe("invalid logical timing", () => {
  it.each([
    [note(-1)],
    [note(0.5)],
    [note(16)],
    [note(2), note(1)],
    [note(0, 0)],
    [note(0, -1)],
    [note(15, 2)],
    [{ ...note(0), microOffsetMs: -1 }],
    [{ ...note(0), microOffsetMs: 1 }],
  ] as const)(
    "rejects illegal attacks, durations and offsets without clamping",
    (...events) => {
      expect(() => mapPlaybackEvents(events, plan("light-swing"))).toThrow();
    },
  );
});

it("uses one frozen four-bar variation with bounded fill/break eligibility and deterministic seed policy", () => {
  const director = new MusicDirector("shared-cycle");
  const first = Array.from({ length: 32 }, (_, bar) =>
    createGroovePlan(
      { ...director.planBar(bar), section: "Breakdown", energy: 0.4 },
      "light-swing",
      3,
    ),
  );
  const replay = Array.from({ length: 32 }, (_, bar) =>
    createGroovePlan(
      { ...director.planBar(bar), section: "Breakdown", energy: 0.4 },
      "light-swing",
      3,
    ),
  );
  expect(replay).toEqual(first);
  for (let bar = 0; bar < first.length; bar++) {
    const current = first[bar]!;
    expect(current.patternVariantId).toBe(
      first[bar - (bar % 4)]!.patternVariantId,
    );
    expect(current.cyclePosition).toBe(bar % 4);
    expect(current.pulseAccents).toHaveLength(16);
    expect(Object.isFrozen(current)).toBe(true);
    expect(Object.isFrozen(current.accents)).toBe(true);
    if (current.fill) expect(bar % 8).toBe(7);
    if (current.break) expect(bar % 8).toBe(2);
  }
  expect(first.filter((entry) => entry.fill)).toHaveLength(4);
  expect(first.filter((entry) => entry.break)).toHaveLength(4);
});
