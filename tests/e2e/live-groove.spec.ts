import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import type { observeLiveGroove } from "./live-groove-harness";

// The browser binding is test-only; production does not expose Host internals.
async function readProbe(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const binding = window as unknown as {
      liveGrooveProbe: {
        sample: () => {
          starts: number;
          stops: number;
          tracks: number;
          voices: { id: string; ownership: number }[];
          sameContext: boolean;
          sameTransport: boolean;
          swing: number;
          tick: number;
          seed?: string;
          controls?: import("../../src/core/ControlTimeline").ControlCommand[];
          currentGroove?: string;
          running?: boolean;
          bars: import("../../src/audio/AudioEngine").PreparedBar[];
          snapshots: unknown[];
          ticks: number[];
          commands: unknown[];
          played: {
            id: string;
            bar: number;
            groove: string;
            time: number;
            duration?: number;
          }[];
        };
      };
    };
    return binding.liveGrooveProbe.sample();
  });
}

test("app accepts continuous Live Groove switches on the same real Transport with immutable committed plans", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "即興樂團", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const path = "/tests/e2e/live-groove-harness.ts";
    const mod = (await import(path)) as {
      observeLiveGroove: typeof observeLiveGroove;
    };
    mod.observeLiveGroove();
  });
  await page.getByLabel("Seed", { exact: true }).fill("alpha");
  for (const id of [
    "piano-melody",
    "piano-accompaniment",
    "violin-melody",
    "bass",
    "drums",
  ])
    await page
      .locator(`[data-character-id="${id}"]`)
      .getByRole("button", { name: "加入", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Groove", { exact: true })).toBeEnabled();
  // Multiple real UI events land before the next refill; each has its own receipt.
  const initial = await readProbe(page);
  const frozen = JSON.stringify(initial.bars);
  for (const target of [
    "light-swing",
    "half-time",
    "straight",
    "straight",
    "light-swing",
  ])
    await page.getByLabel("Groove", { exact: true }).selectOption(target);
  await expect(page.getByTestId("groove-status")).toContainText("等待");
  const quick = await readProbe(page);
  expect(
    quick.controls?.filter((c) => c.status === "superseded").length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(quick.bars.slice(0, initial.bars.length))).toBe(frozen);
  await expect
    .poll(async () => (await readProbe(page)).currentGroove, { timeout: 15000 })
    .toBe("light-swing");
  await page.getByLabel("Groove", { exact: true }).selectOption("half-time");
  await expect
    .poll(async () => (await readProbe(page)).currentGroove, { timeout: 15000 })
    .toBe("half-time");
  await page
    .locator('[data-character-id="piano-accompaniment"]')
    .getByRole("button", { name: "Mute", exact: true })
    .click();
  await page.getByLabel("Groove", { exact: true }).selectOption("straight");
  await expect
    .poll(async () => (await readProbe(page)).currentGroove, { timeout: 15000 })
    .toBe("straight");
  await expect(
    page
      .locator('[data-character-id="piano-accompaniment"]')
      .getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .locator('[data-character-id="piano-accompaniment"]')
    .getByRole("button", { name: "Mute", exact: true })
    .click();
  await page
    .getByTestId("instrument-violin")
    .getByRole("button", { name: "Solo", exact: true })
    .click();
  await page.getByLabel("Groove", { exact: true }).selectOption("light-swing");
  await expect
    .poll(async () => (await readProbe(page)).currentGroove, { timeout: 15000 })
    .toBe("light-swing");
  await expect(
    page
      .getByTestId("instrument-violin")
      .getByRole("button", { name: "Solo", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .getByTestId("instrument-violin")
    .getByRole("button", { name: "Solo", exact: true })
    .click();
  // Browser audio suspend/resume keeps this Transport, pending request and voices.
  await page.evaluate(async () => {
    await (
      window as unknown as { liveGrooveProbe: { suspend: () => Promise<void> } }
    ).liveGrooveProbe.suspend();
  });
  await page.getByLabel("Groove", { exact: true }).selectOption("half-time");
  await page.evaluate(async () => {
    await (
      window as unknown as { liveGrooveProbe: { resume: () => Promise<void> } }
    ).liveGrooveProbe.resume();
  });
  await expect
    .poll(async () => (await readProbe(page)).currentGroove, { timeout: 15000 })
    .toBe("half-time");
  const result = await readProbe(page);
  expect(result.starts).toBe(1);
  expect(result.stops).toBe(0);
  expect(result.tracks).toBe(5);
  expect(result.voices).toHaveLength(5);
  expect(result.seed).toBe("alpha");
  expect(result.sameContext && result.sameTransport).toBe(true);
  expect(result.swing).toBe(0);
  expect(
    result.ticks.every((tick, i) => i === 0 || tick >= result.ticks[i - 1]!),
  ).toBe(true);
  expect(
    result.controls?.filter((command) => command.status === "completed").length,
  ).toBeGreaterThanOrEqual(4);
  expect(result.bars.every((bar) => bar.tracks.length === 5)).toBe(true);
  for (const family of ["straight", "light-swing", "half-time"])
    expect(result.played.some((call) => call.groove === family)).toBe(true);
  expect(
    result.played.every(
      (call) => call.duration === undefined || call.duration > 0,
    ),
  ).toBe(true);
  mkdirSync(".verification/m3-a1-2026-10-09", { recursive: true });
  await page.screenshot({
    path: ".verification/m3-a1-2026-10-09/live-groove.png",
    fullPage: true,
  });
  writeFileSync(
    ".verification/m3-a1-2026-10-09/live-transport.json",
    JSON.stringify(result, null, 2),
  );
  await info.attach("live-transport", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});
