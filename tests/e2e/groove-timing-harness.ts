import * as Tone from "tone";
import { AudioEngine } from "../../src/audio/AudioEngine";
import { MusicDirector } from "../../src/core/MusicDirector";
import {
  createGroovePlan,
  mapPlaybackEvents,
  playbackSecondsPerStep,
  PPQ,
  TICKS_PER_BAR,
} from "../../src/core/GroovePlan";
import type { BarPlan, MusicEvent } from "../../src/contracts/music";
import { createVoice } from "../../src/instruments/violin/voice";
import { loadSampleVoice } from "../../src/audio/SampleVoice";
import type { SamplePlayback } from "../../src/contracts/instrument";
import { prefixError, rms } from "./violin-quality-harness";

const steps = [0, 1, 2, 3, 4, 6, 10, 14];
function plans(stepped: boolean) {
  const director = new MusicDirector("groove-timing-native");
  return Array.from({ length: 6 }, (_, barIndex): BarPlan => {
    const base = {
      ...director.planBar(barIndex),
      bpm: stepped ? [180, 180, 160, 160, 200, 200][barIndex]! : 180,
    };
    return Object.freeze({
      ...base,
      groovePlan: createGroovePlan(
        base,
        ["light-swing", "half-time", "straight"][Math.floor(barIndex / 2)] as
          "straight" | "light-swing" | "half-time",
        barIndex,
      ),
    });
  });
}
const events = (bar: number): readonly MusicEvent[] =>
  steps.map((step) => ({
    kind: "note",
    step,
    midi: 60,
    velocity: 0.5,
    durationSteps: step < 4 ? 1 : 1.8,
    articulation: String(bar),
  }));

/** Measures callback audio timestamps, never arrival wall-clock jitter or sample attack. */
export async function measureGrooveTransport(stepped: boolean) {
  await Tone.start();
  const context = Tone.getContext();
  const transport = Tone.getTransport();
  const engine = new AudioEngine();
  const bars = plans(stepped);
  const calls: {
    id: string;
    bar: number;
    step: number;
    time: number;
    duration: number;
  }[] = [];
  const positions: { tick: number; time: number }[] = [];
  let interval = 0;
  let releases = 0;
  try {
    for (const id of ["a", "b", "c"]) {
      engine.createTrack(id);
      engine.setVoice(id, {
        play(event, time, secondsPerStep) {
          if (event.kind !== "note") throw new Error("Expected note");
          calls.push({
            id,
            bar: Number(event.articulation),
            step: event.step,
            time,
            duration: event.durationSteps * secondsPerStep,
          });
        },
        releaseAll() {
          releases++;
        },
        dispose() {},
      });
    }
    for (const plan of bars) {
      const logical = events(plan.barIndex);
      engine.scheduleBar(
        {
          plan,
          tracks: ["a", "b", "c"].map((id) => ({
            id,
            active: true,
            muted: false,
            solo: false,
            events: logical,
            playbackEvents: mapPlaybackEvents(logical, plan),
          })),
        },
        () => {},
      );
    }
    engine.start(bars[0]!.bpm);
    interval = context.setInterval(
      () =>
        positions.push({
          tick: engine.currentTick(),
          time: context.immediate(),
        }),
      0.05,
    );
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        500 + bars.reduce((sum, plan) => sum + 240 / plan.bpm, 0) * 1000,
      ),
    );
    const swing = transport.swing;
    engine.stop();
    return {
      stepped,
      bars,
      calls,
      positions,
      releases,
      ppq: transport.PPQ,
      swing,
    };
  } finally {
    context.clearInterval(interval);
    engine.dispose();
  }
}

