import type {
  InstrumentVoice,
  SampleBank,
  SampleRegion,
  SamplePerformance,
  SamplePlayback,
} from "../contracts/instrument";
import type { MusicEvent } from "../contracts/music";

/** The same audio context as Transport, or an OfflineAudioContext for rendering tests. */
export type SampleContext = Pick<
  BaseAudioContext,
  "currentTime" | "createBufferSource" | "createGain" | "decodeAudioData"
>;

interface Region extends SampleRegion {
  readonly key: string;
  readonly buffer: AudioBuffer;
}
interface Sound {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly start: number;
  readonly regionKey: string;
  readonly midi?: number;
  readonly naturalEnd: number;
  envelope: { time: number; value: number }[];
  releaseAt: number;
  end: number;
}

function validate(bank: SampleBank) {
  if (!Object.keys(bank.urls).length)
    throw new Error("Sample bank has no sample URLs");
  if (!bank.licenseRecord.trim())
    throw new Error("Sample bank needs a license record");
  if (!Number.isFinite(bank.releaseSeconds) || bank.releaseSeconds < 0.005)
    throw new Error("Sample release must be at least 5 ms");
  if (
    !Number.isFinite(bank.attackSeconds ?? 0.003) ||
    (bank.attackSeconds ?? 0.003) < 0.001
  )
    throw new Error("Sample attack must be at least 1 ms");
  if (!Number.isFinite(bank.gainDb ?? 0))
    throw new Error("Invalid sample gain");
  if (
    !Number.isFinite(bank.transitionSeconds ?? 0.04) ||
    (bank.transitionSeconds ?? 0.04) < 0.005
  )
    throw new Error("Sample transition must be at least 5 ms");
  if (!Number.isInteger(bank.maxVoices ?? 32) || (bank.maxVoices ?? 32) < 1)
    throw new Error("Invalid sample polyphony");
}

function abortError() {
  return new DOMException("Sample loading cancelled", "AbortError");
}

/** Fetches only the requesting plugin's assets; no synth or partial-bank fallback. */
export async function loadSampleVoice(
  context: SampleContext,
  destination: AudioNode,
  bank: SampleBank,
  signal: AbortSignal,
  performance?: SamplePerformance,
): Promise<InstrumentVoice> {
  validate(bank);
  if (signal.aborted) throw abortError();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  let aborted: (() => void) | undefined;
  try {
    const cancellation = new Promise<never>((_, reject) => {
      aborted = () =>
        reject(
          timedOut
            ? new Error("Sample loading timed out after 20 s")
            : abortError(),
        );
      controller.signal.addEventListener("abort", aborted, { once: true });
    });
    const loading = Promise.all(
      Object.entries(bank.urls).map(async ([key, url]): Promise<Region> => {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (controller.signal.aborted) throw abortError();
          if (
            !buffer.length ||
            !Number.isFinite(buffer.duration) ||
            buffer.duration < 0.01
          )
            throw new Error("Empty or invalid decoded audio");
          const region = bank.regions?.[key] ?? {};
          const midi = region.midi ?? Number(key);
          if (!Number.isFinite(region.tuneCents ?? 0))
            throw new Error("Invalid sample tuning");
          if (!Number.isFinite(region.gainDb ?? 0))
            throw new Error("Invalid region gain");
          if (
            bank.kind === "pitched" &&
            (!Number.isFinite(midi) || midi < 0 || midi > 127)
          )
            throw new Error("Pitched sample needs a MIDI root");
          const min = region.minVelocity ?? 0;
          const max = region.maxVelocity ?? 1;
          if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            min < 0 ||
            max > 1 ||
            min > max
          )
            throw new Error("Invalid velocity region");
          if (region.loopStart !== undefined || region.loopEnd !== undefined) {
            if (
              region.loopStart === undefined ||
              region.loopEnd === undefined ||
              !Number.isFinite(region.loopStart) ||
              !Number.isFinite(region.loopEnd) ||
              region.loopStart < 0 ||
              region.loopEnd <= region.loopStart ||
              region.loopEnd > buffer.duration
            )
              throw new Error("Invalid sustain loop");
          }
          return { ...region, midi, key, buffer };
        } catch (error) {
          if (controller.signal.aborted) throw abortError();
          throw new Error(`Sample ${key} (${url}) failed: ${String(error)}`);
        }
      }),
    );
    const regions = await Promise.race([loading, cancellation]);
    if (signal.aborted) throw abortError();
    return new SampleVoice(context, destination, bank, regions, performance);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    if (aborted) controller.signal.removeEventListener("abort", aborted);
    controller.abort();
  }
}

/** Generic buffer playback; all mapping and performance policy comes from the plugin. */
class SampleVoice implements InstrumentVoice {
  private readonly sounds = new Set<Sound>();
  private disposed = false;

  constructor(
    private readonly context: SampleContext,
    private readonly destination: AudioNode,
    private readonly bank: SampleBank,
    private regions: Region[],
    private readonly performance?: SamplePerformance,
  ) {}

