// Frozen M2 0.2.1 performance for one-factor experiments. Do not update to match a candidate.
import type { SamplePerformance } from "../../src/contracts/instrument";
import { sampleBank as ownedBank } from "../../src/instruments/violin/samples";
import type { SampleBank } from "../../src/contracts/instrument";

export const baselineBank: SampleBank = {
  kind: "pitched",
  urls: ownedBank.urls,
  attackSeconds: 0.045,
  releaseSeconds: 0.35,
  gainDb: -9,
  maxVoices: 8,
  monophonic: true,
  transitionSeconds: 0.09,
  licenseRecord: "docs/SAMPLE_LICENSES.md#violin",
  regions: {
    "c5-soft": {
      midi: 72,
      gainDb: -8.456,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "c5-loud": {
      midi: 72,
      gainDb: -8.884,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "e5-soft": {
      midi: 76,
      gainDb: 3.53,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "e5-loud": {
      midi: 76,
      gainDb: -1.499,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "g5-soft": {
      midi: 79,
      gainDb: 4.315,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "g5-loud": {
      midi: 79,
      gainDb: -0.928,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "a5-soft": {
      midi: 81,
      gainDb: 2.079,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "a5-loud": {
      midi: 81,
      gainDb: -5.489,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "c6-soft": {
      midi: 84,
      gainDb: 0.224,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
    "c6-loud": {
      midi: 84,
      gainDb: -4.856,
      loopStart: 1.2,
      loopEnd: 3.2,
    },
  },
};
const sampleBank = baselineBank;

/** Private bow and dynamics decisions. No pitch automation, timer, or other track. */
export function createBaselinePerformance() {
  let previous:
    | { midi: number; time: number; end: number; layerVelocity: number }
    | undefined;
  const reset = () => {
    previous = undefined;
  };
  const select: SamplePerformance = (event, time, secondsPerStep) => {
    if (event.kind !== "note") throw new Error("Violin expects pitched events");
    const gap = previous ? time - previous.end : Infinity;
    // Explicit bows override proximity. Legacy 'sustain' events can also connect.
    const connected =
      !!previous &&
      time > previous.time &&
      gap >= -0.025 &&
      gap <= 0.075 &&
      Math.abs(event.midi - previous.midi) <= 4 &&
      event.articulation !== "rebow" &&
      event.articulation !== "detached";
    // Keep the recording blend stable within a bow; gradual expression can still move it.
    const layerVelocity = connected
      ? previous!.layerVelocity +
        (event.velocity - previous!.layerVelocity) * 0.12
      : event.velocity;
    const position = Math.max(0, Math.min(1, (layerVelocity - 0.42) / 0.36));
    const blend = position * position * (3 - 2 * position);
    const roots = Object.entries(sampleBank.regions!).filter(([key]) =>
      key.endsWith("-soft"),
    );
    roots.sort(
      ([, a], [, b]) =>
        Math.abs(a.midi! - event.midi) - Math.abs(b.midi! - event.midi) ||
        a.midi! - b.midi!,
    );
    const prefix = roots[0]![0].replace(/-soft$/, "");
    const sameNote = connected && previous!.midi === event.midi;
    previous = {
      midi: event.midi,
      time,
      end: time + event.durationSteps * secondsPerStep,
      layerVelocity,
    };
    return {
      layers: [
        { key: `${prefix}-soft`, weight: Math.sqrt(1 - blend) },
        { key: `${prefix}-loud`, weight: Math.sqrt(blend) },
      ],
      // Start inside the stable bow, including for notes shorter than the original 1.2 s onset.
      offsetSeconds: connected ? 1.2 : 0,
      attackSeconds: connected ? 0.07 : 0.045,
      transitionSeconds: connected ? 0.07 : 0.045,
      equalPowerTransition: connected,
      continueMatching: sameNote,
    };
  };
  return { select, reset };
}
