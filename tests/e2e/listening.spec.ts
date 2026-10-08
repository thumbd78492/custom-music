import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("renders a ten-minute real-sample audition with its complete event and section plan", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/e2e/listening-harness.ts";
    const { renderListening } = (await import(
      path
    )) as typeof import("./listening-harness");
    return renderListening("alpha");
  });
  const directory = `.verification/listening-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/alpha-balanced.wav`,
    Buffer.from(result.wav, "base64"),
  );
  writeFileSync(
    `${directory}/plan-and-metrics.json`,
    JSON.stringify(result.metadata, null, 2),
  );
  await info.attach("audition-receipt", {
    body: JSON.stringify({
      directory,
      duration: result.metadata.duration,
      peakDbfs: result.metadata.peakDbfs,
      humanListening: "Pending",
    }),
    contentType: "application/json",
  });
  expect(result.metadata.duration).toBeGreaterThan(600);
  expect(result.metadata.peakDbfs).toBeLessThan(-1);
  expect(result.metadata.sections.length).toBeGreaterThan(10);
  expect(
    new Set(result.metadata.sections.map((section) => section.key)).size,
  ).toBeGreaterThan(2);
  console.log(
    `Audition artifact (human acceptance Pending): ${directory}/alpha-balanced.wav`,
  );
});
