import { expect, it, vi } from "vitest";
import type {
  AudioServices,
  InstrumentVoice,
} from "../../../contracts/instrument";
import type { MusicEvent } from "../../../contracts/music";
import {
  createGroovePlan,
  mapPlaybackEvents,
  playbackSecondsPerStep,
  PPQ,
} from "../../../core/GroovePlan";
import { MusicDirector } from "../../../core/MusicDirector";
import { createPerformance } from "../performance";
import { createVoice } from "../voice";

const note = (step: number, durationSteps: number, midi = 76): MusicEvent => ({
  kind: "note",
  step,
  durationSteps,
  midi,
  velocity: 0.6,
  articulation: "legato",
});

it("keeps mapped adjacent bows connected and detached/rest boundaries deliberate across groove changes", () => {
  const base = { ...new MusicDirector("violin-warp").planBar(0), bpm: 90 };
  for (const familyId of ["straight", "light-swing", "half-time"] as const) {
    const plan = { ...base, groovePlan: createGroovePlan(base, familyId, 1) };
    const performance = createPerformance();
    const mapped = mapPlaybackEvents(
      [note(0, 2), note(2, 2, 77), note(4, 2, 77), note(8, 2, 76)],
      plan,
    );
    const select = (index: number) => {
      const playback = mapped[index]!;
      return performance.select(
        playback.event,
        1 + ((playback.onTick / PPQ) * 60) / plan.bpm,
        playbackSecondsPerStep(playback, plan.bpm),
      );
    };
    expect(select(0).offsetSeconds).toBeLessThan(0.2);
    expect(select(1).offsetSeconds).toBe(1.2);
    expect(select(2).continueMatching).toBe(true);
    expect(select(3).offsetSeconds).toBeLessThan(0.2);
    performance.reset();
    expect(select(1).offsetSeconds).toBeLessThan(0.2);
  }
});

it("forwards exact mapped duration through the unchanged violin adapter and resets performance on Stop", async () => {
  const selected: number[] = [];
  const inner: InstrumentVoice = {
    play: vi.fn(),
    releaseAll: vi.fn(),
    dispose: vi.fn(),
  };
  const audio: AudioServices = {
    createSynthVoice: vi.fn(),
    createPercussionVoice: vi.fn(),
    createSampleVoice: vi.fn(async (_bank, performance) => ({
      ...inner,
      play(event: MusicEvent, time: number, secondsPerStep: number) {
        selected.push(performance!(event, time, secondsPerStep).offsetSeconds!);
        inner.play(event, time, secondsPerStep);
      },
    })),
  };
  const voice = await createVoice(audio);
  const base = { ...new MusicDirector("violin-stop").planBar(0), bpm: 90 };
  const plan = {
    ...base,
    groovePlan: createGroovePlan(base, "light-swing", 4),
  };
  const mapped = mapPlaybackEvents([note(0, 2), note(2, 2, 77)], plan);
  for (const playback of mapped)
    voice.play(
      playback.event,
      1 + ((playback.onTick / PPQ) * 60) / 90,
      playbackSecondsPerStep(playback, 90),
    );
  expect(selected[1]).toBe(1.2);
  expect(inner.play).toHaveBeenNthCalledWith(
    1,
    mapped[0]!.event,
    1,
    expect.closeTo(0.2),
  );
  voice.releaseAll(1.5);
  voice.play(mapped[1]!.event, 1.5, playbackSecondsPerStep(mapped[1]!, 90));
  expect(selected[2]).toBeLessThan(0.2);
  expect(inner.releaseAll).toHaveBeenCalledWith(1.5);
  voice.dispose();
  expect(inner.dispose).toHaveBeenCalledOnce();
});
