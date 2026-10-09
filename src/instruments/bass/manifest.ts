import type { InstrumentManifest } from "../../contracts/instrument";
export const manifest = {
  id: "bass",
  displayName: "Electric Bass",
  version: "0.1.0",
  capabilities: ["bass", "pulse"],
  characters: [
    {
      id: "bass",
      displayName: "貝斯",
      capabilities: ["bass", "pulse"],
      default: true,
      phrase: { tasks: ["support", "rest"], leadWeight: 0, register: [36, 55] },
    },
  ],
  controls: [],
  sound: {
    kind: "samples",
    label: "Karoryfer 真實電貝斯 · 手指撥弦 · CC0",
  },
} as const satisfies InstrumentManifest;
