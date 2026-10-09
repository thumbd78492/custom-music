import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import { instances } from "../../src/core/CharacterInstances";
import { createPluginSession } from "../../src/core/PluginSession";
import { BarPlanner, validateEvents } from "../../src/core/BarPlanner";
import { MusicDirector } from "../../src/core/MusicDirector";
import type { VariationMode } from "../../src/contracts/music";

const descriptors = await discoverPlugins();
const roles = descriptors.flatMap((descriptor) =>
  instances(descriptor.manifest).map((role) => ({ ...role, descriptor })),
);
const leadRoles = roles.filter((role) =>
  role.character.phrase.tasks.includes("lead"),
);

async function capture(
  seed: string,
  mode: VariationMode,
  selection = roles,
  reverse = false,
  controls = false,
  count = 96,
) {
  const ordered = reverse ? [...selection].reverse() : selection;
  const tracks = await Promise.all(
    ordered.map(async (role) => ({
      id: role.identity.instanceId,
      active: true,
      muted: false,
      solo: false,
      volume: 1,
      session: createPluginSession(
        (await role.descriptor.load()).plugin,
        role.identity,
      ),
    })),
  );
  const planner = new BarPlanner(new MusicDirector(seed, mode));
  const bars = Array.from({ length: count }, (_, index) => {
    if (controls) {
      const first = tracks.find(
        (t) => t.id === leadRoles[0]?.identity.instanceId,
      );
      const second = tracks.find(
        (t) => t.id === leadRoles[1]?.identity.instanceId,
      );
      if (first && index === 8) first.muted = true;
      if (first && index === 12) first.muted = false;
      if (second && index === 20) second.solo = true;
      if (second && index === 24) second.solo = false;
      if (second && index === 28) second.active = false;
      if (second && index === 32) second.active = true;
      if (first && index === 40) first.volume = 0;
      if (first && index === 44) first.volume = 1;
    }
    return planner.prepare(tracks, (id, error) => {
      throw new Error(`${id}: ${String(error)}`);
    });
  });
  return {
    bars,
    hash: createHash("sha256").update(JSON.stringify(bars)).digest("hex"),
  };
}

it("replays role seeds, private histories and assignments through mute/solo/remove operations independent of load order", async () => {
  for (const mode of ["Subtle", "Balanced", "Experimental"] as const)
    for (const seed of ["alpha", "beta", "音樂", "0"])
      expect((await capture(seed, mode, roles, false, true)).hash).toBe(
        (await capture(seed, mode, roles, true, true)).hash,
      );
});

it("generates all nonempty role subsets legally without requiring bass, drums or a lead partner", async () => {
  for (let mask = 1; mask < 2 ** roles.length; mask++) {
    const selection = roles.filter((_, bit) => mask & (1 << bit));
    const { bars } = await capture(
      "subset-roles",
      "Balanced",
      selection,
      false,
      false,
      32,
    );
    for (const role of selection) {
      const events = bars.flatMap(
        (bar) =>
          bar.tracks.find((t) => t.id === role.identity.instanceId)!.events,
      );
      expect(events.length, role.identity.instanceId).toBeGreaterThan(0);
      for (const bar of bars)
        for (const track of bar.tracks) validateEvents(track.events);
    }
  }
});

describe.each(leadRoles)("$character.displayName sole lead", (role) => {
  it("takes its own full lead turns and does not wait for an absent responder", async () => {
    const { bars } = await capture(
      "alone",
      "Balanced",
      [role],
      false,
      false,
      32,
    );
    expect(
      bars.every((bar) => bar.tracks[0]!.assignment?.task === "lead"),
    ).toBe(true);
    expect(
      bars
        .filter((bar) => bar.plan.phrasePosition === 0)
        .every((bar) => bar.tracks[0]!.events.length > 0),
    ).toBe(true);
  });
});

describe.each(leadRoles.length > 1 ? [{ selection: leadRoles }] : [])(
  "equal lead ensemble",
  ({ selection }) => {
    it("gives both performers complete opening turns, answers, space and common phrase endings", async () => {
      const { bars } = await capture(
        "equal",
        "Balanced",
        selection,
        false,
        false,
        64,
      );
      const turns = new Map(selection.map((r) => [r.identity.instanceId, 0]));
      for (const bar of bars) {
        const sounding = bar.tracks.filter((t) => t.events.length > 0);
        expect(sounding.length).toBeGreaterThan(0);
        if (bar.plan.phrasePosition === 0) {
          const leader = bar.tracks.find((t) => t.assignment?.task === "lead")!;
          expect(leader.events.length).toBeGreaterThan(1);
          turns.set(leader.id, turns.get(leader.id)! + 1);
          expect(
            bar.tracks.find((t) => t.assignment?.task === "rest")!.events,
          ).toEqual([]);
        }
        if (bar.plan.phrasePosition === 2)
          expect(
            bar.tracks.find((t) => t.assignment?.task === "respond")!.events
              .length,
          ).toBeGreaterThan(1);
        for (const track of bar.tracks) {
          const assignment = track.assignment!;
          for (const event of track.events) {
            expect(event.step).toBeGreaterThanOrEqual(assignment.stepRange[0]);
            expect(event.step).toBeLessThan(assignment.stepRange[1]);
            if (event.kind === "note")
              expect(event.step + event.durationSteps).toBeLessThanOrEqual(
                assignment.stepRange[1],
              );
          }
        }
      }
      for (const count of turns.values()) expect(count).toBeGreaterThan(3);
      expect(
        Math.max(...turns.values()) - Math.min(...turns.values()),
      ).toBeLessThanOrEqual(1);
    });

    it("reallocates an inaudible leader immediately at the new uncommitted boundary", async () => {
      const { bars } = await capture(
        "controls",
        "Balanced",
        selection,
        false,
        true,
        48,
      );
      for (const index of [
        8, 9, 10, 11, 20, 21, 22, 23, 28, 29, 30, 31, 40, 41, 42, 43,
      ]) {
        const bar = bars[index]!;
        const anySolo = bar.tracks.some((t) => t.active && t.solo);
        const audible = bar.tracks.filter(
          (t) => t.active && !t.muted && t.volume! > 0 && (!anySolo || t.solo),
        );
        expect(audible).toHaveLength(1);
        expect(audible[0]!.assignment?.task).toBe("lead");
        expect(audible[0]!.events.length).toBeGreaterThan(0);
        expect(
          bar.tracks.filter((t) => t.assignment?.task === "lead"),
        ).toHaveLength(1);
      }
    });
  },
);
