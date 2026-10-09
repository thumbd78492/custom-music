import type { SamplePerformance } from "../../contracts/instrument";
import { sampleBank } from "./samples";
import { bowRegions } from "./regions";

/** Private bow and dynamics decisions. No pitch automation, timer, or other track. */
export function createPerformance() {
  let previous: { midi: number; time: number; end: number } | undefined;
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
    const roots = Object.entries(sampleBank.regions!).filter(([key]) =>
      key.endsWith("-soft"),
    );
    roots.sort(
      ([, a], [, b]) =>
        Math.abs(a.midi! - event.midi) - Math.abs(b.midi! - event.midi) ||
        a.midi! - b.midi!,
    );
    const prefix = roots[0]![0].replace(/-soft$/, "");
    const region = bowRegions[prefix]!;
    const sameNote = connected && previous!.midi === event.midi;
    previous = {
      midi: event.midi,
      time,
      end: time + event.durationSteps * secondsPerStep,
    };
    return {
      // One recording; event velocity still carries the original phrase dynamics.
      layers: [
        {
          key: `${prefix}-loud`,
          weight: connected ? 1 : 10 ** (region.bowAttenuationDb / 20),
        },
      ],
      offsetSeconds: connected ? region.legatoOffset : region.bowOffset,
      attackSeconds: connected ? 0.07 : 0.08,
      transitionSeconds: connected ? 0.07 : 0.08,
      equalPowerTransition: connected,
      continueMatching: sameNote,
    };
  };
  return { select, reset };
}
