import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { peak: 0, contexts: [] as AudioContext[] };
    const analysers: AnalyserNode[] = [];
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
        probe.contexts.push(this.context as AudioContext);
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

for (const id of ids)
  test(`${id} alone lazy loads, produces audio, stops, and restarts`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requested.push(request.url()));
    await page.goto(`/?instrument=${id}`);
    await expect(
      page.getByRole("heading", { name: "InstrumentLab" }),
    ).toBeVisible();
    await expect(page.locator("article")).toHaveCount(1);
    expect(
      requested.filter((url) =>
        /\/src\/instruments\/.*\/(index|voice|generator)\.ts/.test(url),
      ),
    ).toEqual([]);
    await page.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const level = () =>
      page.evaluate(
        () =>
          (window as unknown as { audioProbe: { peak: number } }).audioProbe
            .peak,
      );
    await expect.poll(level).toBeGreaterThan(0.0001);
    await expect(page.getByTestId("position")).toContainText("第 2 小節", {
      timeout: 7000,
    });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(level).toBeLessThan(0.000001);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(level).toBeGreaterThan(0.0001);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.screenshot({
      path: `test-results/${id}-m0.png`,
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
  await expect(page.locator("article")).toHaveCount(ids.length);
  for (const id of ids) {
    const card = page.getByTestId(`instrument-${id}`);
    await card.getByRole("button", { name: "加入", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "移除", exact: true }),
    ).toBeEnabled();
  }
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
  await page.screenshot({
    path: "test-results/ensemble-m0.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
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
  expect(errors).toEqual([]);
});
