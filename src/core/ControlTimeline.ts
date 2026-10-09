/** Control decisions are separate from both composition and audio callbacks. */
export type CommandSource = "ui" | "local-policy" | "future-llm";
export type CommandStatus =
  "accepted" | "scheduled" | "completed" | "superseded" | "rejected";

export interface ControlCommand<T extends string = string> {
  readonly commandId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly target: T;
  readonly source: CommandSource;
  readonly revision: number;
  readonly requestedAtTick: number;
  readonly effectiveBar: number;
  readonly effectiveTick: number;
  readonly transitionLengthBars: 0;
  readonly planVersion: string;
  readonly status: CommandStatus;
  readonly reason?: string;
}

/** Immutable receipts, latest-wins only before submission; reusable by future controls. */
export class ControlTimeline {
  private sequence = 0;
  private readonly revisions = new Map<string, number>();
  private records: readonly ControlCommand[] = [];

  constructor(
    private readonly ticksPerBar: number,
    private readonly planVersion: string,
  ) {
    if (!Number.isSafeInteger(ticksPerBar) || ticksPerBar <= 0)
      throw new Error("Invalid timeline resolution");
  }

  get commands(): readonly ControlCommand[] {
    return this.records;
  }

  revision(kind: string): number {
    return this.revisions.get(kind) ?? 0;
  }

  request<T extends string>(input: {
    kind: string;
    target: T;
    source?: CommandSource;
    requestedAtTick: number;
    effectiveBar: number;
    expectedRevision?: number;
    rejection?: string;
  }): ControlCommand<T> {
    const current = this.revision(input.kind);
    const rejection =
      input.rejection ??
      (!Number.isFinite(input.requestedAtTick) ||
      input.requestedAtTick < 0 ||
      !Number.isSafeInteger(input.effectiveBar) ||
      input.effectiveBar < 0
        ? "Invalid control time"
        : undefined) ??
      (!(["ui", "local-policy", "future-llm"] as readonly string[]).includes(
        input.source ?? "ui",
      )
        ? "Unsupported control source"
        : undefined) ??
      (input.source === "future-llm" && input.expectedRevision === undefined
        ? "Asynchronous controls require a revision"
        : undefined) ??
      (input.expectedRevision !== undefined &&
      input.expectedRevision !== current
        ? "Stale control revision"
        : undefined);
    const sequence = ++this.sequence;
    const revision = rejection ? current : current + 1;
    const command: ControlCommand<T> = Object.freeze({
      commandId: `control-${sequence}`,
      sequence,
      kind: input.kind,
      target: input.target,
      source: input.source ?? "ui",
      revision,
      requestedAtTick: input.requestedAtTick,
      effectiveBar: input.effectiveBar,
      effectiveTick: input.effectiveBar * this.ticksPerBar,
      transitionLengthBars: 0,
      planVersion: this.planVersion,
      status: rejection ? "rejected" : "accepted",
      ...(rejection ? { reason: rejection } : {}),
    });
    if (!rejection) {
      this.revisions.set(input.kind, revision);
      this.records = this.records.map((old) =>
        old.kind === input.kind && old.status === "accepted"
          ? Object.freeze({
              ...old,
              status: "superseded",
              reason: command.commandId,
            })
          : old,
      );
    }
    this.records = Object.freeze([...this.records, command]);
    return command;
  }

  /** Called once at the first uncommitted bar, before generation. */
  commit(bar: number): readonly ControlCommand[] {
    const committed: ControlCommand[] = [];
    const records = Object.freeze(
      this.records.map((command) => {
        if (command.status !== "accepted" || command.effectiveBar > bar)
          return command;
        const next = Object.freeze({
          ...command,
          status: "scheduled" as const,
        });
        committed.push(next);
        return next;
      }),
    );
    if (committed.length) this.records = records;
    return Object.freeze(committed);
  }

  boundary(bar: number): void {
    this.records = Object.freeze(
      this.records.map((command) =>
        command.status === "scheduled" && command.effectiveBar <= bar
          ? Object.freeze({ ...command, status: "completed" as const })
          : command,
      ),
    );
  }

  stop(): void {
    this.records = Object.freeze(
      this.records.map((command) =>
        command.status === "accepted" || command.status === "scheduled"
          ? Object.freeze({
              ...command,
              status: "superseded" as const,
              reason: "Session stopped",
            })
          : command,
      ),
    );
  }
}
