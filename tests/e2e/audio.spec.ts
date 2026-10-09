import { expect, test } from "@playwright/test";
import type { Page, Request } from "@playwright/test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type {
  InstrumentPlugin,
  SampleBank,
} from "../../src/contracts/instrument";
import type { MusicEvent } from "../../src/contracts/music";

interface AudioProbe {
  peak: number;
  decoded: number;
  sampleStarts: number;
  sampleEnds: number;
  activeSampleSources: number;
  lateSampleStarts: number;
  contexts: AudioContext[];
}

const sampleUrl =
  /\/src\/instruments\/([^/]+)\/samples\/[^?#]+\.(?:wav|flac)(?:\?|$)/;
const sampleRequest = (request: Request) =>
  sampleUrl.test(request.url()) && request.resourceType() === "fetch";
const probe = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { audioProbe: AudioProbe }).audioProbe,
  );
const expectSilentAndReleased = async (page: Page) => {
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeLessThan(0.000001);
  await expect
    .poll(async () => (await probe(page)).activeSampleSources)
    .toBe(0);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe = {
      peak: 0,
      decoded: 0,
      sampleStarts: 0,
      sampleEnds: 0,
      activeSampleSources: 0,
      lateSampleStarts: 0,
      contexts: [] as AudioContext[],
    };
    const analysers: AnalyserNode[] = [];
    const decodedBuffers = new WeakSet<AudioBuffer>();
    const originalDecode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (
      this: BaseAudioContext,
      data: ArrayBuffer,
      success?: DecodeSuccessCallback | null,
      failure?: DecodeErrorCallback | null,
    ) {
      const remember = (buffer: AudioBuffer) => {
        if (!decodedBuffers.has(buffer)) {
          decodedBuffers.add(buffer);
          probe.decoded++;
        }
        return buffer;
      };
      return originalDecode
        .call(
          this,
          data,
          success ? (buffer) => success(remember(buffer)) : null,
          failure,
        )
        .then(remember);
    };
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      this: AudioBufferSourceNode,
      ...args: Parameters<AudioBufferSourceNode["start"]>
    ) {
      // Tone also creates constant buffers. Count only buffers returned from
      // native decodeAudioData, so a synth-only voice cannot satisfy this test.
      const sampled = this.buffer !== null && decodedBuffers.has(this.buffer);
      const result = Reflect.apply(originalStart, this, args);
      if (sampled) {
        probe.sampleStarts++;
        probe.activeSampleSources++;
        if (
          (args[0] ?? this.context.currentTime) <
          this.context.currentTime - 0.02
        )
          probe.lateSampleStarts++;
        this.addEventListener(
          "ended",
          () => {
            probe.sampleEnds++;
            probe.activeSampleSources--;
          },
          { once: true },
        );
      }
      return result;
    };
    Object.assign(window, { audioProbe: probe });
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: Parameters<AudioNode["connect"]>
    ) {
      const result = Reflect.apply(originalConnect, this, args);
      const destination = args[0];
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 256;
        Reflect.apply(originalConnect, this, [analyser]);
        if (
          this.context instanceof AudioContext &&
          !probe.contexts.includes(this.context)
        )
          probe.contexts.push(this.context);
        analysers.push(analyser);
      }
      return result;
    } as AudioNode["connect"];
    setInterval(() => {
      probe.peak = Math.max(
        0,
        ...analysers.map((analyser) => {
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          return Math.max(...data.map(Math.abs));
        }),
      );
    }, 20);
  });
});

