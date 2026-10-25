# Minimal HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The DPS meter over the game shows three rows and nothing else until you hover it, hides itself when nothing is happening, and can be pinned open with a button or a hotkey.

**Architecture:** The look is CSS; the decisions (which rows, which percentage, whether to hide) are pure functions in the frontend and the backend's existing tick loop. The pin is a backend atomic like the overlay lock, toggled by a hotkey or the header button, mirrored to the page as an event. The hover state is a class on `.meter` that the CSS keys off, so the visual work hot-reloads in the running game without a Rust rebuild.

**Tech Stack:** Vanilla JS (classic scripts, no modules), CSS custom properties, Tauri 2 (Rust), `node --test` for the frontend tests, `cargo test` for the backend.

**Spec:** `docs/superpowers/specs/2026-10-25-minimal-hud-design.md`

## Global Constraints

- No new dependencies. No build step changes. The frontend stays classic scripts (`<script src>`), so `import.meta.env` is unavailable — no `import.meta` anywhere.
- The Details, History and Settings panels are not redesigned. The OBS stream overlay (`src-tauri/src/stream_overlay/page.html`) is not touched.
- Themes, bar textures and the supporter/A2Tools badges are kept, not deleted.
- "Max players shown" keeps its meaning: how many rows the meter shows when it is **expanded**. Its default stays 6 and its dropdown options stay `[4, 5, 6, 7, 8, 10, 12]`.
- The compact meter shows **3** rows. That number is fixed, not a setting.
- Your own row is always among the three: outside the top three, your row takes the third place.
- The idle timeout default is **15 s**. The pin hotkey default is **Ctrl+Alt+P**.
- OS-specific code only in `src-tauri/src/platform/` (the CI job "OS code stays in src/platform" checks this).
- `node --test tests/*.test.mjs` and `cargo test --all-targets` must pass before any commit.
- The frontend scripts are loaded in this order in `index.html`: `tauriBridge`, `battleTime`, `ttk`, `meter`, `skillIcons`, `buffTimeline`, `staggerPanel`, `details`, `fightReplay`, `history`, `checkRelease`, `i18n`, `core`. `meter.js` loads before `core.js`, so `core.js` may use what `meter.js` defines, never the other way round.

## Review Focus

Five inputs the spec implies that no task's happy-path test covers. Each one gets a test in the task that owns the code.

1. **The overlay is locked (click-through).** The window ignores the mouse, so there is no hover: the pin is the only way to see the extra data, and the pin button must stay clickable while locked. → Task 5.
2. **The meter sits near the bottom of the screen.** The expansion must be trimmed to the room below, never grow past the screen edge (KWin moves the window back and the flicker loop of issue #11 returns). → Task 2.
3. **You are outside the top three.** Your row takes the third place, and the rank it shows is still your real rank (the rank is by damage, not by row order). → Task 3.
4. **No damage has ever been recorded** (`NEVER_MS`). The meter counts as idle and hides; the first hit brings it back. → Task 6.
5. **HEAL mode with nobody having healed.** The percentage is empty, not "0.0%". → Task 4.

---

### Task 1: The compact look

The meter's default appearance: shorter rows, smaller type, the boss HP as a hairline with its percentage in the header, and a flat bar without the lit edge.

**Files:**
- Modify: `src/styles.css` (`:root` at line 405, `.header` at 460, `.bossHpBar` at 570, `.list .item` at 637, `.list .item .fill` at 660, `.list .item .fill::after` at 687, `.list .item .content` at 929, `.rank` at 939, `.classIcon` at 953, `.name` at 971, `.dps` at 997, `.dps > p` at 1018, `.dpsContribution` at 1033, `.meter.slim` at 1296, `.barPreviewPanel.slim` at 1311)
- Modify: `index.html` (the `.header` block, lines 46–65)
- Modify: `public/src/js/core.js` (`updateBossHpBar`, line 5590)
- Test: `tests/hud-styles.test.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `.bossHpInline` in the header, with `.bossHpPctInline` and `.bossHpAmtInline` inside it. `updateBossHpBar(maxHp, totalDamage, currentHp)` keeps its signature and additionally writes the percentage and the absolute HP into those two spans.

- [ ] **Step 1: Write the failing test**

Create `tests/hud-styles.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the row is shorter than it was", () => {
  assert.match(css, /--hud-row-h:\s*24px/);
  assert.match(css, /\.meter\.slim\s*\{[^}]*--hud-row-h:\s*20px/);
  assert.match(css, /\.barPreviewPanel\.slim\s*\{[^}]*--hud-row-h:\s*20px/);
});

test("the boss HP is a hairline with the figure in the header", () => {
  assert.match(css, /\.bossHpBar\s*\{[^}]*height:\s*3px/);
  assert.match(html, /class="bossHpInline"/);
  assert.match(html, /class="bossHpPctInline"/);
  assert.match(html, /class="bossHpAmtInline"/);
});

test("the bar has no lit edge", () => {
  const fill = css.slice(css.indexOf(".list .item .fill"), css.indexOf(".list .item .fill", css.indexOf(".list .item .fill") + 1));
  assert.doesNotMatch(fill, /::after/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/hud-styles.test.mjs`
Expected: FAIL — `--hud-row-h: 24px` is not in the CSS yet (the file has `30px`).

- [ ] **Step 3: Write the minimal implementation**

In `src/styles.css`:

```css
/* ---------- the compact meter ---------- */
/* The row is the meter's floor: 24px, the type scaled to match, and the
   boss HP reduced to a hairline, so the meter covers as little of the game
   as it can while still being read at a glance. */
:root {
  --hud-row-h: 24px;
  --hud-gap: 3px;
}
.meter.slim { --hud-row-h: 20px; --hud-gap: 2px; }
.barPreviewPanel.slim { --hud-row-h: 20px; --hud-gap: 2px; }
```

Replace `.bossHpBar`'s `height: 14px` with `height: 3px`, drop its
`border-bottom`, and change `.bossHpFill` to a flat fill:

```css
.bossHpBar {
  position: relative;
  height: 3px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.45);
  border-top: 1px solid var(--hud-hairline);
}
.bossHpFill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(180deg, #47d47d 0%, #2ea75f 100%);
  opacity: var(--meter-fill-opacity, 0.8);
  transition: width var(--bar-glide, 200ms) steps(5, end), background 300ms ease;
}
```

Delete the `.bossHpFill::after` rule (the lit edge) and the `.bossHpText`
rules inside `.bossHpBar` (the figures move to the header).

Add the header's figures:

```css
.header .bossHpInline {
  order: 2;
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--hud-tech);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--hud-sub);
  white-space: nowrap;
}
.header .bossHpInline .bossHpPctInline { color: var(--hud-num); }
```

Scale the row's type down with the row:

```css
.list .item .rank { font-size: 10px; }
.list .item .classIcon { width: 16px; height: 16px; }
.list .item .name { font-size: 13px; }
.list .item .name.isCjk { font-size: 12.5px; }
.list .item .dps > p { font-size: 14px; }
.list .item .dps .dpsContribution { font-size: 10px; min-width: 30px; }
```

In `index.html`, inside `.header`, after the `.bossNames` div:

```html
<div class="bossHpInline">
  <span class="bossHpPctInline"></span>
  <span class="bossHpAmtInline"></span>
