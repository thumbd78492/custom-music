import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  if (sampleBank) return audio.createSampleVoice(sampleBank);
  return audio.createSynthVoice({
    waveform: "sawtooth",
    attack: 0.15,
    decay: 0.12,
    sustain: 0.7,
    release: 0.22,
    volumeDb: -22,
  });
}
