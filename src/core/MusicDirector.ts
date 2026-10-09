import type { BarPlan, VariationMode } from "../contracts/music";
import type { CreativeIntent } from "../contracts/creativity";
import { deriveSeed, SeededRandom } from "./SeededRandom";
import { harmony, keyName, pivot, scale } from "./HarmonyPlan";
import { modeSettings, nextSection } from "./SectionPlan";
import type { SectionPlan } from "./SectionPlan";

export const ENGINE_VERSION = "m3.a1";

/** Shared musical context only: no plugin identities, events, audio or motif state. */
export class MusicDirector {
  private readonly sections: SectionPlan[] = [];
  constructor(
    readonly seed: string,
    readonly mode: VariationMode = "Balanced",
    private readonly creative: CreativeIntent = {},
  ) {}

  private sectionAt(bar: number): SectionPlan {
    while (
      !this.sections.length ||
      this.sections.at(-1)!.start + this.sections.at(-1)!.length <= bar
    )
      this.sections.push(
        nextSection(this.seed, this.mode, this.sections.at(-1), this.creative),
      );
    return this.sections.find(
      (section) => section.start <= bar && bar < section.start + section.length,
    )!;
  }
  private contextAt(bar: number) {
    const section = this.sectionAt(bar);
    const following = this.sectionAt(section.start + section.length);
    const sectionBar = bar - section.start;
    const changed =
      section.key.tonic !== following.key.tonic ||
      section.key.mode !== following.key.mode;
    let chord = harmony(
      section.key,
      section.path[sectionBar % section.path.length]!,
    );
    let modulation: BarPlan["modulation"];
    if (changed && sectionBar === section.length - 2) {
      chord = pivot(section.key, following.key)!;
      modulation = "pivot";
    }
    if (changed && sectionBar === section.length - 1) {
      chord = harmony(following.key, 4);
      modulation = "dominant";
    }
    const previous = this.sections[section.index - 1];
    if (
      sectionBar === 0 &&
      previous &&
      (previous.key.tonic !== section.key.tonic ||
        previous.key.mode !== section.key.mode)
    )
      modulation = "arrival";
    return {
      section,
      sectionBar,
      chord,
      modulation,
      harmonicKey: modulation === "dominant" ? following.key : section.key,
    };
  }
  planBar(barIndex: number): BarPlan {
    if (!Number.isInteger(barIndex) || barIndex < 0)
      throw new Error("Invalid bar index");
    const { section, sectionBar, chord, modulation, harmonicKey } =
      this.contextAt(barIndex);
    const next = this.contextAt(barIndex + 1).chord;
    const phrasePosition = sectionBar % 4;
    const random = new SeededRandom(
      deriveSeed(
        this.seed,
        barIndex - phrasePosition,
        "director",
        "development",
      ),
    );
    const settings = modeSettings[this.mode];
    const development =
      section.name === "Return"
        ? "recall"
        : sectionBar - phrasePosition === 0 && random.next() < settings.renewal
          ? "renew"
          : section.name === "Variation" || random.next() < settings.complexity
            ? "vary"
            : "repeat";
    const pitchClasses = scale(harmonicKey);
    if (harmonicKey.mode === "minor" && chord.harmonyFunction === "V")
      pitchClasses[6] = (harmonicKey.tonic + 11) % 12;
    return Object.freeze({
      barIndex,
      rootSeed: this.seed,
      bpm: section.bpm,
      meter: "4/4",
      key: keyName(section.key),
      tonic: section.key.tonic,
      tonality: section.key.mode,
      ...chord,
      chordPitchClasses: Object.freeze(chord.chordPitchClasses),
      nextChord: next.chord,
      nextChordPitchClasses: Object.freeze(next.chordPitchClasses),
      scalePitchClasses: Object.freeze(pitchClasses),
      modulation,
      section: section.name,
      sectionIndex: section.index,
      sectionBar,
      sectionLength: section.length,
      phrasePosition,
      phraseLength: 4,
      energy: section.energy,
      density: Math.max(
        0.15,
        Math.min(0.9, this.creative.densityTarget ?? section.energy),
      ),
      complexity: this.creative.complexityTarget ?? settings.complexity,
      variationMode: this.mode,
      development,
      groove: Object.freeze(
        Array.from({ length: 16 }, (_, step) =>
          step % 4 === 0 ? 1 : step % 2 === 0 ? 0.42 : 0.12,
        ),
      ),
    });
  }
}
