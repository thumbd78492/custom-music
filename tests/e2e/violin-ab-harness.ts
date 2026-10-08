import { discoverPlugins } from "../../src/app/discoverPlugins";
import { MusicDirector } from "../../src/core/MusicDirector";
import { BarPlanner } from "../../src/core/BarPlanner";
import { createPluginSession } from "../../src/core/PluginSession";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type { PreparedBar } from "../../src/audio/AudioEngine";

/** Isolated stems of one ensemble performance: soloing must not regenerate events. */
export async function renderViolinAB(
  frozen?: readonly PreparedBar[],
  melody = false,
) {
  const descriptors = await discoverPlugins();
  const plugins = await Promise.all(
    descriptors.map(async (d) => (await d.load()).plugin),
  );
  const planner = new BarPlanner(new MusicDirector("alpha", "Balanced"));
  const tracks = plugins.map((plugin) => ({
    id: plugin.manifest.id,
    active: true,
    muted: false,
    solo: false,
    session: createPluginSession(plugin),
  }));
  const generated = Array.from({ length: 64 }, () =>
    planner.prepare(tracks, (_, error) => {
      throw error;
    }),
  );
  const bars = frozen
    ? frozen.map((bar, index) => ({
        ...bar,
        tracks: bar.tracks.map((track) =>
          melody && track.id === "violin"
            ? generated[index]!.tracks.find((t) => t.id === track.id)!
            : track,
        ),
      }))
    : generated;
  let duration = 0.1;
  const starts = bars.map((bar) => {
    const start = duration;
    duration += 240 / bar.plan.bpm;
    return start;
  });
  const rate = 22050;
  const context = new OfflineAudioContext(
    plugins.length * 2,
    Math.ceil((duration + 2) * rate),
    rate,
  );
  const merger = context.createChannelMerger(plugins.length * 2);
  merger.connect(context.destination);
  const gains: Record<string, number> = {};
  const voices = await Promise.all(
    plugins.map(async (plugin, index) => {
      const stereo = context.createGain();
      stereo.channelCount = 2;
      stereo.channelCountMode = "explicit";
      const splitter = context.createChannelSplitter(2);
      stereo.connect(splitter);
      splitter.connect(merger, 0, index * 2);
      splitter.connect(merger, 1, index * 2 + 1);
      return plugin.createVoice({
        createSynthVoice() {
          throw new Error("Samples required");
        },
        createPercussionVoice() {
          throw new Error("Samples required");
        },
        createSampleVoice(bank, performance) {
          gains[plugin.manifest.id] = bank.gainDb ?? 0;
          return loadSampleVoice(
            context,
            stereo,
            bank,
            new AbortController().signal,
            performance,
          );
        },
      });
    }),
  );
  const schedule = (index: number) => {
    const bar = bars[index]!;
    for (const track of bar.tracks) {
      const voice =
        voices[plugins.findIndex((p) => p.manifest.id === track.id)]!;
      for (const event of track.events)
        voice.play(
          event,
          starts[index]! + (event.step * 15) / bar.plan.bpm,
          15 / bar.plan.bpm,
        );
    }
  };
  schedule(0);
  const suspensions = starts
    .slice(1)
    .map((time) => context.suspend(time - 0.06));
  const rendering = context.startRendering();
  for (let index = 1; index < bars.length; index++) {
    await suspensions[index - 1];
    schedule(index);
    await context.resume();
  }
  const buffer = await rendering;
  const stems = plugins.map((plugin, index) => {
    const data = new Float32Array(buffer.length * 2);
    const left = buffer.getChannelData(index * 2),
      right = buffer.getChannelData(index * 2 + 1);
    for (let frame = 0; frame < buffer.length; frame++) {
      data[frame * 2] = left[frame]!;
      data[frame * 2 + 1] = right[frame]!;
    }
    const bytes = new Uint8Array(data.buffer);
    const strings = [];
    for (let i = 0; i < bytes.length; i += 16384)
      strings.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return { id: plugin.manifest.id, data: btoa(strings.join("")) };
  });
  voices.forEach((voice) => voice.dispose());
  return {
    stems,
    metadata: {
      seed: "alpha",
      mode: "Balanced",
      bars,
      starts,
      sampleRate: rate,
      frames: buffer.length,
      duration: buffer.duration,
      gains,
      master: 0.65,
      normalisation: false,
      limiter: false,
      humanListening: "Pending",
      frozenAccompaniment: !!frozen,
    },
  };
}
