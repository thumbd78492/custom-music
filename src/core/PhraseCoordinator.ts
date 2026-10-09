import type { CharacterDefinition } from "../contracts/instrument";
import type { BarPlan, PhraseAssignment } from "../contracts/music";
import { deriveSeed, SeededRandom } from "./SeededRandom";

const layouts = [
  {
    id: "two-bar-answer",
    responseBar: 1,
    responseStep: 2,
    endingLead: 8,
    endingAnswer: 8,
  },
  {
    id: "four-bar-answer",
    responseBar: 2,
    responseStep: 4,
    endingLead: 9,
    endingAnswer: 9,
  },
  {
    id: "four-bar-overlap",
    responseBar: 2,
    responseStep: 4,
    endingLead: 10,
    endingAnswer: 8,
  },
] as const;

/** Phrase ownership only: no instrument names, note events or sound dependencies. */
export class PhraseCoordinator {
  private phraseStart = -1;
  private leader?: string;
  private responder?: string;
  private roster = "";
  private layout: (typeof layouts)[number] = layouts[1];
  private readonly lastLed = new Map<string, number>();
  private readonly lastResponded = new Map<string, number>();

  checkpoint() {
    return {
      phraseStart: this.phraseStart,
      leader: this.leader,
      responder: this.responder,
      roster: this.roster,
      layout: this.layout,
      lastLed: [...this.lastLed],
      lastResponded: [...this.lastResponded],
    };
  }

  restore(checkpoint: ReturnType<PhraseCoordinator["checkpoint"]>) {
    this.phraseStart = checkpoint.phraseStart;
    this.leader = checkpoint.leader;
    this.responder = checkpoint.responder;
    this.roster = checkpoint.roster;
    this.layout = checkpoint.layout;
    this.lastLed.clear();
    this.lastResponded.clear();
    for (const [id, bar] of checkpoint.lastLed) this.lastLed.set(id, bar);
    for (const [id, bar] of checkpoint.lastResponded)
      this.lastResponded.set(id, bar);
  }

  assign(
    plan: BarPlan,
    audible: ReadonlyMap<string, CharacterDefinition>,
  ): ReadonlyMap<string, PhraseAssignment> {
    const start = plan.barIndex - plan.phrasePosition;
    const leads = [...audible]
      .filter(([, c]) => c.phrase.tasks.includes("lead"))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const roster = JSON.stringify(leads.map(([id]) => id));
    if (start !== this.phraseStart || roster !== this.roster) {
      const samePhrase = start === this.phraseStart;
      if (!samePhrase) {
        const random = new SeededRandom(
          deriveSeed(plan.rootSeed, start, "phrase", "answer-layout"),
        );
        this.layout = layouts[Math.floor(random.next() * layouts.length)]!;
      }
      const choose = (
        options: typeof leads,
        history: Map<string, number>,
        purpose: string,
      ) => {
        const scored = options.map(([id, character]) => ({
          id,
          last: history.get(id) ?? -1,
          preference:
            new SeededRandom(
              deriveSeed(plan.rootSeed, start, id, purpose),
            ).next() * Math.max(0.01, character.phrase.leadWeight),
        }));
        scored.sort(
          (a, b) =>
            a.last - b.last ||
            b.preference - a.preference ||
            (a.id < b.id ? -1 : 1),
        );
        return scored[0]?.id;
      };
      if (!samePhrase || !leads.some(([id]) => id === this.leader)) {
        this.leader = choose(leads, this.lastLed, "lead-turn");
        if (this.leader) this.lastLed.set(this.leader, plan.barIndex);
      }
      this.responder = choose(
        leads.filter(
          ([id, c]) => id !== this.leader && c.phrase.tasks.includes("respond"),
        ),
        this.lastResponded,
        "response-turn",
      );
      if (this.responder) this.lastResponded.set(this.responder, plan.barIndex);
      this.phraseStart = start;
      this.roster = roster;
    }
    const assignments = new Map<string, PhraseAssignment>();
    for (const [id, character] of audible) {
      let task: PhraseAssignment["task"] = "support";
      let stepRange: readonly [number, number] = [0, 16];
      let densityScale = leads.length > 1 ? 0.6 : 1;
      const ending = plan.phrasePosition === plan.phraseLength - 1;
      if (id === this.leader) {
        task = "lead";
        densityScale = 1;
        if (ending)
          stepRange = [0, this.responder ? this.layout.endingLead : 14];
        else if (this.responder && plan.phrasePosition >= 2) {
          task = "support";
          stepRange = [0, 4];
          densityScale = 0.3;
        } else if (
          this.responder &&
          plan.phrasePosition === 1 &&
          this.layout.responseBar === 1
        ) {
          stepRange = [0, 8];
        }
      } else if (id === this.responder) {
        if (ending) {
          task = "respond";
          stepRange = [this.layout.endingAnswer, 14];
          densityScale = 0.7;
        } else if (plan.phrasePosition >= 2) {
          task = "respond";
          stepRange = [this.layout.responseStep, 16];
          densityScale = 1;
        } else if (plan.phrasePosition === 1) {
          const earlyAnswer = this.layout.responseBar === 1;
          task = earlyAnswer ? "respond" : "support";
          stepRange = [earlyAnswer ? 8 : 10, 16];
          densityScale = earlyAnswer ? 0.7 : 0.25;
        } else {
          task = "rest";
          stepRange = [0, 0];
          densityScale = 0;
        }
      } else if (character.phrase.tasks.includes("lead")) {
        task = "rest";
        stepRange = [0, 0];
        densityScale = 0;
      }
      if (!character.phrase.tasks.includes(task)) {
        task = character.phrase.tasks.includes("support") ? "support" : "rest";
      }
      assignments.set(
        id,
        Object.freeze({
          phraseStartBar: start,
          layoutId: this.layout.id,
          task,
          stepRange: Object.freeze(stepRange),
          densityScale,
          register: character.phrase.register,
        }),
      );
    }
    return assignments;
  }
}
