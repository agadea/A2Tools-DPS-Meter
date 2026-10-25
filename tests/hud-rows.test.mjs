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
  const party = [
    row("a", 100), row("b", 90), row("c", 80), row("d", 70),
    row("e", 60), row("f", 50), row("g", 40), row("h", 30),
  ];
  const names = namesOf(ctx, party, { limit: 4, expanded: true });
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

// The trim: how many rows the meter draws when there is only so much room
// below the window.
const countIn = (ctx, rows, room, pitch, drawn) =>
  vm.runInContext(
    "pickRowCount(rows, room, pitch, drawn)",
    Object.assign(ctx, { rows, room, pitch, drawn })
  );

test("the expansion is trimmed to the room below the window", () => {
  const ctx = meterContext();
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];
  // Three rows are drawn and 81px (three pitches) are left below.
  const count = countIn(ctx, rows, 81, 27, 3);
  assert.equal(count, 6);
  // Never more than the rows that fit.
  assert.ok(count <= 3 + Math.floor(81 / 27));
});

test("the trimmed count settles instead of trading rows with the room", () => {
  const ctx = meterContext();
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];
  let drawn = 3;
  let room = 81;
  const counts = [];
  for (let i = 0; i < 5; i++) {
    const count = countIn(ctx, rows, room, 27, drawn);
    counts.push(count);
    // Every row the meter adds takes its pitch out of the room below.
    room -= (count - drawn) * 27;
    drawn = count;
  }
  assert.deepEqual(counts, [6, 6, 6, 6, 6]);
});

test("the compact meter keeps three rows when there is no room below", () => {
  const ctx = meterContext();
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(countIn(ctx, rows, 0, 27, 0), 3);
  assert.equal(countIn(ctx, rows, 0, 27, 3), 3);
});

test("without a measurable pitch nothing is trimmed", () => {
  const ctx = meterContext();
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(countIn(ctx, rows, 0, 0, 0), 8);
});

// A gap of 0px is a real gap: "bar spacing" goes down to 0, and the pitch
// must not fall back to the CSS variable's 3px.
test("a gap of zero is a real gap", () => {
  const ctx = meterContext();
  ctx.getComputedStyle = () => ({
    rowGap: "0px",
    getPropertyValue: (name) => (name === "--hud-row-h" ? "24px" : "3px"),
  });
  const pitch = vm.runInContext(
    "rowPitchPx(list)",
    Object.assign(ctx, { list: { querySelectorAll: () => [] } })
  );
  assert.equal(pitch, 24);
});

// The percentage beside a row's figure: the share of what the meter shows.
const shareIn = (ctx, row, mode, totals) =>
  vm.runInContext("shareFor(row, mode, totals)", Object.assign(ctx, { row, mode, totals }));

test("the percentage is the share of what the meter is showing", () => {
  const ctx = meterContext();
  const result = shareIn(
    ctx,
    { totalDamage: 500, healAmount: 250, stagger: 10 },
    "hps",
    { damage: 1000, heal: 500, stagger: 40 }
  );
  assert.equal(result, 50);
});

test("the damage share is the damage", () => {
  const ctx = meterContext();
  const result = shareIn(
    ctx,
    { totalDamage: 500, healAmount: 250, stagger: 10 },
    "dps",
    { damage: 1000, heal: 500, stagger: 40 }
  );
  assert.equal(result, 50);
});

test("a share of nothing is empty, not zero", () => {
  const ctx = meterContext();
  const result = shareIn(
    ctx,
    { totalDamage: 500, healAmount: 0, stagger: 10 },
    "totalHeal",
    { damage: 1000, heal: 0, stagger: 40 }
  );
  assert.equal(result, "");
});
