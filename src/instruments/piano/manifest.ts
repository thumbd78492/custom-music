import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "piano",
  displayName: "Piano",
  version: "0.2.0",
  capabilities: ["harmony", "arpeggio"],
  characters: [
    {
      id: "piano-melody",
      displayName: "旋律鋼琴",
      capabilities: ["melody", "motif"],
      phrase: {
        tasks: ["lead", "respond", "support", "rest"],
        leadWeight: 1,
        register: [62, 76],
      },
    },
    {
      id: "piano-accompaniment",
      displayName: "伴奏鋼琴",
      capabilities: ["harmony", "arpeggio"],
      default: true,
      phrase: { tasks: ["support", "rest"], leadWeight: 0, register: [55, 72] },
    },
  ],
  controls: [],
  sound: {
    kind: "samples",
    label: "Kawai 真實鋼琴取樣 · 兩層力度 · CC0",
  },
} as const satisfies InstrumentManifest;
