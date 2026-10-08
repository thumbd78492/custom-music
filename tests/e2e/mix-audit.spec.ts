import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import type { InstrumentPlugin } from "../../src/contracts/instrument";

// A measurement, not a perceptual loudness or music-quality certification.
test("measures actual ensemble samples, stereo RMS and unnormalised peaks", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const directorPath = "/src/core/MusicDirector.ts";
    const plannerPath = "/src/core/BarPlanner.ts";
    const sessionPath = "/src/core/PluginSession.ts";
    const voicePath = "/src/audio/SampleVoice.ts";
    const { MusicDirector } = (await import(
      directorPath
    )) as typeof import("../../src/core/MusicDirector");
    const { BarPlanner } = (await import(
      plannerPath
    )) as typeof import("../../src/core/BarPlanner");
    const { createPluginSession } = (await import(
      sessionPath
    )) as typeof import("../../src/core/PluginSession");
    const { loadSampleVoice } = (await import(
      voicePath
    )) as typeof import("../../src/audio/SampleVoice");
    const ids = ["bass", "drums", "piano", "violin"];
    const plugins = await Promise.all(
      ids.map(async (id) => {
        const path = `/src/instruments/${id}/index.ts`;
        return ((await import(path)) as { plugin: InstrumentPlugin }).plugin;
      }),
    );
    const result = [];
    for (const seed of ["alpha", "beta", "音樂", "0"]) {
      const planner = new BarPlanner(new MusicDirector(seed));
      const tracks = plugins.map((plugin) => ({
        id: plugin.manifest.id,
        active: true,
        muted: false,
        solo: false,
        session: createPluginSession(plugin),
      }));
      const bars = Array.from({ length: 32 }, () =>
        planner.prepare(tracks, (_, error) => {
          throw error;
        }),
      );
      let duration = 0.1;
      const starts = bars.map((bar) => {
        const start = duration;
        duration += 240 / bar.plan.bpm;
        return start;
      });
      const rate = 22050;
      const context = new OfflineAudioContext(
        8,
        Math.ceil((duration + 2) * rate),
        rate,
      );
      const merger = context.createChannelMerger(8);
      merger.connect(context.destination);
      const gains: Record<string, number> = {};
      const voices = await Promise.all(
        plugins.map(async (plugin, index) => {
          const stereo = context.createGain();
          stereo.channelCount = 2;
          stereo.channelCountMode = "explicit";
          const split = context.createChannelSplitter(2);
          stereo.connect(split);
          split.connect(merger, 0, index * 2);
          split.connect(merger, 1, index * 2 + 1);
          return plugin.createVoice({
            createSynthVoice() {
              throw new Error("Samples required");
            },
            createPercussionVoice() {
              throw new Error("Samples required");
            },
            createSampleVoice(bank) {
              gains[plugin.manifest.id] = bank.gainDb ?? 0;
              return loadSampleVoice(
                context,
                stereo,
                bank,
                new AbortController().signal,
              );
            },
          });
        }),
      );
      const schedule = (index: number) => {
        const bar = bars[index]!;
        bar.tracks.forEach((track) => {
          const voice = voices[ids.indexOf(track.id)]!;
          for (const event of track.events)
            voice.play(
              event,
              starts[index]! + (event.step * 15) / bar.plan.bpm,
              15 / bar.plan.bpm,
            );
        });
      };
      schedule(0);
      // Refill against real offline audio time: do not queue a whole song into
      // a finite-polyphony voice while context.currentTime is still zero.
      const suspended = starts
        .slice(1)
        .map((time) => context.suspend(time - 0.06));
      const rendered = context.startRendering();
      for (let index = 1; index < bars.length; index++) {
        await suspended[index - 1];
        schedule(index);
        await context.resume();
      }
      const buffer = await rendered;
      const channels = Array.from({ length: 8 }, (_, i) =>
        buffer.getChannelData(i),
      );
      const measure = (indices: number[], factors: number[]) => {
        let sum = 0,
          peak = 0,
          windowSum = 0,
          maxWindow = 0;
        const windowFrames = Math.round(rate * 0.4);
        const frames = Math.floor(duration * rate);
        for (let frame = 0; frame < frames; frame++) {
          for (let side = 0; side < 2; side++) {
            const sample = indices.reduce(
              (total, index, j) =>
                total + channels[index * 2 + side]![frame]! * factors[j]!,
              0,
            );
            peak = Math.max(peak, Math.abs(sample));
            sum += sample * sample;
            windowSum += sample * sample;
          }
          if ((frame + 1) % windowFrames === 0) {
            maxWindow = Math.max(maxWindow, windowSum / (windowFrames * 2));
            windowSum = 0;
          }
        }
        return {
          rmsDbfs: 10 * Math.log10(sum / (frames * 2)),
          peakDbfs: 20 * Math.log10(peak),
          max400msRmsDbfs: 10 * Math.log10(maxWindow),
        };
      };
      const all = ids.map((_, i) => i);
      const oldGains = [-9, -6, -8, -12];
      const oldFactors = ids.map(
        (id, i) => 10 ** ((oldGains[i]! - gains[id]!) / 20),
      );
      result.push({
        seed,
        duration,
        gains,
        tracks: ids.map((id, i) => ({
          id,
          before: measure([i], [oldFactors[i]!]),
          after: measure([i], [1]),
        })),
        mixBefore: measure(
          all,
          oldFactors.map((x) => x * 0.65),
        ),
        mixAfter: measure(
          all,
          all.map(() => 0.65),
        ),
        bars,
      });
      voices.forEach((voice) => voice.dispose());
    }
    return result;
  });
  const evidence = `.verification/mix-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    `${evidence}/metrics-and-events.json`,
    JSON.stringify(results, null, 2),
  );
  await info.attach("mix-metrics", {
    body: JSON.stringify(
      results.map((result) => ({
        seed: result.seed,
        duration: result.duration,
        gains: result.gains,
        tracks: result.tracks,
        mixBefore: result.mixBefore,
        mixAfter: result.mixAfter,
      })),
      null,
      2,
    ),
    contentType: "application/json",
  });
  for (const result of results) {
    expect(result.mixAfter.peakDbfs).toBeLessThan(-1);
    for (const track of result.tracks)
      expect(Number.isFinite(track.after.rmsDbfs)).toBe(true);
  }
  console.log(`Mix evidence: ${evidence}/metrics-and-events.json`);
});
