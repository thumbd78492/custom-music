import { describe, expect, it, vi } from "vitest";
import type {
  AudioServices,
  InstrumentVoice,
} from "../../../contracts/instrument";
import type { BarPlan, EnsembleIntent } from "../../../contracts/music";
import { plugin } from "../index";
import { sampleBank } from "../samples";
import { material } from "../motif";

const plan: BarPlan = {
  barIndex: 0,
  rootSeed: "m0-plugin",
  bpm: 88,
  meter: "4/4",
  key: "C Major",
  chord: "C",
  nextChord: "Am",
  chordPitchClasses: [0, 4, 7],
  section: "Main",
  nextChordPitchClasses: [9, 0, 4],
  scalePitchClasses: [0, 2, 4, 5, 7, 9, 11],
  tonic: 0,
  tonality: "major",
  harmonyFunction: "I",
  sectionIndex: 0,
  sectionBar: 0,
  sectionLength: 8,
  phraseLength: 4,
  density: 0.5,
  complexity: 0.55,
  variationMode: "Balanced",
  development: "repeat",
  phrasePosition: 0,
  energy: 0.5,
  groove: Array.from({ length: 16 }, (_, step) => (step % 4 === 0 ? 1 : 0.25)),
};
const ensemble: EnsembleIntent = {
  accents: Array.from({ length: 16 }, () => 0),
  density: 0,
  lowRegisterLoad: 0,
  midRegisterLoad: 0,
  highRegisterLoad: 0,
  leadActivity: 0,
};

function generate(context: BarPlan = plan) {
  const state = plugin.createInitialState();
  return plugin.generateBar(
    context,
    plugin.proposeBar(context, state),
    ensemble,
    state,
  );
}

