import type { SampleBank } from "../../../contracts/instrument";

// Close kick/snare microphones and stereo overhead closed hats, recorded kit.
export const sampleBank: SampleBank = {
  kind: "percussion",
  urls: {
    kick: new URL("./kick-soft.flac", import.meta.url).href,
    "kick-accent": new URL("./kick-accent.flac", import.meta.url).href,
    "snare-soft": new URL("./snare-soft.flac", import.meta.url).href,
    snare: new URL("./snare-medium.flac", import.meta.url).href,
    "snare-accent": new URL("./snare-accent.flac", import.meta.url).href,
    hat: new URL("./hat-soft-1.flac", import.meta.url).href,
    "hat-alt": new URL("./hat-soft-2.flac", import.meta.url).href,
    "hat-accent": new URL("./hat-accent-1.flac", import.meta.url).href,
    "hat-accent-alt": new URL("./hat-accent-2.flac", import.meta.url).href,
  },
  attackSeconds: 0.001,
  releaseSeconds: 0.07,
  gainDb: -6,
  maxVoices: 24,
  licenseRecord: "docs/SAMPLE_LICENSES.md#drums",
};
