import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

for (const stepped of [false, true]) {
  test(`shared native fractional groove timing ${stepped ? "stepped" : "fixed"} BPM and render impulse quantization`, async ({
    page,
  }, info) => {
    test.setTimeout(40000);
    await page.goto("/");
    await page.locator("h1").click();
    const result = await page.evaluate(async (stepped) => {
      const path = "/tests/e2e/groove-timing-harness.ts";
      const { measureGrooveTransport, renderGrooveImpulses } = (await import(
        path
      )) as typeof import("./groove-timing-harness");
      return {
        live: await measureGrooveTransport(stepped),
        impulses: await renderGrooveImpulses(stepped),
      };
    }, stepped);
    const origin = result.live.calls[0]!.time;
    let elapsed = origin;
    const errors: number[] = [];
    const durationErrors: number[] = [];
    for (const bar of result.live.bars) {
      const ratio = bar.groovePlan!.swingRatio;
      const warp = (step: number) => {
        const beat = step / 4,
          whole = Math.floor(beat),
          u = beat - whole;
        return (
          whole +
          (u <= 0.5 ? 2 * ratio * u : ratio + 2 * (1 - ratio) * (u - 0.5))
        );
      };
      const attacks = result.live.calls.filter(
        (call) => call.bar === bar.barIndex,
      );
      expect(attacks).toHaveLength(8 * 3);
      for (const call of attacks) {
        errors.push(
          Math.abs(call.time - (elapsed + (warp(call.step) * 60) / bar.bpm)),
        );
        const duration = call.step < 4 ? 1 : 1.8;
        durationErrors.push(
          Math.abs(
            call.duration -
              ((warp(call.step + duration) - warp(call.step)) * 60) / bar.bpm,
          ),
        );
      }
      for (const step of [0, 1, 2, 3, 4, 6, 10, 14]) {
        const simultaneous = attacks
          .filter((call) => call.step === step)
          .map((call) => call.time);
        expect(
          Math.max(...simultaneous) - Math.min(...simultaneous),
        ).toBeLessThan(0.000001);
      }
      elapsed += 240 / bar.bpm;
    }
    errors.sort((a, b) => a - b);
    const metrics = {
      maxCallbackErrorMs: errors.at(-1)! * 1000,
      p95CallbackErrorMs:
        errors[Math.floor((errors.length - 1) * 0.95)]! * 1000,
      maxDurationErrorMs: Math.max(...durationErrors) * 1000,
      tolerance: { callbackMs: 0.2, durationMs: 0.001, impulseSamples: 1 },
    };
    const receipt = info.outputPath("groove-timing-receipt.json");
    writeFileSync(receipt, JSON.stringify({ ...result, metrics }, null, 2));
    await info.attach("groove-timing-receipt", {
      path: receipt,
      contentType: "application/json",
    });
    expect(metrics.maxCallbackErrorMs).toBeLessThan(0.2);
    expect(metrics.maxDurationErrorMs).toBeLessThan(0.001);
    expect(result.live.ppq).toBe(192);
    expect(result.live.swing).toBe(0);
    expect(result.live.releases).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < result.live.positions.length; i++)
      expect(result.live.positions[i]!.tick).toBeGreaterThanOrEqual(
        result.live.positions[i - 1]!.tick,
      );
    expect(result.impulses.maxErrorSamples).toBeLessThanOrEqual(1);
    expect(result.impulses.maxErrorSamples).toBeGreaterThan(0.01);
    expect(result.impulses.p95ErrorSamples).toBeLessThanOrEqual(1);
  });
}

test("preserved real violin samples keep mapped note-offs, legato, matching sources and Stop release", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto("/?instrument=violin");
  const result = await page.evaluate(async () => {
    const path = "/tests/e2e/groove-timing-harness.ts";
    const { renderWarpedViolin, compareWarpedPrefixes } = (await import(
      path
    )) as typeof import("./groove-timing-harness");
    const reference = await renderWarpedViolin();
    const stopped = await renderWarpedViolin(0.52);
    const prefixError = compareWarpedPrefixes(
      reference.waveform,
      stopped.waveform,
      0.52,
    );
    const regular = { ...reference, waveform: undefined };
    const stop = { ...stopped, waveform: undefined };
    return { regular, stop, prefixError };
  });
  const receipt = info.outputPath("warped-violin-receipt.json");
  writeFileSync(
    receipt,
    JSON.stringify({ ...result, humanListening: "Pending" }, null, 2),
  );
  await info.attach("warped-violin-receipt", {
    path: receipt,
    contentType: "application/json",
  });
  expect(result.regular.playback.map((event) => event.offsetSeconds)).toEqual([
    0.03, 1.2, 1.2, 1.2,
  ]);
  expect(result.regular.playback[2]!.continueMatching).toBe(true);
  expect(result.regular.sources).toHaveLength(3);
  const last = result.regular.sources.at(-1)!;
  expect(last.stops[0]).toBeCloseTo(0.1 + ((8 / 4) * 60) / 90 + 0.35, 10);
  for (const entry of [...result.regular.sources, ...result.stop.sources]) {
    expect(entry.rateRamps).toBe(0);
    expect(entry.ended).toBe(true);
    expect(entry.disconnected).toBe(1);
  }
  expect(result.regular.rms).toBeGreaterThan(0.000001);
  expect(result.prefixError).toBeLessThan(0.000001);
  expect(result.stop.silenceAfterStop).toBeLessThan(0.000001);
  expect(result.regular.activeAfterRendering).toBe(0);
  expect(result.regular.activeAfterDispose).toBe(0);
  expect(result.stop.activeAfterRendering).toBe(0);
  expect(result.stop.activeAfterDispose).toBe(0);
});
