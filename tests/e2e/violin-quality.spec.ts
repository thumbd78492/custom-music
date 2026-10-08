import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("real violin samples: legato power, continuous layers, unchanged release prefixes and rapid-source cleanup", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/?instrument=violin");
  const result = await page.evaluate(async () => {
    const path = "/tests/e2e/violin-quality-harness.ts";
    const { renderQuality, rms, prefixError, waveBase64 } = (await import(
      path
    )) as typeof import("./violin-quality-harness");
    const note = { time: 0.1, midi: 76, velocity: 0.6, duration: 0.5 };
    const sequence = [note, { ...note, time: 0.6, midi: 77, duration: 0.6 }];
    const pair = await renderQuality(sequence);
    const legacyPair = await renderQuality(sequence, true);
    const reference = Math.max(
      rms(pair.waveform, 0.45, 0.59),
      rms(pair.waveform, 0.69, 0.84),
    );
    const windows = Array.from({ length: 8 }, (_, i) =>
      rms(pair.waveform, 0.59 + i * 0.01, 0.61 + i * 0.01),
    );
    const transition = {
      maxBoostDb: 20 * Math.log10(Math.max(...windows) / reference),
      minRelativeDb: 20 * Math.log10(Math.min(...windows) / reference),
      sourceOffsets: pair.records.map((record) => record.offset),
      playback: pair.playback,
    };
    const intervalTransitions = [];
    for (const [from, to] of [
      [72, 74],
      [74, 76],
      [76, 77],
      [77, 79],
      [79, 81],
      [81, 83],
      [83, 84],
      [84, 81],
    ]) {
      const rendered = await renderQuality([
        { ...note, midi: from! },
        { ...note, time: 0.6, midi: to!, duration: 0.6 },
      ]);
      const reference = Math.max(
        rms(rendered.waveform, 0.45, 0.59),
        rms(rendered.waveform, 0.69, 0.84),
      );
      const levels = Array.from({ length: 8 }, (_, i) =>
        rms(rendered.waveform, 0.59 + i * 0.01, 0.61 + i * 0.01),
      );
      intervalTransitions.push({
        from,
        to,
        maxBoostDb: 20 * Math.log10(Math.max(...levels) / reference),
        minRelativeDb: 20 * Math.log10(Math.min(...levels) / reference),
      });
    }
    const single = await renderQuality([{ ...note, duration: 1.1 }]);
    const repeated = await renderQuality([
      note,
      { ...note, time: 0.6, duration: 0.6 },
    ]);
    const samePitch = {
      sources: repeated.records.length,
      continuousWaveformMaxError: prefixError(
        single.waveform,
        repeated.waveform,
        1.19,
      ),
      rateRamps: repeated.records.reduce((n, r) => n + r.rateRamps, 0),
    };
    const threshold = [];
    for (const midi of [72, 76, 79, 81, 84]) {
      const soft = await renderQuality([
        { ...note, midi, velocity: 0.5999, duration: 0.8 },
      ]);
      const loud = await renderQuality([
        { ...note, midi, velocity: 0.6001, duration: 0.8 },
      ]);
      const oldSoft = await renderQuality(
        [{ ...note, midi, velocity: 0.5999, duration: 0.8 }],
        true,
      );
      const oldLoud = await renderQuality(
        [{ ...note, midi, velocity: 0.6001, duration: 0.8 }],
        true,
      );
      threshold.push({
        midi,
        afterDifferenceDb:
          20 *
          Math.log10(
            rms(loud.waveform, 0.3, 0.8) / rms(soft.waveform, 0.3, 0.8),
          ),
        beforeDifferenceDb:
          20 *
          Math.log10(
            rms(oldLoud.waveform, 0.3, 0.8) / rms(oldSoft.waveform, 0.3, 0.8),
          ),
        sameKeys:
          JSON.stringify(soft.playback[0]!.layers!.map((l) => l.key)) ===
          JSON.stringify(loud.playback[0]!.layers!.map((l) => l.key)),
      });
    }
    const stops = [];
    for (const stopAt of [0.12, 0.635, 1.35]) {
      const stopped = await renderQuality(sequence, false, stopAt);
      stops.push({
        stopAt,
        prefixMaxError: prefixError(pair.waveform, stopped.waveform, stopAt),
        silenceRms: rms(stopped.waveform, Math.max(stopAt + 0.4, 1.7), 2.5),
        activeAfter: stopped.aliveAfterRendering,
        activeAfterDispose: stopped.aliveAfterDispose,
      });
    }
    // Many short changes need real chronological refills, not an offline source-cap artefact.
    const quick = await renderQuality(
      Array.from({ length: 72 }, (_, i) => ({
        time: 0.1 + i * 0.06,
        midi: [76, 77, 79, 77][i % 4]!,
        duration: 0.06,
        velocity: i % 2 ? 0.61 : 0.59,
      })),
      false,
      undefined,
      true,
    );
    const detached = await renderQuality([
      note,
      { ...note, time: 0.6, midi: 84, articulation: "detached" },
      { ...note, time: 1.6, midi: 83 },
    ]);
    return {
      transition,
      intervalTransitions,
      samePitch,
      threshold,
      stops,
      rapid: {
        events: 72,
        sources: quick.records.length,
        maxAlive: quick.maxAlive,
        activeAfterRendering: quick.aliveAfterRendering,
        activeAfterDispose: quick.aliveAfterDispose,
        ended: quick.records.filter((r) => r.ended).length,
        disconnectOnce: quick.records.every((r) => r.disconnected === 1),
        rateRamps: quick.records.reduce((n, r) => n + r.rateRamps, 0),
      },
      detachedOffsets: detached.records.map((r) => r.offset),
      probeBefore: waveBase64(legacyPair.waveform),
      probeAfter: waveBase64(pair.waveform),
    };
  });
  const directory = ".verification/violin-m2-2026-10-09";
  mkdirSync(`${directory}/wav`, { recursive: true });
  const { probeBefore, probeAfter, ...metrics } = result;
  writeFileSync(
    `${directory}/wav/legato-probe-before.wav`,
    Buffer.from(probeBefore, "base64"),
  );
  writeFileSync(
    `${directory}/wav/legato-probe-after.wav`,
    Buffer.from(probeAfter, "base64"),
  );
  writeFileSync(
    `${directory}/audio-quality.json`,
    JSON.stringify({ ...metrics, humanListening: "Pending" }, null, 2),
  );
  await info.attach("violin-quality", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(result.transition.sourceOffsets).toEqual([0, 0, 1.2, 1.2]);
  expect(result.transition.maxBoostDb).toBeLessThan(2);
  expect(result.transition.minRelativeDb).toBeGreaterThan(-9);
  for (const entry of result.intervalTransitions) {
    expect(entry.maxBoostDb).toBeLessThan(3.1);
    expect(entry.minRelativeDb).toBeGreaterThan(-9);
  }
  expect(result.samePitch.sources).toBe(2);
  expect(result.samePitch.continuousWaveformMaxError).toBeLessThan(0.000001);
  for (const entry of result.threshold) {
    expect(Math.abs(entry.afterDifferenceDb)).toBeLessThan(0.03);
    expect(entry.sameKeys).toBe(true);
  }
  expect(
    Math.max(...result.threshold.map((entry) => entry.beforeDifferenceDb)),
  ).toBeGreaterThan(8);
  for (const stop of result.stops) {
    expect(stop.prefixMaxError).toBeLessThan(0.000001);
    expect(stop.silenceRms).toBeLessThan(0.000001);
    expect(stop.activeAfter).toBe(0);
    expect(stop.activeAfterDispose).toBe(0);
  }
  expect(result.rapid.sources).toBe(144);
  expect(result.rapid.maxAlive).toBeLessThanOrEqual(8);
  expect(result.rapid.activeAfterRendering).toBe(0);
  expect(result.rapid.activeAfterDispose).toBe(0);
  expect(result.rapid.disconnectOnce).toBe(true);
  expect(result.rapid.ended).toBe(144);
  expect(result.rapid.rateRamps).toBe(0);
  expect(result.detachedOffsets.every((offset) => offset === 0)).toBe(true);
});
