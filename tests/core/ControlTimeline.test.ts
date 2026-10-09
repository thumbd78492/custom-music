import { expect, it } from "vitest";
import { ControlTimeline } from "../../src/core/ControlTimeline";

it("coalesces only uncommitted commands and retains immutable decision receipts", () => {
  const timeline = new ControlTimeline(768, "test");
  const first = timeline.request({
    kind: "groove",
    target: "B",
    requestedAtTick: 19,
    effectiveBar: 3,
  });
  const oldSnapshot = timeline.commands;
  const second = timeline.request({
    kind: "groove",
    target: "C",
    requestedAtTick: 21,
    effectiveBar: 3,
  });
  expect(oldSnapshot[0]).toBe(first);
  expect(first.status).toBe("accepted");
  expect(timeline.commands[0]).toMatchObject({
    status: "superseded",
    reason: second.commandId,
  });
  expect(timeline.commit(2)).toEqual([]);
  const committed = timeline.commit(3)[0]!;
  expect(committed).toMatchObject({
    target: "C",
    effectiveTick: 2304,
    status: "scheduled",
  });
  timeline.request({
    kind: "groove",
    target: "A",
    requestedAtTick: 900,
    effectiveBar: 4,
  });
  expect(timeline.commands[1]).toBe(committed);
  timeline.boundary(3);
  expect(timeline.commands[1]?.status).toBe("completed");
  expect(committed.status).toBe("scheduled");
  expect(new Set(timeline.commands.map((c) => c.commandId)).size).toBe(3);
});

it("rejects a stale asynchronous revision after manual input without superseding it", () => {
  const timeline = new ControlTimeline(768, "test");
  timeline.request({
    kind: "groove",
    target: "B",
    requestedAtTick: 0,
    effectiveBar: 3,
  });
  const rejected = timeline.request({
    kind: "groove",
    target: "A",
    source: "future-llm",
    expectedRevision: 0,
    requestedAtTick: 1,
    effectiveBar: 3,
  });
  expect(rejected).toMatchObject({
    status: "rejected",
    reason: "Stale control revision",
  });
  expect(timeline.commands[0]?.status).toBe("accepted");
  timeline.stop();
  expect(timeline.commands[0]).toMatchObject({
    status: "superseded",
    reason: "Session stopped",
  });
  expect(rejected.status).toBe("rejected");
});

it("keeps independent control kinds on the same timeline", () => {
  const timeline = new ControlTimeline(768, "test");
  for (const kind of ["groove", "future-style"])
    timeline.request({
      kind,
      target: "B",
      requestedAtTick: 0,
      effectiveBar: 3,
    });
  expect(timeline.commit(3)).toHaveLength(2);
});

it("requires asynchronous revision and validates timing without disturbing a pending UI control", () => {
  const timeline = new ControlTimeline(768, "test");
  timeline.request({
    kind: "groove",
    target: "B",
    requestedAtTick: 0,
    effectiveBar: 3,
  });
  expect(
    timeline.request({
      kind: "groove",
      target: "A",
      source: "future-llm",
      requestedAtTick: 1,
      effectiveBar: 3,
    }).reason,
  ).toBe("Asynchronous controls require a revision");
  expect(
    timeline.request({
      kind: "groove",
      target: "A",
      requestedAtTick: -1,
      effectiveBar: 3,
    }).status,
  ).toBe("rejected");
  expect(
    timeline.request({
      kind: "groove",
      target: "A",
      requestedAtTick: 1,
      effectiveBar: 3.5,
    }).status,
  ).toBe("rejected");
  expect(timeline.commands[0]?.status).toBe("accepted");
});
