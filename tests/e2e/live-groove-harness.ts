import * as Tone from "tone";
import { AudioEngine } from "../../src/audio/AudioEngine";
import type { PreparedBar } from "../../src/audio/AudioEngine";
import { EnsembleHost } from "../../src/core/EnsembleHost";
import type { HostSnapshot } from "../../src/core/EnsembleHost";

/** Test-only observation of the app's existing Host/engine; never replaces its clock. */
export function observeLiveGroove() {
  const bars: PreparedBar[] = [];
  const snapshots: HostSnapshot[] = [];
  const ticks: number[] = [];
  const commands: unknown[] = [];
  const played: {
    id: string;
    bar: number;
    groove: string;
    time: number;
    duration?: number;
  }[] = [];
  const voiceIds = new WeakMap<object, number>();
  const voices: { id: string; ownership: number }[] = [];
  let nextVoice = 0,
    starts = 0,
    stops = 0,
    tracks = 0;
  let getHostSnapshot: (() => HostSnapshot) | undefined;
  const context = Tone.getContext();
  const rawContext = context.rawContext;
  const transport = Tone.getTransport();
  const start = AudioEngine.prototype.start;
  const stop = AudioEngine.prototype.stop;
  const schedule = AudioEngine.prototype.scheduleBar;
  const createTrack = AudioEngine.prototype.createTrack;
  const setVoice = AudioEngine.prototype.setVoice;
  const request = EnsembleHost.prototype.requestGroove;
  AudioEngine.prototype.start = function (bpm) {
    starts++;
    return start.call(this, bpm);
  };
  AudioEngine.prototype.stop = function () {
    stops++;
    return stop.call(this);
  };
  AudioEngine.prototype.createTrack = function (id) {
    tracks++;
    return createTrack.call(this, id);
  };
  AudioEngine.prototype.setVoice = function (id, voice) {
    if (!voiceIds.has(voice)) voiceIds.set(voice, ++nextVoice);
    voices.push({ id, ownership: voiceIds.get(voice)! });
    const play = voice.play.bind(voice);
    voice.play = (event, time, secondsPerStep) => {
      const bar = bars.find((bar) =>
        bar.tracks.some(
          (track) => track.id === id && track.events.includes(event),
        ),
      );
      if (!bar) throw new Error("Played event was not in a submitted plan");
      played.push({
        id,
        bar: bar.plan.barIndex,
        groove: bar.plan.groovePlan!.familyId,
        time,
        ...(event.kind === "note"
          ? { duration: event.durationSteps * secondsPerStep }
          : {}),
      });
      play(event, time, secondsPerStep);
    };
    return setVoice.call(this, id, voice);
  };
  AudioEngine.prototype.scheduleBar = function (bar, boundary) {
    bars.push(bar);
    return schedule.call(this, bar, (prepared) => {
      boundary(prepared);
      if (getHostSnapshot) snapshots.push(getHostSnapshot());
    });
  };
  EnsembleHost.prototype.requestGroove = function (target, options) {
    getHostSnapshot = () => this.getSnapshot();
    const command = request.call(this, target, options);
    commands.push(command);
    snapshots.push(this.getSnapshot());
    return command;
  };
  const sample = () => {
    const tick = transport.getTicksAtTime(Tone.immediate());
    ticks.push(tick);
    return {
      starts,
      stops,
      tracks,
      voices: [...voices],
      sameContext:
        context === Tone.getContext() &&
        rawContext === Tone.getContext().rawContext,
      sameTransport: transport === Tone.getTransport(),
      swing: transport.swing,
      tick,
      seed: getHostSnapshot?.().seed,
      controls: getHostSnapshot?.().controls,
      currentGroove: getHostSnapshot?.().music.groovePlan?.familyId,
      running: getHostSnapshot?.().running,
      bars,
      snapshots,
      ticks,
      commands,
      played,
    };
  };
  Object.assign(window, {
    liveGrooveProbe: {
      sample,
      suspend: () => (rawContext as AudioContext).suspend(),
      resume: () => (rawContext as AudioContext).resume(),
    },
  });
}
