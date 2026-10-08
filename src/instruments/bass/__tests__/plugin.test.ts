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

describe("bass independent plugin", () => {
  it("follows anonymous kick anchors and reduces density under low-register congestion", () => {
    const state = plugin.createInitialState();
    const own = plugin.proposeBar(plan, state);
    const intent = {
      ...ensemble,
      pulseAccents: Array.from({ length: 16 }, (_, i) =>
        [0, 6, 11].includes(i) ? 1 : 0,
      ),
    };
    const following = plugin.generateBar(plan, own, intent, state).events;
    expect(following.map((event) => event.step)).toEqual([0, 6, 11]);
    expect(
      plugin.generateBar(plan, own, { ...intent, lowRegisterLoad: 0.8 }, state)
        .events,
    ).toHaveLength(2);
    expect(following).not.toEqual(
      plugin.generateBar(plan, own, ensemble, state).events,
    );
  });
  it("anchors every harmony with a low root on the downbeat", () => {
    for (const pitchClasses of [
      [0, 4, 7],
      [9, 0, 4],
      [5, 9, 0],
      [7, 11, 2],
    ]) {
      const events = generate({
        ...plan,
        chordPitchClasses: pitchClasses,
      }).events;
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0]).toMatchObject({
        kind: "note",
        midi: 36 + pitchClasses[0]!,
      });
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
            expect(event.midi).toBeGreaterThanOrEqual(36);
            expect(event.midi).toBeLessThanOrEqual(55);
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
    expect(plugin.manifest.id).toBe("bass");
    expect(plugin.manifest.sound.kind).toBe("samples");
    expect(plugin.manifest.sound.label).not.toContain("placeholder");
    expect(Object.keys(sampleBank.urls)).toHaveLength(8);
    expect(await plugin.createVoice(audio)).toBe(voice);
    expect(audio.createSynthVoice).not.toHaveBeenCalled();
    expect(audio.createSampleVoice).toHaveBeenCalledWith(sampleBank);
  });
});
