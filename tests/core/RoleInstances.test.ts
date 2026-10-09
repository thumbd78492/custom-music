import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPlugins } from "../../src/app/discoverPlugins";
import type {
  InstrumentVoice,
  PluginDescriptor,
} from "../../src/contracts/instrument";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import { instances } from "../../src/core/CharacterInstances";
import { FakeAudioEngine, fakeVoice } from "../helpers/FakeAudioEngine";

const multiRole = (await discoverPlugins()).filter(
  (d) => (d.manifest.characters?.length ?? 0) > 1,
);
it("requires every discovered stage slot to have separate plugin, character and instance fields", async () => {
  const descriptors = await discoverPlugins();
  for (const descriptor of descriptors) {
    const roles = instances(descriptor.manifest);
    expect(new Set(roles.map((role) => role.identity.instanceId)).size).toBe(
      roles.length,
    );
    for (const role of roles) {
      expect(role.identity.pluginId).toBe(descriptor.manifest.id);
      expect(role.identity.characterId).toBe(role.character.id);
      expect(role.identity.instanceId).not.toBe(role.identity.pluginId);
      expect(role.identity.instanceId).not.toBe(role.identity.characterId);
    }
  }
});
const hosts: EnsembleHost[] = [];
afterEach(() => {
  hosts.splice(0).forEach((host) => host.dispose());
  vi.useRealTimers();
});
function setup(descriptor: PluginDescriptor) {
  const audio = new FakeAudioEngine(),
    host = new EnsembleHost([descriptor], audio);
  hosts.push(host);
  return {
    host,
    audio,
    ids: instances(descriptor.manifest).map((i) => i.identity.instanceId),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe.each(multiRole)(
  "$manifest.id independent role instances",
  (descriptor) => {
    it("owns separate generator histories, seeds, voices and tracks from one plugin", async () => {
      const { plugin } = await descriptor.load();
      const states = new Map<string, number[]>();
      const { host, audio, ids } = setup({
        ...descriptor,
        load: async () => ({
          plugin: {
            ...plugin,
            generateBar(plan, own, ensemble, state, instance) {
              const history = states.get(instance!.instanceId) ?? [];
              history.push((state as { barsPlayed: number }).barsPlayed);
              states.set(instance!.instanceId, history);
              return plugin.generateBar(plan, own, ensemble, state, instance);
            },
          },
        }),
      });
      await Promise.all(ids.map((id) => host.add(id)));
      await host.start();
      expect(audio.tracks).toEqual(new Set(ids));
      expect(audio.voices.get(ids[0]!)).not.toBe(audio.voices.get(ids[1]!));
      expect([...states.values()]).toEqual([
        [0, 1, 2],
        [0, 1, 2],
      ]);
      expect(audio.bars[0]!.tracks[0]!.events).not.toEqual(
        audio.bars[0]!.tracks[1]!.events,
      );
      host.remove(ids[0]!);
      const at = host.getSnapshot().tracks[0]!.pendingAt!;
      audio.bar = at - 1;
      await vi.waitFor(() =>
        expect(audio.bars.some((b) => b.plan.barIndex === at)).toBe(true),
      );
      audio.boundary(at);
      expect(audio.tracks.has(ids[1]!)).toBe(true);
      expect(audio.voices.get(ids[1]!)!.dispose).not.toHaveBeenCalled();
    });

    it("applies one instance's mute, solo, volume and removal at safe boundaries", async () => {
      vi.useFakeTimers();
      const { host, audio, ids } = setup(descriptor);
      await Promise.all(ids.map((id) => host.add(id)));
      await host.start();
      const frozen = structuredClone(audio.bars);
      const apply = async (command: () => void) => {
        command();
        const at = host.getSnapshot().tracks[0]!.pendingAt!;
        audio.bar = at - 1;
        await vi.advanceTimersByTimeAsync(100);
        audio.boundary(at);
        return audio.bars.find((b) => b.plan.barIndex === at)!;
      };
      let bar = await apply(() => host.mute(ids[0]!, true));
      expect(bar.tracks.find((t) => t.id === ids[0])).toMatchObject({
        muted: true,
      });
      expect(bar.tracks.find((t) => t.id === ids[1])).toMatchObject({
        muted: false,
      });
      bar = await apply(() => host.solo(ids[0]!, true));
      expect(bar.tracks.find((t) => t.id === ids[1])).toMatchObject({
        solo: false,
      });
      bar = await apply(() => host.setVolume(ids[0]!, 0.4));
      expect(bar.tracks.find((t) => t.id === ids[0])).toMatchObject({
        volume: 0.4,
      });
      expect(bar.tracks.find((t) => t.id === ids[1])).toMatchObject({
        volume: 1,
      });
      expect(audio.bars.slice(0, frozen.length)).toEqual(frozen);
      await apply(() => host.remove(ids[0]!));
      expect(audio.tracks).toEqual(new Set([ids[1]]));
      expect(
        host.operations
          .filter((o) => o.type !== "add")
          .every(
            (o) =>
              o.instanceId === ids[0] && o.pluginId === descriptor.manifest.id,
          ),
      ).toBe(true);
    });

    it("isolates failure, cancellation and late cleanup from the other role and its replacement", async () => {
      const { plugin } = await descriptor.load();
      const obsolete = deferred<InstrumentVoice>();
      const createVoice = vi
        .fn(plugin.createVoice)
        .mockReturnValueOnce(obsolete.promise);
      const { host, audio, ids } = setup({
        ...descriptor,
        load: async () => ({ plugin: { ...plugin, createVoice } }),
      });
      const oldAdd = host.add(ids[0]!);
      await Promise.resolve();
      await host.add(ids[1]!);
      const partner = audio.voices.get(ids[1]!);
      host.remove(ids[0]!);
      await host.add(ids[0]!);
      const replacement = audio.voices.get(ids[0]!);
      const oldVoice = fakeVoice();
      obsolete.resolve(oldVoice);
      await oldAdd;
      expect(oldVoice.dispose).toHaveBeenCalledTimes(1);
      expect(audio.voices.get(ids[0]!)).toBe(replacement);
      expect(audio.voices.get(ids[1]!)).toBe(partner);
      expect(partner!.dispose).not.toHaveBeenCalled();
      host.remove(ids[0]!);
      createVoice.mockRejectedValueOnce(new Error("one role sample failure"));
      await host.add(ids[0]!);
      expect(host.getSnapshot().tracks[0]!.error).toContain(
        "one role sample failure",
      );
      expect(audio.voices.get(ids[1]!)).toBe(partner);
      await host.add(ids[0]!);
      await host.start();
      const before = structuredClone(audio.bars);
      host.stop();
      expect(audio.tracks.size).toBe(0);
      await host.start();
      expect(audio.bars.slice(before.length)).toEqual(before);
    });

    it("replays the same configuration regardless of asynchronous completion order", async () => {
      const capture = async (reverse: boolean) => {
        const { plugin } = await descriptor.load();
        const gates = [
          deferred<InstrumentVoice>(),
          deferred<InstrumentVoice>(),
        ];
        const voices = [fakeVoice(), fakeVoice()];
        const createVoice = vi
          .fn()
          .mockReturnValueOnce(gates[0]!.promise)
          .mockReturnValueOnce(gates[1]!.promise);
        const { host, audio, ids } = setup({
          ...descriptor,
          load: async () => ({ plugin: { ...plugin, createVoice } }),
        });
        host.setSeed("load-order");
        const adding = ids.map((id) => host.add(id));
        await Promise.resolve();
        for (const i of reverse ? [1, 0] : [0, 1])
          gates[i]!.resolve(voices[i]!);
        await Promise.all(adding);
        await host.start();
        return audio.bars;
      };
      expect(await capture(true)).toEqual(await capture(false));
    });
  },
);
