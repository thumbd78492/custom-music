import { expect, it, vi } from "vitest";
import type {
  CharacterDefinition,
  InstrumentPlugin,
} from "../../src/contracts/instrument";
import { BarPlanner } from "../../src/core/BarPlanner";
import { MusicDirector } from "../../src/core/MusicDirector";
import { createPluginSession } from "../../src/core/PluginSession";
import { PhraseCoordinator } from "../../src/core/PhraseCoordinator";

const character: CharacterDefinition = {
  id: "generic-lead",
  displayName: "Generic lead",
  capabilities: [],
  phrase: { tasks: ["lead", "respond", "support", "rest"], leadWeight: 1 },
};

function seedWithHealthyLead(prefix: string) {
  for (let index = 0; index < 32; index++) {
    const seed = `${prefix}-${index}`;
    const assignments = new PhraseCoordinator().assign(
      new MusicDirector(seed).planBar(0),
      new Map([
        ["a-healthy", character],
        ["z-solo", character],
      ]),
    );
    if (assignments.get("a-healthy")?.task === "lead") return seed;
  }
  throw new Error("Could not construct the healthy-first rollback fixture");
}

function setup(
  fault?: "propose" | "generate" | "invalid",
  faultIds: readonly string[] = ["z-solo"],
) {
  const states = new Map<string, number[]>();
  const propose = vi.fn((_plan, _state, instance) => {
    if (faultIds.includes(instance.instanceId) && fault === "propose")
      throw new Error("sole solo propose failure");
    return { accents: Array<number>(16).fill(0.5), density: 0.5 };
  });
  const generate = vi.fn((_plan, _own, ensemble, state, instance) => {
    const id = instance.instanceId as string;
    states.set(id, [...(states.get(id) ?? []), state.barsPlayed]);
    if (faultIds.includes(id) && fault === "generate")
      throw new Error("sole solo generate failure");
    return {
      events:
        ensemble.assignment?.task === "rest" &&
        !(faultIds.includes(id) && fault === "invalid")
          ? []
          : [
              {
                kind: "note" as const,
                step: faultIds.includes(id) && fault === "invalid" ? 16 : 0,
                midi: 60 + state.barsPlayed,
                durationSteps: 2,
                velocity: 0.5,
              },
            ],
      nextState: { barsPlayed: state.barsPlayed + 1 },
    };
  });
  const plugin: InstrumentPlugin<{ barsPlayed: number }> = {
    manifest: {
      id: "independent-test",
      displayName: "Independent test",
      version: "test",
      capabilities: [],
      controls: [],
      characters: [character],
      sound: { kind: "samples", label: "test" },
    },
    createInitialState: () => ({ barsPlayed: 0 }),
    proposeBar: propose,
    generateBar: generate,
    createVoice: async () => ({ play() {}, releaseAll() {}, dispose() {} }),
  };
  const tracks = ["a-healthy", "z-solo"].map((id) => ({
    id,
    active: true,
    muted: false,
    solo: id === "z-solo",
    session: createPluginSession(plugin, {
      pluginId: plugin.manifest.id,
      characterId: character.id,
      instanceId: id,
    }),
  }));
  return { tracks, states, propose, generate, plugin };
}

