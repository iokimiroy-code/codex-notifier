import test from "node:test";
import assert from "node:assert/strict";
import { createServer, externalAgentToEvent, hookToEvent } from "../bridge/server.mjs";

test("maps Codex lifecycle hooks to notifier task events", () => {
  const event = hookToEvent("PermissionRequest", { session_id: "session-1", cwd: "C:\\work\\demo" });
  assert.equal(event.type, "TASK_WAITING");
  assert.equal(event.state, "waiting");
  assert.equal(event.taskId, "session-1");
});

test("accepts hook payloads over the local bridge", async () => {
  const app = createServer({ port: 43124, startAppServer: false });
  await app.listen();
  const health = await fetch("http://127.0.0.1:43124/health");
  assert.equal(health.status, 200);
  const response = await fetch("http://127.0.0.1:43124/hook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "Stop", payload: { session_id: "test-session", cwd: "C:\\work\\demo" } }),
  });
  assert.equal(response.status, 204);
  await app.close();
});

test("normalizes events from any external agent", () => {
  const event = externalAgentToEvent({ state: "completed", taskId: "work-1", name: "Build project", source: "workbuddy" });
  assert.deepEqual(event, {
    type: "TASK_COMPLETED",
    state: "completed",
    taskId: "work-1",
    threadId: undefined,
    sessionId: undefined,
    turnId: undefined,
    name: "Build project",
    progress: 100,
    source: "workbuddy",
  });
});

test("accepts generic agent events over the local bridge", async () => {
  const app = createServer({ port: 43125, startAppServer: false });
  await app.listen();
  const response = await fetch("http://127.0.0.1:43125/agent-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: "waiting", taskId: "agent-1", name: "Review changes", source: "other-agent" }),
  });
  assert.equal(response.status, 204);
  await app.close();
});
