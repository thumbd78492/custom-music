import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pcm16Wave, measureAudio } from "../helpers/audio-metrics";
import type { FrozenEnsemble } from "./violin-frozen-ensemble-harness";
const frozen = JSON.parse(
  readFileSync("tests/fixtures/violin-m2-frozen-ensemble.json", "utf8"),
) as FrozenEnsemble;

test("M2 short violin A/B extracts solo from exactly the same frozen ensemble events", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const directory = `.verification/violin-diagnosis-2026-10-09/ensemble/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(directory, { recursive: true });
  await page.goto("/");
  const receipts = [];
  const canonical: Record<string, Float32Array> = {};
  for (const before of [true, false]) {
    const result = await page.evaluate(async (before) => {
      const path = "/tests/e2e/violin-frozen-ensemble-harness.ts";
      const { renderFrozenEnsemble } = (await import(
        path
      )) as typeof import("./violin-frozen-ensemble-harness");
      return renderFrozenEnsemble(before);
    }, before);
    expect(result.metadata.bars).toEqual(frozen.bars);
    expect(result.metadata.gains.violin).toBe(-9);
    expect(result.metadata.duration).toBeGreaterThanOrEqual(20);
    expect(result.metadata.duration).toBeLessThanOrEqual(30);
    const variant = before ? "before" : "after";
    const pcm: Record<string, Float32Array> = {};
    const errors: Record<string, number> = {};
    for (const stem of result.stems) {
      const bytes = Buffer.from(stem.data, "base64");
      const data = new Float32Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.length / 4,
      );
      pcm[stem.id] = data;
      if (before) canonical[stem.id] = data;
      else if (stem.id !== "violin") {
        let error = 0;
        for (let i = 0; i < data.length; i++)
          error = Math.max(error, Math.abs(data[i]! - canonical[stem.id]![i]!));
        errors[stem.id] = error;
        expect(error, `${stem.id} actual rerender error`).toBeLessThan(1e-7);
        pcm[stem.id] = canonical[stem.id]!;
      }
      writeFileSync(
        `${directory}/${variant}-${stem.id}.f32`,
        Buffer.from(
          pcm[stem.id]!.buffer,
          pcm[stem.id]!.byteOffset,
          pcm[stem.id]!.byteLength,
        ),
      );
    }
    for (const scope of ["violin-only", "full", "without-violin"] as const) {
      if (!before && scope === "without-violin") continue;
      const data = new Float32Array(result.metadata.frames * 2);
      for (let i = 0; i < data.length; i++)
        data[i] =
          frozen.master *
          Object.entries(pcm).reduce(
            (sum, [id, values]) =>
              sum +
              ((scope === "violin-only" && id !== "violin") ||
              (scope === "without-violin" && id === "violin")
                ? 0
                : values[i]!),
            0,
          );
      const name = `${variant}-${scope}.wav`,
        bytes = pcm16Wave(data, result.metadata.rate);
      writeFileSync(`${directory}/${name}`, bytes);
      receipts.push({
        file: name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...measureAudio(data, result.metadata.rate),
      });
    }
    writeFileSync(
      `${directory}/${variant}-plan.json`,
      JSON.stringify(
        { ...result.metadata, accompanimentRerenderError: errors },
        null,
        2,
      ),
    );
  }
  for (const id of ["piano", "bass", "drums"])
    expect(
      readFileSync(`${directory}/after-${id}.f32`).equals(
        readFileSync(`${directory}/before-${id}.f32`),
      ),
      `${id} exported PCM identity`,
    ).toBe(true);
  writeFileSync(
    `${directory}/receipts.json`,
    JSON.stringify(
      {
        sourceEventSha256: frozen.sourceEventSha256,
        excerptEventsSha256: createHash("sha256")
          .update(JSON.stringify(frozen.bars))
          .digest("hex"),
        receipts,
        humanListening: "Pending",
        feedback: {
          noteTransitions: "人工回饋未通過",
          melodyLoudness: "人工回饋未通過",
        },
      },
      null,
      2,
    ),
  );
  await info.attach("frozen-short-AB", {
    body: JSON.stringify({
      directory,
      receipts: receipts.map((r) => ({ file: r.file, rmsDbfs: r.rmsDbfs })),
    }),
    contentType: "application/json",
  });
  console.log(`Frozen 27 s A/B: ${directory}`);
});
