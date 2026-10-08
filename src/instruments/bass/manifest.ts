import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "bass",
  displayName: "Electric Bass",
  version: "0.1.0",
  capabilities: ["bass", "pulse"],
  controls: [],
  sound: {
    kind: "samples",
    label: "Karoryfer 真實電貝斯 · 手指撥弦 · CC0",
  },
} as const satisfies InstrumentManifest;
