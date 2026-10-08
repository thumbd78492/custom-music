import type {
  InstrumentPlugin,
  InstrumentSession,
} from "../contracts/instrument";

function snapshot<T>(state: T): T {
  const encoded = JSON.stringify(state);
  if (encoded === undefined)
    throw new Error("Plugin state must be JSON serializable");
  return JSON.parse(encoded) as T;
}

export function createPluginSession<State>(
  plugin: InstrumentPlugin<State>,
): InstrumentSession {
  let state = snapshot(plugin.createInitialState());
  return {
    propose: (plan) => plugin.proposeBar(plan, snapshot(state)),
    generate: (plan, own, ensemble) => {
      const result = plugin.generateBar(plan, own, ensemble, snapshot(state));
      state = snapshot(result.nextState);
      return result.events;
    },
  };
}
