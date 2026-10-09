import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "violin",
  displayName: "Violin",
  version: "0.2.2",
  capabilities: ["melody", "sustain"],
  characters: [
    {
      id: "violin-melody",
      displayName: "旋律小提琴",
      capabilities: ["melody", "sustain"],
      default: true,
      phrase: {
        tasks: ["lead", "respond", "support", "rest"],
        leadWeight: 1,
        register: [69, 84],
      },
    },
  ],
  controls: [],
  sound: {
    kind: "samples",
    label: "VSCO 真實小提琴 · 持續弓奏與換音 · CC0",
  },
} as const satisfies InstrumentManifest;
