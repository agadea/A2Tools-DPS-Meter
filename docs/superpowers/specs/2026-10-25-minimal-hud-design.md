# Minimal HUD — design

**Date:** 2026-10-25
**Branch:** `feature/minimalism-ui`

## The problem

The DPS meter sits on top of the game, always. Today it is a panel with a
header of six buttons, a full-bleed boss HP band, and a row per player that
carries a rank, a class icon, a name, two possible badges, a combat power
figure, a DPS number and a contribution percentage. It is on screen even when
nothing is happening.

Four complaints, in the user's words:

1. It covers too much of the game.
2. It is visually noisy.
3. It is always visible.
4. It shows too much data.

The goal is a HUD that stays out of the way: smaller, quieter, and driven by
what is actually happening in the game.

## The design

Package **A — "Instrumento discreto"**: the same panel and the same data,
shown less. Nothing is deleted; the extra information moves behind a hover,
and a pin brings it back.

### 1. The compact HUD (default)

The meter keeps its structure but sheds weight:

| Part | Today | New |
|---|---|---|
| Row height (Standard) | 30 px | 24 px |
| Row height (Slim) | 22 px | 20 px |
| Header | boss icon, name, 6 buttons, full-bleed HP band with text | one line: boss icon, target name, HP %, buttons |
| Boss HP | full-bleed band, text over it | 3 px hairline under the header; the % sits in the header |
| Bar | gradient tint + lit edge, 80 % opacity | flat tint, no lit edge, one accent colour on your own row |
| Rows shown | the whole party, up to "Max players shown" (6) | the top three; the rest on hover |
| Row content | rank, class icon, name, badges, combat power, DPS, contribution % | rank, name, DPS — the rest on hover |

Themes stay (they are palettes, not noise). Bar textures stay available and
are already off by default.

### 2. Chrome on hover

The header buttons (updates, suspend, history, reset, settings) are hidden
until the meter is hovered, then fade in. The **lock button always stays
visible**: it is the way out of click-through, and a hidden escape hatch is
not an escape hatch.

The same rule applies to the footer's buttons.

### 3. Hovering expands the meter

Hovering the meter expands it: the accessory data appears (section 4) and
the rest of the party appears below the first three rows. With the pin on,
the expanded meter stays expanded.

**Compact: the top three rows.** The meter shows three rows while it is not
hovered, so it covers as little of the game as possible. Your own row is
always among them: if your damage puts you outside the top three, your row
takes the third place, and the third-ranked player is the one that falls off
the list. (The OBS overlay already does exactly this — `capRows` in
`stream_overlay/page.html`.)

**Expanded: the whole party, up to "Max players shown".** That setting
(default 6) keeps its meaning: how many rows the meter shows when it is
fully expanded. The dropdown is unchanged.

**The expansion is trimmed to the room below.** The overlay grows from its
top-left corner, and a window that grows past the bottom of the screen is
moved back by the window manager on Linux (KWin), which puts the row under
the cursor out from under it and starts the flicker loop of issue #11. The
page already knows the space to the right and below the window
(`spaceRightBelow` in `tauriBridge.js`); the expansion shows as many of the
remaining rows as fit in it. When there is no room, the meter stays at three
rows.

The Details panel is unaffected: it always shows the whole party with the
skill breakdown, which is where the detail belongs.

### 4. Accessory data on hover

Per row, the class icon, the supporter and A2Tools badges, the combat power
figure and the contribution percentage are hidden by default. Hovering the
meter fades them in (140 ms). The row does not jump: the extra elements have
a fixed width that goes from 0 to full, and the name column gives up the
space, so the DPS number stays where it was.

With the pin on, they are always shown — the current look.

### 5. The pin

One pin, for the whole meter, toggled two ways:

- a 📌 button in the header,
- a hotkey (`Ctrl+Alt+P` by default, new `dpsMeter.pinHotkey`).

Pinned means: the meter stays expanded (section 3), the accessory data is
always visible (section 4), and the meter never auto-hides (section 7).

The pin button has to stay clickable while the overlay is locked
(click-through), where the window ignores the mouse entirely. Today the
backend watches the pointer over the lock button's rectangle and takes the
mouse back over it. That rectangle becomes a list of rectangles, so the pin
button is clickable too.

When the overlay is locked there is no hover, so the pin is the only way to
see the extra data. That is the point of the pin.

### 6. The percentage follows the metric

The row's percentage is not always the damage share. It says how much of
what the meter is currently showing, that player did:

| Display mode | The percentage is |
|---|---|
| DPS / DMG / BOTH | the player's damage over the party's damage |
| HPS / HEAL | the player's healing over the party's healing |
| STAG | the player's stagger over the party's stagger |

