import { afterEach, expect, it, vi } from "vitest";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import type { InstrumentPlugin } from "../../src/contracts/instrument";
import { FakeAudioEngine, fakeVoice } from "../helpers/FakeAudioEngine";
import type { GrooveId } from "../../src/contracts/music";

const hosts: EnsembleHost[] = [];
function setup() {
  const plugin: InstrumentPlugin<number> = {
    manifest: {
      id: "independent",
      displayName: "Test",
      version: "test",
      controls: [],
      capabilities: [],
      sound: { kind: "samples", label: "test" },
    },
    createInitialState: () => 0,
    proposeBar: () => ({ accents: Array<number>(16).fill(0.5), density: 0.5 }),
    generateBar: (_plan, _own, _ensemble, state) => ({
      events: [
        {
          kind: "note",
          step: 2,
          durationSteps: 2,
          midi: 60 + (state % 12),
          velocity: 0.5,
        },
      ],
      nextState: state + 1,
    }),
    createVoice: async () => fakeVoice(),
  };
  const audio = new FakeAudioEngine();
  const host = new EnsembleHost(
    [{ manifest: plugin.manifest, load: async () => ({ plugin }) }],
    audio,
  );
  hosts.push(host);
  return { host, audio };
}
afterEach(() => {
  hosts.splice(0).forEach((host) => host.dispose());
  vi.useRealTimers();
});

it("uses one precise tick sample for a future safe boundary during background lag", async () => {
  vi.useFakeTimers();
  const { host, audio } = setup();
  await host.add("independent");
  await host.start();
  audio.bar = 50;
  const currentTick = vi.fn(() => 51 * 768 + 0.25);
  Object.assign(audio, { currentTick });
  const command = host.requestGroove("half-time");
  expect(currentTick).toHaveBeenCalledTimes(1);
  expect(command.effectiveBar).toBe(52);
  expect(command.effectiveTick).toBeGreaterThan(command.requestedAtTick);
});

it("retains selected preview Groove when changing stopped Seed or variation", () => {
  const { host } = setup();
  host.requestGroove("half-time");
  host.setSeed("alpha");
  host.setVariationMode("Subtle");
  expect(host.getSnapshot().music.groovePlan).toMatchObject({
    familyId: "half-time",
    revision: 1,
  });
  const stale = host.requestGroove("light-swing", {
    source: "future-llm",
    expectedRevision: 0,
  });
  expect(stale.status).toBe("rejected");
  expect(host.getSnapshot().requestedGroove).toBe("half-time");
});

it("accepts live quick switches, freezes submitted bars and preserves session/voices/state", async () => {
  vi.useFakeTimers();
  const { host, audio } = setup();
  await host.add("independent");
  await host.start();
  const committed = JSON.stringify(audio.bars);
  const voice = audio.voices.get("independent:1");
  const targets: GrooveId[] = [
    "light-swing",
    "half-time",
    "straight",
    "straight",
    "light-swing",
  ];
  targets.forEach((target) => host.requestGroove(target));
  expect(
    host
      .getSnapshot()
      .controls.slice(0, -1)
      .every((c) => c.status === "superseded"),
  ).toBe(true);
  expect(host.getSnapshot().controls.at(-1)).toMatchObject({
    effectiveBar: 3,
    effectiveTick: 2304,
    status: "accepted",
  });
  expect(JSON.stringify(audio.bars)).toBe(committed);
  audio.boundary(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(audio.bars.at(-1)?.plan.groovePlan).toMatchObject({
    familyId: "light-swing",
    revision: 5,
  });
  expect(host.getSnapshot().controls.at(-1)?.status).toBe("scheduled");
  const frozen = JSON.stringify(audio.bars[3]);
  host.requestGroove("half-time");
  expect(host.getSnapshot().controls.at(-1)?.effectiveBar).toBe(4);
  audio.boundary(2);
  await vi.advanceTimersByTimeAsync(100);
  audio.boundary(3);
  expect(host.getSnapshot().controls[4]?.status).toBe("completed");
  expect(JSON.stringify(audio.bars[3])).toBe(frozen);
  expect(audio.bars[3]?.tracks[0]?.events[0]).toMatchObject({ midi: 63 });
  expect(audio.voices.get("independent:1")).toBe(voice);
  expect(audio.start).toHaveBeenCalledTimes(1);
  expect(audio.stop).not.toHaveBeenCalled();
  expect(audio.createTrack).toHaveBeenCalledTimes(1);
  expect(host.getSnapshot().seed).toBe("ensemble-001");
});

it("reproduces logical/playback timing and controls from the same operations", async () => {
  vi.useFakeTimers();
  async function run() {
    const { host, audio } = setup();
    await host.add("independent");
    await host.start();
    host.requestGroove("light-swing");
    host.requestGroove("half-time");
    for (let bar = 1; bar <= 7; bar++) {
      audio.boundary(bar);
      if (bar === 3) host.requestGroove("light-swing");
      if (bar === 4) host.mute("independent", true);
      await vi.advanceTimersByTimeAsync(100);
    }
    const result = JSON.stringify({
      bars: audio.bars,
      controls: host.getSnapshot().controls,
      operations: host.operations,
    });
    host.dispose();
    return result;
  }
  expect(await run()).toBe(await run());
});

it("keeps pending groove recovery bounded after background lag and cancels old requests on Stop", async () => {
  vi.useFakeTimers();
  const { host, audio } = setup();
  await host.add("independent");
  await host.start();
  audio.bar = 50;
  const command = host.requestGroove("half-time");
  expect(command.effectiveBar).toBe(51);
  await vi.advanceTimersByTimeAsync(200);
  expect(audio.bars.slice(3).map((bar) => bar.plan.barIndex)).toEqual([51, 52]);
  expect(audio.bars.at(-1)?.plan.groovePlan?.familyId).toBe("half-time");
  audio.boundary(51);
  host.requestGroove("light-swing");
  host.stop();
  expect(host.getSnapshot().controls.at(-1)?.status).toBe("superseded");
  await host.start();
  expect(audio.bars.at(-1)?.plan.groovePlan?.familyId).toBe("light-swing");
  expect(
    host
      .getSnapshot()
      .controls.filter(
        (c) => c.status === "accepted" || c.status === "scheduled",
      ),
  ).toEqual([]);
});
