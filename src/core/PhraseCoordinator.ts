import type { CharacterDefinition } from "../contracts/instrument";
import type { BarPlan, PhraseAssignment } from "../contracts/music";
import { deriveSeed, SeededRandom } from "./SeededRandom";

/** Phrase ownership only: no instrument names, note events or sound dependencies. */
export class PhraseCoordinator {
  private phraseStart = -1;
  private leader?: string;
  private responder?: string;
  private roster = "";
  private readonly lastLed = new Map<string, number>();
  private readonly lastResponded = new Map<string, number>();

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
        if (ending) stepRange = [0, this.responder ? 9 : 14];
        else if (this.responder && plan.phrasePosition >= 2) {
          task = "support";
          stepRange = [0, 4];
          densityScale = 0.3;
        }
      } else if (id === this.responder) {
        if (ending) {
          task = "respond";
          stepRange = [9, 14];
          densityScale = 0.7;
        } else if (plan.phrasePosition >= 2) {
          task = "respond";
          stepRange = [4, 16];
          densityScale = 1;
        } else if (plan.phrasePosition === 1) {
          task = "support";
          stepRange = [10, 16];
          densityScale = 0.25;
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