  private level(sound: Sound, time: number): number {
    if (time <= sound.start || time >= sound.end) return 0;
    let previous = sound.envelope[0]!;
    for (const next of sound.envelope.slice(1)) {
      if (time < next.time)
        return (
          previous.value +
          ((next.value - previous.value) * (time - previous.time)) /
            (next.time - previous.time)
        );
      previous = next;
    }
    return previous.value;
  }

  private replaceEnvelope(
    sound: Sound,
    time: number,
    points: { time: number; value: number }[],
  ) {
    const value = this.level(sound, time);
    // Keep the previously scheduled attack/transition prefix even during Stop.
    sound.gain.gain.cancelAndHoldAtTime(time);
    sound.gain.gain.setValueAtTime(value, time);
    sound.envelope = [
      ...sound.envelope.filter((point) => point.time < time),
      { time, value },
      ...points,
    ];
    for (const point of points)
      sound.gain.gain.linearRampToValueAtTime(point.value, point.time);
  }

  private curve(time: number, end: number, level: number, incoming: boolean) {
    // Piecewise-linear sine/cosine permits exact cancellation and level tracking.
    return Array.from({ length: 16 }, (_, i) => {
      const fraction = (i + 1) / 16;
      return {
        time: time + (end - time) * fraction,
        value:
          level *
          (incoming
            ? Math.sin((fraction * Math.PI) / 2)
            : Math.cos((fraction * Math.PI) / 2)),
      };
    });
  }

  private release(
    sound: Sound,
    time: number,
    duration: number,
    equalPower = false,
  ) {
    if (time >= sound.end) return;
    const level = this.level(sound, time);
    const end =
      time <= sound.start ? time : Math.min(sound.end, time + duration);
    this.replaceEnvelope(
      sound,
      time,
      equalPower && end > time
        ? this.curve(time, end, level, false)
        : [{ time: end, value: 0 }],
    );
    sound.releaseAt = time;
    sound.end = end;
    sound.source.stop(end);
  }

  play(event: MusicEvent, audioTimeSec: number, secondsPerStep: number): void {
    if (this.disposed || event.velocity <= 0) return;
    // A throttled callback must never compress overdue music into a burst.
    if (audioTimeSec < this.context.currentTime - 0.02) return;
    const time = Math.max(audioTimeSec, this.context.currentTime);
    const playback = this.performance?.(event, time, secondsPerStep) ?? {};
    this.validatePlayback(playback);
    const candidates = this.regions.filter(
      (region) =>
        event.velocity >= (region.minVelocity ?? 0) &&
        event.velocity <= (region.maxVelocity ?? 1) &&
        (event.kind === "note"
          ? this.bank.kind === "pitched"
          : region.key === event.sampleKey),
    );
    const defaultRegion =
      event.kind === "note"
        ? candidates.sort(
            (a, b) =>
              Math.abs(a.midi! - event.midi) - Math.abs(b.midi! - event.midi),
          )[0]
        : candidates[0];
    const layers = playback.layers
      ?.map((layer) => ({
        region: this.regions.find((region) => region.key === layer.key),
        weight: layer.weight,
      }))
      .filter((layer) => layer.weight > 0) ?? [
      { region: defaultRegion, weight: 1 },
    ];
    if (!layers.length || layers.some((layer) => !layer.region))
      throw new Error("No sample region covers this event");
    if (
      layers.some(
        (layer) =>
          (playback.offsetSeconds ?? 0) >= layer.region!.buffer.duration,
      )
    )
      throw new Error("Sample offset exceeds recording");
    // Dispose voices that have already ended even if onended delivery was throttled.
    for (const sound of this.sounds)
      if (sound.end <= this.context.currentTime) this.clean(sound);
    const matching = [...this.sounds].filter(
      (sound) =>
        sound.start < time &&
        sound.end > time &&
        sound.naturalEnd > time + 0.04 &&
        event.kind === "note" &&
        sound.midi === event.midi &&
        layers.some((layer) => layer.region!.key === sound.regionKey),
    );
    if (
      playback.continueMatching &&
      matching.length === layers.length &&
      layers.every((layer) =>
        matching.some((sound) => sound.regionKey === layer.region!.key),
      )
    ) {
      for (const layer of layers) {
        const sound = matching.find(
          (sound) => sound.regionKey === layer.region!.key,
        )!;
        const releaseAt = Math.min(
          time +
            (event.kind === "note" ? event.durationSteps * secondsPerStep : 0),
          sound.naturalEnd - 0.04,
        );
        const end = Math.min(
          releaseAt + this.bank.releaseSeconds,
          sound.naturalEnd,
        );
        const peak =
          event.velocity *
          10 ** (((this.bank.gainDb ?? 0) + (layer.region!.gainDb ?? 0)) / 20) *
          layer.weight;
        this.replaceEnvelope(sound, time, [
          {
            time: Math.min(time + (playback.attackSeconds ?? 0.04), releaseAt),
            value: peak,
          },
          { time: releaseAt, value: peak },
          { time: end, value: 0 },
        ]);
        sound.releaseAt = releaseAt;
        sound.end = end;
        // Web Audio stop calls replace a future stop; the source is never restarted.
        sound.source.stop(end);
      }
      return;
    }
    const transition =
      playback.transitionSeconds ?? this.bank.transitionSeconds ?? 0.04;
    const transitioning =
      this.bank.monophonic &&
      [...this.sounds].some((sound) => sound.start < time && sound.end > time);
    if (this.bank.monophonic)
      for (const sound of this.sounds)
        this.release(sound, time, transition, playback.equalPowerTransition);
    const maximum = this.bank.maxVoices ?? 32;
    if (this.sounds.size + layers.length > maximum) {
      for (const sound of [...this.sounds].slice(0, layers.length))
        this.release(sound, time, 0.008);
      if (this.sounds.size + layers.length > maximum * 2) return;
    }
    for (const layer of layers)
      this.start(
        event,
        time,
        secondsPerStep,
        layer.region!,
        layer.weight,
        playback,
        !!transitioning,
      );
  }

