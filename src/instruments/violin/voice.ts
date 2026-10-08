import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";
import { createPerformance } from "./performance";

/** Sample-based legato approximation with preserved bows and phrase-level dynamics. */
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  const performance = createPerformance();
  const voice = await audio.createSampleVoice(sampleBank, performance.select);
  return {
    play: (event, time, secondsPerStep) =>
      voice.play(event, time, secondsPerStep),
    releaseAll: (time) => {
      performance.reset();
      voice.releaseAll(time);
    },
    dispose: () => {
      performance.reset();
      voice.dispose();
    },
  };
}
