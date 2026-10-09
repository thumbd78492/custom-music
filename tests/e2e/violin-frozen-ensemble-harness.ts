import { loadSampleVoice } from "../../src/audio/SampleVoice";
import { plugin as violin } from "../../src/instruments/violin";
import { plugin as piano } from "../../src/instruments/piano";
import { plugin as bass } from "../../src/instruments/bass";
import { plugin as drums } from "../../src/instruments/drums";
import {
  baselineBank,
  createBaselinePerformance,
} from "./violin-diagnostic-baseline";
import frozenData from "../fixtures/violin-m2-frozen-ensemble.json";
import type { PreparedBar } from "../../src/audio/AudioEngine";
export interface FrozenEnsemble {
  sourceReceipt: string;
  sourceEventSha256: string;
  seed: string;
  mode: string;
  master: number;
  bars: readonly PreparedBar[];
}
const frozen = frozenData as unknown as FrozenEnsemble;

/** Same immutable ensemble events, actual voices. Each solo is extracted from this render. */
export async function renderFrozenEnsemble(before: boolean) {
  const plugins = [violin, piano, bass, drums];
  let duration = 0.1;
  const starts = frozen.bars.map((bar) => {
    const start = duration;
    duration += 240 / bar.plan.bpm;
    return start;
  });
  const rate = 44100;
  const context = new OfflineAudioContext(
    8,
    Math.ceil((duration + 0.9) * rate),
    rate,
  );
  const merger = context.createChannelMerger(8);
  merger.connect(context.destination);
  const gains: Record<string, number> = {};
  const voices = await Promise.all(
    plugins.map(async (plugin, i) => {
      const input = context.createGain(),
        splitter = context.createChannelSplitter(2);
      input.channelCount = 2;
      input.channelCountMode = "explicit";
      input.connect(splitter);
      splitter.connect(merger, 0, 2 * i);
      splitter.connect(merger, 1, 2 * i + 1);
      if (before && plugin === violin) {
        gains.violin = baselineBank.gainDb!;
        return loadSampleVoice(
          context,
          input,
          baselineBank,
          new AbortController().signal,
          createBaselinePerformance().select,
        );
      }
      return plugin.createVoice({
        createSynthVoice() {
          throw new Error("Samples required");
        },
        createPercussionVoice() {
          throw new Error("Samples required");
        },
        createSampleVoice(bank, performance) {
          gains[plugin.manifest.id] = bank.gainDb!;
          return loadSampleVoice(
            context,
            input,
            bank,
            new AbortController().signal,
            performance,
          );
        },
      });
    }),
  );
  const schedule = (i: number) => {
    for (const track of frozen.bars[i]!.tracks)
      for (const event of track.events)
        voices[plugins.findIndex((p) => p.manifest.id === track.id)]!.play(
          event,
          starts[i]! + (event.step * 15) / frozen.bars[i]!.plan.bpm,
          15 / frozen.bars[i]!.plan.bpm,
        );
  };
  schedule(0);
  const suspensions = starts.slice(1).map((t) => context.suspend(t - 0.06));
  const rendering = context.startRendering();
  for (let i = 1; i < frozen.bars.length; i++) {
    await suspensions[i - 1];
    schedule(i);
    await context.resume();
  }
  const buffer = await rendering;
  const stems = plugins.map((p, i) => {
    const data = new Float32Array(buffer.length * 2),
      left = buffer.getChannelData(2 * i),
      right = buffer.getChannelData(2 * i + 1);
    for (let frame = 0; frame < buffer.length; frame++) {
      data[frame * 2] = left[frame]!;
      data[frame * 2 + 1] = right[frame]!;
    }
    const bytes = new Uint8Array(data.buffer),
      chunks = [];
    for (let j = 0; j < bytes.length; j += 16384)
      chunks.push(String.fromCharCode(...bytes.subarray(j, j + 16384)));
    return { id: p.manifest.id, data: btoa(chunks.join("")) };
  });
  voices.forEach((v) => v.dispose());
  return {
    stems,
    metadata: {
      ...frozen,
      before,
      starts,
      duration: buffer.duration,
      frames: buffer.length,
      rate,
      gains,
      normalisation: false,
      limiter: false,
      humanListening: "Pending",
    },
  };
}
