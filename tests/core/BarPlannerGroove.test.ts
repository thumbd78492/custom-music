import { describe, expect, it } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import type { GrooveId } from "../../src/contracts/music";
import { BarPlanner, validateEvents } from "../../src/core/BarPlanner";
import { instances } from "../../src/core/CharacterInstances";
import { MusicDirector } from "../../src/core/MusicDirector";
import { createPluginSession } from "../../src/core/PluginSession";
import { mapStepToTick, TICKS_PER_BAR } from "../../src/core/GroovePlan";

const descriptors = await discoverPlugins();
const roles = descriptors.flatMap((descriptor) =>
  instances(descriptor.manifest).map((role) => ({ ...role, descriptor })),
);
const families: readonly GrooveId[] = ["straight", "light-swing", "half-time"];
async function capture(reverse = false) {
  const tracks = (
    await Promise.all(
      descriptors.map(async (descriptor) => {
        const { plugin } = await descriptor.load();
        return instances(descriptor.manifest).map((role) => ({
          id: role.identity.instanceId,
          active: true,
          muted: false,
          solo: false,
          volume: 1,
          session: createPluginSession(plugin, role.identity),
          canLead: role.character.phrase.tasks.includes("lead"),
        }));
      }),
    )
  ).flat();
  if (reverse) tracks.reverse();
  const leads = tracks
    .filter((track) => track.canLead)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const planner = new BarPlanner(new MusicDirector("groove-role-replay"));
  return Array.from({ length: 24 }, (_, index) => {
    if (leads[0] && index === 5) leads[0].muted = true;
    if (leads[0] && index === 7) leads[0].muted = false;
    if (leads[1] && index === 9) leads[1].solo = true;
    if (leads[1] && index === 11) leads[1].solo = false;
    if (leads[0] && index === 15) leads[0].active = false;
    if (leads[0] && index === 17) leads[0].active = true;
    if (leads[1] && index === 19) leads[1].volume = 0;
    if (leads[1] && index === 21) leads[1].volume = 1;
    return planner.prepare(
      tracks,
      (id, error) => {
        throw new Error(`${id}: ${String(error)}`);
      },
      {
        familyId: families[Math.floor(index / 4) % families.length]!,
        revision: Math.floor(index / 4),
      },
    );
  });
}

it("replays logical and playback events under shared Groove and role controls independent of roster order", async () => {
  const forward = await capture();
  expect(await capture(true)).toEqual(forward);
  expect(forward[0]!.tracks).toHaveLength(roles.length);
  for (const bar of forward) {
    expect(Object.isFrozen(bar.plan.groovePlan)).toBe(true);
    for (const track of bar.tracks) {
      const playback = track.playbackEvents!;
      expect(playback).toHaveLength(track.events.length);
      expect(Object.isFrozen(playback)).toBe(true);
      expect(
        playback.every(
          (event) => event.grooveRevision === bar.plan.groovePlan!.revision,
        ),
      ).toBe(true);
    }
  }
});

it("keeps committed plans, logical events and performance ticks frozen after later Groove preparation", async () => {
  const { plugin } = await descriptors[0]!.load();
  const role = instances(plugin.manifest)[0]!;
  const track = {
    id: role.identity.instanceId,
    active: true,
    muted: false,
    solo: false,
    session: createPluginSession(plugin, role.identity),
  };
  const planner = new BarPlanner(new MusicDirector("frozen-groove"));
  const first = planner.prepare([track], () => {}, {
    familyId: "straight",
    revision: 0,
  });
  const receipt = structuredClone(first);
  planner.prepare([track], () => {}, { familyId: "light-swing", revision: 1 });
  planner.prepare([track], () => {}, { familyId: "half-time", revision: 2 });
  expect(first).toEqual(receipt);
  expect(Object.isFrozen(first.tracks[0]!.events)).toBe(true);
  expect(first.tracks[0]!.playbackEvents!.every(Object.isFrozen)).toBe(true);
});

