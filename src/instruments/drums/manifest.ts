import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "drums",
  displayName: "Drums",
  version: "0.0.1",
  capabilities: ["rhythm", "percussion"],
  controls: [],
  sound: {
    kind: "synth-placeholder",
    label: "合成鼓組 placeholder · 非真實取樣",
  },
} as const satisfies InstrumentManifest;
