import { createVoice } from "../../src/instruments/violin/voice";
import { sampleBank } from "../../src/instruments/violin/samples";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type {
  SamplePlayback,
  SampleBank,
} from "../../src/contracts/instrument";
import type { MusicEvent } from "../../src/contracts/music";
import { pcm16Wave } from "../helpers/audio-metrics";

export interface TimedNote {
  time: number;
  midi: number;
  duration: number;
  velocity: number;
  articulation?: string;
}
export async function renderQuality(
  notes: TimedNote[],
  legacy = false,
  stopAt?: number,
  chronological = false,
) {
  const rate = 44100;
  const duration = Math.max(
    3,
    ...notes.map((note) => note.time + note.duration + 1),
  );
  const context = new OfflineAudioContext(1, Math.ceil(duration * rate), rate);
  const originalCreate = context.createBufferSource.bind(context);
  const records: {
    offset: number;
    rates: number[];
    rateRamps: number;
    disconnected: number;
    ended: boolean;
  }[] = [];
  let alive = 0,
    maxAlive = 0;
  context.createBufferSource = () => {
    const source = originalCreate();
    const record = {
      offset: 0,
      rates: [] as number[],
      rateRamps: 0,
      disconnected: 0,
      ended: false,
    };
    records.push(record);
    alive++;
    maxAlive = Math.max(maxAlive, alive);
    source.addEventListener("ended", () => {
      record.ended = true;
    });
    const start = source.start.bind(source),
      disconnect = source.disconnect.bind(source);
    const setRate = source.playbackRate.setValueAtTime.bind(
      source.playbackRate,
    );
    const ramp = source.playbackRate.linearRampToValueAtTime.bind(
      source.playbackRate,
    );
    source.start = (time = 0, offset = 0) => {
      record.offset = offset;
      start(time, offset);
    };
    source.disconnect = () => {
      record.disconnected++;
      alive--;
      disconnect();
    };
    source.playbackRate.setValueAtTime = (value, time) => {
      record.rates.push(value);
      return setRate(value, time);
    };
    source.playbackRate.linearRampToValueAtTime = (value, time) => {
      record.rateRamps++;
      return ramp(value, time);
    };
    return source;
  };
  const playback: SamplePlayback[] = [];
  const controller = new AbortController();
  const legacyBank: SampleBank = {
    ...sampleBank,
    regions: Object.fromEntries(
      Object.entries(sampleBank.regions!).map(([key, region]) => [
        key,
        {
          ...region,
          gainDb: 0,
          minVelocity: key.endsWith("-loud") ? 0.6 : 0,
          maxVelocity: key.endsWith("-soft") ? 0.6 : 1,
        },
      ]),
    ),
  };
  const voice = legacy
    ? await loadSampleVoice(
        context,
        context.destination,
        legacyBank,
        controller.signal,
      )
    : await createVoice({
        createSynthVoice() {
          throw new Error("Samples required");
        },
        createPercussionVoice() {
          throw new Error("Samples required");
        },
        createSampleVoice(bank, performance) {
          return loadSampleVoice(
            context,
            context.destination,
            bank,
            controller.signal,
            (...args) => {
              const selected = performance!(...args);
              playback.push(selected);
              return selected;
            },
          );
        },
      });
  const schedule = (note: TimedNote) => {
    const event: MusicEvent = {
      kind: "note",
      step: 0,
      midi: note.midi,
      velocity: note.velocity,
      durationSteps: note.duration,
      articulation: note.articulation,
    };
    voice.play(event, note.time, 1);
  };
  if (chronological) schedule(notes[0]!);
  else notes.forEach(schedule);
  if (stopAt !== undefined) voice.releaseAll(stopAt);
  const suspensions = chronological
    ? notes.slice(1).map((note) => context.suspend(note.time - 0.02))
    : [];
  const rendering = context.startRendering();
  for (let i = 1; i < notes.length && chronological; i++) {
    await suspensions[i - 1];
    schedule(notes[i]!);
    await context.resume();
  }
  const rendered = await rendering;
  // onended delivery can occur on the task following render completion.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const aliveAfterRendering = alive;
  const waveform = new Float32Array(rendered.getChannelData(0));
  voice.dispose();
  voice.dispose();
  return {
    waveform,
    duration: rendered.duration,
    rate,
    playback,
    records,
    maxAlive,
    aliveAfterRendering,
    aliveAfterDispose: alive,
  };
}

export function rms(
  data: Float32Array,
  from: number,
  to: number,
  rate = 44100,
) {
  const start = Math.floor(from * rate),
    end = Math.min(data.length, Math.floor(to * rate));
  let energy = 0;
  for (let i = start; i < end; i++) energy += data[i]! ** 2;
  return Math.sqrt(energy / Math.max(1, end - start));
}
export function prefixError(
  a: Float32Array,
  b: Float32Array,
  until: number,
  rate = 44100,
) {
  let error = 0;
  for (let i = 0; i < Math.floor(until * rate) - 1; i++)
    error = Math.max(error, Math.abs(a[i]! - b[i]!));
  return error;
}
export function waveBase64(mono: Float32Array) {
  const stereo = new Float32Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++)
    stereo[i * 2] = stereo[i * 2 + 1] = mono[i]! * 0.65;
  const bytes = pcm16Wave(stereo, 44100),
    chunks = [];
  for (let i = 0; i < bytes.length; i += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return btoa(chunks.join(""));
}
