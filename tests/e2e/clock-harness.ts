import * as Tone from "tone";
import { AudioEngine } from "../../src/audio/AudioEngine";
import { MusicDirector } from "../../src/core/MusicDirector";

export async function measureTransport() {
  await Tone.start();
  const context = Tone.getContext();
  const engine = new AudioEngine();
  const director = new MusicDirector("alpha");
  const plans = Array.from({ length: 18 }, (_, index) =>
    director.planBar(index),
  );
  const calls: {
    id: string;
    bar: number;
    step: number;
    time: number;
    secondsPerStep: number;
  }[] = [];
  const positions: { time: number; bar: number }[] = [];
  let releases = 0;
  let refill = 0;
  try {
    for (const id of ["a", "b", "c"]) {
      engine.createTrack(id);
      engine.setVoice(id, {
        play(event, time, secondsPerStep) {
          calls.push({
            id,
            bar: Number(event.kind === "note" ? event.articulation : -1),
            step: event.step,
            time,
            secondsPerStep,
          });
        },
        releaseAll() {
          releases++;
        },
        dispose() {},
      });
    }
    let next = 0;
    const schedule = () => {
      while (next < plans.length && next <= engine.currentBar() + 2) {
        const plan = plans[next++]!;
        engine.scheduleBar(
          {
            plan,
            tracks: ["a", "b", "c"].map((id) => ({
              id,
              active: true,
              muted: id === "b" && plan.barIndex >= 8 && plan.barIndex < 12,
              solo: false,
              events: [0, 4, 15].map((step) => ({
                kind: "note" as const,
                step,
                midi: 60,
                velocity: 0.5,
                durationSteps: 0.5,
                articulation: String(plan.barIndex),
              })),
            })),
          },
          () => {},
        );
      }
    };
    schedule();
    engine.start(plans[0]!.bpm);
    refill = context.setInterval(() => {
      positions.push({ time: context.immediate(), bar: engine.currentBar() });
      schedule();
    }, 0.05);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        600 + plans.reduce((sum, plan) => sum + 240 / plan.bpm, 0) * 1000,
      ),
    );
    engine.stop();
    return { calls, positions, plans, releases };
  } finally {
    context.clearInterval(refill);
    engine.dispose();
  }
}
