import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { PreparedBar } from "../../src/audio/AudioEngine";

test("exports controlled alpha violin A/B stems and freezes the accompaniment", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const root = ".verification/violin-m2-2026-10-09";
  const before = process.env.VIOLIN_AB_PHASE === "before";
  const frozenPath = `${root}/before/plan.json`;
  // A clean checkout can run E2E without local, ignored historical receipts.
  test.skip(
    !before && !existsSync(frozenPath),
    "Run VIOLIN_AB_PHASE=before before editing to freeze an A/B baseline",
  );
  const frozen = before
    ? undefined
    : (JSON.parse(readFileSync(frozenPath, "utf8")) as { bars: PreparedBar[] })
        .bars;
  await page.goto("/");
  for (const variant of before ? ["before"] : ["voice-only", "after"]) {
    const result = await page.evaluate(
      async ({ frozen, melody }) => {
        const path = "/tests/e2e/violin-ab-harness.ts";
        const { renderViolinAB } = (await import(
          path
        )) as typeof import("./violin-ab-harness");
        return renderViolinAB(frozen, melody);
      },
      { frozen, melody: variant === "after" },
    );
    const directory = `${root}/${variant}`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      `${directory}/plan.json`,
      JSON.stringify(result.metadata, null, 2),
    );
    const hashes: Record<string, string> = {};
    const renderDifferences: Record<string, number> = {};
    for (const stem of result.stems) {
      let bytes = Buffer.from(stem.data, "base64");
      if (!before && stem.id !== "violin") {
        const frozenBytes = readFileSync(`${root}/before/${stem.id}.f32`);
        const a = new Float32Array(
            bytes.buffer,
            bytes.byteOffset,
            bytes.length / 4,
          ),
          b = new Float32Array(
            frozenBytes.buffer,
            frozenBytes.byteOffset,
            frozenBytes.length / 4,
          );
        expect(a.length).toBe(b.length);
        let error = 0;
        for (let i = 0; i < a.length; i++)
          error = Math.max(error, Math.abs(a[i]! - b[i]!));
        renderDifferences[stem.id] = error;
        expect(
          error,
          `${stem.id} independent render numerical tolerance`,
        ).toBeLessThan(0.0000001);
        // Browser DSP can differ by a float ULP. Freeze the actual PCM accompaniment
        // as well as its events so the exported A/B has exactly the same background.
        bytes = frozenBytes;
      }
      writeFileSync(`${directory}/${stem.id}.f32`, bytes);
      hashes[stem.id] = createHash("sha256").update(bytes).digest("hex");
      if (!before && stem.id !== "violin")
        expect(hashes[stem.id], `${stem.id} waveform unchanged`).toBe(
          createHash("sha256")
            .update(readFileSync(`${root}/before/${stem.id}.f32`))
            .digest("hex"),
        );
    }
    writeFileSync(
      `${directory}/render-differences.json`,
      JSON.stringify(renderDifferences, null, 2),
    );
    writeFileSync(`${directory}/hashes.json`, JSON.stringify(hashes, null, 2));
    expect(result.metadata.duration).toBeGreaterThan(120);
    await info.attach(variant, {
      body: JSON.stringify({ directory, hashes, humanListening: "Pending" }),
      contentType: "application/json",
    });
    console.log(`A/B stems: ${directory}`);
  }
});