Today the percentage is always the damage share, so in HEAL mode a healer
sees "0%" beside their healing figure. That is the incoherence this fixes.

The rows already carry what this needs — `totalDamage`, `healAmount` and
`stagger` per row — so it is all frontend: the numerator and the
denominator are picked by the display mode, exactly as the sort already is.
In HEAL mode the healer is already at the top, because the order follows the
metric.

A row's share of nothing is left empty rather than shown as "0.0%": in HEAL
mode, when nobody healed, there is no percentage to show.

The denominator is the visible rows, as it is for damage today: with "max
players shown" set below the party size, the shares are of the visible rows,
not of the whole party.

### 7. Hiding when idle

Combination of both signals the user chose:

- **no damage** for N seconds (default 15), anywhere;
- **and** no live target: no current target, or the current target has taken
  no damage for N seconds.

The meter hides (as it does for "hide while solo" and "hide while the game
is closed": the window goes off the top) and comes back as soon as damage
arrives.

The meter does **not** hide when it is pinned, or when a panel or a card is
open over it.

This is decided in the backend's tick loop, next to the existing
`hideWhenGameClosed` and `hideWhenSolo` conditions — the same place, the same
mechanism, the same `show_meter_again` to bring it back.

## Where the signals come from

Already in the backend, no new plumbing:

- `DataStorage::last_damage_ms` — the last damage packet applied, anyone.
  Needs a public getter (one line).
- `DataStorage::current_target()` — the target the meter is following.
- `DataStorage::get_target_snapshot_light(target)` — its last damage time.

Already in the frontend:

- the target label, the HP %, the rows (`meter.js` builds them),
- `updateOverlaySize()` — the window is sized to its content,
- `spaceRightBelow()` — the screen space to the right and below the window,
  which trims the expansion.

New:

- `dpsMeter.pinned` — the pin state, in the backend (an atomic, like the
  overlay lock) and mirrored to the page as a `pin-changed` event.
- `dpsMeter.pinHotkey` — the hotkey; registered next to
  `dpsMeter.lockHotkey`, default `Ctrl+Alt+P`.
- `dpsMeter.hideWhenIdle` (default on) and `dpsMeter.idleSeconds`
  (default 15).

## Settings

**Meter settings**

- Hide when idle — on by default.
- Idle seconds — 15.

**Appearance**

- Extra data on hover — on by default. Off means the accessory data is always
  shown (today's behaviour).

**Keybinds**

- Pin the meter — `Ctrl+Alt+P`.

## Files

| File | Change |
|---|---|
| `src/styles.css` | the compact look, the hover reveals, the hairline HP |
| `index.html` | the pin button, the HP % in the header |
| `public/src/js/core.js` | the pin state, the hover state, the idle check, the settings wiring |
| `public/src/js/meter.js` | the accessory elements' reveal state, the percentage by metric, the top-three selection |
| `public/src/js/tauriBridge.js` | the `pin-changed` listener, the clickable-rect list, the keybind row, the room below the window |
| `src-tauri/src/app.rs` | the pin hotkey and state, the idle condition, the rect list |
| `src/data/i18n/ui/*.json` | the new strings (10 languages) |
| `tests/hud-visibility.test.mjs` | the new test |

## Testing

The idle rule and the reveal rule are pure decisions, so they are pure
functions, tested in the style of `tests/meter-rows.test.mjs` (node --test,
`vm` + `assert`):

- idle when both signals are idle; not idle when either is not; never idle
  when pinned or a panel is open;
- the accessory data is hidden by default, shown on hover, always shown when
  pinned;
- the top three: the three best rows, and your own row taking the third
  place when you are outside them;
- the percentage: the damage share in DMG mode, the healing share in HEAL
  mode, the stagger share in STAG mode, and empty when the total is zero.

The rest is CSS and wiring; it is checked by running the app.

## Out of scope

- The Details, History and Settings panels: unchanged.
- The OBS stream overlay (`stream_overlay/page.html`): unchanged. It is a
  separate page and already compact.
- Deleting themes, textures or badges: they stay.
- New dependencies: none.

## Risks

- **Hover needs the mouse.** Locked (click-through) means no hover; the pin
  covers it, but a player who locks the overlay and never pins sees only the
  compact rows. That is the trade the design makes.
- **The idle rule hides the meter mid-fight** if a fight pauses longer than
  the timeout (a long cutscene, a phase where nobody deals damage). 15 s is
  the default; it is a setting.
- **Hover reveals change the row's layout.** The extra elements have a fixed
  width so the DPS column does not move, but the name column does shorten.
- **The meter grows on hover**, so the overlay window changes height while
  the pointer is over it. The expansion is trimmed to the room below the
  window so it never grows past the screen, but the resize itself is still
  visible.