const ids = readdirSync("src/instruments", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

async function addAllRoles(page: Page) {
  const cards = page.locator("article");
  for (let index = 0; index < (await cards.count()); index++) {
    const card = cards.nth(index);
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled();
  }
}

for (const id of ids)
  test(`${id} alone lazy loads, produces audio, stops, and restarts`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    const samples: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      requested.push(request.url());
      if (sampleRequest(request)) samples.push(request.url());
    });
    await page.goto(`/?instrument=${id}`);
    await expect(
      page.getByRole("heading", { name: "InstrumentLab" }),
    ).toBeVisible();
    await expect(page.locator("article")).toHaveCount(id === "piano" ? 2 : 1);
    const card = page.getByTestId(`instrument-${id}`);
    expect(
      requested.filter((url) =>
        /\/src\/instruments\/.*\/(index|voice|generator)\.ts/.test(url),
      ),
    ).toEqual([]);
    expect(samples).toEqual([]);
    const firstSample = page.waitForResponse((response) =>
      sampleRequest(response.request()),
    );
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled();
    const response = await firstSample;
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    const signature = bytes.subarray(0, 4).toString();
    expect(["RIFF", "fLaC"]).toContain(signature);
    if (signature === "RIFF")
      expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(samples.length).toBeGreaterThan(0);
    expect(
      samples.every((url) => url.includes(`/instruments/${id}/samples/`)),
    ).toBe(true);
    await expect
      .poll(async () => (await probe(page)).decoded)
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const level = () =>
      page.evaluate(
        () =>
          (window as unknown as { audioProbe: { peak: number } }).audioProbe
            .peak,
      );
    await expect.poll(level).toBeGreaterThan(0.0001);
    await expect
      .poll(async () => (await probe(page)).sampleStarts)
      .toBeGreaterThan(0);
    await expect(page.getByTestId("position")).toContainText("第 2 小節", {
      timeout: 7000,
    });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(level).toBeLessThan(0.000001);
    await expectSilentAndReleased(page);
    const previousStarts = (await probe(page)).sampleStarts;
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(level).toBeGreaterThan(0.0001);
    await expect
      .poll(async () => (await probe(page)).sampleStarts)
      .toBeGreaterThan(previousStarts);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expectSilentAndReleased(page);
    await page.screenshot({
      path: `test-results/${id}-m1.png`,
      fullPage: true,
    });
    for (const url of requested.filter((url) =>
      url.includes("/src/instruments/"),
    ))
      expect(url).toContain(`/src/instruments/${id}/`);
    expect(errors).toEqual([]);
  });

