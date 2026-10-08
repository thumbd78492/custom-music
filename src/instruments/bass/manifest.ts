import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "bass",
  displayName: "Electric Bass",
  version: "0.0.1",
  capabilities: ["bass", "pulse"],
  controls: [],
  sound: {
    kind: "synth-placeholder",
    label: "合成電貝斯 placeholder · 非真實取樣",
  },
} as const satisfies InstrumentManifest;
