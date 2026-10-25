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
  assert.doesNotMatch(css, /\.list \.item \.fill::after/);
});
