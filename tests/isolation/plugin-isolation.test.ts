import { describe, expect, it } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { MusicDirector } from "../../src/core/MusicDirector";
import { createPluginSession } from "../../src/core/PluginSession";
import { coordinate } from "../../src/core/EnsembleCoordinator";
import { validateEvents } from "../../src/core/BarPlanner";
import { FakeAudioEngine } from "../helpers/FakeAudioEngine";

const descriptors = await discoverPlugins();

describe.each(descriptors)("$manifest.id in isolation", (descriptor) => {
  it("discovers only the selected manifest and loads its plugin on demand", async () => {
    const selected = await discoverPlugins(descriptor.manifest.id);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.manifest).toEqual(descriptor.manifest);
    expect((await selected[0]!.load()).plugin.manifest).toEqual(
      descriptor.manifest,
    );
  });

  it("generates legal, reproducible events with no other plugin present", async () => {
    const { plugin } = await descriptor.load();
    for (const seed of ["alpha", "beta", "音樂", "0"]) {
      const first = createPluginSession(plugin);
      const replay = createPluginSession(plugin);
      const director = new MusicDirector(seed);
      let notes = 0;
      for (let index = 0; index < 12; index++) {
        const plan = director.planBar(index);
        const intent = first.propose(plan);
        const ensemble = coordinate(
          new Map([[descriptor.manifest.id, intent]]),
        );
        const events = first.generate(plan, intent, ensemble);
        notes += events.length;
        expect(() => validateEvents(events)).not.toThrow();
        expect(replay.generate(plan, replay.propose(plan), ensemble)).toEqual(
          events,
        );
      }
      expect(notes).toBeGreaterThan(0);
    }
  });

  it("runs Host + one plugin through generation, voice creation and disposal", async () => {
    const audio = new FakeAudioEngine();
    const host = new EnsembleHost([descriptor], audio);
    try {
      await host.add(descriptor.manifest.id);
      await host.start();
      expect(host.getSnapshot().error).toBeUndefined();
      expect(host.getSnapshot().running).toBe(true);
      expect(audio.tracks).toEqual(new Set([descriptor.manifest.id]));
      expect(audio.start).toHaveBeenCalledWith(host.getSnapshot().music.bpm);
      expect(audio.bars.length).toBeGreaterThanOrEqual(2);
      for (const bar of audio.bars) {
        expect(bar.tracks).toHaveLength(1);
        expect(bar.tracks[0]?.events.length).toBeGreaterThan(0);
        expect(bar.plan).toMatchObject({
          bpm: host.getSnapshot().music.bpm,
          meter: "4/4",
          key: host.getSnapshot().music.key,
        });
      }
      // Exercise the plugin's voice contract with the exact generated events.
      const voice = audio.voices.get(descriptor.manifest.id)!;
      const prepared = audio.bars[0]!;
      for (const event of prepared.tracks[0]!.events)
        voice.play(
          event,
          (event.step * 15) / prepared.plan.bpm,
          15 / prepared.plan.bpm,
        );
      expect(voice.play).toHaveBeenCalledTimes(
        prepared.tracks[0]!.events.length,
      );
      host.stop();
      expect(voice.releaseAll).toHaveBeenCalled();
      expect(voice.dispose).toHaveBeenCalledTimes(1);
      expect(audio.tracks.size).toBe(0);
    } finally {
      host.dispose();
    }
  });
});

it("reports an unknown lab plugin instead of loading a different one", async () => {
  await expect(discoverPlugins("missing-plugin")).rejects.toThrow(
    "missing-plugin",
  );
});
