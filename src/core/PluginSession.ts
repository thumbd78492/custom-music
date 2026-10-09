import type {
  InstrumentPlugin,
  InstrumentSession,
  InstrumentInstance,
} from "../contracts/instrument";
import type { BarPlan } from "../contracts/music";
import { characters } from "./CharacterInstances";

function snapshot<T>(state: T): T {
  const encoded = JSON.stringify(state);
  if (encoded === undefined)
    throw new Error("Plugin state must be JSON serializable");
  return JSON.parse(encoded) as T;
}

export function createPluginSession<State>(
  plugin: InstrumentPlugin<State>,
  instance?: InstrumentInstance,
): InstrumentSession {
  if (
    instance &&
    (instance.pluginId !== plugin.manifest.id ||
      !characters(plugin.manifest).some((c) => c.id === instance.characterId))
  )
    throw new Error("Instance does not belong to this plugin/character");
  let state = snapshot(plugin.createInitialState(instance));
  const scope = (plan: BarPlan): BarPlan =>
    instance
      ? Object.freeze({
          ...plan,
          rootSeed: JSON.stringify([
            plan.rootSeed,
            "instance-v1",
            instance.pluginId,
            instance.characterId,
            instance.instanceId,
            plugin.manifest.version,
          ]),
        })
      : plan;
  return {
    instance,
    character: instance
      ? characters(plugin.manifest).find((c) => c.id === instance.characterId)
      : undefined,
    checkpoint: () => snapshot(state),
    restore: (checkpoint) => {
      state = snapshot(checkpoint) as State;
    },
    propose: (plan) =>
      plugin.proposeBar(scope(plan), snapshot(state), instance),
    generate: (plan, own, ensemble) => {
      const result = plugin.generateBar(
        scope(plan),
        own,
        ensemble,
        snapshot(state),
        instance,
      );
      state = snapshot(result.nextState);
      return result.events;
    },
  };
}
