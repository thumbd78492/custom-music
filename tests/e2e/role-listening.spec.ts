import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pcm16Wave, measureAudio } from "../helpers/audio-metrics";

test("renders short melody, equal duet and five-role ensemble with same-render stems", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("/");
  const directory = `.verification/m2-dual-role-2026-10-09/listening/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(directory, { recursive: true });
  const scenarios = [
    { name: "melody-piano", roles: ["piano-melody"], seconds: 45 },
    {
      name: "equal-duet",
      roles: ["piano-melody", "violin-melody"],
      seconds: 75,
    },
    {
      name: "five-role",
      roles: [
        "piano-melody",
        "piano-accompaniment",
        "violin-melody",
        "bass",
        "drums",
      ],
      seconds: 75,
    },
  ];
  const receipts = [];
  for (const scenario of scenarios) {
    const result = await page.evaluate(async ({ roles, seconds }) => {
      const path = "/tests/e2e/role-listening-harness.ts";
      const { renderRoles } = (await import(
        path
      )) as typeof import("./role-listening-harness");
      return renderRoles("alpha", roles, seconds);
    }, scenario);
    const pcm = result.stems.map((stem) => {
      const bytes = Buffer.from(stem.data, "base64");
      return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    });
    const full = new Float32Array(pcm[0]!.length);
    const stemMetrics = result.stems.map((stem, index) => {
      const data = pcm[index]!;
      for (let i = 0; i < data.length; i++) full[i] = full[i]! + data[i]!;
      const wave = pcm16Wave(data, result.metadata.sampleRate);
      writeFileSync(
        `${directory}/${scenario.name}-${stem.characterId}.wav`,
        wave,
      );
      return {
        ...stem,
        data: undefined,
        pcmSha256: createHash("sha256")
          .update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
          .digest("hex"),
        wavSha256: createHash("sha256").update(wave).digest("hex"),
        metrics: measureAudio(data, result.metadata.sampleRate),
      };
    });
    const wave = pcm16Wave(full, result.metadata.sampleRate),
      metrics = measureAudio(full, result.metadata.sampleRate);
    writeFileSync(`${directory}/${scenario.name}-full.wav`, wave);
    const eventSha256 = createHash("sha256")
      .update(JSON.stringify(result.metadata.bars))
      .digest("hex");
    const receipt = {
      scenario: scenario.name,
      ...result.metadata,
      eventSha256,
      stems: stemMetrics,
      full: {
        wavSha256: createHash("sha256").update(wave).digest("hex"),
        metrics,
        derivedFrom:
          "Exact same-render Float32 stems summed in declared performer order, before PCM16 quantisation.",
      },
    };
    writeFileSync(
      `${directory}/${scenario.name}-receipt.json`,
      JSON.stringify(receipt, null, 2),
    );
    expect(result.metadata.duration).toBeGreaterThanOrEqual(scenario.seconds);
    expect(result.metadata.duration).toBeLessThan(scenario.seconds + 5);
    expect(metrics.peakDbfs).toBeLessThan(-1);
    for (const stem of stemMetrics)
      expect(Number.isFinite(stem.metrics.rmsDbfs)).toBe(true);
    for (const role of scenario.roles.filter((id) => id.endsWith("melody"))) {
      const leading = result.metadata.bars.filter(
        (bar) =>
          bar.plan.phrasePosition === 0 &&
          bar.tracks.some(
            (t) => t.id === `${role}:1` && t.assignment?.task === "lead",
          ),
      );
      expect(leading.length, role).toBeGreaterThan(1);
      expect(
        leading.every(
          (bar) =>
            bar.tracks.find((t) => t.id === `${role}:1`)!.events.length > 1,
        ),
      ).toBe(true);
    }
    receipts.push({
      scenario: scenario.name,
      duration: result.metadata.duration,
      eventSha256,
      metrics,
      stems: stemMetrics,
    });
  }
  writeFileSync(
    `${directory}/summary.json`,
    JSON.stringify({ directory, receipts, humanListening: "Pending" }, null, 2),
  );
  await info.attach("short-audition-receipt", {
    body: JSON.stringify({ directory, receipts, humanListening: "Pending" }),
    contentType: "application/json",
  });
  console.log(`Short auditions and exact stems: ${directory}`);
});