/** Three tracks with separate on/off impulse channels, so connected edges cannot cancel. */
export async function renderGrooveImpulses(stepped: boolean) {
  const rate = 48000;
  // Odd BPM values deliberately put mapped boundaries between PCM frames.
  const bars = plans(stepped).map((plan) => ({
    ...plan,
    bpm: stepped ? [181, 181, 173, 173, 197, 197][plan.barIndex]! : 181,
  }));
  const starts: number[] = [];
  let elapsed = 0.1;
  for (const plan of bars) {
    starts.push(elapsed);
    elapsed += 240 / plan.bpm;
  }
  const context = new OfflineAudioContext(
    6,
    Math.ceil((elapsed + 0.1) * rate),
    rate,
  );
  const merger = context.createChannelMerger(6);
  merger.connect(context.destination);
  const expected: {
    track: number;
    bar: number;
    step: number;
    boundary: "on" | "off";
    time: number;
    amplitude: number;
  }[] = [];
  for (let track = 0; track < 3; track++)
    for (const plan of bars)
      for (const playback of mapPlaybackEvents(events(plan.barIndex), plan)) {
        for (const [boundary, tick, amplitude] of [
          ["on", playback.onTick, 1],
          ["off", playback.offTick!, -0.5],
        ] as const) {
          const time =
            starts[plan.barIndex]! +
            (((tick - plan.barIndex * TICKS_PER_BAR) / PPQ) * 60) / plan.bpm;
          const buffer = context.createBuffer(1, 1, rate);
          buffer.getChannelData(0)[0] = amplitude;
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(merger, 0, track * 2 + (boundary === "off" ? 1 : 0));
          source.start(time);
          expected.push({
            track,
            bar: plan.barIndex,
            step: playback.event.step,
            boundary,
            time,
            amplitude,
          });
        }
      }
  const rendered = await context.startRendering();
  const measurements = expected.map((event) => {
    const data = rendered.getChannelData(
      event.track * 2 + (event.boundary === "off" ? 1 : 0),
    );
    const expectedFrame = event.time * rate;
    let actualFrame = -1;
    for (
      let frame = Math.floor(expectedFrame) - 2;
      frame <= Math.ceil(expectedFrame) + 2;
      frame++
    )
      if (
        Math.sign(data[frame] ?? 0) === Math.sign(event.amplitude) &&
        Math.abs(data[frame] ?? 0) > 0.000001
      ) {
        actualFrame = frame;
        break;
      }
    return {
      ...event,
      expectedFrame,
      actualFrame,
      errorSamples:
        actualFrame < 0
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(actualFrame - expectedFrame),
    };
  });
  const errors = measurements
    .map((event) => event.errorSamples)
    .sort((a, b) => a - b);
  return {
    stepped,
    sampleRate: rate,
    tracks: 3,
    diagnosticChannels: 6,
    measurements,
    maxErrorSamples: errors.at(-1)!,
    p95ErrorSamples: errors[Math.floor((errors.length - 1) * 0.95)]!,
  };
}

/** Real preserved violin voice, logging source note-off/stop and fixed bow policy. */
export async function renderWarpedViolin(stopAt?: number) {
  const rate = 44100;
  const context = new OfflineAudioContext(1, 3 * rate, rate);
  const original = context.createBufferSource.bind(context);
  const sources: {
    start: number;
    offset: number;
    stops: number[];
    rates: number[];
    rateRamps: number;
    ended: boolean;
    disconnected: number;
  }[] = [];
  let active = 0;
  context.createBufferSource = () => {
    const source = original();
    const record = {
      start: 0,
      offset: 0,
      stops: [] as number[],
      rates: [] as number[],
      rateRamps: 0,
      ended: false,
      disconnected: 0,
    };
    sources.push(record);
    active++;
    const start = source.start.bind(source),
      stop = source.stop.bind(source),
      disconnect = source.disconnect.bind(source);
    source.start = (time = 0, offset = 0) => {
      record.start = time;
      record.offset = offset;
      start(time, offset);
    };
    source.stop = (time = 0) => {
      record.stops.push(time);
      stop(time);
    };
    source.disconnect = () => {
      record.disconnected++;
      active--;
      disconnect();
    };
    source.addEventListener("ended", () => {
      record.ended = true;
    });
    const setRate = source.playbackRate.setValueAtTime.bind(
        source.playbackRate,
      ),
      ramp = source.playbackRate.linearRampToValueAtTime.bind(
        source.playbackRate,
      );
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
  const base = { ...new MusicDirector("warped-violin").planBar(0), bpm: 90 };
  const plan = {
    ...base,
    groovePlan: createGroovePlan(base, "light-swing", 2),
  };
  const logical = [76, 77, 77, 79].map((midi, index): MusicEvent => ({
    kind: "note",
    step: index * 2,
    durationSteps: 2,
    midi,
    velocity: 0.6,
    articulation: "legato",
  }));
  const mapped = mapPlaybackEvents(logical, plan);
  const playback: SamplePlayback[] = [];
  const voice = await createVoice({
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
        new AbortController().signal,
        (...args) => {
          const selected = performance!(...args);
          playback.push(selected);
          return selected;
        },
      );
    },
  });
  for (const event of mapped)
    voice.play(
      event.event,
      0.1 + ((event.onTick / PPQ) * 60) / plan.bpm,
      playbackSecondsPerStep(event, plan.bpm),
    );
  if (stopAt !== undefined) voice.releaseAll(stopAt);
  const rendered = await context.startRendering();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const activeAfterRendering = active;
  const data = new Float32Array(rendered.getChannelData(0));
  voice.dispose();
  const waveform = Array.from(data);
  return {
    plan,
    logical,
    mapped,
    playback,
    sources,
    activeAfterRendering,
    activeAfterDispose: active,
    rms: rms(data, 0.2, 1.4),
    silenceAfterStop: rms(data, (stopAt ?? 1.5) + 0.4, 2.8),
    waveform,
  };
}

export function compareWarpedPrefixes(
  reference: number[],
  stopped: number[],
  until: number,
) {
  return prefixError(
    new Float32Array(reference),
    new Float32Array(stopped),
    until,
  );
}
