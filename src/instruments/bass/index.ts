import type { InstrumentPlugin } from "../../contracts/instrument";
import { generateBar, proposeBar } from "./generator";
import type { BassState } from "./generator";
import { manifest } from "./manifest";

export const plugin: InstrumentPlugin<BassState> = {
  manifest,
  createInitialState: () => ({ barsPlayed: 0 }),
  proposeBar,
  generateBar,
  createVoice: async (audio) => (await import("./voice")).createVoice(audio),
};
