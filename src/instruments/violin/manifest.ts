import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "violin",
  displayName: "Violin",
  version: "0.2.2",
  capabilities: ["melody", "sustain"],
  controls: [],
  sound: {
    kind: "samples",
    label: "VSCO 真實小提琴 · 持續弓奏與換音 · CC0",
  },
} as const satisfies InstrumentManifest;
