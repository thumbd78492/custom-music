import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";

/** Finger-plucked notes damp at note-off, with a short crossfade on a new pluck. */
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  return audio.createSampleVoice(sampleBank);
}
