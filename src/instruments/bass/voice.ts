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
    attack: 0.01,
    decay: 0.22,
    sustain: 0.35,
    release: 0.12,
    volumeDb: -10,
  });
}
