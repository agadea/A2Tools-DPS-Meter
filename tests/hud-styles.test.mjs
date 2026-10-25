import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// The rule body of a top-level selector, anchored to the line start so a
// longer selector that ends in the same name cannot stand in for it.
function rule(selector) {
  const m = css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m"));
  assert.ok(m, `the "${selector}" rule is not in the stylesheet`);
  return m[1];
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
