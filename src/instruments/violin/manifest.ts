import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "violin",
  displayName: "Violin",
  version: "0.0.1",
  capabilities: ["melody", "sustain"],
  controls: [],
  sound: {
    kind: "synth-placeholder",
    label: "合成小提琴 placeholder · 非真實取樣",
  },
} as const satisfies InstrumentManifest;
