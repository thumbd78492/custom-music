/** BS.1770 K weighting with De Man's sample-rate-adjusted biquads.
 * Reference: https://github.com/BrechtDeMan/loudness.py
 * EBU Tech 3341: 400 ms momentary, 3 s short term, 100 ms measurement hop.
 * This local meter is regression-tested, not a certified broadcast meter.
 */
function filter(b: number[], a: number[]) {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x: number) => {
    const y = b[0]! * x + b[1]! * x1 + b[2]! * x2 - a[1]! * y1 - a[2]! * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
function kWeight(rate: number) {
  const k = Math.tan((Math.PI * 1681.9744509555319) / rate),
    q = 0.7071752369554193;
  const vh = 10 ** (3.99984385397 / 20),
    vb = vh ** 0.499666774155;
  const d = 1 + k / q + k * k;
  const shelf = filter(
    [
      (vh + (vb * k) / q + k * k) / d,
      (2 * (k * k - vh)) / d,
      (vh - (vb * k) / q + k * k) / d,
    ],
    [1, (2 * (k * k - 1)) / d, (1 - k / q + k * k) / d],
  );
  const h = Math.tan((Math.PI * 38.13547087613982) / rate),
    hq = 0.5003270373253953;
  const hd = 1 + h / hq + h * h;
  const highpass = filter(
    [1, -2, 1],
    [1, (2 * (h * h - 1)) / hd, (1 - h / hq + h * h) / hd],
  );
  return (x: number) => highpass(shelf(x));
}
const loudness = (energy: number) =>
  energy > 0 ? -0.691 + 10 * Math.log10(energy) : -120;

export function measureAudio(data: Float32Array, rate: number) {
  if (data.length % 2 || !data.length)
    throw new Error("Stereo samples required");
  const filters = [kWeight(rate), kWeight(rate)];
  const hop = Math.round(rate * 0.1);
  const weighted: number[] = [],
    raw: number[] = [];
  let energy = 0,
    blockRaw = 0,
    blockWeighted = 0,
    peak = 0;
  const frames = data.length / 2;
  for (let frame = 0; frame < frames; frame++) {
    for (let side = 0; side < 2; side++) {
      const value = data[frame * 2 + side]!;
      if (!Number.isFinite(value)) throw new Error("Nonfinite audio sample");
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
      blockRaw += value * value;
      const y = filters[side]!(value);
      blockWeighted += y * y;
    }
    if ((frame + 1) % hop === 0) {
      raw.push(blockRaw / (hop * 2));
      weighted.push(blockWeighted / hop);
      blockRaw = 0;
      blockWeighted = 0;
    }
  }
  const averages = (input: number[], length: number) => {
    const result = [];
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input[i]!;
      if (i >= length) sum -= input[i - length]!;
      if (i >= length - 1) result.push(Math.max(0, sum / length));
    }
    return result;
  };
  const momentaryEnergy = averages(weighted, 4);
  const absolute = momentaryEnergy.filter((value) => loudness(value) >= -70);
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const relative = loudness(mean(absolute)) - 10;
  const integrated = absolute.filter((value) => loudness(value) > relative);
  const shortTerm = averages(weighted, 30).map((value, index) => ({
    atSeconds: ((index + 30) * hop) / rate,
    lufs: loudness(value),
  }));
  return {
    rmsDbfs: energy > 0 ? 10 * Math.log10(energy / data.length) : -120,
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -120,
    max400msRmsDbfs: 10 * Math.log10(Math.max(1e-12, ...averages(raw, 4))),
    integratedLufs: loudness(mean(integrated)),
    maxMomentaryLufs: Math.max(-120, ...momentaryEnergy.map(loudness)),
    maxShortTermLufs: Math.max(-120, ...shortTerm.map((point) => point.lufs)),
    shortTerm,
  };
}

export function pcm16Wave(data: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + data.length * 2),
    view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i]) || Math.abs(data[i]!) > 1)
      throw new Error("WAV clipping: no automatic normalisation allowed");
    view.setInt16(44 + i * 2, Math.round(data[i]! * 32767), true);
  }
  return bytes;
}
