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
const pitchWith = (ctx, rowGap) => {
  ctx.getComputedStyle = () => ({
    rowGap,
    getPropertyValue: (name) => (name === "--hud-row-h" ? "24px" : "3px"),
  });
  return vm.runInContext(
    "rowPitchPx(list)",
    Object.assign(ctx, { list: { querySelectorAll: () => [] } })
  );
};

test("a gap of zero is a real gap", () => {
  assert.equal(pitchWith(meterContext(), "0px"), 24);
});

test("an unreadable gap falls back to the CSS variable", () => {
  assert.equal(pitchWith(meterContext(), "normal"), 27);
});

// The percentage beside a row's figure: the share of what the meter shows.
// The fixture makes the metrics disagree — 50% of the damage, 20% of the
// healing, 25% of the stagger — so a share taken from the wrong metric
// gives a different number and the test says something.
const shareIn = (ctx, row, mode, totals) =>
  vm.runInContext("shareFor(row, mode, totals)", Object.assign(ctx, { row, mode, totals }));

const SHARE_ROW = { totalDamage: 500, healAmount: 100, stagger: 10 };
const SHARE_TOTALS = { damage: 1000, heal: 500, stagger: 40 };

test("the percentage is the share of what the meter is showing", () => {
  const ctx = meterContext();
  assert.equal(shareIn(ctx, SHARE_ROW, "hps", SHARE_TOTALS), 20);
  assert.equal(shareIn(ctx, SHARE_ROW, "totalHeal", SHARE_TOTALS), 20);
});

test("the damage share is the damage", () => {
  const ctx = meterContext();
  assert.equal(shareIn(ctx, SHARE_ROW, "dps", SHARE_TOTALS), 50);
  assert.equal(shareIn(ctx, SHARE_ROW, "totalDamage", SHARE_TOTALS), 50);
});

test("the stagger share is the stagger", () => {
  const ctx = meterContext();
  assert.equal(shareIn(ctx, SHARE_ROW, "stagger", SHARE_TOTALS), 25);
});

test("a share of nothing is empty, not zero", () => {
  const ctx = meterContext();
  assert.equal(shareIn(ctx, SHARE_ROW, "totalHeal", { ...SHARE_TOTALS, heal: 0 }), "");
  assert.equal(shareIn(ctx, SHARE_ROW, "stagger", { ...SHARE_TOTALS, stagger: 0 }), "");
  assert.equal(shareIn(ctx, SHARE_ROW, "dps", { ...SHARE_TOTALS, damage: 0 }), "");
});

// What the row's percentage says, and how the row is marked by it.
const contributionIn = (ctx, share) => {
  const result = vm.runInContext("contributionFor(share)", Object.assign(ctx, { share }));
  return { text: result.text, className: result.className };
};

test("an empty share says nothing and marks nothing", () => {
  assert.deepEqual(contributionIn(meterContext(), ""), { text: "", className: "" });
});

test("a share of zero is a real zero", () => {
  assert.deepEqual(contributionIn(meterContext(), 0), { text: "0.0%", className: "error" });
});

test("a small share is marked, a large one is not", () => {
  assert.deepEqual(contributionIn(meterContext(), 4), { text: "4.0%", className: "warning" });
  assert.deepEqual(contributionIn(meterContext(), 50), { text: "50.0%", className: "" });
});

