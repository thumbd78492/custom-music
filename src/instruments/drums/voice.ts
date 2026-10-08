import type {
  AudioServices,
  InstrumentVoice,
} from "../../contracts/instrument";
import { sampleBank } from "./samples";

/** The kit owns velocity selection and deterministic hat round robins. */
export async function createVoice(
  audio: AudioServices,
): Promise<InstrumentVoice> {
  const samples = await audio.createSampleVoice(sampleBank);
  let hatHit = 0;
  return {
    play(event, time, secondsPerStep) {
      if (event.kind !== "hit") return;
      let key = event.sampleKey;
      if (key === "kick") key = event.velocity < 0.7 ? "kick" : "kick-accent";
      if (key === "snare")
        key =
          event.velocity < 0.45
            ? "snare-soft"
            : event.velocity < 0.75
              ? "snare"
              : "snare-accent";
      if (key === "hat") {
        key = event.velocity < 0.5 ? "hat" : "hat-accent";
        if (hatHit++ % 2) key += "-alt";
      }
      samples.play({ ...event, sampleKey: key }, time, secondsPerStep);
    },
    releaseAll: (time) => samples.releaseAll(time),
    dispose: () => samples.dispose(),
  };
}
