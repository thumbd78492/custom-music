import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "piano",
  displayName: "Piano",
  version: "0.1.0",
  capabilities: ["harmony", "arpeggio"],
  controls: [],
  sound: {
    kind: "samples",
    label: "Kawai 真實鋼琴取樣 · 兩層力度 · CC0",
  },
} as const satisfies InstrumentManifest;
