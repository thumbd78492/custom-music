import type {
  InstrumentVoice,
  SampleBank,
  SampleRegion,
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
  readonly attackEnd: number;
  readonly peak: number;
  releaseAt: number;
  end: number;
  releaseGain: number;
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
    return new SampleVoice(context, destination, bank, regions);
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
  ) {}

  private level(sound: Sound, time: number): number {
    if (time <= sound.start || time >= sound.end) return 0;
    if (time >= sound.releaseAt)
      return (
        (sound.releaseGain * (sound.end - time)) / (sound.end - sound.releaseAt)
      );
    return (
      sound.peak *
      Math.min(1, (time - sound.start) / (sound.attackEnd - sound.start))
    );
  }

  private release(sound: Sound, time: number, duration: number) {
    if (time >= sound.end) return;
    const level = this.level(sound, time);
    // Preserve the in-flight ramp up to this instant. cancelScheduledValues
    // would remove its endpoint and turn the preceding segment into a jump.
    sound.gain.gain.cancelAndHoldAtTime(time);
    sound.gain.gain.setValueAtTime(level, time);
    sound.releaseAt = time;
    sound.releaseGain = level;
    sound.end =
      time <= sound.start ? time : Math.min(sound.end, time + duration);
    sound.gain.gain.linearRampToValueAtTime(0, sound.end);
    sound.source.stop(sound.end);
  }

  play(event: MusicEvent, audioTimeSec: number, secondsPerStep: number): void {
    if (this.disposed || event.velocity <= 0) return;
    // A throttled callback must never compress overdue music into a burst.
    if (audioTimeSec < this.context.currentTime - 0.02) return;
    const time = Math.max(audioTimeSec, this.context.currentTime);
    const candidates = this.regions.filter(
      (region) =>
        event.velocity >= (region.minVelocity ?? 0) &&
        event.velocity <= (region.maxVelocity ?? 1) &&
        (event.kind === "note"
          ? this.bank.kind === "pitched"
          : region.key === event.sampleKey),
    );
    const region =
      event.kind === "note"
        ? candidates.sort(
            (a, b) =>
              Math.abs(a.midi! - event.midi) - Math.abs(b.midi! - event.midi),
          )[0]
        : candidates[0];
    if (!region) throw new Error("No sample region covers this event");
    if (this.bank.monophonic) {
      for (const sound of this.sounds)
        this.release(sound, time, this.bank.transitionSeconds ?? 0.04);
    }
    // Dispose voices that have already ended even if onended delivery was throttled.
    for (const sound of this.sounds)
      if (sound.end <= this.context.currentTime) this.clean(sound);
    if (this.sounds.size >= (this.bank.maxVoices ?? 32)) {
      const oldest = this.sounds.values().next().value;
      if (oldest) {
        // A short audio-time fade prevents a hard stealing click; clean onended.
        this.release(oldest, time, 0.008);
      }
      // Bounded excess during the stealing fades, including malicious simultaneous events.
      if (this.sounds.size >= (this.bank.maxVoices ?? 32) * 2) return;
    }
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
    const naturalEnd = time + region.buffer.duration / rate;
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
      time + (this.bank.attackSeconds ?? 0.003),
      releaseAt,
    );
    const peak = event.velocity * 10 ** ((this.bank.gainDb ?? 0) / 20);
    const sound: Sound = {
      source,
      gain,
      start: time,
      attackEnd,
      peak,
      releaseAt,
      end,
      releaseGain: peak,
    };
    source.connect(gain);
    gain.connect(this.destination);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);
    gain.gain.setValueAtTime(peak, releaseAt);
    gain.gain.linearRampToValueAtTime(0, end);
    source.onended = () => this.clean(sound);
    this.sounds.add(sound);
    source.start(time);
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
