import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test("M2 violin one-factor diagnostics preserve full pitch, bow, length and velocity coverage", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const loadedSampleUrls: string[] = [];
  page.on("request", (request) => {
    if (/\/samples\/.*\.(wav|flac)(\?|$)/.test(request.url()))
      loadedSampleUrls.push(request.url());
  });
  await page.goto("/?instrument=violin");
  const directory = `.verification/violin-diagnosis-2026-10-09/attempts/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  mkdirSync(`${directory}/wav`, { recursive: true });
  const summaries = [];
  const variants =
    process.env.VIOLIN_DIAG_PHASE === "before"
      ? ([
          "dual-current",
          "soft-current",
          "loud-current",
          "dual-stable",
          "soft-stable",
          "loud-stable",
          "loud-stable-restart",
        ] as const)
      : (["candidate"] as const);
  const failures: string[] = [];
  for (const kind of [
    "scale",
    "bows",
    "lengths",
    "lengths-low",
    "lengths-high",
    "same",
    "frozen",
  ] as const) {
    for (const velocity of kind === "bows" ? [0.5, 0.56, 0.62, 0.74] : [0.56]) {
      for (const variant of variants) {
        const result = await page.evaluate(
          async ({ kind, velocity, variant }) => {
            const path = "/tests/e2e/violin-diagnostic-harness.ts";
            const { renderDiagnostic, sequence } = (await import(
              path
            )) as typeof import("./violin-diagnostic-harness");
            const {
              wav,
              waveform: _waveform,
              ...metrics
            } = await renderDiagnostic(sequence(kind, velocity), variant);
            void _waveform;
            return { wav, metrics };
          },
          { kind, velocity, variant },
        );
        const name =
          kind === "frozen"
            ? `frozen-events-${variant}`
            : `${kind}-v${velocity}-${variant}`;
        writeFileSync(
          `${directory}/wav/${name}.wav`,
          Buffer.from(result.wav, "base64"),
        );
        writeFileSync(
          `${directory}/${name}.json`,
          JSON.stringify(result.metrics, null, 2),
        );
        summaries.push({
          name,
          kind,
          velocity,
          variant,
          ...result.metrics.summary,
        });
        console.log(
          `${name}: worst adjacent ${result.metrics.summary.worstAdjacent.differenceDb.toFixed(3)} dB; span ${result.metrics.summary.spanDb.toFixed(3)} dB; onset ${result.metrics.summary.maxOnsetDelaySeconds.toFixed(3)} s`,
        );
        expect(result.metrics.summary.allSourcesDisconnected).toBe(true);
        expect(result.metrics.duration).toBeGreaterThanOrEqual(20);
        expect(result.metrics.duration).toBeLessThanOrEqual(30);
        for (let i = 1; i < result.metrics.perNote.length; i++) {
          const note = result.metrics.perNote[i]!;
          const previous = result.metrics.perNote[i - 1]!;
          const gap = note.start - previous.end;
          if (
            note.midi === previous.midi &&
            note.articulation === "legato" &&
            gap >= -0.025 &&
            gap <= 0.075
          ) {
            if (variant === "candidate" || variant === "loud-stable") {
              expect(
                note.continued,
                `${name}: same-pitch source continuation at ${i}`,
              ).toBe(true);
              expect(note.layers.map((l) => l.sourceId)).toEqual(
                previous.layers.map((l) => l.sourceId),
              );
            } else if (variant === "loud-stable-restart") {
              expect(
                note.continued,
                `${name}: continuation disabled at ${i}`,
              ).toBe(false);
            }
          }
        }
        if (variant === "candidate") {
          // A provisional engineering target, never human acceptance. Full original coverage remains.
          for (const pair of result.metrics.adjacent) {
            const expressionDb =
              kind === "frozen"
                ? 20 *
                  Math.log10(
                    result.metrics.perNote[pair.to]!.velocity /
                      result.metrics.perNote[pair.from]!.velocity,
                  )
                : 0;
            if (
              Math.abs(pair.differenceDb - expressionDb) > 3 ||
              Math.abs(pair.isolatedDifferenceDb - expressionDb) > 3
            )
              failures.push(
                `${name}: ${pair.from}->${pair.to}: ${pair.differenceDb}/${pair.isolatedDifferenceDb} dB`,
              );
          }
          if (kind !== "frozen" && result.metrics.summary.spanDb > 3)
            failures.push(
              `${name}: all-pitch/bow span ${result.metrics.summary.spanDb} dB`,
            );
        }
      }
    }
  }
  writeFileSync(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        summaries,
        failures,
        loadedSampleUrls: [...new Set(loadedSampleUrls)],
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
  await info.attach("violin-diagnostics", {
    body: JSON.stringify({ directory, summaries }),
    contentType: "application/json",
  });
  console.log(`Diagnostic receipts: ${directory}`);
  expect(
    failures,
    "3 dB provisional engineering target; does not grant human acceptance",
  ).toEqual([]);
  expect(loadedSampleUrls.length).toBeGreaterThan(0);
  expect(
    loadedSampleUrls.every((url) => url.includes("/violin/samples/")),
    "diagnosis loads Violin only",
  ).toBe(true);
});