test("ensemble plays together and applies Solo, Mute, removal at pending bar boundaries", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("article")).toHaveCount(ids.length + 1);
  await addAllRoles(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const level = () =>
    page.evaluate(
      () =>
        (window as unknown as { audioProbe: { peak: number } }).audioProbe.peak,
    );
  await expect.poll(level).toBeGreaterThan(0.0001);
  const card = page.getByTestId(`instrument-${ids[0]}`);
  await card.getByRole("button", { name: "Solo", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("等待");
  await expect(
    card.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await card.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect.poll(level).toBeLessThan(0.000001);
  // Removing the muted Solo releases the other voices without restarting music.
  await card.getByRole("button", { name: "移除", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "加入", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect.poll(level).toBeGreaterThan(0.0001);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(level).toBeLessThan(0.000001);
  await expectSilentAndReleased(page);
  await page.screenshot({
    path: "test-results/ensemble-m1.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Piano Lab runs two real voices and removing one leaves the other playing", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/?instrument=piano");
  const melody = page.locator('[data-character-id="piano-melody"]');
  const comping = page.locator('[data-character-id="piano-accompaniment"]');
  await expect(page.locator("article")).toHaveCount(2);
  await addAllRoles(page);
  await expect
    .poll(async () => (await probe(page)).decoded)
    .toBeGreaterThanOrEqual(28);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await melody.getByRole("button", { name: "Solo", exact: true }).click();
  await expect(
    melody.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await melody.getByRole("button", { name: "Solo", exact: true }).click();
  await expect(
    melody.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await melody.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    melody.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await melody.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    melody.getByRole("button", { name: "Mute", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await comping.getByRole("button", { name: "移除", exact: true }).click();
  await expect(
    comping.getByRole("button", { name: "加入", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  const before = (await probe(page)).sampleStarts;
  await expect
    .poll(async () => (await probe(page)).sampleStarts, { timeout: 8000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await expect(melody.getByRole("status")).toContainText("已加入");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(async () => (await probe(page)).sampleStarts)
    .toBeGreaterThan(before);
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
  await page.screenshot({
    path: info.outputPath("piano-two-roles.png"),
    fullPage: true,
  });
  await info.attach("two-piano-voices", {
    body: JSON.stringify(await probe(page)),
    contentType: "application/json",
  });
});

test("one Piano role's failed or cancelled sample load leaves its partner and retry intact", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto("/?instrument=piano");
  const melody = page.locator('[data-character-id="piano-melody"]');
  const comping = page.locator('[data-character-id="piano-accompaniment"]');
  await comping.getByRole("button", { name: "加入", exact: true }).click();
  await expect(
    comping.getByRole("button", { name: "移除", exact: true }),
  ).toBeEnabled();
  let fail = true,
    hold = false,
    delayed = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(sampleUrl, async (route) => {
    if (!sampleRequest(route.request())) return route.continue();
    if (fail) return route.fulfill({ status: 404, body: "one role failure" });
    if (hold) {
      delayed++;
      await gate;
    }
    await route.continue();
  });
  await melody.getByRole("button", { name: "加入", exact: true }).click();
  await expect(melody.getByRole("alert")).toContainText("失敗");
  await expect(comping.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  fail = false;
  hold = true;
  await melody.getByRole("button", { name: "加入", exact: true }).click();
  await expect.poll(() => delayed).toBeGreaterThan(0);
  await melody.getByRole("button", { name: "取消載入", exact: true }).click();
  await expect(comping.getByRole("status")).toContainText("已加入");
  hold = false;
  release();
  await melody.getByRole("button", { name: "加入", exact: true }).click();
  await expect(
    melody.getByRole("button", { name: "移除", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect(melody.getByRole("alert")).toHaveCount(0);
  await expect(comping.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
});

test("empty host can start and add an instrument while playing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = page.getByTestId(`instrument-${ids[0]}`);
  await card.getByRole("button", { name: "加入", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("等待");
  await expect(
    card.getByRole("button", { name: "移除", exact: true }),
  ).toBeEnabled({ timeout: 12000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { audioProbe: { peak: number } }).audioProbe
            .peak,
      ),
    )
    .toBeGreaterThan(0.0001);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
  expect(errors).toEqual([]);
});

for (const id of ids) {
  test(`${id} renders real samples offline with velocity, release and scheduled-stop silence`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?instrument=${id}`);
    const result = await page.evaluate(async (instrumentId) => {
      const pluginPath = `/src/instruments/${instrumentId}/index.ts`;
      const voicePath = "/src/audio/SampleVoice.ts";
      const { plugin } = (await import(pluginPath)) as {
        plugin: InstrumentPlugin;
      };
      const { loadSampleVoice } = (await import(
        voicePath
      )) as typeof import("../../src/audio/SampleVoice");
      const waveforms = new Map<string, Float32Array>();
      const render = async (
        scenario:
          | "velocity"
          | "stop"
          | "sustain"
          | "chord"
          | "single"
          | "baseline"
          | "attackStop"
          | "tailStop",
        pitchOffset = 0,
      ) => {
        const context = new OfflineAudioContext(1, 10 * 44100, 44100);
        let bank: SampleBank | undefined;
        const voice = await plugin.createVoice({
          createSynthVoice() {
            throw new Error("A real-sample test cannot use a synth");
          },
          createPercussionVoice() {
            throw new Error(
              "A real-sample test cannot use synthesized percussion",
            );
          },
          createSampleVoice(configuration, performance) {
            bank = configuration;
            return loadSampleVoice(
              context,
              context.destination,
              configuration,
              new AbortController().signal,
              performance,
            );
          },
        });
        if (!bank) throw new Error("Plugin did not supply its own sample bank");
        const configuration: SampleBank = bank;
        const key = Object.keys(configuration.urls)[0]!;
        const midi = configuration.regions?.[key]?.midi ?? Number(key);
        const event = (
          velocity: number,
          duration: number,
          offset = 0,
        ): MusicEvent =>
          configuration.kind === "pitched"
            ? {
                kind: "note",
                step: 0,
                midi: midi + offset,
                durationSteps: duration,
                velocity,
              }
            : { kind: "hit", step: 0, sampleKey: key, velocity };
        if (scenario === "velocity") {
          voice.play(event(0.3, 0.5), 0.1, 1);
          voice.play(event(0.9, 0.5), 4.1, 1);
        } else if (scenario === "stop") {
          voice.play(event(0.8, 7), 0.1, 1);
          voice.play(event(0.8, 1), 4.1, 1);
          voice.releaseAll(0.4);
        } else if (scenario === "sustain") {
          voice.play(event(0.8, 7), 0.1, 1);
        } else if (scenario === "single") {
          voice.play(event(0.5, 0.5, pitchOffset), 0.1, 1);
        } else if (
          scenario === "baseline" ||
          scenario === "attackStop" ||
          scenario === "tailStop"
        ) {
          voice.play(event(0.8, 0.5), 0.1, 1);
          if (scenario === "attackStop")
            voice.releaseAll(0.1 + (configuration.attackSeconds ?? 0.003) / 2);
          if (scenario === "tailStop")
            voice.releaseAll(0.6 + configuration.releaseSeconds / 2);
        } else {
          for (const offset of [0, 4, 7])
            voice.play(event(0.5, 0.5, offset), 0.1, 1);
        }
        const rendered = await context.startRendering();
        const data = rendered.getChannelData(0);
        if (
          ["single", "chord", "baseline", "attackStop", "tailStop"].includes(
            scenario,
          )
        )
          waveforms.set(`${scenario}:${pitchOffset}`, new Float32Array(data));
        const rms = (from: number, to: number) => {
          const begin = Math.floor(from * rendered.sampleRate);
          const end = Math.floor(to * rendered.sampleRate);
          let energy = 0;
          for (let index = begin; index < end; index++)
            energy += data[index]! ** 2;
          return Math.sqrt(energy / (end - begin));
        };
        let peak = 0;
        for (const sample of data) peak = Math.max(peak, Math.abs(sample));
        const metrics = {
          peak,
          onsetRms: rms(0.12, 0.3),
          loudRms: rms(4.12, 4.3),
          tailRms: rms(0.61, 0.66),
          afterStopRms: rms(
            Math.min(3.5, 0.4 + configuration.releaseSeconds + 0.05),
            4,
          ),
          futureRms: rms(4.12, 4.3),
          sustainedRms: rms(6.2, 6.7),
          finalRms: rms(9.5, 10),
          kind: configuration.kind,
          monophonic: configuration.monophonic ?? false,
          attackSeconds: configuration.attackSeconds ?? 0.003,
          releaseSeconds: configuration.releaseSeconds,
          hasLoop: Object.values(configuration.regions ?? {}).some(
            (region) => region.loopStart !== undefined,
          ),
        };
        voice.dispose();
        return metrics;
      };
      const velocity = await render("velocity");
      await render("baseline");
      await render("attackStop");
      await render("tailStop");
      const prefixError = (
        scenario: "attackStop" | "tailStop",
        cutoff: number,
      ) => {
        const baseline = waveforms.get("baseline:0")!;
        const changed = waveforms.get(`${scenario}:0`)!;
        let maxError = 0;
        for (let index = 0; index < Math.floor(cutoff * 44100) - 1; index++)
          maxError = Math.max(
            maxError,
            Math.abs(baseline[index]! - changed[index]!),
          );
        return maxError;
      };
      const releasePrefix = {
        duringAttackMaxError: prefixError(
          "attackStop",
          0.1 + velocity.attackSeconds / 2,
        ),
        duringTailMaxError: prefixError(
          "tailStop",
          0.6 + velocity.releaseSeconds / 2,
        ),
      };
      let chord;
      if (velocity.kind === "pitched" && !velocity.monophonic) {
        const metrics = await render("chord");
        for (const offset of [0, 4, 7]) await render("single", offset);
        const combined = waveforms.get("chord:0")!;
        let maxSumError = 0;
        for (let index = 0; index < combined.length; index++) {
          const sum = [0, 4, 7].reduce(
            (value, offset) =>
              value + waveforms.get(`single:${offset}`)![index]!,
            0,
          );
          maxSumError = Math.max(maxSumError, Math.abs(sum - combined[index]!));
        }
        chord = { ...metrics, maxSumError, independentNotes: 3 };
      }
      return {
        velocity,
        releasePrefix,
        stop: await render("stop"),
        sustain: velocity.hasLoop ? await render("sustain") : undefined,
        chord,
      };
    }, id);
    const metricsPath = testInfo.outputPath(
      `${id}-offline-render-metrics.json`,
    );
    writeFileSync(metricsPath, JSON.stringify(result, null, 2) + "\n");
    await testInfo.attach(`${id}-offline-render-metrics.json`, {
      path: metricsPath,
      contentType: "application/json",
    });
    expect(result.velocity.onsetRms).toBeGreaterThan(0.00001);
    expect(result.releasePrefix.duringAttackMaxError).toBeLessThan(0.000001);
    expect(result.releasePrefix.duringTailMaxError).toBeLessThan(0.000001);
    expect(result.velocity.loudRms).toBeGreaterThan(
      result.velocity.onsetRms * 1.2,
    );
    expect(result.velocity.finalRms).toBeLessThan(0.000001);
    if (result.velocity.kind === "pitched")
      expect(result.velocity.tailRms).toBeGreaterThan(0.000001);
    expect(result.stop.onsetRms).toBeGreaterThan(0.00001);
    expect(result.stop.afterStopRms).toBeLessThan(0.000001);
    expect(result.stop.futureRms).toBeLessThan(0.000001);
    expect(result.stop.finalRms).toBeLessThan(0.000001);
    if (result.sustain) {
      expect(result.sustain.sustainedRms).toBeGreaterThan(0.00001);
      expect(result.sustain.finalRms).toBeLessThan(0.000001);
    }
    if (result.chord) {
      expect(result.chord.onsetRms).toBeGreaterThan(0.00001);
      expect(result.chord.maxSumError).toBeLessThan(0.000001);
    }
  });

  test(`${id} sample HTTP and decode failures are visible, isolated, and retryable`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let failure: "http" | "decode" | undefined = "http";
    await page.route(sampleUrl, async (route) => {
      if (
        failure &&
        sampleRequest(route.request()) &&
        route.request().url().includes(`/instruments/${id}/samples/`)
      )
        await route.fulfill({
          status: failure === "http" ? 503 : 200,
          contentType: "audio/wav",
          body: "Deliberate invalid audio content",
        });
      else await route.continue();
    });
    await page.goto("/");
    const healthy = ids.find((candidate) => candidate !== id);
    if (healthy) {
      const card = page.getByTestId(`instrument-${healthy}`);
      await card.getByRole("button", { name: "加入", exact: true }).click();
      await expect(
        card.getByRole("button", { name: "移除", exact: true }),
      ).toBeEnabled();
    }
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = page.getByTestId(`instrument-${id}`);
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("503");
    await expect(
      card.getByRole("button", { name: "加入", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Stop", exact: true }),
    ).toBeEnabled();
    if (healthy) {
      await expect(
        page.getByTestId(`instrument-${healthy}`).getByRole("alert"),
      ).toHaveCount(0);
      await expect
        .poll(async () => (await probe(page)).peak)
        .toBeGreaterThan(0.0001);
    }
    failure = "decode";
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("failed");
    await expect(
      card.getByRole("button", { name: "加入", exact: true }),
    ).toBeEnabled();
    if (healthy)
      await expect
        .poll(async () => (await probe(page)).peak)
        .toBeGreaterThan(0.0001);
    failure = undefined;
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled({ timeout: 12000 });
    await expect(card.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expectSilentAndReleased(page);
    expect(errors).toEqual([]);
  });

  for (const operation of ["cancel", "stop"] as const)
    test(`${id} ${operation} invalidates delayed samples and allows a fresh retry`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let delayed = 0;
      let hold = true;
      await page.route(sampleUrl, async (route) => {
        if (hold && sampleRequest(route.request())) {
          delayed++;
          await gate;
        }
        await route.continue();
      });
      await page.goto(`/?instrument=${id}`);
      const card = page.getByTestId(`instrument-${id}`);
      await card.getByRole("button", { name: "加入", exact: true }).click();
      await expect.poll(() => delayed).toBeGreaterThan(0);
      await expect(card.getByRole("status")).toContainText("載入中");
      if (operation === "cancel")
        await card
          .getByRole("button", { name: "取消載入", exact: true })
          .click();
      else
        await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(
        card.getByRole("button", { name: "加入", exact: true }),
      ).toBeEnabled();
      hold = false;
      release();
      // Allow the previously held network callbacks to finish after cancellation.
      await page.waitForTimeout(250);
      await expect(
        card.getByRole("button", { name: "加入", exact: true }),
      ).toBeEnabled();
      await expect(card.getByRole("alert")).toHaveCount(0);
      expect((await probe(page)).sampleStarts).toBe(0);
      await expectSilentAndReleased(page);
      await card.getByRole("button", { name: "加入", exact: true }).click();
      await expect(
        card.getByRole("button", { name: "移除", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect
        .poll(async () => (await probe(page)).sampleStarts)
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await probe(page)).peak)
        .toBeGreaterThan(0.0001);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expectSilentAndReleased(page);
      expect(errors).toEqual([]);
    });

  test(`${id} repeated live removal, re-add and restart leave no sample sources`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?instrument=${id}`);
    const card = page.getByTestId(`instrument-${id}`);
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled();
    for (let iteration = 0; iteration < 3; iteration++) {
      const before = (await probe(page)).sampleStarts;
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect
        .poll(async () => (await probe(page)).sampleStarts)
        .toBeGreaterThan(before);
      await card.getByRole("button", { name: "移除", exact: true }).click();
      await expect(card.getByRole("status")).toContainText("等待");
      await expect(
        card.getByRole("button", { name: "加入", exact: true }),
      ).toBeEnabled({ timeout: 12000 });
      await expectSilentAndReleased(page);
      const afterRemoval = (await probe(page)).sampleStarts;
      await card.getByRole("button", { name: "加入", exact: true }).click();
      await expect(
        card.getByRole("button", { name: "移除", exact: true }),
      ).toBeEnabled({ timeout: 12000 });
      await expect
        .poll(async () => (await probe(page)).sampleStarts)
        .toBeGreaterThan(afterRemoval);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expectSilentAndReleased(page);
    }
    const result = await probe(page);
    expect(result.sampleEnds).toBe(result.sampleStarts);
    expect(errors).toEqual([]);
  });
}

test("audio-clock recovery after a main-thread stall skips overdue sample attacks", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await addAllRoles(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(async () => (await probe(page)).sampleStarts)
    .toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const probe = (window as unknown as { audioProbe: AudioProbe }).audioProbe;
    probe.lateSampleStarts = 0;
    // More than three 88-BPM bars, while the native audio clock continues.
    const deadline = performance.now() + 9500;
    while (performance.now() < deadline) {
      /* simulate a blocked main thread */
    }
    return probe.sampleStarts;
  });
  await page.waitForTimeout(500);
  const recovered = await probe(page);
  expect(recovered.lateSampleStarts).toBe(0);
  // A whole missed-bar queue cannot be compressed into the recovery frame.
  expect(recovered.sampleStarts - before).toBeLessThanOrEqual(12);
  await expect
    .poll(async () => (await probe(page)).sampleStarts, { timeout: 12000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await expect(page.getByTestId("position")).not.toContainText("第 1 小節");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
  expect(errors).toEqual([]);
});

test("native AudioContext suspension and resume retain a recoverable audio clock", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await addAllRoles(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect
    .poll(async () => (await probe(page)).sampleStarts)
    .toBeGreaterThan(0);
  const suspended = await page.evaluate(async () => {
    const contexts = (window as unknown as { audioProbe: AudioProbe })
      .audioProbe.contexts;
    await Promise.all(contexts.map((context) => context.suspend()));
    return contexts.map((context) => ({
      state: context.state,
      time: context.currentTime,
    }));
  });
  expect(suspended.length).toBeGreaterThan(0);
  expect(suspended.every(({ state }) => state === "suspended")).toBe(true);
  await page.waitForTimeout(1000);
  const still = await page.evaluate(() =>
    (window as unknown as { audioProbe: AudioProbe }).audioProbe.contexts.map(
      (context) => context.currentTime,
    ),
  );
  expect(still).toEqual(suspended.map(({ time }) => time));
  const before = (await probe(page)).sampleStarts;
  await page.evaluate(async () => {
    await Promise.all(
      (window as unknown as { audioProbe: AudioProbe }).audioProbe.contexts.map(
        (context) => context.resume(),
      ),
    );
  });
  await expect
    .poll(async () => (await probe(page)).sampleStarts, { timeout: 12000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => (await probe(page)).peak)
    .toBeGreaterThan(0.0001);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expectSilentAndReleased(page);
  expect(errors).toEqual([]);
});

// A separate worker fixture keeps the ordinary tests' headless browser intact.
// Playwright does not allow worker-level launch options inside test.describe.
const backgroundTest = test.extend({
  browser: [
    async ({ playwright }, use, workerInfo) => {
      // Verified installed Edge App Paths entry on the supported Windows host;
      // check common installation roots so no user browser profile is needed.
      const executable = [
        process.env["ProgramFiles(x86)"],
        process.env.ProgramFiles,
        process.env.LOCALAPPDATA,
      ]
        .filter((root): root is string => Boolean(root))
        .map((root) =>
          join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        )
        .find(existsSync);
      if (!executable)
        throw new Error("Installed Microsoft Edge executable was not found");
      const profiles = join(
        workerInfo.project.outputDir,
        "native-edge-profiles",
      );
      mkdirSync(profiles, { recursive: true });
      const profile = mkdtempSync(join(profiles, "profile-"));
      const child = spawn(
        executable,
        [
          `--user-data-dir=${profile}`,
          "--remote-debugging-port=0",
          "--window-size=1100,800",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-sync",
          // Match the ordinary Playwright harness inside the managed runtime.
          // Background throttling and focus policy remain at browser defaults.
          "--no-sandbox",
          "--edge-skip-compat-layer-relaunch",
          "about:blank",
        ],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      writeFileSync(
        join(profile, "native-launch.json"),
        JSON.stringify({ pid: child.pid, executable, profile }, null, 2) + "\n",
      );
      child.stderr?.on("data", (data: Buffer) =>
        appendFileSync(join(profile, "native-stderr.log"), data),
      );
      let browser:
        | Awaited<ReturnType<typeof playwright.chromium.connectOverCDP>>
        | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", reject);
        });
        const activePort = join(profile, "DevToolsActivePort");
        const deadline = Date.now() + 15000;
        while (!existsSync(activePort) && Date.now() < deadline) {
          if (child.exitCode !== null)
            throw new Error(
              `Isolated Edge exited before CDP opened (${child.exitCode})`,
            );
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!existsSync(activePort))
          throw new Error("Isolated Edge did not publish its CDP port");
        const port = readFileSync(activePort, "utf8").split(/\r?\n/)[0]!;
        if (!/^\d+$/.test(port))
          throw new Error("Invalid isolated Edge CDP port");
        // noDefaults is a public installed Playwright option that leaves the
        // existing default context's native focus and media state unchanged.
        browser = await playwright.chromium.connectOverCDP(
          `http://127.0.0.1:${port}`,
          { noDefaults: true },
        );
        await use(browser);
      } finally {
        if (browser?.isConnected()) {
          try {
            const shutdown = await browser.newBrowserCDPSession();
            // Browser.close can close the channel before its acknowledgement.
            await shutdown.send("Browser.close").catch(() => {});
          } catch {
            // A crashed/closed browser can race the connected-state snapshot.
          }
          await browser.close().catch(() => {});
        }
        if (child.exitCode === null) {
          await Promise.race([
            new Promise<void>((resolve) => child.once("exit", () => resolve())),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]);
          // This handle belongs only to this test's fresh, isolated profile.
          if (child.exitCode === null) child.kill();
        }
      }
    },
    { scope: "worker" },
  ],
  context: async ({ browser }, use) => {
    const context = browser.contexts()[0];
    if (!context) throw new Error("Native Edge default context is missing");
    await use(context);
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

backgroundTest.describe("real background browser policy", () => {
  backgroundTest(
    "actual background tab returns to synchronized sample playback",
    async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const baseURL = testInfo.project.use.baseURL;
      if (!baseURL)
        throw new Error(
          "Background test needs the configured development server URL",
        );
      await page.goto(new URL("/", baseURL).href);
      const musicCdp = await page.context().newCDPSession(page);
      // Playwright also emulates every page as focused/active by default.
      // Disable that emulation so visibility comes from actual selected tabs.
      await musicCdp.send("Emulation.setFocusEmulationEnabled", {
        enabled: false,
      });
      const musicWindow = await musicCdp.send("Browser.getWindowForTarget", {});
      await page.bringToFront();
      await addAllRoles(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect
        .poll(async () => (await probe(page)).sampleStarts)
        .toBeGreaterThan(0);
      const bar = async () =>
        Number(
          (await page.getByTestId("position").textContent())?.match(
            /第 (\d+) 小節/,
          )?.[1],
        );
      const beforeBar = await bar();
      const beforeBackground = (await probe(page)).sampleStarts;
      await page.evaluate(() => {
        const changes = [
          { state: document.visibilityState, time: performance.now() },
        ];
        document.addEventListener("visibilitychange", () =>
          changes.push({
            state: document.visibilityState,
            time: performance.now(),
          }),
        );
        Object.assign(window, { backgroundVisibility: changes });
        (
          window as unknown as { audioProbe: AudioProbe }
        ).audioProbe.lateSampleStarts = 0;
      });
      const foreground = await page.context().newPage();
      await foreground.goto("about:blank");
      const foregroundCdp = await foreground
        .context()
        .newCDPSession(foreground);
      await foregroundCdp.send("Emulation.setFocusEmulationEnabled", {
        enabled: false,
      });
      const foregroundWindow = await foregroundCdp.send(
        "Browser.getWindowForTarget",
        {},
      );
      writeFileSync(
        testInfo.outputPath("background-launch.json"),
        JSON.stringify(
          { musicWindow, foregroundWindow, focusEmulationDisabled: true },
          null,
          2,
        ) + "\n",
      );
      await foreground.bringToFront();
      await expect
        .poll(() => page.evaluate(() => document.visibilityState))
        .toBe("hidden");
      // Audible tabs can be exempt from timer throttling. This observes the real
      // browser policy and makes no claim about OS sleep or energy-saving modes.
      await foreground.waitForTimeout(10000);
      expect(await page.evaluate(() => document.visibilityState)).toBe(
        "hidden",
      );
      await page.bringToFront();
      const atForeground = (await probe(page)).sampleStarts;
      await expect
        .poll(() => page.evaluate(() => document.visibilityState))
        .toBe("visible");
      await page.waitForTimeout(500);
      const recovery = await probe(page);
      expect(recovery.lateSampleStarts).toBe(0);
      expect(recovery.sampleStarts - atForeground).toBeLessThanOrEqual(12);
      await expect
        .poll(async () => (await probe(page)).sampleStarts, { timeout: 12000 })
        .toBeGreaterThan(atForeground);
      await expect
        .poll(async () => (await probe(page)).peak)
        .toBeGreaterThan(0.0001);
      await expect.poll(bar).toBeGreaterThan(beforeBar + 2);
      const visibility = await page.evaluate(
        () =>
          (
            window as unknown as {
              backgroundVisibility: { state: string; time: number }[];
            }
          ).backgroundVisibility,
      );
      expect(visibility.map(({ state }) => state)).toEqual([
        "visible",
        "hidden",
        "visible",
      ]);
      const hiddenMilliseconds = visibility[2]!.time - visibility[1]!.time;
      expect(hiddenMilliseconds).toBeGreaterThanOrEqual(10000);
      const metricsPath = testInfo.outputPath("background-visibility.json");
      writeFileSync(
        metricsPath,
        JSON.stringify(
          {
            visibility,
            musicWindowId: musicWindow.windowId,
            foregroundWindowId: foregroundWindow.windowId,
            focusEmulationDisabled: true,
            hiddenMilliseconds,
            beforeBackground,
            atForeground,
            startsInFirstRecovery500ms: recovery.sampleStarts - atForeground,
            afterForeground: (await probe(page)).sampleStarts,
            lateSampleStarts: (await probe(page)).lateSampleStarts,
            beforeBar,
            afterBar: await bar(),
            scope:
              "Native isolated Edge default context via CDP noDefaults:true; natural background policy and focus; no forced OS sleep or energy-saving mode",
          },
          null,
          2,
        ) + "\n",
      );
      await testInfo.attach("background-visibility.json", {
        path: metricsPath,
        contentType: "application/json",
      });
      await foreground.close();
      await musicCdp.detach();
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expectSilentAndReleased(page);
      expect(errors).toEqual([]);
    },
  );
});
