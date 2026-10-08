import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { measureAudio, pcm16Wave } from "../tests/helpers/audio-metrics.ts";

const root = ".verification/violin-m2-2026-10-09";
const plan = JSON.parse(readFileSync(`${root}/before/plan.json`, "utf8"));
const stems = (variant) =>
  Object.fromEntries(
    ["bass", "drums", "piano", "violin"].map((id) => {
      const b = readFileSync(`${root}/${variant}/${id}.f32`);
      return [id, new Float32Array(b.buffer, b.byteOffset, b.length / 4)];
    }),
  );
const before = stems("before");
const combine = (tracks, factors) => {
  const output = new Float32Array(plan.frames * 2);
  for (let i = 0; i < output.length; i++) {
    let value = 0;
    for (const [id, factor] of Object.entries(factors))
      value += tracks[id][i] * factor;
    output[i] = value * plan.master;
  }
  return output;
};
mkdirSync(`${root}/wav`, { recursive: true });
const measurements = [];
function save(name, data, details) {
  const metrics = measureAudio(data, plan.sampleRate);
  const file = `${root}/wav/${name}.wav`,
    bytes = pcm16Wave(data, plan.sampleRate);
  writeFileSync(file, bytes);
  const entry = {
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...details,
    ...metrics,
  };
  measurements.push(entry);
  console.log(
    `${name}: RMS ${metrics.rmsDbfs.toFixed(2)}, short-term max ${metrics.maxShortTermLufs.toFixed(2)} LUFS, peak ${metrics.peakDbfs.toFixed(2)}`,
  );
}
save(
  "alpha-ensemble-without-violin",
  combine(before, { piano: 1, bass: 1, drums: 1 }),
  { variant: "common", scope: "without-violin" },
);
for (const gain of [-5, -8, -9, -10]) {
  const factor = 10 ** ((gain - plan.gains.violin) / 20);
  const label = gain === -5 ? "before-minus5" : `gain-only-minus${-gain}`;
  save(
    `alpha-${label}-full`,
    combine(before, { piano: 1, bass: 1, drums: 1, violin: factor }),
    { variant: label, gainDb: gain, scope: "full", identicalEvents: true },
  );
  save(`alpha-${label}-violin-only`, combine(before, { violin: factor }), {
    variant: label,
    gainDb: gain,
    scope: "violin-only",
    identicalEvents: true,
  });
}
for (const variant of ["voice-only", "after"])
  if (existsSync(`${root}/${variant}/plan.json`)) {
    const tracks = stems(variant);
    for (const gain of variant === "after" ? [-8, -9, -10] : [-9]) {
      const factor = 10 ** ((gain + 9) / 20);
      save(
        `alpha-${variant}-minus${-gain}-full`,
        combine(tracks, { piano: 1, bass: 1, drums: 1, violin: factor }),
        {
          variant,
          gainDb: gain,
          scope: "full",
          identicalAccompaniment: true,
          identicalEvents: variant === "voice-only",
        },
      );
      save(
        `alpha-${variant}-minus${-gain}-violin-only`,
        combine(tracks, { violin: factor }),
        {
          variant,
          gainDb: gain,
          scope: "violin-only",
          identicalAccompaniment: true,
          identicalEvents: variant === "voice-only",
        },
      );
    }
  }
const tracks = Object.entries(before).map(([id, data]) => ({
  id,
  ...measureAudio(
    data.map((x) => x * plan.master),
    plan.sampleRate,
  ),
}));
writeFileSync(
  `${root}/metrics.json`,
  JSON.stringify(
    {
      seed: plan.seed,
      mode: plan.mode,
      duration: plan.duration,
      barCount: plan.bars.length,
      sampleRate: plan.sampleRate,
      master: plan.master,
      normalisation: false,
      limiter: false,
      peak: "sample peak (not oversampled true peak)",
      loudness:
        "Local BS.1770 K-weighted meter: ungated 3 s short term, 400 ms momentary, gated integrated. Not a certified EBU meter.",
      humanListening:
        "Pending; original alpha: violin too loud and every note rebowed, user feedback 2026-10-09",
      tracks,
      measurements,
    },
    null,
    2,
  ),
);
