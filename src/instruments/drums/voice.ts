import type {
  AudioServices,
  InstrumentVoice,
  PercussionSound,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";

/** The host interprets generic synth specifications; only this plugin names kit pieces. */
export const kit = {
  kick: {
    kind: "membrane",
    pitch: "C1",
    pitchDecay: 0.05,
    octaves: 5,
    durationSeconds: 0.12,
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 },
    volumeDb: -8,
  },
  snare: {
    kind: "noise",
    noise: "white",
    durationSeconds: 0.09,
    highpassHz: 700,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.03 },
    volumeDb: -17,
  },
  hat: {
    kind: "noise",
    noise: "white",
    durationSeconds: 0.035,
    highpassHz: 7000,
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.015 },
    volumeDb: -21,
  },
} as const satisfies Readonly<Record<string, PercussionSound>>;

export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  if (sampleBank) return audio.createSampleVoice(sampleBank);
  return audio.createPercussionVoice(kit);
}
