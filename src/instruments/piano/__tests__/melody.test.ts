import { expect, it } from "vitest";
import { plugin } from "../index";
import { themeMaterial } from "../melody";
import { MusicDirector } from "../../../core/MusicDirector";
import { createPluginSession } from "../../../core/PluginSession";
import { sampleBank } from "../samples";
import { coordinate } from "../../../core/EnsembleCoordinator";
import type { InstrumentIntent } from "../../../contracts/music";

const identity = {
  pluginId: "piano",
  characterId: "piano-melody",
  instanceId: "piano-melody:1",
};
it("stores a short melody, repeats its rhythm, varies and recalls it with phrase-ending space", () => {
  const plan = {
    ...new MusicDirector("theme").planBar(0),
    density: 0.6,
    development: "repeat" as const,
  };
  const initial = plugin.createInitialState(identity);
  const empty = coordinate(new Map());
  const first = plugin.generateBar(
    plan,
    plugin.proposeBar(plan, initial, identity),
    empty,
    initial,
    identity,
  );
  expect(first.nextState.theme!.bars).toHaveLength(2);
  expect(
    themeMaterial({ ...plan, barIndex: 2 }, first.nextState).notes,
  ).toEqual(themeMaterial(plan, initial).notes);
  expect(
    themeMaterial(
      { ...plan, barIndex: 2, development: "vary" },
      first.nextState,
    ).notes,
  ).not.toEqual(themeMaterial(plan, initial).notes);
  const renewed = plugin.generateBar(
    { ...plan, barIndex: 24, development: "renew" },
    plugin.proposeBar(plan, first.nextState, identity),
    empty,
    first.nextState,
    identity,
  );
  expect(renewed.nextState.theme!.id).not.toBe(first.nextState.theme!.id);
  expect(
    themeMaterial(
      { ...plan, barIndex: 28, development: "recall" },
      renewed.nextState,
    ).theme,
  ).toEqual(first.nextState.theme);
  const cadence = plugin.generateBar(
    { ...plan, barIndex: 3, phrasePosition: 3 },
    plugin.proposeBar(plan, first.nextState, identity),
    empty,
    first.nextState,
    identity,
  );
  expect(
    cadence.events.every(
      (e) => e.kind === "note" && e.step + e.durationSteps <= 14,
    ),
  ).toBe(true);
  expect(initial.barsPlayed).toBe(0);
});

it("uses single-note lines and scale passing tones within the existing recorded mapping and stable loud layer", () => {
  const session = createPluginSession(plugin, identity),
    director = new MusicDirector("melody-range");
  const roots = Object.values(sampleBank.regions!).map(
    (region) => region.midi!,
  );
  let passing = 0,
    notes = 0;
  for (let index = 0; index < 64; index++) {
    const plan = director.planBar(index),
      own = session.propose(plan);
    const events = session.generate(plan, own, coordinate(new Map()));
    expect(new Set(events.map((e) => e.step)).size).toBe(events.length);
    for (const event of events)
      if (event.kind === "note") {
        expect(event.midi).toBeGreaterThanOrEqual(62);
        expect(event.midi).toBeLessThanOrEqual(76);
        expect(
          Math.min(...roots.map((root) => Math.abs(event.midi - root))),
        ).toBeLessThanOrEqual(4);
        expect(event.velocity).toBeGreaterThan(0.6);
        expect(event.velocity).toBeLessThan(0.74);
        if (!plan.chordPitchClasses.includes(event.midi % 12)) passing++;
        notes++;
      }
  }
  expect(passing / notes).toBeGreaterThan(0.1);
});

it("keeps two instances of the same melody character on separate reproducible PRNG identities", () => {
  const a = createPluginSession(plugin, identity),
    b = createPluginSession(plugin, {
      ...identity,
      instanceId: "piano-melody:2",
    });
  const replay = createPluginSession(plugin, identity),
    director = new MusicDirector("two-pianists");
  const differences: boolean[] = [];
  for (let index = 0; index < 8; index++) {
    const plan = director.planBar(index),
      empty = coordinate(new Map());
    const first = a.generate(plan, a.propose(plan), empty);
    differences.push(
      JSON.stringify(first) !==
        JSON.stringify(b.generate(plan, b.propose(plan), empty)),
    );
    expect(replay.generate(plan, replay.propose(plan), empty)).toEqual(first);
  }
  expect(differences.some(Boolean)).toBe(true);
});

it("leaves low roots to a sparse audible partner even when other roles dilute the average occupancy", () => {
  const accompanimentIdentity = {
    pluginId: "piano",
    characterId: "piano-accompaniment",
    instanceId: "piano-accompaniment:1",
  };
  const session = createPluginSession(plugin, accompanimentIdentity);
  const plan = {
    ...new MusicDirector("sparse-foundation").planBar(0),
    chordPitchClasses: [0, 4, 7],
    density: 0.3,
  };
  const proposal = (
    register: InstrumentIntent["register"],
    density: number,
  ): InstrumentIntent => ({
    register,
    density,
    accents: Array(16).fill(0),
    leadActivity: 0,
  });
  const others = new Map([
    ["foundation", proposal("low", 0.09)],
    ["line-one", proposal("mid", 0.3)],
    ["line-two", proposal("high", 0.3)],
    ["pulse", { ...proposal("wide", 0.3), rhythmic: true }],
  ]);
  const ensemble = { ...coordinate(others), audibleLeadCount: 2 };
  expect(ensemble.lowRegisterLoad).toBeGreaterThan(0);
  expect(ensemble.lowRegisterLoad).toBeLessThan(0.04);
  const supported = session.generate(plan, session.propose(plan), ensemble);
  expect(supported.length).toBeGreaterThan(0);
  for (const event of supported)
    if (event.kind === "note") {
      expect(event.midi).toBeGreaterThanOrEqual(60);
      expect(event.midi % 12).not.toBe(0);
    }
  const alone = createPluginSession(plugin, accompanimentIdentity);
  expect(
    alone
      .generate(plan, alone.propose(plan), coordinate(new Map()))
      .some((event) => event.kind === "note" && event.midi % 12 === 0),
  ).toBe(true);
});