describe("violin independent plugin", () => {
  it("retains a 2–4 bar contour, repeats rhythm, varies it, recalls it and creates new themes", () => {
    const initial = plugin.createInitialState();
    const first = plugin.generateBar(
      plan,
      plugin.proposeBar(plan, initial),
      ensemble,
      initial,
    );
    const state = first.nextState;
    expect([2, 4]).toContain(state.theme!.bars.length);
    const repeatedPlan = { ...plan, barIndex: state.theme!.bars.length };
    expect(material(repeatedPlan, state).notes).toEqual(
      material(plan, initial).notes,
    );
    expect(
      material({ ...repeatedPlan, development: "vary" }, state).notes,
    ).not.toEqual(material(repeatedPlan, state).notes);
    const repeated = plugin.generateBar(
      repeatedPlan,
      plugin.proposeBar(repeatedPlan, state),
      ensemble,
      state,
    );
    expect(repeated.events.map((event) => event.step)).toEqual(
      first.events.map((event) => event.step),
    );
    const renewal = { ...plan, barIndex: 32, development: "renew" as const };
    const fresh = plugin.generateBar(
      renewal,
      plugin.proposeBar(renewal, state),
      ensemble,
      state,
    ).nextState;
    expect(fresh.theme!.id).not.toBe(state.theme!.id);
    expect(
      material({ ...plan, barIndex: 40, development: "recall" }, fresh).theme,
    ).toEqual(state.theme);
    const newHarmony = {
      ...repeatedPlan,
      chordPitchClasses: [2, 6, 9, 1],
      tonic: 2,
      scalePitchClasses: [2, 4, 6, 7, 9, 11, 1],
    };
    const adapted = plugin.generateBar(
      newHarmony,
      plugin.proposeBar(newHarmony, state),
      ensemble,
      state,
    );
    expect(adapted.nextState.theme).toEqual(state.theme);
    for (const event of adapted.events)
      if (event.kind === "note" && event.step % 4 === 0)
        expect(newHarmony.chordPitchClasses).toContain(event.midi % 12);
  });

  it("breathes, respects its recorded register and responds to upper-register congestion", () => {
    const state = plugin.createInitialState(),
      own = plugin.proposeBar(plan, state);
    const solo = plugin.generateBar(plan, own, ensemble, state);
    const crowded = plugin.generateBar(
      plan,
      own,
      { ...ensemble, highRegisterLoad: 0.8 },
      state,
    );
    expect(crowded.events.length).toBeLessThan(solo.events.length);
    expect(solo.events.length).toBeGreaterThan(2);
    const resting = {
      ...plan,
      section: "Breakdown" as const,
      phrasePosition: 1,
    };
    expect(plugin.proposeBar(resting, state).leadActivity).toBe(0);
    expect(
      plugin.generateBar(
        resting,
        plugin.proposeBar(resting, state),
        ensemble,
        state,
      ).events,
    ).toEqual([]);
    for (const event of solo.events)
      if (event.kind === "note") {
        expect((event.durationSteps * 15) / plan.bpm).toBeGreaterThan(0.25);
        expect(event.midi).toBeGreaterThanOrEqual(69);
        expect(event.midi).toBeLessThanOrEqual(84);
      }
  });
  it("replays identical events and advances only returned state", () => {
    const state = Object.freeze(plugin.createInitialState());
    const proposal = plugin.proposeBar(plan, state);
    const first = plugin.generateBar(plan, proposal, ensemble, state);
    expect(plugin.generateBar(plan, proposal, ensemble, state)).toEqual(first);
    expect(first.nextState.barsPlayed).toBe(1);
    expect(state.barsPlayed).toBe(0);
    expect(first.events.length).toBeGreaterThan(0);
  });

  it("uses the seed and bar index to vary the generated events", () => {
    expect(generate({ ...plan, rootSeed: "another-seed" }).events).not.toEqual(
      generate().events,
    );
    expect(generate({ ...plan, barIndex: 1 }).events).not.toEqual(
      generate().events,
    );
  });

  it("emits legal, ordered events over every initial harmony and many seeds", () => {
    for (const pitchClasses of [
      [0, 4, 7],
      [9, 0, 4],
      [5, 9, 0],
      [7, 11, 2],
    ]) {
      for (let seed = 0; seed < 12; seed++) {
        const events = generate({
          ...plan,
          rootSeed: String(seed),
          chordPitchClasses: pitchClasses,
        }).events;
        let previousStep = -1;
        for (const event of events) {
          expect(Number.isInteger(event.step)).toBe(true);
          expect(event.step).toBeGreaterThanOrEqual(previousStep);
          expect(event.step).toBeGreaterThanOrEqual(0);
          expect(event.step).toBeLessThan(16);
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
          previousStep = event.step;
          if (event.kind === "note") {
            expect(event.durationSteps).toBeGreaterThan(0);
            expect(event.step + event.durationSteps).toBeLessThanOrEqual(16);
            expect(Number.isInteger(event.midi)).toBe(true);
            expect(event.midi).toBeGreaterThanOrEqual(69);
            expect(event.midi).toBeLessThanOrEqual(84);
            expect(
              event.step % 4 === 0 ? pitchClasses : plan.scalePitchClasses,
            ).toContain(event.midi % 12);
          } else {
            expect(["kick", "snare", "hat"]).toContain(event.sampleKey);
          }
        }
      }
    }
  });

  it("loads only its owned real sample bank through the injected service", async () => {
    const voice: InstrumentVoice = {
      play: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
    const audio: AudioServices = {
      createSynthVoice: vi.fn(() => voice),
      createPercussionVoice: vi.fn(() => voice),
      createSampleVoice: vi.fn(async () => voice),
    };
    expect(plugin.manifest.id).toBe("violin");
    expect(plugin.manifest.sound.kind).toBe("samples");
    expect(plugin.manifest.sound.label).not.toContain("placeholder");
    expect(Object.keys(sampleBank.urls)).toHaveLength(10);
    expect(await plugin.createVoice(audio)).toBe(voice);
    expect(audio.createSynthVoice).not.toHaveBeenCalled();
    expect(audio.createSampleVoice).toHaveBeenCalledWith(sampleBank);
  });
});
