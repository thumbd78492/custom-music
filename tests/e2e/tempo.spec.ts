import { expect, test } from "@playwright/test";

test("native Transport integrates tempo automation, tick bars and three synchronized tracks", async ({
  page,
}, info) => {
  test.setTimeout(70000);
  await page.goto("/");
  await page.locator("h1").click();
  const result = await page.evaluate(async () => {
    const path = "/tests/e2e/clock-harness.ts";
    const { measureTransport } = (await import(
      path
    )) as typeof import("./clock-harness");
    return measureTransport();
  });
  await info.attach("native-tempo-timeline", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(new Set(result.plans.map((plan) => plan.bpm)).size).toBeGreaterThan(1);
  expect(result.calls).toHaveLength(result.plans.length * 3 * 3 - 4 * 3);
  const origin = result.calls[0]!.time;
  let elapsed = origin;
  for (const plan of result.plans) {
    const attacks = result.calls.filter((call) => call.bar === plan.barIndex);
    for (const call of attacks) {
      expect(
        Math.abs(call.time - (elapsed + (call.step * 15) / plan.bpm)),
      ).toBeLessThan(0.0002);
      expect(call.secondsPerStep).toBeCloseTo(15 / plan.bpm, 10);
    }
    expect(attacks.filter((call) => call.id === "b")).toHaveLength(
      plan.barIndex >= 8 && plan.barIndex < 12 ? 0 : 3,
    );
    for (const position of result.positions.filter(
      (p) =>
        p.time > elapsed + 0.001 && p.time < elapsed + 240 / plan.bpm - 0.001,
    ))
      expect(position.bar).toBe(plan.barIndex);
    elapsed += 240 / plan.bpm;
  }
  expect(result.releases).toBeGreaterThanOrEqual(3);
});