// The meter drawn in a DOM small enough to run: the rows it draws, the
// percentage beside them and the resize the window needs when they change.
// The stub only has to be an element the meter can create, class, fill and
// ask for its size.
function element(tag = "div") {
  const classes = new Set();
  const el = {
    tagName: tag,
    className: "",
    dataset: {},
    style: { display: "", setProperty() {}, removeProperty() {} },
    children: [],
    textContent: "",
    innerHTML: "",
    title: "",
    src: "",
    draggable: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => {
        const wanted = on === undefined ? !classes.has(name) : !!on;
        if (wanted) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    // The DOM moves an element that is appended again; it does not copy it.
    appendChild: (child) => {
      const at = el.children.indexOf(child);
      if (at >= 0) el.children.splice(at, 1);
      el.children.push(child);
      return child;
    },
    addEventListener() {},
    removeAttribute() {},
    setAttribute() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    offsetHeight: 0,
    offsetWidth: 0,
    querySelectorAll: () => [],
    querySelector: () => null,
    replaceChildren: () => { el.children = []; },
    remove() {},
  };
  return el;
}

function meterHarness({ rows, limit = 6, mode = "dps" } = {}) {
  const frames = [];
  const resizes = [];
  const elList = element("div");
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const ctx = vm.createContext({
    window,
    console,
    document: {
      readyState: "complete",
      addEventListener() {},
      querySelector: () => null,
      createElement: (tag) => element(tag),
      documentElement: { dataset: {} },
    },
    getComputedStyle: () => ({ rowGap: "3px", getPropertyValue: () => "24px" }),
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    setTimeout() {},
    clearTimeout() {},
  });
  vm.runInContext(readFileSync(new URL("../public/src/js/meter.js", import.meta.url), "utf8"), ctx);
  const state = { expanded: false };
  window.javaBridge = {
    // How many rows were in the DOM when the window was asked to resize.
    updateOverlaySize: () => resizes.push(elList.children.length),
  };
  const ui = vm.runInContext("createMeterUI", ctx)({
    elList,
    dpsFormatter: { format: (n) => String(n) },
    getUserName: () => "me",
    getMetric: (row) => ({ value: row.dps, text: String(row.dps) }),
    getDisplayMode: () => mode,
    getSortDirection: () => "desc",
    getPinUserToTop: () => false,
    getPlayerLimit: () => limit,
    getPartyStat: () => "off",
    getJobColor: () => "",
    getExpanded: () => state.expanded,
    getRowRoom: () => Infinity,
  });
  const byClass = (el, cls) => el.children.find((child) => child.className === cls);
  return {
    elList,
    resizes,
    state,
    // Draw the rows, the way the page does: the update, then the frame.
    draw: (newRows = rows) => {
      ui.updateFromRows(newRows);
      frames.shift()?.();
    },
    // The percentage the row shows.
    contributionOf: (id) => {
      const rowEl = elList.children.find((el) => el.dataset.rowId === String(id));
      if (!rowEl) return null;
      const dps = byClass(byClass(rowEl, "content"), "dps");
      return dps.children[1].textContent;
    },
    drawnIds: () =>
      elList.children.filter((el) => el.style.display !== "none").map((el) => el.dataset.rowId),
  };
}

// A party: five players and one row that cannot be drawn (no id).
const statRow = (id, damage) => ({ id, name: id, dps: damage / 10, totalDamage: damage, healAmount: 0, stagger: 0 });
const PARTY = [
  statRow("a", 600),
  statRow("b", 500),
  { id: "", name: "", dps: 40, totalDamage: 400, healAmount: 0, stagger: 0 },
  statRow("c", 300),
  statRow("d", 200),
  statRow("e", 100),
];

test("a row's percentage does not change when the meter expands", () => {
  // The denominator is the expanded set — the rows up to "Max players shown"
  // — so the compact meter already shares them out.
  const meter = meterHarness({ rows: PARTY });
  meter.draw();
  assert.equal(meter.contributionOf("a"), "35.3%");
  assert.equal(meter.drawnIds().length, 2, "the row with no id is not drawn");

  meter.state.expanded = true;
  meter.draw();
  assert.equal(meter.contributionOf("a"), "35.3%", "the percentage must not move when the meter expands");
  assert.equal(meter.drawnIds().length, 5);
});

test("a row that cannot be drawn is not in the denominator", () => {
  // The row with no id carries 400 damage; it is in neither the numerator nor
  // the denominator, so the share is 600 of 1700 and not of 2100.
  const meter = meterHarness({ rows: PARTY });
  meter.draw();
  assert.equal(meter.contributionOf("a"), "35.3%");
});

test("the window is asked to resize once the rows are drawn", () => {
  // The class that expands the meter fires before the rows are drawn, so the
  // measurement would take the old height: the resize is asked for after.
  const meter = meterHarness({ rows: PARTY });
  meter.draw();
  assert.equal(meter.resizes.length, 1, "the window was not asked to resize");
  assert.ok(meter.resizes[0] > 0, "the resize was asked for before the rows were drawn");

  // The collapse asks for it too, or the window stays at the taller size.
  meter.state.expanded = true;
  meter.draw();
  meter.state.expanded = false;
  meter.draw();
  assert.equal(meter.resizes.length, 3);
  assert.ok(meter.resizes[1] > meter.resizes[0], "the expansion did not make the window taller");
});

// The idle rule's settings, and the flag that keeps the meter up while it
// is being dragged.
function idleContext() {
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const controls = {};
  const ctx = vm.createContext({
    window,
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelector: (selector) => controls[selector] ?? null,
    },
  });
  vm.runInContext(readFileSync(new URL("../public/src/js/core.js", import.meta.url), "utf8"), ctx);
  return { ctx, controls };
}

