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
    waveform: "triangle",
    attack: 0.005,
    decay: 0.3,
    sustain: 0.15,
    release: 0.3,
    volumeDb: -12,
  });
}
