import type { InstrumentPlugin } from "../../contracts/instrument";
import { generateBar, proposeBar } from "./generator";
import type { DrumsState } from "./generator";
import { manifest } from "./manifest";

export const plugin: InstrumentPlugin<DrumsState> = {
  manifest,
  createInitialState: () => ({ barsPlayed: 0 }),
  proposeBar,
  generateBar,
  createVoice: async (audio) => (await import("./voice")).createVoice(audio),
};