// A control with the handlers the page wires to it.
function control(extra = {}) {
  const handlers = {};
  return {
    checked: false,
    value: "",
    handlers,
    addEventListener(name, handler) { handlers[name] = handler; },
    fire(name, event) { handlers[name]?.(event); },
    ...extra,
  };
}

test("the idle settings are written when the checkbox and the input change", () => {
  const { ctx, controls } = idleContext();
  const written = [];
  ctx.window.javaBridge = {
    getSetting: () => undefined,
    setSetting: (key, value) => written.push([key, value]),
  };
  const checkbox = control();
  const input = control();
  controls[".hideWhenIdleCheckbox"] = checkbox;
  controls[".idleSecondsInput"] = input;

  const app = vm.runInContext("new DpsApp()", ctx);
  app.setupIdleSettings();

  checkbox.fire("change", { target: { checked: false } });
  input.fire("change", { target: { value: "30" } });
  assert.deepEqual(written, [
    ["dpsMeter.hideWhenIdle", "false"],
    ["dpsMeter.idleSeconds", "30"],
  ]);
});

test("the idle settings have their defaults: on, and fifteen seconds", () => {
  const { ctx, controls } = idleContext();
  ctx.window.javaBridge = { getSetting: () => undefined };
  const checkbox = control();
  const input = control();
  controls[".hideWhenIdleCheckbox"] = checkbox;
  controls[".idleSecondsInput"] = input;

  const app = vm.runInContext("new DpsApp()", ctx);
  app.setupIdleSettings();

  assert.equal(checkbox.checked, true, "the meter hides when idle, unless turned off");
  assert.equal(input.value, "15");
});

test("the idle settings read what the backend reads", () => {
  const { ctx, controls } = idleContext();
  // An empty value means on, as the backend reads it, and a number that is
  // not one means fifteen, as the backend reads it.
  ctx.window.javaBridge = {
    getSetting: (key) => (key === "dpsMeter.hideWhenIdle" ? "" : "abc"),
  };
  const checkbox = control();
  const input = control();
  controls[".hideWhenIdleCheckbox"] = checkbox;
  controls[".idleSecondsInput"] = input;

  const app = vm.runInContext("new DpsApp()", ctx);
  app.setupIdleSettings();

  assert.equal(checkbox.checked, true, "an empty value means on");
  assert.equal(input.value, "15", "a value that is not a number means fifteen");
});

test("the idle seconds stay inside what the backend accepts", () => {
  const { ctx, controls } = idleContext();
  const written = [];
  ctx.window.javaBridge = {
    getSetting: () => undefined,
    setSetting: (key, value) => written.push([key, value]),
  };
  const input = control();
  controls[".idleSecondsInput"] = input;

  const app = vm.runInContext("new DpsApp()", ctx);
  app.setupIdleSettings();

  input.fire("change", { target: { value: "9999" } });
  input.fire("change", { target: { value: "0" } });
  assert.deepEqual(written, [
    ["dpsMeter.idleSeconds", "600"],
    ["dpsMeter.idleSeconds", "1"],
  ]);
});

test("the backend is told when the meter is being dragged", () => {
  const { ctx } = idleContext();
  const told = [];
  ctx.window.javaBridge = {
    setMeterInteracting: (on) => told.push(on),
    moveWindow: () => {},
  };
  ctx.Node = { TEXT_NODE: 3 };
  const handlers = {};
  ctx.document.addEventListener = (name, handler) => { handlers[name] = handler; };

  const app = vm.runInContext("new DpsApp()", ctx);
  app.fetchDps = () => {};
  app.bindDragToMoveWindow();

  // A press on the meter starts the drag: the meter must not go away then.
  handlers.mousedown({ button: 0, screenX: 0, screenY: 0, target: { nodeType: 1, closest: () => null } });
  assert.deepEqual(told, [true]);
  handlers.mouseup({});
  assert.deepEqual(told, [true, false]);
});

