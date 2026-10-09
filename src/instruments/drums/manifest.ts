import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "drums",
  displayName: "Drums",
  version: "0.1.0",
  capabilities: ["rhythm", "percussion"],
  characters: [
    {
      id: "drums",
      displayName: "鼓",
      capabilities: ["rhythm", "percussion"],
      default: true,
      phrase: { tasks: ["support", "rest"], leadWeight: 0 },
    },
  ],
  controls: [],
  sound: {
    kind: "samples",
    label: "Virtuosity 真實鼓組 · Kick / Snare / Hi-hat · CC0",
  },
} as const satisfies InstrumentManifest;
