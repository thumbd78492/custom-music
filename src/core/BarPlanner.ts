import type { InstrumentSession } from "../contracts/instrument";
import type { InstrumentIntent, MusicEvent } from "../contracts/music";
import type { PreparedBar } from "../audio/AudioEngine";
import { coordinate } from "./EnsembleCoordinator";
import { MusicDirector } from "./MusicDirector";
import { PhraseCoordinator } from "./PhraseCoordinator";

export interface PlanningTrack {
  readonly id: string;
  readonly active: boolean;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume?: number;
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
        event.step + event.durationSteps > 16 ||
        !Number.isInteger(event.midi) ||
        event.midi < 0 ||
        event.midi > 127)
    )
      throw new Error("Invalid note");
    if (event.kind === "hit" && !event.sampleKey)
      throw new Error("Missing sample key");
    // Keep attacks on the shared tick grid. Articulation and velocity supply
    // expression; no per-track timer or note duration crosses a tempo boundary.
    if (event.microOffsetMs !== undefined && event.microOffsetMs !== 0)
      throw new Error("Microtiming is not supported");
    lastStep = event.step;
  }
}

export class BarPlanner {
  nextBarIndex = 0;
  private readonly phrases = new PhraseCoordinator();
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
    // Muted/solo-suppressed sessions still advance state, but their inaudible
    // intentions must not reserve register or prevent audible accompaniment.
    const anySolo = ordered.some((track) => track.active && track.solo);
    const audible = new Map(
      ordered
        .filter(
          (track) =>
            track.active &&
            !track.muted &&
            (track.volume ?? 1) > 0 &&
            (!anySolo || track.solo) &&
            proposals.has(track.id),
        )
        .map((track) => [track.id, proposals.get(track.id)!]),
    );
    const characters = new Map(
      ordered
        .filter((track) => audible.has(track.id) && track.session.character)
        .map((track) => [track.id, track.session.character!]),
    );
    const assignments = this.phrases.assign(plan, characters);
    const audibleLeadCount = [...characters.values()].filter((c) =>
      c.phrase.tasks.includes("lead"),
    ).length;
    const occupied = new Map(
      [...audible].map(([id, proposal]) => {
        const assignment = assignments.get(id);
        if (!assignment) return [id, proposal] as const;
        const [start, end] = assignment.stepRange;
        return [
          id,
          {
            ...proposal,
            accents: proposal.accents.map((value, step) =>
              step >= start && step < end ? value * assignment.densityScale : 0,
            ),
            density:
              (proposal.density * assignment.densityScale * (end - start)) / 16,
            leadActivity:
              assignment.task === "lead" || assignment.task === "respond"
                ? proposal.leadActivity
                : 0,
          },
        ] as const;
      }),
    );
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
                Object.freeze({
                  ...coordinate(
                    new Map([...occupied].filter(([id]) => id !== track.id)),
                  ),
                  ...(track.session.character
                    ? {
                        assignment:
                          assignments.get(track.id) ??
                          Object.freeze({
                            phraseStartBar: plan.barIndex - plan.phrasePosition,
                            task: "rest" as const,
                            stepRange: [0, 0] as const,
                            densityScale: 0,
                          }),
                        audibleLeadCount,
                      }
                    : {}),
                }),
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
            volume: track.volume ?? 1,
            ...(assignments.has(track.id)
              ? { assignment: assignments.get(track.id) }
              : {}),
            events: Object.freeze(
              events.map((event) => Object.freeze({ ...event })),
            ),
          });
        }),
      ),
    });
  }
}
