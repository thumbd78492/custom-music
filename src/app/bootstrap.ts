import { AudioEngine } from "../audio/AudioEngine";
import { EnsembleHost } from "../core/EnsembleHost";
import { discoverPlugins } from "./discoverPlugins";

export async function bootstrap(onlyId?: string) {
  return new EnsembleHost(await discoverPlugins(onlyId), new AudioEngine());
}