describe.each(families)("%s role subsets", (familyId) => {
  it("generates every nonempty available subset over two cycles with legal notes and one shared timing map", async () => {
    for (let mask = 1; mask < 2 ** roles.length; mask++) {
      const selection = roles.filter((_, bit) => mask & (1 << bit));
      const tracks = await Promise.all(
        selection.map(async (role) => ({
          id: role.identity.instanceId,
          active: true,
          muted: false,
          solo: false,
          session: createPluginSession(
            (await role.descriptor.load()).plugin,
            role.identity,
          ),
        })),
      );
      const planner = new BarPlanner(
        new MusicDirector("groove-subsets", "Balanced", {
          energyTarget: 0.75,
        }),
      );
      const bars = Array.from({ length: 8 }, () =>
        planner.prepare(
          tracks,
          (id, error) => {
            throw new Error(
              `${familyId} subset ${mask} ${id}: ${String(error)}`,
            );
          },
          { familyId, revision: 3 },
        ),
      );
      expect(bars.map((bar) => bar.plan.groovePlan!.cyclePosition)).toEqual([
        0, 1, 2, 3, 0, 1, 2, 3,
      ]);
      expect(bars.some((bar) => bar.plan.groovePlan!.fill)).toBe(true);
      for (const track of tracks)
        expect(
          bars.flatMap(
            (bar) => bar.tracks.find((t) => t.id === track.id)!.events,
          ).length,
          `${familyId} subset ${mask} ${track.id}`,
        ).toBeGreaterThan(0);
      for (const bar of bars) {
        const ratio = bar.plan.groovePlan!.swingRatio;
        const start = bar.plan.barIndex * TICKS_PER_BAR;
        for (const track of bar.tracks) {
          validateEvents(track.events);
          expect(track.playbackEvents).toHaveLength(track.events.length);
          for (const playback of track.playbackEvents!) {
            expect(playback.onTick).toBeCloseTo(
              start + mapStepToTick(playback.event.step, ratio),
              9,
            );
            expect(playback.onTick).toBeGreaterThanOrEqual(start);
            expect(playback.onTick).toBeLessThan(start + TICKS_PER_BAR);
            if (playback.event.kind === "note") {
              expect(playback.offTick).toBeCloseTo(
                start +
                  mapStepToTick(
                    playback.event.step + playback.event.durationSteps,
                    ratio,
                  ),
                9,
              );
              expect(playback.offTick).toBeGreaterThan(playback.onTick);
              expect(playback.offTick).toBeLessThanOrEqual(
                start + TICKS_PER_BAR,
              );
            }
          }
        }
      }
    }
  });
});

describe.each(
  roles.filter((role) => role.character.phrase.tasks.includes("lead")),
)("$character.displayName saved theme", (role) => {
  it("retains the actual theme ID and material while only Groove changes in a repeat development context", async () => {
    class StableContextDirector extends MusicDirector {
      override planBar(barIndex: number) {
        const context = super.planBar(0);
        return Object.freeze({
          ...context,
          barIndex,
          sectionBar: barIndex,
          phrasePosition: barIndex % 4,
          development: "repeat" as const,
        });
      }
    }
    const session = createPluginSession(
      (await role.descriptor.load()).plugin,
      role.identity,
    );
    const track = {
      id: role.identity.instanceId,
      active: true,
      muted: false,
      solo: false,
      session,
    };
    const planner = new BarPlanner(
      new StableContextDirector("theme-groove-persistence"),
    );
    type ThemeSnapshot = {
      barsPlayed: number;
      theme: { id: string; bars: unknown };
      homeTheme: { id: string; bars: unknown };
      themeStartedAt: number;
    };
    const fail = (id: string, error: unknown) => {
      throw new Error(`${id}: ${String(error)}`);
    };
    planner.prepare([track], fail, { familyId: "straight", revision: 0 });
    const original = session.checkpoint!() as ThemeSnapshot;
    expect(original.theme.id).toBeTruthy();
    expect(original.barsPlayed).toBe(1);
    for (let bar = 1; bar < 12; bar++) {
      planner.prepare([track], fail, {
        familyId: families[bar % families.length]!,
        revision: bar,
      });
      const current = session.checkpoint!() as ThemeSnapshot;
      expect(current.theme).toEqual(original.theme);
      expect(current.homeTheme).toEqual(original.homeTheme);
      expect(current.themeStartedAt).toBe(original.themeStartedAt);
      expect(current.barsPlayed).toBe(bar + 1);
    }
  });
});