it.each(["propose", "generate"] as const)(
  "lets the healthy lead take over the sole Solo %s failure in the same bar",
  (fault) => {
    const { tracks, states, propose, generate } = setup(fault);
    const planner = new BarPlanner(new MusicDirector("r4"));
    const onError = vi.fn();
    const bar = planner.prepare(tracks, onError);
    expect(bar.tracks.find((track) => track.id === "z-solo")?.active).toBe(
      false,
    );
    expect(bar.tracks.find((track) => track.id === "a-healthy")).toMatchObject({
      active: true,
      assignment: { task: "lead" },
      events: [
        { kind: "note", step: 0, midi: 60, durationSteps: 2, velocity: 0.5 },
      ],
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(
      propose.mock.calls.filter((call) => call[2].instanceId === "z-solo"),
    ).toHaveLength(1);
    expect(
      generate.mock.calls.filter((call) => call[4].instanceId === "z-solo"),
    ).toHaveLength(fault === "generate" ? 1 : 0);
    tracks[1]!.active = false;
    const next = planner.prepare(tracks, onError);
    expect(next.plan.barIndex).toBe(1);
    expect(next.tracks[0]?.events[0]).toMatchObject({ midi: 61 });
    expect(states.get("a-healthy")?.at(-1)).toBe(1);
  },
);

it("preserves deliberate silence when the healthy sole Solo role is muted", () => {
  const { tracks, states } = setup();
  tracks[1]!.muted = true;
  const onError = vi.fn();
  const bar = new BarPlanner(new MusicDirector("muted-solo")).prepare(
    tracks,
    onError,
  );
  expect(bar.tracks.every((track) => track.active)).toBe(true);
  expect(bar.tracks[0]).toMatchObject({ events: [] });
  expect(onError).not.toHaveBeenCalled();
  expect(states.get("a-healthy")).toEqual([0]);
  expect(states.get("z-solo")).toEqual([0]);
});

it.each(["generate", "invalid"] as const)(
  "rolls back healthy and failed session state during one %s recovery",
  (fault) => {
    const { tracks, states, generate } = setup(fault);
    tracks[0]!.solo = true;
    const planner = new BarPlanner(
      new MusicDirector(seedWithHealthyLead("transaction")),
    );
    const onError = vi.fn();
    const bar = planner.prepare(tracks, onError);
    expect(bar.tracks[0]?.events[0]).toMatchObject({ midi: 60 });
    expect(states.get("a-healthy")).toEqual([0, 0]);
    expect(tracks[0]!.session.checkpoint?.()).toEqual({ barsPlayed: 1 });
    expect(tracks[1]!.session.checkpoint?.()).toEqual({ barsPlayed: 0 });
    expect(
      generate.mock.calls.filter((call) => call[4].instanceId === "z-solo"),
    ).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    tracks[1]!.active = false;
    expect(planner.prepare(tracks, onError).tracks[0]?.events[0]).toMatchObject(
      { midi: 61 },
    );
    expect(states.get("a-healthy")).toEqual([0, 0, 1]);
  },
);

it("bounds recovery when a second role fails during the recovery pass", () => {
  const { tracks, generate } = setup("generate");
  tracks[0]!.solo = true;
  const implementation = generate.getMockImplementation()!;
  let healthyAttempts = 0;
  generate.mockImplementation((...args) => {
    if (args[4].instanceId === "a-healthy" && ++healthyAttempts === 2)
      throw new Error("second role recovery failure");
    return implementation(...args);
  });
  const onError = vi.fn();
  const planner = new BarPlanner(
    new MusicDirector(seedWithHealthyLead("bounded")),
  );
  const bar = planner.prepare(tracks, onError);
  expect(
    bar.tracks.every((track) => !track.active && !track.events.length),
  ).toBe(true);
  expect(onError).toHaveBeenCalledTimes(2);
  expect(healthyAttempts).toBe(2);
  expect(
    generate.mock.calls.filter((call) => call[4].instanceId === "z-solo"),
  ).toHaveLength(1);
  expect(
    tracks.every(
      (track) =>
        JSON.stringify(track.session.checkpoint?.()) === '{"barsPlayed":0}',
    ),
  ).toBe(true);
  expect(planner.nextBarIndex).toBe(1);
});

it("recovers unique Solo failure before advancing a legacy nontransactional healthy role", () => {
  const { tracks, states } = setup("generate");
  for (const track of tracks) {
    const { character, propose, generate } = track.session;
    track.session = { character, propose, generate };
  }
  const bar = new BarPlanner(new MusicDirector("legacy")).prepare(
    tracks,
    () => {},
  );
  expect(bar.tracks[0]?.assignment?.task).toBe("lead");
  expect(bar.tracks[0]?.events).toHaveLength(1);
  expect(states.get("a-healthy")).toEqual([0]);
});

it("releases Solo suppression after two Solo generators fail without retrying either or advancing the survivor twice", () => {
  const { plugin, states, propose, generate } = setup("generate", [
    "a-solo",
    "b-solo",
  ]);
  const tracks = ["a-solo", "b-solo", "c-healthy"].map((id) => ({
    id,
    active: true,
    muted: false,
    solo: id !== "c-healthy",
    session: createPluginSession(plugin, {
      pluginId: plugin.manifest.id,
      characterId: character.id,
      instanceId: id,
    }),
  }));
  const planner = new BarPlanner(new MusicDirector("two-solo-faults"));
  const onError = vi.fn();
  const bar = planner.prepare(tracks, onError);
  expect(
    bar.tracks.filter((track) => track.active).map((track) => track.id),
  ).toEqual(["c-healthy"]);
  expect(bar.tracks[2]).toMatchObject({
    assignment: { task: "lead" },
    events: [{ kind: "note", midi: 60 }],
  });
  expect(onError).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls.map((call) => call[4].instanceId)).toEqual([
    "a-solo",
    "b-solo",
    "c-healthy",
  ]);
  expect(states.get("c-healthy")).toEqual([0]);
  expect(tracks[0]!.session.checkpoint?.()).toEqual({ barsPlayed: 0 });
  expect(tracks[1]!.session.checkpoint?.()).toEqual({ barsPlayed: 0 });
  tracks[0]!.active = tracks[1]!.active = false;
  const next = planner.prepare(tracks, onError);
  expect(next.tracks[2]?.events[0]).toMatchObject({ midi: 61 });
  expect(states.get("c-healthy")).toEqual([0, 1]);
  for (const id of ["a-solo", "b-solo"]) {
    expect(
      propose.mock.calls.filter((call) => call[2].instanceId === id),
    ).toHaveLength(1);
    expect(
      generate.mock.calls.filter((call) => call[4].instanceId === id),
    ).toHaveLength(1);
  }
});

it("checks the current lead first during bounded recovery so a former rest survivor takes over a second fault", () => {
  const ids = ["a", "b", "c"];
  const seed = "recovery-current-task";
  const assignments = new PhraseCoordinator().assign(
    new MusicDirector(seed).planBar(0),
    new Map(ids.map((id) => [id, character])),
  );
  const leader = ids.find((id) => assignments.get(id)?.task === "lead")!;
  const [healthy, firstFault] = ids.filter((id) => id !== leader);
  const { plugin, states, generate } = setup("generate", [firstFault!]);
  const implementation = generate.getMockImplementation()!;
  let leaderAttempts = 0;
  generate.mockImplementation((...args) => {
    if (args[4].instanceId === leader && ++leaderAttempts === 2)
      throw new Error("current lead recovery failure");
    return implementation(...args);
  });
  const tracks = ids.map((id) => ({
    id,
    active: true,
    muted: false,
    solo: false,
    session: createPluginSession(plugin, {
      pluginId: plugin.manifest.id,
      characterId: character.id,
      instanceId: id,
    }),
  }));
  const planner = new BarPlanner(new MusicDirector(seed));
  const onError = vi.fn();
  const bar = planner.prepare(tracks, onError);
  expect(
    bar.tracks.filter((track) => track.active).map((track) => track.id),
  ).toEqual([healthy]);
  expect(bar.tracks.find((track) => track.id === healthy)).toMatchObject({
    assignment: { task: "lead" },
    events: [{ kind: "note", midi: 60 }],
  });
  expect(generate.mock.calls.map((call) => call[4].instanceId)).toEqual([
    leader,
    healthy,
    firstFault,
    leader,
    healthy,
  ]);
  expect(states.get(healthy!)).toEqual([0, 0]);
  expect(onError).toHaveBeenCalledTimes(2);
  expect(
    generate.mock.calls.filter((call) => call[4].instanceId === firstFault),
  ).toHaveLength(1);
  expect(leaderAttempts).toBe(2);
  for (const track of tracks) if (track.id !== healthy) track.active = false;
  expect(
    planner
      .prepare(tracks, onError)
      .tracks.find((track) => track.id === healthy)?.events[0],
  ).toMatchObject({ midi: 61 });
  expect(states.get(healthy!)).toEqual([0, 0, 1]);
});
