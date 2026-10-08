import type { SampleBank } from "../../../contracts/instrument";

// Karoryfer Darkblack: actual finger-plucked hollowbody electric bass.
export const sampleBank: SampleBank = {
  kind: "pitched",
  urls: {
    "c2-soft": new URL("./c2-soft.wav", import.meta.url).href,
    "c2-loud": new URL("./c2-loud.wav", import.meta.url).href,
    "e2-soft": new URL("./e2-soft.wav", import.meta.url).href,
    "e2-loud": new URL("./e2-loud.wav", import.meta.url).href,
    "g2-soft": new URL("./g2-soft.wav", import.meta.url).href,
    "g2-loud": new URL("./g2-loud.wav", import.meta.url).href,
    "b2-soft": new URL("./b2-soft.wav", import.meta.url).href,
    "b2-loud": new URL("./b2-loud.wav", import.meta.url).href,
  },
  regions: {
    "c2-soft": { midi: 36, maxVelocity: 0.6 },
    "c2-loud": { midi: 36, minVelocity: 0.6 },
    "e2-soft": { midi: 40, maxVelocity: 0.6 },
    "e2-loud": { midi: 40, minVelocity: 0.6 },
    "g2-soft": { midi: 43, maxVelocity: 0.6 },
    "g2-loud": { midi: 43, minVelocity: 0.6 },
    "b2-soft": { midi: 47, maxVelocity: 0.6 },
    "b2-loud": { midi: 47, minVelocity: 0.6 },
  },
  attackSeconds: 0.003,
  releaseSeconds: 0.18,
  gainDb: -12,
  maxVoices: 6,
  monophonic: true,
  transitionSeconds: 0.035,
  licenseRecord: "docs/SAMPLE_LICENSES.md#bass",
};
