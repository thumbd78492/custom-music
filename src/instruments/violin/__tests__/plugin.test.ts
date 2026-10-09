import { describe, expect, it, vi } from "vitest";
import type {
  AudioServices,
  InstrumentVoice,
} from "../../../contracts/instrument";
import type { BarPlan, EnsembleIntent } from "../../../contracts/music";
import { plugin } from "../index";
import { sampleBank } from "../samples";
import { material, pitch } from "../motif";
import { createPerformance } from "../performance";
import { MusicDirector } from "../../../core/MusicDirector";

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
      if (event.kind === "note")
        expect([
          ...newHarmony.scalePitchClasses,
          ...newHarmony.chordPitchClasses,
        ]).toContain(event.midi % 12);
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
            expect([
              ...new Set([...pitchClasses, ...plan.scalePitchClasses]),
            ]).toContain(event.midi % 12);
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
    const adapter = await plugin.createVoice(audio);
    adapter.releaseAll(2);
    adapter.dispose();
    expect(voice.releaseAll).toHaveBeenCalledWith(2);
    expect(voice.dispose).toHaveBeenCalledOnce();
    expect(audio.createSynthVoice).not.toHaveBeenCalled();
    expect(audio.createSampleVoice).toHaveBeenCalledWith(
      sampleBank,
      expect.any(Function),
    );
  });

  it("connects small intervals, preserves same-pitch sources and bows after rests or jumps", () => {
    const performance = createPerformance();
    const note = {
      kind: "note",
      step: 0,
      midi: 76,
      velocity: 0.59,
      durationSteps: 4,
    } as const;
    expect(performance.select(note, 1, 0.15).offsetSeconds).toBeGreaterThan(0);
    const legato = performance.select(
      { ...note, midi: 77, velocity: 0.61 },
      1.6,
      0.15,
    );
    expect(legato.offsetSeconds).toBe(1.2);
    expect(legato.layers!.map((layer) => layer.key)).toEqual(["e5-loud"]);
    const retained = performance.select({ ...note, midi: 77 }, 2.2, 0.15);
    expect(retained.continueMatching).toBe(true);
    expect(
      performance.select({ ...note, midi: 84 }, 2.8, 0.15).offsetSeconds,
    ).toBeLessThan(0.2);
    expect(
      performance.select({ ...note, midi: 84 }, 4, 0.15).offsetSeconds,
    ).toBeLessThan(0.2);
    expect(
      performance.select(
        { ...note, midi: 83, articulation: "rebow" },
        4.6,
        0.15,
      ).offsetSeconds,
    ).toBeLessThan(0.2);
    performance.reset();
    expect(performance.select(note, 5.2, 0.15).offsetSeconds).toBeLessThan(0.2);
  });

  it("uses one verified recording across velocity changes without a layer threshold", () => {
    const note = { kind: "note", step: 0, midi: 76, durationSteps: 4 } as const;
    const below = createPerformance().select(
      { ...note, velocity: 0.5999 },
      1,
      0.15,
    );
    const above = createPerformance().select(
      { ...note, velocity: 0.6001 },
      1,
      0.15,
    );
    expect(above.layers!.map((layer) => layer.key)).toEqual(
      below.layers!.map((layer) => layer.key),
    );
    expect(above.layers).toHaveLength(1);
    expect(above.layers).toEqual(below.layers);
    for (const velocity of [0.5, 0.56, 0.62, 0.74]) {
      const playback = createPerformance().select(
        { ...note, velocity },
        1,
        0.15,
      );
      expect(playback.layers).toEqual(above.layers);
    }
  });

  it("prefers continuous voice leading when a modulation removes the former pitch from the chord", () => {
    const arrival = {
      ...plan,
      tonic: 2,
      scalePitchClasses: [2, 4, 6, 7, 9, 11, 1],
      chordPitchClasses: [2, 6, 9],
      modulation: "arrival" as const,
    };
    for (const previous of [72, 74, 76, 79, 81, 84])
      expect(
        Math.abs(pitch(arrival, 0, 0, previous) - previous),
      ).toBeLessThanOrEqual(3);
  });

  it("keeps bounded intervals, longer bows, legato and phrase rests over four seeded ten-minute plans", () => {
    for (const seed of ["alpha", "beta", "音樂", "0"]) {
      let state = plugin.createInitialState(),
        previous: number | undefined;
      let repeats = 0;
      let legatos = 0,
        rests = 0,
        totalDuration = 0,
        notes = 0;
      const director = new MusicDirector(seed);
      for (let bar = 0; bar < 280; bar++) {
        const current = director.planBar(bar);
        const generated = plugin.generateBar(
          current,
          plugin.proposeBar(current, state),
          ensemble,
          state,
        );
        state = generated.nextState;
        if (!generated.events.length) rests++;
        for (const event of generated.events)
          if (event.kind === "note") {
            if (previous !== undefined) {
              expect(Math.abs(event.midi - previous)).toBeLessThanOrEqual(4);
              if (event.midi === previous) repeats++;
            }
            previous = event.midi;
            legatos += event.articulation === "legato" ? 1 : 0;
            totalDuration += (event.durationSteps * 15) / current.bpm;
            notes++;
          }
      }
      expect(totalDuration / notes).toBeGreaterThan(0.55);
      expect(legatos).toBeGreaterThan(notes * 0.35);
      expect(repeats / notes).toBeLessThan(0.55);
      expect(rests).toBeGreaterThan(0);
    }
  });
});
