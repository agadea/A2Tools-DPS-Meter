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

function meterContext() {
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const ctx = vm.createContext({
    window,
    console,
    document: { readyState: "loading", addEventListener() {}, querySelector: () => null },
  });
  vm.runInContext(readFileSync(new URL("../public/src/js/meter.js", import.meta.url), "utf8"), ctx);
  return ctx;
}

const row = (name, dps, isUser = false) => ({ id: name, name, dps, isUser });

// The expression runs inside the vm, so the rows and the options have to be in
// the vm's global too. The result comes back as a vm array, which is not the
// host's Array: Array.from gives the host one back.
const namesOf = (ctx, rows, options) =>
  Array.from(
    vm.runInContext(
      "pickDisplayRows(rows, options).map((r) => r.name)",
      Object.assign(ctx, { rows, options })
    )
  );

test("the meter is expanded when the pointer is over it or it is pinned", () => {
  const ctx = coreContext();
  const expanded = vm.runInContext(
    "[meterIsExpanded(false, false), meterIsExpanded(true, false), meterIsExpanded(false, true)]",
    ctx
  );
  assert.deepEqual(Array.from(expanded), [false, true, true]);
});

test("the compact meter shows the top three", () => {
  const ctx = meterContext();
  const names = namesOf(ctx, [row("a", 100), row("b", 90), row("c", 80), row("d", 70)], {
    limit: 6,
    expanded: false,
  });
  assert.deepEqual(names, ["a", "b", "c"]);
});

test("your row takes the third place when you are outside the top three", () => {
  const ctx = meterContext();
  const names = namesOf(ctx, [row("a", 100), row("b", 90), row("c", 80), row("me", 10, true)], {
    limit: 6,
    expanded: false,
  });
  assert.deepEqual(names, ["a", "b", "me"]);
});

test("expanded, the meter shows as many rows as the setting allows", () => {
  const ctx = meterContext();
  const names = namesOf(ctx, [row("a", 100), row("b", 90), row("c", 80), row("d", 70)], {
    limit: 6,
    expanded: true,
  });
  assert.deepEqual(names, ["a", "b", "c", "d"]);
});

test("pinned to the top, you come first and the count still holds", () => {
  const ctx = meterContext();
  const names = namesOf(ctx, [row("a", 100), row("b", 90), row("c", 80), row("me", 10, true)], {
    limit: 3,
    expanded: false,
    pinUserToTop: true,
  });
  assert.deepEqual(names, ["me", "a", "b"]);
});
