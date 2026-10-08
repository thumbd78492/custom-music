import { beforeEach, expect, it, vi } from "vitest";
import { MasterMixer, TRACK_FADE_SECONDS } from "../../src/audio/MasterMixer";

const mock = vi.hoisted(() => ({
  gains: [] as {
    gain: {
      cancelAndHoldAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    dispose: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("tone", () => ({
  Gain: class {
    gain = { cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
    dispose = vi.fn();
    connect() {
      return this;
    }
    constructor() {
      mock.gains.push(this);
    }
  },
  Limiter: class {
    toDestination() {
      return this;
    }
    dispose = vi.fn();
  },
}));
beforeEach(() => {
  mock.gains.length = 0;
});

it("uses audio-time ramps for controls and keeps retired same-id gain ownership isolated", () => {
  const mixer = new MasterMixer();
  mixer.addTrack("track");
  const old = mock.gains[1]!;
  mixer.setAudible("track", true, 3);
  expect(old.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(3);
  expect(old.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    1,
    3 + TRACK_FADE_SECONDS,
  );
  const cleanup = mixer.retireTrack("track", 4);
  expect(old.dispose).not.toHaveBeenCalled();
  mixer.addTrack("track");
  const current = mock.gains[2]!;
  cleanup();
  expect(old.dispose).toHaveBeenCalledTimes(1);
  expect(current.dispose).not.toHaveBeenCalled();
  mixer.silence(5);
  expect(current.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0,
    5 + TRACK_FADE_SECONDS,
  );
  mixer.dispose();
  expect(current.dispose).toHaveBeenCalledTimes(1);
});
