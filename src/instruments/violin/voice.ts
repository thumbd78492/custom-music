import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";

/** Bowed attacks with a sustained recording loop; changes crossfade the preceding bow. */
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  return audio.createSampleVoice(sampleBank);
}
