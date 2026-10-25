import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function coreContext() {
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const ctx = vm.createContext({
    window,
    console,
    document: { readyState: "loading", addEventListener() {}, querySelector: () => null },
  });
  vm.runInContext(readFileSync(new URL("../public/src/js/core.js", import.meta.url), "utf8"), ctx);
  return ctx;
}

// The pin's methods, without the constructor: they need a few stubs, and the
// code under test is the class's own.
function pinApp(ctx) {
  const app = Object.create(vm.runInContext("DpsApp.prototype", ctx));
  app.pinned = false;
  app.meterHovered = false;
  app.toggles = [];
  app.expanded = null;
  app.pinBtn = { classList: { toggle: (name, on) => app.toggles.push([name, on]) } };
  app.setMeterExpanded = (expanded) => { app.expanded = expanded; };
  return app;
}

test("the backend owns the pin, and the page writes nothing", () => {
  const ctx = coreContext();
  const calls = [];
  ctx.window.javaBridge = {
    setPinned: (pinned) => calls.push(["setPinned", pinned]),
    setSetting: (key, value) => calls.push(["setSetting", key, value]),
  };
  const app = pinApp(ctx);

  // The backend says it: the page mirrors it and does no IPC of its own.
  app.applyPinState(true);
  assert.equal(app.pinned, true);
  assert.equal(app.expanded, true, "a pinned meter stays expanded");
  assert.deepEqual(app.toggles, [["isPinned", true]]);
  assert.deepEqual(calls, [], "the page asks the backend for nothing");

  // The player clicks the button: the page asks the backend and writes
  // nothing itself, so the two cannot ping-pong the setting.
  app.togglePin();
  assert.deepEqual(calls, [["setPinned", false]]);
  assert.ok(
    !calls.some(([kind, key]) => kind === "setSetting" && key === "dpsMeter.pinned"),
    "the page must not write the pin's setting"
  );
});

test("both buttons that stay clickable are sent, not only the lock's", () => {
  const ctx = coreContext();
  const sent = [];
  ctx.window.javaBridge = {
    setOverlayButtonRects: (rects, scale) => sent.push([rects, scale]),
  };
  const app = pinApp(ctx);
  const button = (left) => ({
    style: { display: "" },
    getBoundingClientRect: () => ({ left, top: 10, width: 20, height: 20 }),
  });
  app.lockBtn = button(100);
  app.pinBtn = button(130);

  app._sendOverlayButtonRects();
  assert.equal(sent.length, 1);
  // The arrays come from the vm, so they are not the host's arrays.
  assert.deepEqual(Array.from(sent[0][0]).map((r) => Array.from(r)), [
    [100, 10, 20, 20],
    [130, 10, 20, 20],
  ]);
  assert.equal(sent[0][1], ctx.window.devicePixelRatio);

  // A hidden lock button keeps no rectangle: the area over it must let the
  // clicks through again.
  app.lockBtn.style.display = "none";
  app._sendOverlayButtonRects();
  assert.equal(sent.length, 2);
  assert.deepEqual(Array.from(sent[1][0]).map((r) => Array.from(r)), [[130, 10, 20, 20]]);
});