  private validatePlayback(playback: SamplePlayback) {
    if (
      !Number.isFinite(playback.offsetSeconds ?? 0) ||
      (playback.offsetSeconds ?? 0) < 0 ||
      !Number.isFinite(playback.attackSeconds ?? 0.001) ||
      (playback.attackSeconds ?? 0.001) < 0.001 ||
      !Number.isFinite(playback.transitionSeconds ?? 0.005) ||
      (playback.transitionSeconds ?? 0.005) < 0.005 ||
      (playback.layers &&
        (!playback.layers.length ||
          playback.layers.length > 4 ||
          new Set(playback.layers.map((layer) => layer.key)).size !==
            playback.layers.length ||
          playback.layers.some(
            (layer) =>
              !Number.isFinite(layer.weight) ||
              layer.weight < 0 ||
              layer.weight > 1,
          )))
    )
      throw new Error("Invalid sample playback primitives");
  }

  private start(
    event: MusicEvent,
    time: number,
    secondsPerStep: number,
    region: Region,
    weight: number,
    playback: SamplePlayback,
    transitioning: boolean,
  ) {
    const offset = playback.offsetSeconds ?? 0;
    if (offset >= region.buffer.duration)
      throw new Error("Sample offset exceeds recording");
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = region.buffer;
    const rate =
      event.kind === "note"
        ? 2 **
          ((event.midi - region.midi! + (region.tuneCents ?? 0) / 100) / 12)
        : 1;
    source.playbackRate.setValueAtTime(rate, time);
    if (region.loopStart !== undefined && region.loopEnd !== undefined) {
      source.loop = true;
      source.loopStart = region.loopStart;
      source.loopEnd = region.loopEnd;
    }
    const naturalEnd = source.loop
      ? Infinity
      : time + (region.buffer.duration - offset) / rate;
    const requestedRelease =
      event.kind === "note"
        ? time + event.durationSteps * secondsPerStep
        : naturalEnd;
    const end = source.loop
      ? requestedRelease + this.bank.releaseSeconds
      : Math.min(naturalEnd, requestedRelease + this.bank.releaseSeconds);
    const releaseAt =
      event.kind === "hit"
        ? Math.max(time, end - 0.012)
        : Math.max(
            time,
            Math.min(
              requestedRelease,
              end - Math.min(0.04, this.bank.releaseSeconds),
            ),
          );
    const attackEnd = Math.min(
      time + (playback.attackSeconds ?? this.bank.attackSeconds ?? 0.003),
      releaseAt,
    );
    const peak =
      event.velocity *
      10 ** (((this.bank.gainDb ?? 0) + (region.gainDb ?? 0)) / 20) *
      weight;
    const attack =
      transitioning && playback.equalPowerTransition
        ? this.curve(time, attackEnd, peak, true)
        : [{ time: attackEnd, value: peak }];
    const envelope = [
      { time, value: 0 },
      ...attack,
      { time: releaseAt, value: peak },
      { time: end, value: 0 },
    ];
    const sound: Sound = {
      source,
      gain,
      start: time,
      regionKey: region.key,
      midi: event.kind === "note" ? event.midi : undefined,
      naturalEnd,
      envelope,
      releaseAt,
      end,
    };
    source.connect(gain);
    gain.connect(this.destination);
    gain.gain.setValueAtTime(0, time);
    for (const point of attack)
      gain.gain.linearRampToValueAtTime(point.value, point.time);
    gain.gain.setValueAtTime(peak, releaseAt);
    gain.gain.linearRampToValueAtTime(0, end);
    source.onended = () => this.clean(sound);
    this.sounds.add(sound);
    if (offset) source.start(time, offset);
    else source.start(time);
    source.stop(end);
  }

  private clean(sound: Sound) {
    sound.source.onended = null;
    sound.source.disconnect();
    sound.gain.disconnect();
    this.sounds.delete(sound);
  }

  releaseAll(audioTimeSec: number): void {
    const time = Math.max(audioTimeSec, this.context.currentTime);
    for (const sound of this.sounds)
      this.release(sound, time, this.bank.releaseSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const sound of this.sounds) {
      sound.source.stop();
      this.clean(sound);
    }
    this.regions = [];
  }
}
