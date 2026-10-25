import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const meterSource = readFileSync(new URL("../public/src/js/meter.js", import.meta.url), "utf8");

// The rule body of a top-level selector, anchored to the line start so a
// longer selector that ends in the same name cannot stand in for it.
function rule(selector) {
  const m = css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m"));
  assert.ok(m, `the "${selector}" rule is not in the stylesheet`);
  return m[1];
}

// The rules that mention a selector, with their bodies. A rule with a list
// of selectors spans several lines, so the whole selector text is kept.
function rulesFor(part) {
  return [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)]
    .map(([, selector, body]) => ({ selector, body }))
    .filter((r) => r.selector.includes(part));
}

test("the row is shorter than it was", () => {
  assert.match(css, /--hud-row-h:\s*24px/);
  assert.match(css, /\.meter\.slim\s*\{[^}]*--hud-row-h:\s*20px/);
  assert.match(css, /\.barPreviewPanel\.slim\s*\{[^}]*--hud-row-h:\s*20px/);
});

test("the boss HP is a hairline with the figure in the header", () => {
  // Anchored: ".meter.slim .bossHpBar" must not be able to satisfy this.
  assert.match(rule(".bossHpBar"), /height:\s*3px/);
  assert.match(rule(".meter.slim .bossHpBar"), /height:\s*3px/);
  assert.match(html, /class="bossHpInline"/);
  assert.match(html, /class="bossHpPctInline"/);
  assert.match(html, /class="bossHpAmtInline"/);
});

test("the bar has no lit edge", () => {
  assert.doesNotMatch(css, /\.list \.item \.fill::after/);
});

test("the bar is a flat tint, not a gradient", () => {
  const fill = rule(".list .item .fill");
  assert.match(fill, /--bar-base:\s*color-mix\(/);
  assert.doesNotMatch(fill, /linear-gradient/);
});

test("the row's type is scaled down with the row", () => {
  assert.match(rule(".list .item .name"), /font-size:\s*13px/);
  assert.match(rule(".list .item .dps > p"), /font-size:\s*14px/);
  assert.match(rule(".list .item .classIcon"), /width:\s*16px/);
});

test("the accessory data is revealed in the meter's own list only", () => {
  // `.meter` holds the Settings panel too, and the bar preview in it is a
  // list of its own: a rule that reaches the `.item`s of any list inside
  // `.meter` would take the preview's class icon and combat power away.
  for (const part of [".classIcon", ".combatPower", ".supporterBadge", ".a2toolsBadge"]) {
    const hiding = rulesFor(part).filter((r) => /max-width:\s*0/.test(r.body));
    assert.ok(hiding.length > 0, `the ${part} is never collapsed`);
    for (const r of hiding) {
      assert.match(r.selector, /\.meter > \.list \.item/);
    }
    const shown = rulesFor(part).filter((r) => /\.meter\.isExpanded/.test(r.selector));
    assert.ok(shown.length > 0, `the ${part} is never revealed`);
    for (const r of shown) {
      assert.match(r.selector, /\.meter\.isExpanded > \.list \.item/);
    }
  }
});

test("the boss's amounts collapse until the meter is expanded", () => {
  const amounts = rulesFor(".bossHpAmtInline");
  // The base rule holds the box's width, and it must not hold a min-width:
  // a min-width cannot be collapsed.
  const base = amounts.find((r) => !/isExpanded/.test(r.selector) && /max-width:\s*8em/.test(r.body));
  assert.ok(base, "the amounts' box rule is gone");
  assert.match(base.selector, /\.header \.bossHpInline \.bossHpAmtInline\s*$/);
  assert.doesNotMatch(base.body, /min-width/);
  // The collapsed rule has to be the same selector, or the base rule wins
  // and the amounts never collapse.
  const collapsed = amounts.find((r) => !/isExpanded/.test(r.selector) && /max-width:\s*0/.test(r.body));
  assert.ok(collapsed, "the amounts are never collapsed");
  assert.match(collapsed.selector, /\.header \.bossHpInline \.bossHpAmtInline\s*$/);
  // And they come back in a box of the same width.
  const shown = amounts.find((r) => /\.meter\.isExpanded/.test(r.selector));
  assert.ok(shown, "the amounts are never shown again");
  assert.match(shown.body, /max-width:\s*8em/);
});

test("the hidden buttons take no clicks", () => {
  const hidden = rulesFor(".headerBtn").filter((r) => /opacity:\s*0/.test(r.body));
  assert.ok(hidden.length > 0, "the header buttons are never hidden");
  for (const r of hidden) {
    assert.match(r.body, /pointer-events:\s*none/);
  }
  const shown = rulesFor(".headerBtn").filter((r) => /\.meter\.isExpanded/.test(r.selector));
  assert.ok(shown.length > 0, "the header buttons are never revealed");
  for (const r of shown) {
    assert.match(r.body, /pointer-events:\s*auto/);
  }
});

test("the pin button is always there", () => {
  // The pin is the way to see the extra data while the overlay is locked,
  // where there is no hover to expand the meter.
  assert.match(html, /class="headerBtn pinBtn"/);
  const pin = rulesFor(".pinBtn").find((r) => /opacity:\s*1/.test(r.body));
  assert.ok(pin, "the pin button is never shown");
  assert.match(pin.body, /pointer-events:\s*auto/);
});

test("the row's percentage comes from the tested helper", () => {
  // There is no DOM harness, so nothing exercises renderRows: the decision
  // could be inlined there and the suite would stay green. This pins the one
  // line that decides it.
  const body = meterSource.slice(
    meterSource.indexOf("const renderRows ="),
    meterSource.indexOf("const flushPendingRows =")
  );
  assert.ok(body.length > 0, "renderRows is gone from meter.js");
  assert.match(body, /contributionFor\(/);
});
