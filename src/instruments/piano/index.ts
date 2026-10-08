import type { InstrumentPlugin } from "../../contracts/instrument";
import { generateBar, proposeBar } from "./generator";
import type { PianoState } from "./generator";
import { manifest } from "./manifest";

export const plugin: InstrumentPlugin<PianoState> = {
  manifest,
  createInitialState: () => ({ barsPlayed: 0 }),
  proposeBar,
  generateBar,
  createVoice: async (audio) => (await import("./voice")).createVoice(audio),
};
