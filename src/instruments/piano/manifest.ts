import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "piano",
  displayName: "Piano",
  version: "0.0.1",
  capabilities: ["harmony", "arpeggio"],
  controls: [],
  sound: {
    kind: "synth-placeholder",
    label: "合成鋼琴 placeholder · 非真實取樣",
  },
} as const satisfies InstrumentManifest;
