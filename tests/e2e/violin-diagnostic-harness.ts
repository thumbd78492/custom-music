import { loadSampleVoice } from "../../src/audio/SampleVoice";
import { sampleBank } from "../../src/instruments/violin/samples";
import { createPerformance } from "../../src/instruments/violin/performance";
import {
  baselineBank,
  createBaselinePerformance,
} from "./violin-diagnostic-baseline";
import type {
  SampleBank,
  SamplePlayback,
} from "../../src/contracts/instrument";
import type { MusicEvent } from "../../src/contracts/music";
import { rms, waveBase64 } from "./violin-quality-harness";
import frozenData from "../fixtures/violin-m2-frozen-ensemble.json";
import type { PreparedBar } from "../../src/audio/AudioEngine";

export type Variant =
  | "dual-current"
  | "soft-current"
  | "loud-current"
  | "dual-stable"
  | "soft-stable"
  | "loud-stable"
  | "loud-stable-restart"
  | "candidate";
export interface DiagnosticNote {
  time: number;
  event: Extract<MusicEvent, { kind: "note" }>;
  secondsPerStep: number;
}
export interface SourceRecord {
  id: number;
  key: string;
  time: number;
  offset: number;
  playbackRate: number;
  stops: number[];
  disconnected: number;
}
export function sequence(
  kind:
    | "scale"
    | "bows"
    | "lengths"
    | "lengths-low"
    | "lengths-high"
    | "same"
    | "frozen",
  velocity = 0.56,
): DiagnosticNote[] {
  const notes: DiagnosticNote[] = [];
  let time = 0.1;
  if (kind === "frozen") {
    for (const bar of frozenData.bars as unknown as readonly PreparedBar[]) {
      for (const event of bar.tracks.find((track) => track.id === "violin")!
        .events)
        if (event.kind === "note")
          notes.push({
            event,
            time: time + (event.step * 15) / bar.plan.bpm,
            secondsPerStep: 15 / bar.plan.bpm,
          });
      time += 240 / bar.plan.bpm;
    }
    return notes;
  }
  const add = (
    midi: number,
    duration: number,
    articulation: string,
    gap = 0,
  ) => {
    notes.push({
      time,
      event: {
        kind: "note",
        step: 0,
        midi,
        velocity,
        durationSteps: duration,
        articulation,
      },
      secondsPerStep: 1,
    });
    time += duration + gap;
  };
  if (kind === "scale") {
    const pitches = [
      ...Array.from({ length: 16 }, (_, i) => 69 + i),
      ...Array.from({ length: 16 }, (_, i) => 84 - i),
    ];
    pitches.forEach((midi, i) =>
      add(midi, 0.75, i === 0 ? "detached" : i === 16 ? "rebow" : "legato"),
    );
  } else if (kind === "bows") {
    // Every pitch, each bow, identical velocity and length; no hidden crescendo.
    for (let midi = 69; midi <= 84; midi++) {
      add(midi, 0.5, "detached");
      add(midi, 0.5, "legato");
      add(midi, 0.5, "rebow");
    }
  } else if (kind === "lengths-low" || kind === "lengths-high") {
    const first = kind === "lengths-low" ? 69 : 77;
    for (let midi = first; midi < first + 8; midi++) {
      add(midi, 0.26, "detached", 0.12);
      add(midi, 0.6, "rebow");
      add(midi, 1.9, "legato", 0.12);
    }
  } else if (kind === "lengths") {
    for (const midi of [69, 72, 76, 79, 81, 84]) {
      add(midi, 0.3, "detached", 0.12);
      add(midi, 0.9, "detached");
      add(midi, 2.4, "legato", 0.12);
    }
  } else {
    for (const midi of [72, 76, 79, 81, 84]) {
      add(midi, 0.6, "detached");
      add(midi, 0.6, "legato");
      add(midi, 0.6, "legato");
      add(midi, 0.6, "rebow", 0.15);
      add(midi, 2.1, "detached", 0.15);
    }
  }
  return notes;
}
const db = (value: number) => (value > 0 ? 20 * Math.log10(value) : -120);
const rate = 44100;
const buffers = new Map<string, AudioBuffer>();
async function bufferFor(
  context: BaseAudioContext,
  key: string,
  bank: SampleBank,
) {
  if (!buffers.has(key))
    buffers.set(
      key,
      await context.decodeAudioData(
        await (await fetch(bank.urls[key]!)).arrayBuffer(),
      ),
    );
  return buffers.get(key)!;
}
function curves(data: Float32Array, from: number, to: number) {
  return [0.02, 0.1].map((width) => ({
    widthSeconds: width,
    hopSeconds: 0.005,
    points: Array.from(
      { length: Math.max(0, Math.floor((to - from - width) / 0.005) + 1) },
      (_, i) => {
        const time = from + i * 0.005;
        return { time, rmsDbfs: db(rms(data, time, time + width, rate)) };
      },
    ),
  }));
}

