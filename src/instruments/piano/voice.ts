import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";

/** Polyphonic damped piano; note duration holds the string, then its release tail fades. */
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  return audio.createSampleVoice(sampleBank);
}
