import type { SampleBank } from "../../../contracts/instrument";

// Recorded VSCO 2 CE solo arco vibrato. Loop seam is crossfaded in the owned assets.
export const sampleBank: SampleBank = {
  kind: "pitched",
  urls: {
    "c5-soft": new URL("./c5-soft.wav", import.meta.url).href,
    "c5-loud": new URL("./c5-loud.wav", import.meta.url).href,
    "e5-soft": new URL("./e5-soft.wav", import.meta.url).href,
    "e5-loud": new URL("./e5-loud.wav", import.meta.url).href,
    "g5-soft": new URL("./g5-soft.wav", import.meta.url).href,
    "g5-loud": new URL("./g5-loud.wav", import.meta.url).href,
    "a5-soft": new URL("./a5-soft.wav", import.meta.url).href,
    "a5-loud": new URL("./a5-loud.wav", import.meta.url).href,
    "c6-soft": new URL("./c6-soft.wav", import.meta.url).href,
    "c6-loud": new URL("./c6-loud.wav", import.meta.url).href,
  },
  regions: {
    "c5-soft": { midi: 72, maxVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "c5-loud": { midi: 72, minVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "e5-soft": { midi: 76, maxVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "e5-loud": { midi: 76, minVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "g5-soft": { midi: 79, maxVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "g5-loud": { midi: 79, minVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "a5-soft": { midi: 81, maxVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "a5-loud": { midi: 81, minVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "c6-soft": { midi: 84, maxVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
    "c6-loud": { midi: 84, minVelocity: 0.6, loopStart: 1.2, loopEnd: 3.2 },
  },
  attackSeconds: 0.045,
  releaseSeconds: 0.35,
  gainDb: -5,
  maxVoices: 6,
  monophonic: true,
  transitionSeconds: 0.09,
  licenseRecord: "docs/SAMPLE_LICENSES.md#violin",
};
