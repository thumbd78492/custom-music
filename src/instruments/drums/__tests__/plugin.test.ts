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

describe("drums independent plugin", () => {
  it("proposes its real kick grid and shortens fills beneath an active lead", () => {
    const state = plugin.createInitialState();
    const ending = { ...plan, sectionBar: 7, phrasePosition: 3 };
    const own = plugin.proposeBar(ending, state);
    const quiet = plugin.generateBar(ending, own, ensemble, state).events;
    const busy = plugin.generateBar(
      ending,
      own,
      { ...ensemble, leadActivity: 0.95 },
      state,
    ).events;
    const kicks = quiet
      .filter((event) => event.kind === "hit" && event.sampleKey === "kick")
      .map((event) => event.step);
    expect(
      own.pulseAccents!.flatMap((value, step) => (value ? [step] : [])),
    ).toEqual(kicks);
    expect(quiet.filter((event) => event.step >= 13).length).toBeGreaterThan(
      busy.filter((event) => event.step >= 13).length,
    );
    expect(quiet).not.toEqual(busy);
  });
  it("emits playable local kit keys with an independent pulse and backbeat", () => {
    const events = generate().events;
    const stepsFor = (key: string) =>
      events
        .filter((event) => event.kind === "hit" && event.sampleKey === key)
        .map((event) => event.step);
    expect(stepsFor("kick")).toContain(0);
    expect(stepsFor("snare")).toEqual([4, 12]);
    expect(stepsFor("hat")).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    for (const event of events) {
      expect(event.kind).toBe("hit");
      if (event.kind === "hit")
        expect(Object.keys(sampleBank.urls)).toContain(event.sampleKey);
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
            expect(event.midi).toBeGreaterThanOrEqual(0);
            expect(event.midi).toBeLessThanOrEqual(127);
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
    expect(plugin.manifest.id).toBe("drums");
    expect(plugin.manifest.sound.kind).toBe("samples");
    expect(plugin.manifest.sound.label).not.toContain("placeholder");
    expect(Object.keys(sampleBank.urls)).toHaveLength(9);
    const adapter = await plugin.createVoice(audio);
    adapter.play(
      { kind: "hit", step: 0, sampleKey: "kick", velocity: 0.9 },
      1,
      0.2,
    );
    expect(voice.play).toHaveBeenCalledWith(
      { kind: "hit", step: 0, sampleKey: "kick-accent", velocity: 0.9 },
      1,
      0.2,
    );
    for (let hit = 0; hit < 2; hit++)
      adapter.play(
        { kind: "hit", step: 0, sampleKey: "hat", velocity: 0.3 },
        2 + hit,
        0.2,
      );
    expect(voice.play).toHaveBeenNthCalledWith(
      2,
      { kind: "hit", step: 0, sampleKey: "hat", velocity: 0.3 },
      2,
      0.2,
    );
    expect(voice.play).toHaveBeenNthCalledWith(
      3,
      { kind: "hit", step: 0, sampleKey: "hat-alt", velocity: 0.3 },
      3,
      0.2,
    );
    expect(audio.createPercussionVoice).not.toHaveBeenCalled();
    expect(audio.createSampleVoice).toHaveBeenCalledWith(sampleBank);
  });
});