/** Only the Violin bank is loaded. Source interception records actual Web Audio starts. */
export async function renderDiagnostic(
  notes: DiagnosticNote[],
  variant: Variant,
) {
  const bank = variant === "candidate" ? sampleBank : baselineBank;
  const selector =
    variant === "candidate"
      ? createPerformance().select
      : createBaselinePerformance().select;
  const duration = Math.max(
    25,
    ...notes.map(
      (n) => n.time + n.event.durationSteps * n.secondsPerStep + 0.9,
    ),
  );
  const context = new OfflineAudioContext(1, Math.ceil(duration * rate), rate);
  await Promise.all(
    Object.keys(bank.urls).map((key) => bufferFor(context, key, bank)),
  );
  const sources: SourceRecord[] = [];
  const create = context.createBufferSource.bind(context);
  context.createBufferSource = () => {
    const source = create();
    const record: SourceRecord = {
      id: sources.length,
      key: "",
      time: 0,
      offset: 0,
      playbackRate: 1,
      stops: [],
      disconnected: 0,
    };
    sources.push(record);
    const start = source.start.bind(source),
      stop = source.stop.bind(source),
      disconnect = source.disconnect.bind(source);
    source.start = (time = 0, offset = 0) => {
      record.time = time;
      record.offset = offset;
      start(time, offset);
    };
    const set = source.playbackRate.setValueAtTime.bind(source.playbackRate);
    source.playbackRate.setValueAtTime = (value, time) => {
      record.playbackRate = value;
      return set(value, time);
    };
    source.stop = (time = 0) => {
      record.stops.push(time);
      stop(time);
    };
    source.disconnect = () => {
      record.disconnected++;
      disconnect();
    };
    return source;
  };
  const selected: {
    playback: SamplePlayback;
    sourceIds: number[];
    sourceOffsetsAtEvent: number[];
  }[] = [];
  let current: SamplePlayback;
  const voice = await loadSampleVoice(
    context,
    context.destination,
    bank,
    new AbortController().signal,
    (event, time, step) => {
      current = selector(event, time, step);
      if (variant.startsWith("soft"))
        current = {
          ...current,
          layers: [{ key: current.layers![0]!.key, weight: 1 }],
        };
      if (variant.startsWith("loud"))
        current = {
          ...current,
          layers: [{ key: current.layers![1]!.key, weight: 1 }],
        };
      if (variant.includes("stable"))
        current = { ...current, offsetSeconds: 1.2 };
      if (variant === "loud-stable-restart")
        current = { ...current, continueMatching: false };
      return current;
    },
  );
  const schedule = (note: DiagnosticNote) => {
    const previousCount = sources.length;
    voice.play(note.event, note.time, note.secondsPerStep);
    const activeLayers = current.layers!.filter((l) => l.weight > 0);
    const sourceIds: number[] = [];
    const offsets: number[] = [];
    activeLayers.forEach((layer, i) => {
      const created = sources[previousCount + i];
      const source =
        created ??
        [...sources]
          .reverse()
          .find(
            (s) =>
              s.key === layer.key &&
              s.time < note.time &&
              s.stops.at(-1)! > note.time,
          )!;
      if (created) source.key = layer.key;
      sourceIds.push(source.id);
      let position =
        source.offset + (note.time - source.time) * source.playbackRate;
      const region = bank.regions![layer.key]!;
      if (region.loopEnd !== undefined && position >= region.loopEnd)
        position =
          region.loopStart! +
          ((position - region.loopStart!) %
            (region.loopEnd - region.loopStart!));
      offsets.push(position);
    });
    selected.push({
      playback: current,
      sourceIds,
      sourceOffsetsAtEvent: offsets,
    });
  };
  schedule(notes[0]!);
  const suspensions = notes
    .slice(1)
    .map((n) => context.suspend(n.time - 0.025));
  const rendering = context.startRendering();
  for (let i = 1; i < notes.length; i++) {
    await suspensions[i - 1];
    schedule(notes[i]!);
    await context.resume();
  }
  const rendered = await rendering;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const waveform = new Float32Array(rendered.getChannelData(0));
  voice.dispose();

  // Isolate each actual source position/rate/layer for onset measurement. No previous note bleed.
  // Continued notes have no new onset and start at the original source's current loop position.
  let cursor = 0.1;
  const slots = notes.map((n) => {
    const slot = cursor;
    cursor += n.event.durationSteps * n.secondsPerStep + 0.4;
    return slot;
  });
  const isolatedContext = new OfflineAudioContext(
    3,
    Math.ceil((cursor + 0.5) * rate),
    rate,
  );
  const isolatedMerger = isolatedContext.createChannelMerger(3);
  isolatedMerger.connect(isolatedContext.destination);
  notes.forEach((note, i) => {
    const info = selected[i]!;
    const slot = slots[i]!;
    const seconds = note.event.durationSteps * note.secondsPerStep;
    info.playback
      .layers!.filter((l) => l.weight > 0)
      .forEach((layer, j) => {
        const source = isolatedContext.createBufferSource(),
          gain = isolatedContext.createGain();
        const region = bank.regions![layer.key]!;
        const actualSource = sources[info.sourceIds[j]!]!;
        source.buffer = buffers.get(layer.key)!;
        source.playbackRate.value = actualSource.playbackRate;
        source.loop = true;
        source.loopStart = region.loopStart!;
        source.loopEnd = region.loopEnd!;
        const level =
          note.event.velocity *
          10 ** ((bank.gainDb! + region.gainDb!) / 20) *
          layer.weight;
        const continued = actualSource.time < note.time;
        gain.gain.setValueAtTime(continued ? level : 0, slot);
        if (!continued) {
          if (info.playback.equalPowerTransition)
            for (let k = 1; k <= 16; k++)
              gain.gain.linearRampToValueAtTime(
                level * Math.sin(((k / 16) * Math.PI) / 2),
                slot + (info.playback.attackSeconds! * k) / 16,
              );
          else
            gain.gain.linearRampToValueAtTime(
              level,
              slot + info.playback.attackSeconds!,
            );
        }
        source.connect(gain);
        gain.connect(isolatedMerger, 0, 0);
        gain.connect(isolatedMerger, 0, j + 1);
        source.start(slot, info.sourceOffsetsAtEvent[j]);
        source.stop(slot + seconds);
      });
  });
  const isolatedBuffer = await isolatedContext.startRendering();
  const isolated = isolatedBuffer.getChannelData(0);
  const perNote = notes.map((note, i) => {
    const end = note.time + note.event.durationSteps * note.secondsPerStep;
    const slot = slots[i]!;
    const seconds = end - note.time;
    const stableFrom = note.time + Math.min(0.15, seconds * 0.35),
      stableTo = end - Math.min(0.04, seconds * 0.1);
    const stable = rms(waveform, stableFrom, stableTo, rate);
    const isolatedStable = rms(
      isolated,
      slot + stableFrom - note.time,
      slot + stableTo - note.time,
      rate,
    );
    let onsetDelaySeconds: number | null = null;
    for (let t = 0; t < seconds - 0.02; t += 0.005)
      if (
        rms(isolated, slot + t, slot + t + 0.02, rate) >=
        isolatedStable * 10 ** (-12 / 20)
      ) {
        onsetDelaySeconds = t;
        break;
      }
    const info = selected[i]!;
    const continued = info.sourceIds.some(
      (id) => sources[id]!.time < note.time,
    );
    const layerStable = info.sourceIds.map((_, j) =>
      rms(
        isolatedBuffer.getChannelData(j + 1),
        slot + stableFrom - note.time,
        slot + stableTo - note.time,
        rate,
      ),
    );
    const incoherent = Math.sqrt(
      layerStable.reduce((sum, r) => sum + r * r, 0),
    );
    return {
      index: i,
      midi: note.event.midi,
      articulation: note.event.articulation,
      velocity: note.event.velocity,
      start: note.time,
      end,
      secondsPerStep: note.secondsPerStep,
      durationSeconds: seconds,
      layers: info.playback
        .layers!.filter((l) => l.weight > 0)
        .map((l, j) => ({
          ...l,
          regionGainDb: bank.regions![l.key]!.gainDb,
          playbackRate: sources[info.sourceIds[j]!]!.playbackRate,
          sourceId: info.sourceIds[j],
          sourceStartOffset: sources[info.sourceIds[j]!]!.offset,
          effectiveOffset: info.sourceOffsetsAtEvent[j],
        })),
      requestedOffset: info.playback.offsetSeconds,
      continued,
      onsetDelaySeconds: continued ? null : onsetDelaySeconds,
      onsetThresholdDbBelowStable: 12,
      effectiveFrom: note.time + (onsetDelaySeconds ?? 0),
      effectiveTo: end,
      effectiveRmsDbfs: db(
        rms(isolated, slot + (onsetDelaySeconds ?? 0), slot + seconds, rate),
      ),
      onset100msRmsDbfs: db(
        rms(isolated, slot, slot + Math.min(0.1, seconds), rate),
      ),
      onset250msRmsDbfs: db(
        rms(isolated, slot, slot + Math.min(0.25, seconds), rate),
      ),
      stableFrom,
      stableTo,
      stableRmsDbfs: db(stable),
      isolatedStableRmsDbfs: db(isolatedStable),
      layerStableRmsDbfs: layerStable.map(db),
      incoherentStableRmsDbfs: db(incoherent),
      interferenceDb: db(isolatedStable) - db(incoherent),
      isolatedEnvelope: curves(isolated, slot, slot + seconds).map((c) => ({
        ...c,
        points: c.points.map((p) => ({
          time: p.time - slot + note.time,
          rmsDbfs: p.rmsDbfs,
        })),
      })),
    };
  });
  const adjacent = perNote.slice(1).map((note, i) => ({
    from: i,
    to: i + 1,
    differenceDb: note.stableRmsDbfs - perNote[i]!.stableRmsDbfs,
    isolatedDifferenceDb:
      note.isolatedStableRmsDbfs - perNote[i]!.isolatedStableRmsDbfs,
  }));
  const transitions = notes.slice(1).map((note, i) => {
    const referenceDbfs = Math.max(
      perNote[i]!.stableRmsDbfs,
      perNote[i + 1]!.stableRmsDbfs,
    );
    return {
      from: i,
      to: i + 1,
      time: note.time,
      gapSeconds: note.time - perNote[i]!.end,
      windows: [0.02, 0.1].map((width) => ({
        widthSeconds: width,
        beforeDbfs: db(rms(waveform, note.time - width, note.time, rate)),
        middleDbfs: db(
          rms(waveform, note.time - width / 2, note.time + width / 2, rate),
        ),
        afterDbfs: db(rms(waveform, note.time, note.time + width, rate)),
        referenceDbfs,
        raw: curves(
          waveform,
          Math.max(0, note.time - 0.15),
          note.time + 0.25,
        ).find((c) => c.widthSeconds === width)!.points,
      })),
    };
  });
  const worstAdjacent = adjacent.reduce(
    (worst, a) =>
      Math.abs(a.differenceDb) > Math.abs(worst.differenceDb) ? a : worst,
    adjacent[0]!,
  );
  const spanDb =
    Math.max(...perNote.map((n) => n.stableRmsDbfs)) -
    Math.min(...perNote.map((n) => n.stableRmsDbfs));
  const worstTransition = transitions
    .flatMap((t) =>
      t.windows.flatMap((w) =>
        w.raw.map((p) => ({
          from: t.from,
          to: t.to,
          width: w.widthSeconds,
          time: p.time,
          relativeDb: p.rmsDbfs - w.referenceDbfs,
        })),
      ),
    )
    .reduce((w, p) => (p.relativeDb < w.relativeDb ? p : w));
  return {
    variant,
    duration: rendered.duration,
    rate,
    master: 0.65,
    measurementPoint:
      "Violin output before Master; exported WAV includes unchanged Master 0.65",
    violinGainDb: bank.gainDb,
    normalisation: false,
    compressor: false,
    perNote,
    adjacent,
    transitions,
    sources,
    summary: {
      spanDb,
      worstAdjacent,
      worstTransition,
      maxOnsetDelaySeconds: Math.max(
        ...perNote.map((n) => n.onsetDelaySeconds ?? 0),
      ),
      allSourcesDisconnected: sources.every((s) => s.disconnected === 1),
    },
    waveform,
    wav: waveBase64(waveform),
  };
}
