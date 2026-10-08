import { expect, it } from "vitest";
import { measureAudio, pcm16Wave } from "../helpers/audio-metrics";

it("calibrates stereo 1 kHz, preserves a 4 dB gain change in RMS/LUFS/peak and does not normalise", () => {
  const rate = 22050,
    data = new Float32Array(rate * 8 * 2);
  for (let i = 0; i < data.length / 2; i++)
    data[i * 2] = data[i * 2 + 1] =
      0.1 * Math.sin((2 * Math.PI * 1000 * i) / rate);
  const before = measureAudio(data, rate),
    after = measureAudio(
      data.map((value) => value * 10 ** (-4 / 20)),
      rate,
    );
  expect(before.integratedLufs).toBeCloseTo(-20, 0);
  expect(before.rmsDbfs).toBeCloseTo(-23.01, 2);
  for (const field of [
    "rmsDbfs",
    "peakDbfs",
    "integratedLufs",
    "maxShortTermLufs",
  ] as const)
    expect(after[field] - before[field]).toBeCloseTo(-4, 5);
  const wave = pcm16Wave(data, rate);
  expect(new DataView(wave.buffer).getUint16(22, true)).toBe(2);
  expect(() => pcm16Wave(new Float32Array([1.1, 0]), rate)).toThrow("clipping");
});
