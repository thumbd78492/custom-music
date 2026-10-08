import { describe, expect, it, vi } from "vitest";
import type {
  AudioServices,
  InstrumentVoice,
} from "../../../contracts/instrument";
import type { BarPlan, EnsembleIntent } from "../../../contracts/music";
import { plugin } from "../index";
import { sampleBank } from "../samples";

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

describe("piano independent plugin", () => {
  it("clears the lead register and relinquishes low notes to another low voice", () => {
    const state = plugin.createInitialState();
    const own = plugin.proposeBar(plan, state);
    const solo = plugin.generateBar(plan, own, ensemble, state).events;
    const backing = plugin.generateBar(
      plan,
      own,
      { ...ensemble, leadActivity: 0.9, lowRegisterLoad: 0.6 },
      state,
    ).events;
    expect(backing).not.toEqual(solo);
    expect(new Set(backing.map((event) => event.step)).size).toBeLessThan(
      new Set(solo.map((event) => event.step)).size,
    );
    for (const event of backing)
      if (event.kind === "note") {
        expect(event.midi).toBeGreaterThanOrEqual(60);
        expect(event.midi).toBeLessThanOrEqual(72);
      }
    expect(solo.some((event) => event.kind === "note" && event.midi > 72)).toBe(
      true,
    );
    const polyphony = Math.max(
      ...backing.map(
        (event) => backing.filter((other) => other.step === event.step).length,
      ),
    );
    expect(polyphony).toBeGreaterThan(1);
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
            expect(event.midi).toBeGreaterThanOrEqual(55);
            expect(event.midi).toBeLessThanOrEqual(79);
            expect(pitchClasses).toContain(event.midi % 12);
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
    expect(plugin.manifest.id).toBe("piano");
    expect(plugin.manifest.sound.kind).toBe("samples");
    expect(plugin.manifest.sound.label).not.toContain("placeholder");
    expect(Object.keys(sampleBank.urls)).toHaveLength(14);
    expect(await plugin.createVoice(audio)).toBe(voice);
    expect(audio.createSynthVoice).not.toHaveBeenCalled();
    expect(audio.createSampleVoice).toHaveBeenCalledWith(sampleBank);
  });
});
