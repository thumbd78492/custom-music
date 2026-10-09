import { discoverPlugins } from "../../src/app/discoverPlugins";
import { MusicDirector, ENGINE_VERSION } from "../../src/core/MusicDirector";
import { BarPlanner } from "../../src/core/BarPlanner";
import { createPluginSession } from "../../src/core/PluginSession";
import { instances } from "../../src/core/CharacterInstances";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type { PreparedBar } from "../../src/audio/AudioEngine";

/** Audition artifact from the real generators/voice/samples; not a Transport test. */
export async function renderListening(seed: string) {
  const descriptors = await discoverPlugins();
  const plugins = await Promise.all(
    descriptors.map(async (d) => (await d.load()).plugin),
  );
  const performers = plugins.flatMap((plugin) =>
    instances(plugin.manifest).map((role) => ({ ...role, plugin })),
  );
  const tracks = performers.map(({ plugin, identity }) => ({
    id: identity.instanceId,
    active: true,
    muted: false,
    solo: false,
    session: createPluginSession(plugin, identity),
  }));
  const planner = new BarPlanner(new MusicDirector(seed));
  let duration = 0.1;
  const bars: PreparedBar[] = [];
  const starts: number[] = [];
  while (duration < 600.1) {
    const bar = planner.prepare(tracks, (_, error) => {
      throw error;
    });
    starts.push(duration);
    bars.push(bar);
    duration += 240 / bar.plan.bpm;
  }
  const rate = 22050;
  const context = new OfflineAudioContext(
    2,
    Math.ceil((duration + 2) * rate),
    rate,
  );
  const master = context.createGain();
  master.gain.value = 0.65;
  master.connect(context.destination);
  const voices = await Promise.all(
    performers.map(({ plugin }) =>
      plugin.createVoice({
        createSynthVoice() {
          throw new Error("Real samples required");
        },
        createPercussionVoice() {
          throw new Error("Real samples required");
        },
        createSampleVoice(bank, performance) {
          return loadSampleVoice(
            context,
            master,
            bank,
            new AbortController().signal,
            performance,
          );
        },
      }),
    ),
  );
  const schedule = (index: number) => {
    const bar = bars[index]!;
    for (const track of bar.tracks) {
      const voice =
        voices[
          performers.findIndex((p) => p.identity.instanceId === track.id)
        ]!;
      for (const event of track.events)
        voice.play(
          event,
          starts[index]! + (event.step * 15) / bar.plan.bpm,
          15 / bar.plan.bpm,
        );
    }
  };
  schedule(0);
  const suspended = starts.slice(1).map((time) => context.suspend(time - 0.06));
  const rendering = context.startRendering();
  for (let index = 1; index < bars.length; index++) {
    await suspended[index - 1];
    schedule(index);
    await context.resume();
  }
  const buffer = await rendering;
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  const wav = new ArrayBuffer(44 + buffer.length * 4),
    view = new DataView(wav);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, wav.byteLength - 8, true);
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
  view.setUint32(40, buffer.length * 4, true);
  let peak = 0,
    sum = 0;
  for (let i = 0; i < buffer.length; i++)
    for (let side = 0; side < 2; side++) {
      const sample = (side ? right : left)[i]!;
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
      view.setInt16(
        44 + i * 4 + side * 2,
        Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
        true,
      );
    }
  const bytes = new Uint8Array(wav);
  const strings = [];
  for (let i = 0; i < bytes.length; i += 16384)
    strings.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  voices.forEach((voice) => voice.dispose());
  return {
    wav: btoa(strings.join("")),
    metadata: {
      seed,
      mode: "Balanced",
      engineVersion: ENGINE_VERSION,
      duration: buffer.duration,
      sampleRate: rate,
      channels: 2,
      peakDbfs: 20 * Math.log10(peak),
      rmsDbfs: 10 * Math.log10(sum / (buffer.length * 2)),
      rendering:
        "Real SampleVoice, chronological per-bar refill, master 0.65, no limiter, no normalisation. Not realtime Transport recording or human acceptance.",
      humanListening: "Pending",
      sections: bars
        .filter((bar) => bar.plan.sectionBar === 0)
        .map((bar) => ({
          atSeconds: starts[bar.plan.barIndex],
          bar: bar.plan.barIndex + 1,
          section: bar.plan.section,
          bpm: bar.plan.bpm,
          key: bar.plan.key,
          energy: bar.plan.energy,
        })),
      bars,
    },
  };
}
