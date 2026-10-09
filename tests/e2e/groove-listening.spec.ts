import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pcm16Wave, measureAudio } from "../helpers/audio-metrics";
import type { GrooveId } from "../../src/contracts/music";

test("same-seed fixed-BPM groove auditions and timing-only diagnostics use same-render stems", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await page.goto("/");
  const directory = `.verification/m3-a1-2026-10-09/listening/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(directory, { recursive: true });
  const roles = [
    "piano-melody",
    "piano-accompaniment",
    "violin-melody",
    "bass",
    "drums",
  ];
  const receipts = [];
  const logicalHashes: string[] = [];
  const arrangedHashes: string[] = [];
  for (const timingOnly of [false, true]) {
    for (const groove of [
      "straight",
      "light-swing",
      "half-time",
    ] as GrooveId[]) {
      const name = `${timingOnly ? "timing-only" : "arranged"}-${groove}`;
      const result = await page.evaluate(
        async ({ roles, groove, timingOnly }) => {
          const path = "/tests/e2e/role-listening-harness.ts";
          const { renderRoles } = (await import(
            path
          )) as typeof import("./role-listening-harness");
          return renderRoles("alpha", roles, 72, {
            groove,
            fixedBpm: 96,
            timingOnly,
          });
        },
        { roles, groove, timingOnly },
      );
      const hash = (data: string | Uint8Array) =>
        createHash("sha256").update(data).digest("hex");
      const pcm = result.stems.map((stem) => {
        const bytes = Buffer.from(stem.data, "base64");
        return new Float32Array(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength / 4,
        );
      });
      const full = new Float32Array(pcm[0]!.length);
      const stems = result.stems.map((stem, index) => {
        const data = pcm[index]!;
        for (let i = 0; i < data.length; i++) full[i] = full[i]! + data[i]!;
        const wave = pcm16Wave(data, result.metadata.sampleRate);
        writeFileSync(`${directory}/${name}-${stem.characterId}.wav`, wave);
        const metrics = measureAudio(data, result.metadata.sampleRate);
        expect(Number.isFinite(metrics.rmsDbfs), stem.characterId).toBe(true);
        return { ...stem, data: undefined, wavSha256: hash(wave), metrics };
      });
      const fullWave = pcm16Wave(full, result.metadata.sampleRate);
      writeFileSync(`${directory}/${name}-full.wav`, fullWave);
      const logicalHash = hash(
        JSON.stringify(
          result.metadata.bars.map((bar) =>
            bar.tracks.map((track) => ({
              id: track.id,
              assignment: track.assignment,
              events: track.events,
            })),
          ),
        ),
      );
      (timingOnly ? logicalHashes : arrangedHashes).push(logicalHash);
      const metrics = measureAudio(full, result.metadata.sampleRate);
      expect(result.metadata.duration).toBeGreaterThanOrEqual(60);
      expect(result.metadata.duration).toBeLessThanOrEqual(90);
      expect(result.metadata.bars.every((bar) => bar.plan.bpm === 96)).toBe(
        true,
      );
      expect(result.metadata.gains["violin-melody:1"]).toBe(-9);
      expect(metrics.peakDbfs).toBeLessThan(-1);
      const receipt = {
        name,
        ...result.metadata,
        logicalHash,
        stems,
        full: {
          wavSha256: hash(fullWave),
          metrics,
          derivedFrom:
            "Same render Float32 stems summed before independent PCM16 quantisation; no Normalize.",
        },
      };
      writeFileSync(
        `${directory}/${name}-receipt.json`,
        JSON.stringify(receipt, null, 2),
      );
      receipts.push({
        name,
        logicalHash,
        duration: result.metadata.duration,
        metrics,
      });
    }
  }
  expect(new Set(logicalHashes).size).toBe(1);
  expect(new Set(arrangedHashes).size).toBe(3);
  const summary = {
    directory,
    receipts,
    seed: "alpha",
    fixedBpm: 96,
    humanListening: "Pending",
  };
  writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
  await info.attach("groove-auditions", {
    body: JSON.stringify(summary),
    contentType: "application/json",
  });
  console.log(`Groove auditions: ${directory}`);
});
