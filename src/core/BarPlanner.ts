import type { InstrumentSession } from "../contracts/instrument";
import type { InstrumentIntent, MusicEvent } from "../contracts/music";
import type { PreparedBar } from "../audio/AudioEngine";
import { coordinate } from "./EnsembleCoordinator";
import { MusicDirector } from "./MusicDirector";

export interface PlanningTrack {
  readonly id: string;
  readonly active: boolean;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly session: InstrumentSession;
}

export function validateEvents(events: readonly MusicEvent[]): void {
  let lastStep = -1;
  for (const event of events) {
    if (
      !Number.isInteger(event.step) ||
      event.step < 0 ||
      event.step >= 16 ||
      event.step < lastStep
    )
      throw new Error("Invalid or unsorted event step");
    if (
      !Number.isFinite(event.velocity) ||
      event.velocity < 0 ||
      event.velocity > 1
    )
      throw new Error("Invalid velocity");
    if (
      event.kind === "note" &&
      (!Number.isFinite(event.durationSteps) ||
        event.durationSteps <= 0 ||
        event.durationSteps > 16 ||
        !Number.isInteger(event.midi) ||
        event.midi < 0 ||
        event.midi > 127)
    )
      throw new Error("Invalid note");
    if (event.kind === "hit" && !event.sampleKey)
      throw new Error("Missing sample key");
    // M0 deliberately accepts no microtiming until the M1 safety policy exists.
    if (event.microOffsetMs !== undefined && event.microOffsetMs !== 0)
      throw new Error("Microtiming is not supported in M0");
    lastStep = event.step;
  }
}

export class BarPlanner {
  nextBarIndex = 0;
  constructor(private readonly director: MusicDirector) {}

  prepare(
    tracks: readonly PlanningTrack[],
    onError: (id: string, error: unknown) => void,
  ): PreparedBar {
    const plan = this.director.planBar(this.nextBarIndex++);
    const ordered = [...tracks].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const proposals = new Map<string, InstrumentIntent>();
    const failed = new Set<string>();
    for (const track of ordered.filter((track) => track.active)) {
      try {
        proposals.set(track.id, track.session.propose(plan));
      } catch (error) {
        failed.add(track.id);
        onError(track.id, error);
      }
    }
    const ensemble = coordinate(proposals);
    return Object.freeze({
      plan,
      tracks: Object.freeze(
        ordered.map((track) => {
          let events: readonly MusicEvent[] = [];
          if (track.active && !failed.has(track.id)) {
            try {
              events = track.session.generate(
                plan,
                proposals.get(track.id)!,
                ensemble,
              );
              validateEvents(events);
            } catch (error) {
              failed.add(track.id);
              events = [];
              onError(track.id, error);
            }
          }
          return Object.freeze({
            id: track.id,
            active: track.active && !failed.has(track.id),
            muted: track.muted,
            solo: track.solo,
            events: Object.freeze(
              events.map((event) => Object.freeze({ ...event })),
            ),
          });
        }),
      ),
    });
  }
}