</div>
```

In `public/src/js/core.js`, in `updateBossHpBar`, after the existing
`elBossHpText` block, add:

```js
    const inline = document.querySelector(".bossHpInline");
    if (inline) {
      const pctInline = inline.querySelector(".bossHpPctInline");
      const amtInline = inline.querySelector(".bossHpAmtInline");
      if (pctInline) pctInline.textContent = `${Math.round(pct)}%`;
      if (amtInline) {
        amtInline.textContent = `${this.formatAbbreviatedNumber(remaining)} / ${this.formatAbbreviatedNumber(max)}`;
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/hud-styles.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Check the whole frontend still builds**

Run: `npm run build`
Expected: the build succeeds. (The CSS and HTML changes cannot break the build; this is a smoke check that the markup is still well formed enough for Vite.)

- [ ] **Step 6: Commit**

```bash
git add src/styles.css index.html public/src/js/core.js tests/hud-styles.test.mjs
git commit -m "The meter gets smaller

Shorter rows, smaller type, the boss HP as a hairline with its figure in
the header, and a flat bar without the lit edge. The meter covers less of
the game and says the same thing.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: The hover state

Hovering the meter expands it: the chrome appears, the accessory data appears, and the window grows to show the rest of the party.

**Files:**
- Modify: `public/src/js/core.js` (the `meterUI` options at line 386, a new `setMeterExpanded`, the pointer tracking)
- Modify: `public/src/js/meter.js` (`createMeterUI`'s options and `getDisplayRows`)
- Modify: `public/src/js/tauriBridge.js` (`spaceRightBelow` is private today — expose it)
- Modify: `src/styles.css` (the reveal rules)
- Test: `tests/hud-styles.test.mjs` (extend), `tests/hud-rows.test.mjs` (create)

**Interfaces:**
- Consumes: Task 1's CSS variables.
- Produces:
  - `meterIsExpanded(hovered, pinned)` → `boolean`, a top-level function in `core.js`.
  - `DpsApp#setMeterExpanded(expanded)` → toggles the `isExpanded` class on `.meter` and re-renders the rows.
  - `DpsApp#meterExpanded` → `boolean` property.
  - `window.javaBridge.spaceBelow()` → `{ w: number, h: number }`, the screen space to the right of and below the window.
  - `createMeterUI({ ..., getExpanded, getRowRoom })` — two new options.

- [ ] **Step 1: Write the failing test**

Create `tests/hud-rows.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function context() {
  const window = { addEventListener() {}, devicePixelRatio: 1 };
  const ctx = vm.createContext({
    window,
    console,
    document: { readyState: "loading", addEventListener() {}, querySelector: () => null },
  });
  vm.runInContext(readFileSync(new URL("../public/src/js/core.js", import.meta.url), "utf8"), ctx);
  return ctx;
}

test("the meter is expanded when the pointer is over it or it is pinned", () => {
  const ctx = context();
  const expanded = vm.runInContext(
    "meterIsExpanded(false, false), meterIsExpanded(true, false), meterIsExpanded(false, true)",
    ctx
  );
  assert.deepEqual(Array.from(expanded), [false, true, true]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/hud-rows.test.mjs`
Expected: FAIL — `meterIsExpanded` is not defined (`ReferenceError`).

- [ ] **Step 3: Write the minimal implementation**

In `public/src/js/core.js`, above the `DpsApp` class:

```js
// The meter is expanded when the pointer is over it, or when it is pinned.
// Both mean the same thing to the reader: "show me everything".
const meterIsExpanded = (hovered, pinned) => !!hovered || !!pinned;
```

In the `DpsApp` constructor, next to `this.isCollapse = false;` (line 154):

```js
    this.meterExpanded = false;
    this.meterHovered = false;
```

Add the method to `DpsApp`:

```js
  /** The meter's expanded state: the extra rows, the extra columns and the
   *  chrome. The class on `.meter` is what the CSS keys off. */
  setMeterExpanded(expanded) {
    this.meterExpanded = !!expanded;
    document.querySelector(".meter")?.classList.toggle("isExpanded", this.meterExpanded);
    this.renderCurrentRows();
  }
```

Add the pointer tracking, next to `this.bindDragToMoveWindow();` (line 382):

```js
    this._bindMeterHover();
```

and the method:

```js
  _bindMeterHover() {
    const meter = document.querySelector(".meter");
    if (!meter) return;
    const sync = () => {
      this.meterHovered = meter.matches(":hover");
      this.setMeterExpanded(meterIsExpanded(this.meterHovered, this.pinned));
    };
    meter.addEventListener("pointerenter", () => { this.meterHovered = true; sync(); });
    meter.addEventListener("pointerleave", () => { this.meterHovered = false; sync(); });
  }
```

In `public/src/js/meter.js`, in `createMeterUI`'s destructured options, add
`getExpanded` and `getRowRoom`:

```js
    getExpanded = () => false,
    getRowRoom = () => Infinity,
```

and change `getDisplayRows` (line 249) to:

```js
  const getDisplayRows = (sortedAll) => {
    const limit = (typeof getPlayerLimit === "function" ? getPlayerLimit() : 6) || 6;
    // Compact: three rows. Expanded: as many as the setting allows, and only
    // as many as fit below the window, so the overlay never grows past the
    // screen edge (the window manager would move it back, issue #11).
    const cap = getExpanded() ? limit : Math.min(3, limit);
    const topN = sortedAll.slice(0, cap);
    const user = sortedAll.find((x) => x.isUser);

    if (!user) return topN;
    const pinUser = typeof getPinUserToTop === "function" && getPinUserToTop();
    if (pinUser) {
      return [user, ...topN.filter((row) => !row.isUser)].slice(0, cap);
    }
    if (topN.some((x) => x.isUser)) return topN;
    if (topN.length < cap) return [...topN, user];
    // Your row takes the last place, so you always see yourself.
    return [...topN.slice(0, cap - 1), user];
  };
```

The room below the window decides how many of the extra rows fit. In
`public/src/js/tauriBridge.js`, `spaceRightBelow` is a local function inside
the IIFE; expose it:

```js
  window.javaBridge.spaceBelow = spaceRightBelow;
```

and in `core.js`, pass it into the meter:

```js
      getExpanded: () => this.meterExpanded,
      getRowRoom: () => window.javaBridge?.spaceBelow?.().h ?? Infinity,
```

In `src/styles.css`, add the reveal rules:

```css
/* ---------- the hover state ---------- */
/* The chrome and the accessory data are hidden until the meter is hovered:
   the pointer over the meter, or the pin. The lock button is the way out
   of click-through, so it never hides. */
.header .headerBtns .headerBtn,
.footerBtns .footerBtn {
  opacity: 0;
  transition: opacity 140ms ease;
}
.meter.isExpanded .header .headerBtns .headerBtn,
.meter.isExpanded .footerBtns .footerBtn {
  opacity: 1;
}
.header .headerBtns .lockBtn { opacity: 1; }

/* The accessory data: the class icon, the badges and the combat power.
   They take no room until they are wanted, so the row stays short. The
   name gives up the space instead: the readout keeps its place. */
.list .item .classIcon,
.list .item .combatPower,
.list .item .supporterBadge,
.list .item .a2toolsBadge {
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-width 140ms ease, opacity 140ms ease;
}
.meter.isExpanded .list .item .classIcon { max-width: 16px; opacity: 1; }
.meter.isExpanded .list .item .combatPower { max-width: 60px; opacity: 1; }
.meter.isExpanded .list .item .supporterBadge,
.meter.isExpanded .list .item .a2toolsBadge { max-width: 16px; opacity: 1; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hud-rows.test.mjs tests/hud-styles.test.mjs`
Expected: PASS.

- [ ] **Step 5: Trim the expansion to the room below**

The rows beyond the first three are the ones that do not fit. In
`public/src/js/meter.js`, `renderRows` receives the rows to draw; trim them
there, after `getDisplayRows`:

```js
    const displayRows = getDisplayRows(arr);
    // Only the rows that fit below the window are drawn: the overlay grows
    // from its top-left corner, and a window that grows past the screen edge
    // is moved back by the window manager (issue #11).
    const room = getRowRoom();
    const rowHeight = 24;
    const roomRows = Number.isFinite(room) ? Math.max(3, Math.floor(room / rowHeight)) : Infinity;
    const rows = displayRows.slice(0, roomRows);
```

and replace the `renderRows(getDisplayRows(arr), rankById);` call with
`renderRows(rows, rankById);`.

- [ ] **Step 6: Check the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add public/src/js/core.js public/src/js/meter.js public/src/js/tauriBridge.js src/styles.css tests/hud-rows.test.mjs
git commit -m "Hovering expands the meter

The chrome and the accessory data wait for the pointer, and the meter
grows to the rest of the party. The expansion is trimmed to the room
below the window, so the overlay never grows past the screen edge.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: The top three

Your own row always shows, even when your damage puts you outside the top three.

**Files:**
- Modify: `public/src/js/meter.js` (`getDisplayRows`, changed in Task 2 — extend it here)
- Test: `tests/hud-rows.test.mjs` (extend)

**Interfaces:**
- Consumes: `pickDisplayRows(sortedAll, { limit, expanded, pinUserToTop })` — a top-level function in `meter.js` (extracted in this task).
- Produces: `pickDisplayRows`, used by `getDisplayRows`.

- [ ] **Step 1: Write the failing test**

Add to `tests/hud-rows.test.mjs`:

```js
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

// The expression runs inside the vm, so the rows and the options have to be
// in the vm's global too. The result comes back as a vm array, which is not
// the host's Array: Array.from gives the host one back.
const namesOf = (ctx, rows, options) =>
  Array.from(
    vm.runInContext(
      "pickDisplayRows(rows, options).map((r) => r.name)",
      Object.assign(ctx, { rows, options })
    )
  );

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/hud-rows.test.mjs`
Expected: FAIL — `pickDisplayRows` is not defined.

- [ ] **Step 3: Write the minimal implementation**

In `public/src/js/meter.js`, above `createMeterUI`:

```js
// The rows the meter draws. Compact: the top three, with your own row
// taking the last place when your damage puts you outside them, so you
// always see yourself. Expanded: as many as the setting allows.
function pickDisplayRows(sortedAll, { limit = 6, expanded = false, pinUserToTop = false } = {}) {
  const cap = expanded ? limit : Math.min(3, limit);
  const topN = sortedAll.slice(0, cap);
  const user = sortedAll.find((x) => x.isUser);
  if (!user) return topN;
  if (pinUserToTop) {
    return [user, ...topN.filter((row) => !row.isUser)].slice(0, cap);
  }
  if (topN.some((x) => x.isUser)) return topN;
  if (topN.length < cap) return [...topN, user];
  return [...topN.slice(0, cap - 1), user];
}
```

and rewrite `getDisplayRows` to use it:

```js
  const getDisplayRows = (sortedAll) =>
    pickDisplayRows(sortedAll, {
      limit: (typeof getPlayerLimit === "function" ? getPlayerLimit() : 6) || 6,
      expanded: getExpanded() === true,
      pinUserToTop: typeof getPinUserToTop === "function" && getPinUserToTop(),
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hud-rows.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add public/src/js/meter.js tests/hud-rows.test.mjs
git commit -m "Your row is always in the meter

The compact meter shows three rows, and your own row takes the third
place when your damage puts you outside them.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: The percentage follows the metric

In HEAL mode the row's percentage is your share of the party's healing, not of its damage.

**Files:**
- Modify: `public/src/js/meter.js` (`renderRows`, the contribution)
- Modify: `public/src/js/core.js` (`getMetricForRow` — expose the mode so `meter.js` can pick the share)
- Test: `tests/hud-rows.test.mjs` (extend)

**Interfaces:**
- Consumes: `shareFor(row, mode, totals)` — a top-level function in `meter.js`.
- Produces: `shareFor`; `createMeterUI` gains the option `getDisplayMode: () => string`.

- [ ] **Step 1: Write the failing test**

Add to `tests/hud-rows.test.mjs`:

```js
test("the percentage is the share of what the meter is showing", () => {
  const ctx = meterContext();
  const result = vm.runInContext(
    "shareFor({ totalDamage: 500, healAmount: 250, stagger: 10 }, 'hps', { damage: 1000, heal: 500, stagger: 40 })",
    ctx
  );
  assert.equal(result, 50);
});

test("the damage share is the damage", () => {
  const ctx = meterContext();
  const result = vm.runInContext(
    "shareFor({ totalDamage: 500, healAmount: 250, stagger: 10 }, 'dps', { damage: 1000, heal: 500, stagger: 40 })",
    ctx
  );
  assert.equal(result, 50);
});

test("a share of nothing is empty, not zero", () => {
  const ctx = meterContext();
  const result = vm.runInContext(
    "shareFor({ totalDamage: 500, healAmount: 0, stagger: 10 }, 'totalHeal', { damage: 1000, heal: 0, stagger: 40 })",
    ctx
  );
  assert.equal(result, "");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/hud-rows.test.mjs`
Expected: FAIL — `shareFor` is not defined.

- [ ] **Step 3: Write the minimal implementation**

In `public/src/js/meter.js`, above `createMeterUI`:

```js
// The row's percentage: how much of what the meter is showing, this player
// did. In HEAL mode that is the healing, not the damage — a healer beside
// "0%" was saying nothing. A share of nothing is empty, not "0.0%".
function shareFor(row, mode, totals) {
  const t = totals || {};
  if (mode === "hps" || mode === "totalHeal") {
    const total = Number(t.heal) || 0;
    if (total <= 0) return "";
    return ((Number(row?.healAmount) || 0) / total) * 100;
  }
  if (mode === "stagger") {
    const total = Number(t.stagger) || 0;
    if (total <= 0) return "";
    return ((Number(row?.stagger) || 0) / total) * 100;
  }
  const total = Number(t.damage) || 0;
  if (total <= 0) return "";
  return ((Number(row?.totalDamage) || 0) / total) * 100;
}
```

In `createMeterUI`'s options, add `getDisplayMode = () => "dps"`.

In `renderRows`, replace the contribution block (lines 451–478) with:

```js
    const visibleTotalDamage = rows.reduce((sum, row) => sum + (Number(row?.totalDamage) || 0), 0);
    const visibleTotalHeal = rows.reduce((sum, row) => sum + (Number(row?.healAmount) || 0), 0);
    const visibleTotalStagger = rows.reduce((sum, row) => sum + (Number(row?.stagger) || 0), 0);
    const totals = { damage: visibleTotalDamage, heal: visibleTotalHeal, stagger: visibleTotalStagger };
    const mode = getDisplayMode();
```

and inside the row loop, replace the `damageContribution` computation with:

```js
      const share = shareFor(row, mode, totals);
      const damageContribution = share === "" ? NaN : share;
```

and the contribution text with:

```js
      const contributionText = share === "" ? "" : `${share.toFixed(1)}%`;
```

The `warning`/`error` classes use `damageContribution`; keep them, but only
when there is a share:

```js
      let contributionClass = "";
      if (Number.isFinite(damageContribution)) {
        if (damageContribution < 3) {
          contributionClass = "error";
        } else if (damageContribution < 5) {
          contributionClass = "warning";
        }
      }
```

In `public/src/js/core.js`, pass the mode in:

```js
      getDisplayMode: () => this.displayMode || "dps",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hud-rows.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add public/src/js/meter.js public/src/js/core.js tests/hud-rows.test.mjs
git commit -m "The percentage follows the metric

In HEAL mode the row's percentage was the damage share, so a healer saw
a figure that said nothing about their healing. It is now the share of
whatever the meter is showing: damage, healing or stagger.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: The pin

A pin that keeps the meter expanded, keeps the accessory data visible, and keeps the meter from hiding — toggled by a button in the header or by a hotkey, and still clickable while the overlay is locked.

**Files:**
- Modify: `src-tauri/src/app.rs` (`HOTKEY_KEYS` line 898, `HOTKEY_DEFAULTS` line 953, `start_hotkeys` line 997, `OverlayLock` line 94, `pointer_over_lock_button` line 374, `sync_click_through` line 344, `set_lock_button_rect` line 1366, `AppState` line 56)
- Modify: `src-tauri/src/platform/linux/window.rs` (`click_through_except` line 174), `src-tauri/src/platform/win32/window.rs` (line 167), `src-tauri/src/platform/unsupported/window.rs` (line 55)
- Modify: `public/src/js/tauriBridge.js` (`setLockButtonRect` line 807, the hotkey getters/setters line 749)
- Modify: `public/src/js/core.js` (the header button wiring, the keybind row, the pin state)
- Modify: `index.html` (the pin button in the header, the keybind row)
- Test: `tests/hud-rows.test.mjs` (extend), `src-tauri/src/app.rs` (a `#[cfg(test)]` module)

**Interfaces:**
- Consumes: `meterIsExpanded(hovered, pinned)` from Task 2.
- Produces:
  - Rust: `AppState::pinned: AtomicBool`, the command `set_pinned(app, pinned: bool)`, the command `is_pinned(state) -> bool`, the event `pin-changed` with a `bool` payload, the command `set_overlay_button_rects(app, rects: Vec<(f64, f64, f64, f64)>, scale: f64)`.
  - JS: `window.javaBridge.setPinned(pinned)`, `window.javaBridge.getCurrentPinHotKey()`, `window.javaBridge.setPinHotkey(mods, vk)`, `window.javaBridge.setOverlayButtonRects(rects, scale)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/hud-rows.test.mjs`:

```js
test("the pin keeps the meter expanded without the pointer", () => {
  const ctx = context();
  const expanded = vm.runInContext("meterIsExpanded(false, true)", ctx);
  assert.equal(expanded, true);
});
```

The pin's Rust side is wiring (an atomic on the app state, a command and an
event), so it has no unit test of its own: `cargo test` proves it compiles,
and Step 9 checks it by hand.

- [ ] **Step 2: Run the test to verify it passes**

Run: `node --test tests/hud-rows.test.mjs`
Expected: PASS (the pin is `meterIsExpanded`'s second argument, from Task 2).

- [ ] **Step 3: The Rust side of the pin**

In `src-tauri/src/app.rs`:

Add to `AppState` (after `pub overlay_lock: Arc<OverlayLock>,`):

```rust
    /// The meter's pin: the meter stays expanded and never hides. Toggled by
    /// the header's pin button or the pin hotkey.
    pub pinned: std::sync::atomic::AtomicBool,
```

and to the `AppState { ... }` construction (line 3334):

```rust
                pinned: std::sync::atomic::AtomicBool::new(false),
```

Add the commands next to `set_overlay_locked` (line 1344):

```rust
/// The meter's pin: expanded, with the accessory data, and never hidden.
#[tauri::command]
fn set_pinned(app: tauri::AppHandle, state: tauri::State<'_, AppState>, pinned: bool) {
    let pinned = !!pinned;
    state.pinned.store(pinned, std::sync::atomic::Ordering::SeqCst);
    state.settings.set("dpsMeter.pinned", if pinned { "true" } else { "false" });
    let _ = app.emit("pin-changed", pinned);
}

#[tauri::command]
fn is_pinned(state: tauri::State<'_, AppState>) -> bool {
    state.pinned.load(std::sync::atomic::Ordering::SeqCst)
}
```

The hotkey. In `HOTKEY_KEYS` (line 898):

```rust
const HOTKEY_KEYS: [&str; 5] = [
    "dpsMeter.hotkey",
    "dpsMeter.toggleWindowHotkey",
    "dpsMeter.lockHotkey",
    "dpsMeter.pluginWindowsHotkey",
    "dpsMeter.pinHotkey",
];
```

In `HOTKEY_DEFAULTS` (line 953):

```rust
pub const HOTKEY_DEFAULTS: [(&str, &str); 5] = [
    ("dpsMeter.hotkey", "Ctrl+Alt+R"),
    ("dpsMeter.toggleWindowHotkey", "Ctrl+Alt+Up"),
    ("dpsMeter.lockHotkey", "Ctrl+Alt+L"),
    ("dpsMeter.pluginWindowsHotkey", ""),
    ("dpsMeter.pinHotkey", "Ctrl+Alt+P"),
];
```

In `start_hotkeys` (line 997), after the `lock` binding:

```rust
    let h = app.clone();
    let pin = binding("pin", "dpsMeter.pinHotkey", Box::new(move || {
        let Some(state) = h.try_state::<AppState>() else { return };
        let pinned = !state.pinned.load(std::sync::atomic::Ordering::SeqCst);
        state.pinned.store(pinned, std::sync::atomic::Ordering::SeqCst);
        state.settings.set("dpsMeter.pinned", if pinned { "true" } else { "false" });
        let _ = h.emit("pin-changed", pinned);
    }));
```

and add `pin` to the vector passed to `hotkeys.manager.start`.

Register the two new commands in the `invoke_handler` list (near
`set_overlay_locked`):

```rust
            set_pinned,
            is_pinned,
            set_overlay_button_rects,
```

- [ ] **Step 4: The click-through region takes a list of rectangles**

Today `OverlayLock` holds one rectangle, the lock button's, and the pointer
watch asks whether the cursor is over it. The pin button has to be clickable
too, while the rest of the window lets the clicks through.

In `src-tauri/src/app.rs`, change `OverlayLock`:

```rust
#[derive(Default)]
pub struct OverlayLock {
    locked: std::sync::atomic::AtomicBool,
    /// The buttons that stay clickable while the window lets clicks through:
    /// their rectangles in CSS px and the page's scale.
    buttons: Mutex<(Vec<(f64, f64, f64, f64)>, f64)>,
    /// Whether the pointer watch is running.
    watching: std::sync::atomic::AtomicBool,
    /// A card is open in the page (a one-time popup, the update prompt): the
    /// window takes the mouse while it is, locked or not, or nothing on the
    /// card could be clicked. It covers the lock button too.
    card_open: std::sync::atomic::AtomicBool,
    /// What the window was last told (`true` = ignore the mouse). Every change
    /// goes through `sync_click_through` under this lock, so a late pointer
    /// check can never leave an unlocked window click-through.
    applied: Mutex<Option<bool>>,
}
```

Replace `pointer_over_lock_button` (line 374) with:

```rust
/// Whether the pointer is over one of the buttons that stay clickable while
/// the window lets clicks through.
fn pointer_over_buttons(app: &tauri::AppHandle, lock: &OverlayLock) -> bool {
    let Some((px, py)) = platform::window::cursor_position() else { return false };
    let (rects, scale) = lock.buttons.lock().map(|b| (b.0.clone(), b.1)).unwrap_or_default();
    let Some(origin) = app.get_webview_window("main").and_then(|m| m.inner_position().ok()) else {
        return false;
    };
    for (x, y, w, h) in rects {
        let (left, top) = (origin.x as f64 + x * scale, origin.y as f64 + y * scale);
        let (px, py) = (px as f64, py as f64);
        if px >= left && px < left + w * scale && py >= top && py < top + h * scale {
            return true;
        }
    }
    false
}
```

and its call site (line 403): `let over = pointer_over_buttons(&app, &lock);`

Replace `set_lock_button_rect` (line 1366) with:

```rust
/// Where the buttons that stay clickable are in the main window's page, so
/// they stay clickable while the rest of the window lets clicks through.
#[tauri::command]
fn set_overlay_button_rects(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    rects: Vec<(f64, f64, f64, f64)>,
    scale: f64,
) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    *state.overlay_lock.buttons.lock() = (rects, scale);
    // On Linux the buttons' input region moves with them.
    if cfg!(target_os = "linux") {
        let lock = state.overlay_lock.clone();
        sync_click_through(&app, &lock, false);
    }
}
```

In `sync_click_through` (line 344), the Linux branch:

```rust
    if let Some(main) = app.get_webview_window("main") {
        let (rects, scale) = lock.buttons.lock().map(|b| (b.0.clone(), b.1)).unwrap_or_default();
        if platform::window::meter_click_through(&main, ignore, Some((&rects, scale))) {
            *applied = Some(ignore);
            return;
        }
    }
```

- [ ] **Step 5: The platform's meter click-through**

In `src-tauri/src/platform/linux/window.rs`, next to `click_through_except`:

```rust
/// The meter's click-through: while locked, the clicks go through to the game
/// except over the buttons that stay clickable (`keep`: CSS-px rectangles and
/// the page's scale).
pub fn meter_click_through(
    window: &tauri::WebviewWindow,
    ignore: bool,
    keep: Option<(&[(f64, f64, f64, f64)], f64)>,
) -> bool {
    input_region(window, ignore, keep.map(|(rects, scale)| (rects.to_vec(), scale)))
}
```

In `src-tauri/src/platform/win32/window.rs` and
`src-tauri/src/platform/unsupported/window.rs`:

```rust
/// The meter's click-through: Windows watches the pointer instead (app.rs),
/// so there is no region to set here.
pub fn meter_click_through(
    _window: &tauri::WebviewWindow,
    _ignore: bool,
    _keep: Option<(&[(f64, f64, f64, f64)], f64)>,
) -> bool {
    false
}
```

- [ ] **Step 6: The JavaScript side of the pin**

In `public/src/js/tauriBridge.js`, replace `setLockButtonRect` with:

```js
    setOverlayButtonRects(rects, scale) {
      invoke("set_overlay_button_rects", { rects, scale }).catch(() => {});
    },
```

and add, next to the other hotkey helpers:

```js
    getCurrentPinHotKey() {
      return this.getSetting("dpsMeter.pinHotkey") || "Ctrl+Alt+P";
    },
    setPinHotkey(mods, vk) {
      this.setSetting("dpsMeter.pinHotkey", this._buildHotkeyLabel(mods, vk));
    },
    setPinned(pinned) {
      invoke("set_pinned", { pinned: !!pinned }).catch(() => {});
    },
```

and in `restoreDefaultHotkeys`:

```js
      this.setSetting("dpsMeter.pinHotkey", "Ctrl+Alt+P");
```

In `public/src/js/core.js`:

The pin button, next to the other header buttons (line 57, `.headerBtns`):

```html
<div class="headerBtn pinBtn" role="button" tabindex="0" aria-label="Pin the meter" data-i18n-aria-label="meter.pin"><i data-lucide="pin"></i></div>
```

In the constructor, next to `this.lockBtn = ...` (line 376):

```js
    this.pinBtn = document.querySelector(".pinBtn");
    this.pinned = false;
```

In `bindHeaderButtons` (line 2593), after the lock button:

```js
    this.pinBtn?.addEventListener("click", () => {
      this.setPinned(!this.pinned);
    });
```

Add the method:

```js
  /** The pin: the meter stays expanded, with its extra data, and never
   *  hides. The backend owns the state (it has to, for the hotkey). */
  setPinned(pinned) {
    this.pinned = !!pinned;
    this.safeSetSetting(this.storageKeys.pinned, this.pinned ? "true" : "false");
    this.pinBtn?.classList.toggle("isPinned", this.pinned);
    this.setMeterExpanded(meterIsExpanded(this.meterHovered, this.pinned));
    window.javaBridge?.setPinned?.(this.pinned);
  }
```

Add the storage key, next to `autoHideMeter` (line 127):

```js
      pinned: "dpsMeter.pinned",
```

Listen for the backend's event, next to the other listeners in
`tauriBridge.js` (the `listen("overlay-lock-changed", ...)` block, line 342):

```js
  listen("pin-changed", (event) => {
    window.dpsApp?.setPinned?.(event.payload === true);
  });
```

On startup, read the saved state (next to where the other settings are read,
around line 341 of `core.js`):

```js
    this.pinned = this.safeGetSetting(this.storageKeys.pinned) === "true";
    this.pinBtn?.classList.toggle("isPinned", this.pinned);
```

Report the buttons' rectangles. Replace the call to `setLockButtonRect`
wherever it is made (in `tauriBridge.js` or `core.js` — find it with
`grep -n "setLockButtonRect" public/src/js/*.js`) with a call that sends
both buttons:

```js
    const rects = [];
    for (const sel of [".lockBtn", ".pinBtn"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push([r.left, r.top, r.width, r.height]);
    }
    window.javaBridge?.setOverlayButtonRects?.(rects, window.devicePixelRatio || 1);
```

Call it whenever the header is laid out (a `ResizeObserver` on the header, or
after the meter is shown).

- [ ] **Step 7: The keybind row**

In `index.html`, after the lock keybind row (line 1060):

```html
                  <div class="settingsRow settingsRowKeybind">
                    <div class="settingsInfo">
                      <div class="settingsLabel" data-i18n="settings.keybind.pin">Pin the meter</div>
                    </div>
                    <button class="keybindBtn pinKeybindBtn" type="button" data-keybind="pin">
                      <span class="keybindText">Ctrl+Alt+P</span>
                    </button>
                  </div>
```

In `public/src/js/core.js`, next to the other keybind buttons (line 4686):

```js
    const pinKeyBtn = document.querySelector(".pinKeybindBtn");
```

in `refreshKeybindLabels`:

```js
      if (pinKeyBtn) {
        pinKeyBtn.querySelector(".keybindText").textContent =
          window.javaBridge?.getCurrentPinHotKey?.() || "Ctrl+Alt+P";
      }
```

in the status rows list (line 4719):

```js
      const rows = [[reloadBtn, "reload"], [toggleBtn, "toggle"], [lockKeyBtn, "lock"], [pluginsKeyBtn, "plugins"], [pinKeyBtn, "pin"]]
```

in the click handler (line 4810):

```js
    pinKeyBtn?.addEventListener("click", () => handleKeybindClick(pinKeyBtn, "pin"));
```

and in the save branch (line 4877):

```js
      } else if (type === "pin") {
        window.javaBridge?.setPinHotkey?.(mods, vk);
        if (pinKeyBtn) pinKeyBtn.querySelector(".keybindText").textContent = label;
      }
```

- [ ] **Step 8: The pin's look**

In `src/styles.css`:

```css
.header .headerBtns .pinBtn.isPinned { color: var(--isUser-fill); }
```

- [ ] **Step 9: Build and test**

Run: `node --test tests/*.test.mjs && cargo test --all-targets && npm run build`
Expected: all pass.

- [ ] **Step 10: Check it by hand**

Run `npm run tauri dev`, open the meter (no fight needed), and check:

- clicking 📌 expands the meter and keeps it expanded when the pointer leaves;
- `Ctrl+Alt+P` does the same;
- clicking 📌 again unpins;
- with the overlay **locked** (the lock button), the pointer passes through to the game, but the pin button still takes the click.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/app.rs src-tauri/src/platform public/src/js/tauriBridge.js public/src/js/core.js index.html src/styles.css tests/hud-rows.test.mjs
git commit -m "The pin keeps the meter open

A pin button in the header and a hotkey keep the meter expanded, with its
extra data, and keep it from hiding. The button stays clickable while the
overlay is locked, so the click-through region is a list of rectangles now
instead of one.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Hide when idle

The meter hides when nothing is happening: no damage for a while, and no live target.

**Files:**
- Modify: `src-tauri/src/combat/data_storage.rs` (a getter for `last_damage_ms`, near `current_target` at line 2440)
- Modify: `src-tauri/src/app.rs` (the tick loop's hide block, line 3637)
- Modify: `public/src/js/core.js` (the settings, the "hide when idle" toggle)
- Test: `src-tauri/src/combat/data_storage.rs` (a `#[cfg(test)]` module), `tests/hud-rows.test.mjs` (extend)

**Interfaces:**
- Consumes: `AppState::pinned` from Task 5.
- Produces:
  - Rust: `DataStorage::last_damage_ms(&self) -> i64` and `DataStorage::is_idle(&self, idle_ms: i64, now_ms: i64) -> bool`.
  - The settings `dpsMeter.hideWhenIdle` (default on) and `dpsMeter.idleSeconds` (default 15).

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/combat/data_storage.rs`, at the end of the file, add a test
module (or add to the one already there):

```rust
#[cfg(test)]
mod idle_tests {
    use super::*;

    /// A storage that has never seen damage is idle: nothing is happening.
    #[test]
    fn a_storage_without_damage_is_idle() {
        let storage = DataStorage::new();
        assert!(storage.is_idle(15_000, 1_000_000));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --all-targets idle_tests`
Expected: FAIL — `is_idle` is not found (`no method named is_idle`).

- [ ] **Step 3: Write the minimal implementation**

In `src-tauri/src/combat/data_storage.rs`, next to `current_target` (line 2440):

```rust
    /// When the last damage was recorded, in clock ms; `NEVER_MS` if none.
    pub fn last_damage_ms(&self) -> i64 {
        self.last_damage_ms.load(Ordering::Relaxed)
    }

    /// Whether nothing is happening: no damage anywhere for `idle_ms`, and
    /// the target the meter follows (if any) has taken no damage for the
    /// same time. Both have to be quiet: a party fighting elsewhere still
    /// counts, and so does a target that is being fought.
    pub fn is_idle(&self, idle_ms: i64, now: i64) -> bool {
        let idle_ms = idle_ms.max(0);
        let last = self.last_damage_ms();
        // NEVER_MS means no damage has ever been recorded: nothing is
        // happening, but the clock has no start to measure from.
        let quiet = if last == NEVER_MS {
            true
        } else {
            now.saturating_sub(last) >= idle_ms
        };
        if !quiet {
            return false;
        }
        let target = self.current_target();
        if target <= 0 {
            return true;
        }
        match self.get_target_snapshot_light(target) {
            Some(snapshot) => now.saturating_sub(snapshot.last_damage_time) >= idle_ms,
            None => true,
        }
    }
```

`get_target_snapshot_light` (data_storage.rs:2469) returns
`Option<TargetCombatData>`, and `clone_light` keeps `last_damage_time`, so
the field is there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --all-targets idle_tests`
Expected: PASS.

- [ ] **Step 5: Hide the meter when idle**

In `src-tauri/src/app.rs`, the tick loop's hide block (line 3637). The
existing condition is:

```rust
                        if tick_count % 4 == 0 {
                            let on = |key: &str| state.settings.get(key).as_deref() == Some("true");
                            let closed = on("dpsMeter.hideWhenGameClosed") && !platform::window_detector::find_aion2_window();
                            let solo = on("dpsMeter.hideWhenSolo") && state.data_storage.get_party_members().len() < 2;
                            let want = meter_wanted(&handle) && (closed || solo);
```

Change it to:

```rust
                        if tick_count % 4 == 0 {
                            let on = |key: &str| state.settings.get(key).as_deref() == Some("true");
                            let closed = on("dpsMeter.hideWhenGameClosed") && !platform::window_detector::find_aion2_window();
                            let solo = on("dpsMeter.hideWhenSolo") && state.data_storage.get_party_members().len() < 2;
                            // Nothing happening: no damage and no live target.
                            // The pin keeps the meter up whatever happens.
                            let pinned = state.pinned.load(std::sync::atomic::Ordering::SeqCst);
                            let idle_seconds = state
                                .settings
                                .get("dpsMeter.idleSeconds")
                                .and_then(|v| v.parse::<i64>().ok())
                                .unwrap_or(15)
                                .clamp(1, 600);
                            let idle = on("dpsMeter.hideWhenIdle")
                                && !pinned
                                && state.data_storage.is_idle(idle_seconds * 1000, crate::clock::now_ms());
                            let want = meter_wanted(&handle) && (closed || solo || idle);
```

The meter comes back the same way the other two conditions bring it back:
`show_meter_again`, called when `want` changes to false.

- [ ] **Step 6: The settings in the page**

In `public/src/js/core.js`, the storage keys (near line 127):

```js
      hideWhenIdle: "dpsMeter.hideWhenIdle",
      idleSeconds: "dpsMeter.idleSeconds",
```

In `index.html`, after the "Show only in a party" toggle (line 665):

```html
                    <label class="settingsToggle">
                      <span class="settingsToggleLabel settingsLabel" data-i18n="settings.hideWhenIdle" title="The meter hides when nothing is happening: no damage for a while and no target being fought. It comes back with the next hit." data-i18n-title="settings.tips.hideWhenIdle">Hide when idle</span>
                      <span class="settingsToggleControl">
                        <input type="checkbox" class="hideWhenIdleCheckbox" checked />
                        <span class="settingsToggleTrack" aria-hidden="true"></span>
                      </span>
                    </label>
                    <div class="settingsRow settingsRowInput">
                      <div class="settingsInfo">
                        <div class="settingsLabel" data-i18n="settings.idleSeconds.label" title="How long the meter waits before it hides itself when nothing is happening." data-i18n-title="settings.tips.idleSeconds">Idle seconds</div>
                      </div>
                      <div class="settingsRowEnd">
                        <input type="number" class="idleSecondsInput" min="1" max="600" step="1" value="15" />
                      </div>
                    </div>
```

In `core.js`, next to the other toggles (line 3183):

```js
    this.hideWhenIdleCheckbox = document.querySelector(".hideWhenIdleCheckbox");
    if (this.hideWhenIdleCheckbox) {
      const stored = this.safeGetSetting(this.storageKeys.hideWhenIdle);
      this.hideWhenIdleCheckbox.checked = stored === null ? true : stored === "true";
      this.hideWhenIdleCheckbox.addEventListener("change", (event) => {
        this.safeSetSetting(this.storageKeys.hideWhenIdle, String(!!event.target.checked));
      });
    }
    this.idleSecondsInput = document.querySelector(".idleSecondsInput");
    if (this.idleSecondsInput) {
      const stored = this.safeGetSetting(this.storageKeys.idleSeconds);
      this.idleSecondsInput.value = stored || "15";
      this.idleSecondsInput.addEventListener("change", (event) => {
        const seconds = Math.min(600, Math.max(1, parseInt(event.target.value, 10) || 15));
        event.target.value = String(seconds);
        this.safeSetSetting(this.storageKeys.idleSeconds, String(seconds));
      });
    }
```

The backend reads the settings directly, so no command is needed for the
change to take effect within two seconds.

- [ ] **Step 7: A panel or a card keeps the meter up**

The backend hides the whole window, so an open panel would go with it. The
page already tells the backend when a card is open (`_watchOverlayCards`,
core.js line 6888). Extend the watched list to the panels that open inside
the meter window:

```js
    const cards = [
      ...document.querySelectorAll(".updateModal, .discordPromo, .supportModal"),
      ...document.querySelectorAll(".detailsPanel, .historyPanel, .settingsPanel"),
    ];
```

and the backend's idle condition skips hiding while a card is open:

```rust
                            let card_open = state.overlay_lock.card_open.load(std::sync::atomic::Ordering::SeqCst);
                            let idle = on("dpsMeter.hideWhenIdle")
                                && !pinned
                                && !card_open
                                && state.data_storage.is_idle(idle_seconds * 1000, crate::clock::now_ms());
```

- [ ] **Step 8: Build and test**

Run: `cargo test --all-targets && node --test tests/*.test.mjs && npm run build`
Expected: all pass.

- [ ] **Step 9: Check it by hand**

Run `npm run tauri dev` with the game open, in a fight: the meter is there.
Walk away and do nothing for 15 seconds: the meter goes away. Hit something:
it comes back. Pin it: it stays.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/combat/data_storage.rs src-tauri/src/app.rs public/src/js/core.js index.html tests/hud-rows.test.mjs
git commit -m "The meter hides when nothing is happening

No damage for a while and no target being fought: the meter goes away, the
same way it does when the game is closed or when you are alone. The pin
keeps it up.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: The strings and the settings that go with them

The new settings and the new labels, in the ten languages the app ships.

**Files:**
- Modify: `src/data/i18n/ui/{en,de,es,fr,ja,ko,pt,ru,zh-Hans,zh-Hant}.json`
- Test: none (the strings are read from the files; `tests/i18n.test.mjs` already checks the files are well formed — run it).

**Interfaces:**
- Consumes: the keys used in Tasks 2, 5 and 6.
- Produces: the i18n keys `settings.hideWhenIdle`, `settings.tips.hideWhenIdle`, `settings.idleSeconds.label`, `settings.tips.idleSeconds`, `settings.keybind.pin`, `meter.pin`.

- [ ] **Step 1: Find the key shape**

Run: `grep -n "\"hideWhenSolo\"" src/data/i18n/ui/en.json`
Expected: the existing key, so the new keys go next to it.

- [ ] **Step 2: Add the keys to en.json**

```json
    "hideWhenIdle": "Hide when idle",
    "idleSeconds": {
      "label": "Idle seconds"
    },
```

in the `settings` object, next to `hideWhenSolo`, and:

```json
    "tips": {
      "hideWhenIdle": "The meter hides when nothing is happening: no damage for a while and no target being fought. It comes back with the next hit.",
      "idleSeconds": "How long the meter waits before it hides itself when nothing is happening."
    },
```

in the `settings.tips` object, and in the `settings.keybind` object:

```json
      "pin": "Pin the meter"
```

and in the `meter` object:

```json
    "pin": "Pin the meter"
```

- [ ] **Step 3: Add the keys to the other nine languages**

The same keys, translated. `de`, `es`, `fr`, `ja`, `ko`, `pt`, `ru`, `zh-Hans`,
`zh-Hant`. Keep the same shape; a key that is missing falls back to the
English text in the code, so a missing key is not a crash, but every key
must be there.

- [ ] **Step 4: Run the i18n test**

Run: `node --test tests/i18n.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/i18n/ui
git commit -m "The new settings in every language

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Section 1 (the compact HUD) → Task 1. Section 2 (chrome on
hover) → Task 2. Section 3 (hover expands, top three, trimmed to the room
below) → Tasks 2 and 3. Section 4 (accessory data on hover) → Task 2.
Section 5 (the pin) → Task 5. Section 6 (the percentage follows the metric)
→ Task 4. Section 7 (hide when idle) → Task 6. The settings and the strings
→ Tasks 6 and 7. The Details panel and the OBS overlay are out of scope, as
the spec says.

**Placeholders.** Task 5's Rust test was drafted as a placeholder and then
replaced; the remaining "find the exact name" note in Task 6 Step 3 is a
real instruction (`get_target_snapshot_light` is declared at
data_storage.rs:2469 — check its return type before using
`last_damage_time` on it).

**Type consistency.** `pickDisplayRows(sortedAll, { limit, expanded,
pinUserToTop })` is used the same way in Task 3's code and tests.
`shareFor(row, mode, totals)` returns a number or `""`; Task 4's caller
checks `share === ""`. `meterIsExpanded(hovered, pinned)` takes two booleans
everywhere. `set_overlay_button_rects` takes `rects: Vec<(f64, f64, f64,
f64)>` and `scale: f64`; the JS sends `{ rects, scale }`.

**Review Focus.** 1 → Task 5 (the button rectangle list; checked by hand in
Step 10). 2 → Task 2 Step 5 (the trim). 3 → Task 3 ("your row takes the third
place"). 4 → Task 6 Step 3 (`NEVER_MS` is idle). 5 → Task 4 ("a share of
nothing is empty").
