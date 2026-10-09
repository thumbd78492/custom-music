import type { InstrumentSession } from "../contracts/instrument";
import type {
  GrooveId,
  InstrumentIntent,
  MusicEvent,
} from "../contracts/music";
import type { PreparedBar } from "../audio/AudioEngine";
import { coordinate } from "./EnsembleCoordinator";
import { MusicDirector } from "./MusicDirector";
import { PhraseCoordinator } from "./PhraseCoordinator";
import { createGroovePlan, mapPlaybackEvents } from "./GroovePlan";

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
    groove?: { readonly familyId: GrooveId; readonly revision: number },
  ): PreparedBar {
    const base = this.director.planBar(this.nextBarIndex++);
    const groovePlan = createGroovePlan(
      base,
      groove?.familyId,
      groove?.revision,
    );
    const plan = Object.freeze({
      ...base,
      groovePlan,
      groove: groovePlan.accents,
    });
    const ordered = [...tracks].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const proposals = new Map<string, InstrumentIntent>();
    const failed = new Set<string>();
    const checkpoints = new Map<string, unknown>();
    const fail = (track: PlanningTrack, error: unknown) => {
      failed.add(track.id);
      if (checkpoints.has(track.id))
        track.session.restore!(checkpoints.get(track.id));
      onError(track.id, error);
    };
    for (const track of ordered.filter((track) => track.active)) {
      try {
        if (track.session.checkpoint && track.session.restore)
          checkpoints.set(track.id, track.session.checkpoint());
        proposals.set(track.id, track.session.propose(plan));
      } catch (error) {
        fail(track, error);
      }
    }
    // Muted/solo-suppressed sessions still advance state, but their inaudible
    // intentions must not reserve register or prevent audible accompaniment.
    const phraseCheckpoint = this.phrases.checkpoint();
    const context = () => {
      // A failed Solo relinquishes suppression; a healthy muted Solo keeps the
      // player's intentional silence. Those are different states.
      const anySolo = ordered.some(
        (track) => track.active && track.solo && !failed.has(track.id),
      );
      const audible = new Map(
        ordered
          .filter(
            (track) =>
              track.active &&
              !track.muted &&
              (track.volume ?? 1) > 0 &&
              (!anySolo || track.solo) &&
              !failed.has(track.id) &&
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
                step >= start && step < end
                  ? value * assignment.densityScale
                  : 0,
              ),
              density:
                (proposal.density * assignment.densityScale * (end - start)) /
                16,
              leadActivity:
                assignment.task === "lead" || assignment.task === "respond"
                  ? proposal.leadActivity
                  : 0,
            },
          ] as const;
        }),
      );
      return { assignments, occupied, audibleLeadCount };
    };
    let current = context();
    const generated = new Map<string, readonly MusicEvent[]>();
    const generate = (track: PlanningTrack): boolean => {
      try {
        const events = track.session.generate(
          plan,
          proposals.get(track.id)!,
          Object.freeze({
            ...coordinate(
              new Map([...current.occupied].filter(([id]) => id !== track.id)),
            ),
            ...(track.session.character
              ? {
                  assignment:
                    current.assignments.get(track.id) ??
                    Object.freeze({
                      phraseStartBar: plan.barIndex - plan.phrasePosition,
                      task: "rest" as const,
                      stepRange: [0, 0] as const,
                      densityScale: 0,
                    }),
                  audibleLeadCount: current.audibleLeadCount,
                }
              : {}),
          }),
        );
        validateEvents(events);
        generated.set(track.id, events);
        return true;
      } catch (error) {
        generated.delete(track.id);
        fail(track, error);
        // Every newly failed roster releases its occupancy immediately, even
        // after the single regeneration allowance has already been consumed.
        this.phrases.restore(phraseCheckpoint);
        current = context();
        return false;
      }
    };
    // Check roles reserving the current audible task before suppressed roles.
    // Re-sort only unattempted candidates after a roster changes; no role retry
    // is added by ordering. This lets a newly available survivor take its turn.
    const taskPriority = { lead: 0, respond: 1, support: 2, rest: 3 };
    const byPriority = (a: PlanningTrack, b: PlanningTrack) => {
      const rank = (track: PlanningTrack) =>
        taskPriority[
          current.assignments.get(track.id)?.task ??
            (track.session.character ? "rest" : "support")
        ];
      return (
        Number(b.solo) - Number(a.solo) ||
        rank(a) - rank(b) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );
    };
    const remaining = [...ordered];
    let recovered = false;
    while (remaining.length) {
      remaining.sort(byPriority);
      const track = remaining.shift()!;
      if (!track.active || failed.has(track.id)) continue;
      if (generate(track) || recovered) continue;
      recovered = true;
      // At most one recovery pass. Runtime plugin sessions roll back before
      // regeneration, so each healthy state commits once. Legacy sessions with
      // no transaction port retain their generated content instead of advancing twice.
      const recovery = ordered.filter(
        (previous) =>
          generated.has(previous.id) && checkpoints.has(previous.id),
      );
      while (recovery.length) {
        recovery.sort(byPriority);
        const previous = recovery.shift()!;
        previous.session.restore!(checkpoints.get(previous.id));
        generate(previous);
      }
    }
    return Object.freeze({
      plan,
      tracks: Object.freeze(
        ordered.map((track) => {
          const events = Object.freeze(
            (generated.get(track.id) ?? []).map((event) =>
              Object.freeze({ ...event }),
            ),
          );
          return Object.freeze({
            id: track.id,
            active: track.active && !failed.has(track.id),
            muted: track.muted,
            solo: track.solo,
            volume: track.volume ?? 1,
            ...(current.assignments.has(track.id) && !failed.has(track.id)
              ? { assignment: current.assignments.get(track.id) }
              : {}),
            events,
            playbackEvents: mapPlaybackEvents(events, plan),
          });
        }),
      ),
    });
  }
}
