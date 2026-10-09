import type {
  BarPlan,
  GrooveId,
  GroovePlan,
  MusicEvent,
  PreparedPlaybackEvent,
} from "../contracts/music";
import { deriveSeed } from "./SeededRandom";

/** Installed Tone Transport resolution; never changed during a session. */
export const PPQ = 192;
export const TICKS_PER_BAR = PPQ * 4;

const policies = {
  straight: {
    swingRatio: 0.5,
    density: 0.9,
    syncopation: 0.24,
    pulses: [1, 0, 0.2, 0, 0.75, 0, 0.2, 0, 0.95, 0, 0.2, 0, 0.7, 0, 0.35, 0],
    accents: [
      1, 0.1, 0.4, 0.1, 0.8, 0.1, 0.45, 0.2, 0.95, 0.1, 0.4, 0.1, 0.8, 0.1,
      0.45, 0.2,
    ],
  },
  "light-swing": {
    swingRatio: 0.6,
    density: 0.82,
    syncopation: 0.34,
    pulses: [1, 0, 0.3, 0, 0.65, 0, 0.45, 0, 0.9, 0, 0.3, 0, 0.65, 0, 0.55, 0],
    accents: [
      1, 0.1, 0.55, 0.15, 0.75, 0.1, 0.65, 0.15, 0.9, 0.1, 0.5, 0.15, 0.75, 0.1,
      0.7, 0.2,
    ],
  },
  "half-time": {
    swingRatio: 0.5,
    density: 0.66,
    syncopation: 0.22,
    pulses: [1, 0, 0.1, 0, 0.3, 0, 0.3, 0, 0.9, 0, 0.1, 0, 0.25, 0, 0.4, 0],
    accents: [
      1, 0.05, 0.25, 0.1, 0.35, 0.05, 0.4, 0.1, 0.95, 0.05, 0.25, 0.1, 0.35,
      0.05, 0.45, 0.15,
    ],
  },
} as const;

export function createGroovePlan(
  plan: BarPlan,
  familyId: GrooveId = "straight",
  revision = 0,
): GroovePlan {
  if (!Object.hasOwn(policies, familyId))
    throw new Error("Unknown groove family");
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Invalid groove revision");
  if (!Number.isSafeInteger(plan.barIndex) || plan.barIndex < 0)
    throw new Error("Invalid bar index");
  const policy = policies[familyId];
  const cyclePosition = plan.barIndex % 4;
  const cycleStart = plan.barIndex - cyclePosition;
  const cycleIndex = cycleStart / 4;
  const variant =
    deriveSeed(plan.rootSeed, cycleStart, familyId, "groove-cycle") % 3;
  // A fill never occupies consecutive cycles; breaks also have a full-cycle cooldown.
  const fill =
    cyclePosition === 3 && cycleIndex % 2 === 1 && plan.energy >= 0.35;
  const shortBreak =
    cyclePosition === 2 &&
    cycleIndex % 2 === 0 &&
    plan.section === "Breakdown" &&
    plan.energy < 0.5;
  return Object.freeze({
    familyId,
    revision,
    patternVariantId: `${familyId}:${variant}`,
    cycleBars: 4,
    cyclePosition,
    swingRatio: policy.swingRatio,
    pulseAccents: Object.freeze([...policy.pulses]),
    accents: Object.freeze([...policy.accents]),
    density: policy.density * (0.9 + 0.1 * plan.energy),
    syncopation: policy.syncopation,
    fill,
    break: shortBreak,
  });
}

/** Piecewise monotonic eighth-note swing, including fractional logical note ends. */
export function mapStepToTick(step: number, swingRatio = 0.5): number {
  if (!Number.isFinite(step) || step < 0 || step > 16)
    throw new Error("Logical time is outside the bar");
  if (!Number.isFinite(swingRatio) || swingRatio < 0.5 || swingRatio > 0.66)
    throw new Error("Invalid swing ratio");
  const beat = step / 4;
  const wholeBeat = Math.floor(beat);
  const u = beat - wholeBeat;
  const warped =
    u <= 0.5
      ? 2 * swingRatio * u
      : swingRatio + 2 * (1 - swingRatio) * (u - 0.5);
  // Tone.Ticks(number) and TransportEvent preserve fractional tick remainders.
  // No rounding: shared endpoints and historical fractional durations stay exact.
  return (wholeBeat + warped) * PPQ;
}

export function mapPlaybackEvents(
  events: readonly MusicEvent[],
  plan: BarPlan,
): readonly PreparedPlaybackEvent[] {
  if (!Number.isSafeInteger(plan.barIndex) || plan.barIndex < 0)
    throw new Error("Invalid bar index");
  const ratio = plan.groovePlan?.swingRatio ?? 0.5;
  const revision = plan.groovePlan?.revision ?? 0;
  const startTick = plan.barIndex * TICKS_PER_BAR;
  let lastStep = -1;
  return Object.freeze(
    events.map((event, eventIndex) => {
      if (
        !Number.isInteger(event.step) ||
        event.step < 0 ||
        event.step >= 16 ||
        event.step < lastStep
      )
        throw new Error("Invalid or unsorted logical attack");
      if (event.microOffsetMs !== undefined && event.microOffsetMs !== 0)
        throw new Error("Microtiming is not supported");
      lastStep = event.step;
      const onTick = startTick + mapStepToTick(event.step, ratio);
      const offTick =
        event.kind === "note"
          ? startTick + mapStepToTick(event.step + event.durationSteps, ratio)
          : undefined;
      if (
        event.kind === "note" &&
        (!Number.isFinite(event.durationSteps) ||
          event.durationSteps <= 0 ||
          offTick! <= onTick)
      )
        throw new Error("Invalid playback duration");
      return Object.freeze({
        eventIndex,
        event: Object.isFrozen(event) ? event : Object.freeze({ ...event }),
        onTick,
        ...(offTick === undefined ? {} : { offTick }),
        grooveRevision: revision,
      });
    }),
  );
}

/** Adapt exact mapped musical duration to the existing voice/performance contract. */
export function playbackSecondsPerStep(
  playback: PreparedPlaybackEvent,
  bpm: number,
): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Invalid tempo");
  return playback.event.kind === "note"
    ? (((playback.offTick! - playback.onTick) / PPQ) * 60) /
        bpm /
        playback.event.durationSteps
    : 60 / bpm / 4;
}
