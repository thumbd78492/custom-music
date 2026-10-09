import { discoverPlugins } from "../../src/app/discoverPlugins";
import { instances } from "../../src/core/CharacterInstances";
import { createPluginSession } from "../../src/core/PluginSession";
import { BarPlanner } from "../../src/core/BarPlanner";
import { MusicDirector, ENGINE_VERSION } from "../../src/core/MusicDirector";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type { PreparedBar } from "../../src/audio/AudioEngine";

/** Single multichannel render: stems and Full use exactly the same events and PCM. */
export async function renderRoles(
  seed: string,
  characterIds: readonly string[],
  seconds: number,
) {
  const descriptors = await discoverPlugins();
  const performers = await Promise.all(
    descriptors.flatMap((d) =>
      instances(d.manifest)
        .filter((role) => characterIds.includes(role.identity.characterId))
        .map(async (role) => ({ ...role, plugin: (await d.load()).plugin })),
    ),
  );
  if (performers.length !== characterIds.length)
    throw new Error("Unknown role selection");
  const tracks = performers.map((p) => ({
    id: p.identity.instanceId,
    active: true,
    muted: false,
    solo: false,
    session: createPluginSession(p.plugin, p.identity),
  }));
  const planner = new BarPlanner(new MusicDirector(seed));
  const bars: PreparedBar[] = [],
    starts: number[] = [];
  let duration = 0.1;
  while (duration < seconds) {
    const bar = planner.prepare(tracks, (_, error) => {
      throw error;
    });
    starts.push(duration);
    bars.push(bar);
    duration += 240 / bar.plan.bpm;
  }
  const rate = 22050;
  const context = new OfflineAudioContext(
    performers.length * 2,
    Math.ceil((duration + 1) * rate),
    rate,
  );
  const merger = context.createChannelMerger(performers.length * 2);
  merger.connect(context.destination);
  const gains: Record<string, number> = {};
  const voices = await Promise.all(
    performers.map(async (p, i) => {
      const input = context.createGain(),
        split = context.createChannelSplitter(2);
      input.channelCount = 2;
      input.channelCountMode = "explicit";
      input.connect(split);
      split.connect(merger, 0, i * 2);
      split.connect(merger, 1, i * 2 + 1);
      return p.plugin.createVoice({
        createSynthVoice() {
          throw new Error("Samples required");
        },
        createPercussionVoice() {
          throw new Error("Samples required");
        },
        createSampleVoice(bank, performance) {
          gains[p.identity.instanceId] = bank.gainDb ?? 0;
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
  const encode = (data: Float32Array) => {
    const bytes = new Uint8Array(data.buffer),
      chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 16384)
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return btoa(chunks.join(""));
  };
  const stems = performers.map((p, i) => {
    const data = new Float32Array(buffer.length * 2),
      left = buffer.getChannelData(i * 2),
      right = buffer.getChannelData(i * 2 + 1);
    for (let frame = 0; frame < buffer.length; frame++) {
      data[frame * 2] = left[frame]! * 0.65;
      data[frame * 2 + 1] = right[frame]! * 0.65;
    }
    return { ...p.identity, data: encode(data) };
  });
  voices.forEach((voice) => voice.dispose());
  return {
    stems,
    metadata: {
      seed,
      mode: "Balanced",
      engineVersion: ENGINE_VERSION,
      performers: performers.map((p) => ({
        ...p.identity,
        pluginVersion: p.plugin.manifest.version,
      })),
      duration: buffer.duration,
      musicalDuration: duration,
      sampleRate: rate,
      channels: 2,
      master: 0.65,
      gains,
      starts,
      bars,
      rendering:
        "One real-sample multichannel render; Full is the sum of these stems. No limiter, compressor or Normalize. Chronological refill. Not realtime Transport recording.",
      humanListening: "Pending",
    },
  };
}
