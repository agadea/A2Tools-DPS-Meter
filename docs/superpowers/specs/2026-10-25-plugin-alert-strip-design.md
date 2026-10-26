# Plugin alerts — a strip instead of the panel

**Date:** 2026-10-25
**Branch:** `feature/plugin-alert-strip` (off `feature/minimalism-ui`)
**Status:** written for review. Nothing is implemented yet.

## The problem

While testing the Minimal HUD, the player reported a second window stealing the
game's screen: **the "A2 Plugins" dock opens on top of the game the moment a
fight starts.**

The chain, exactly as it happens:

1. **Mantra Watch** watches for the player's mantras dropping. Its default
   preference is `alert: "fight"` (the plugin keeps no `prefs.json` yet, so it
   is on the default). When a mantra drops in a fight it calls
   `a2.window.show()` — `mantra-watch/plugin.js:241`.
2. Mantra Watch is **docked**, not in a window of its own: `dpsMeter.pluginsOwnWindow`
   is not set, so `dock::docks()` is true for it.
3. `a2.window.show()` from a docked plugin is not "show this plugin's little
   window": the command lands on the dock (`plugins/mod.rs:1620`, the
   `window.label() == dock::LABEL` branch of `plugin_window`), which marks the
   plugin's tab as shown and calls `dock::sync(app, Some(id))`.
4. `dock::sync` reveals the **whole dock** with
   `show_on_top_without_focus` (`plugins/dock.rs:144`) — that is TOPMOST: the
   dock ends up over the game.
5. The dock is **380 × 520 px** by default (`plugins/dock.rs:158`): a quarter
   of the screen for the sake of one line of text.

So one dropped mantra costs a 380×520 panel on top of the game, for as long as
the alert is up. The same thing happens to any docked plugin that calls
`show()` in a fight.

This is not the meter's doing: the meter's own windows (`always_on_top`) are
its own, and the idle rule does not touch plugin windows. It is the dock
answering a plugin's "show yourself" with "the whole panel, on top".

### What was rejected, and why

| Option | Why not |
|---|---|
| The dock does not take the game's top slot | The alert becomes invisible: the panel is behind the game and only the sound is left. The player asked for a *smaller* alert, not a *hidden* one. |
| A setting "hide plugin windows while in combat" | Same loss, and one more switch to explain. |
| Turning the plugin's alert off in its own UI | Zero code, but the mantra warning is genuinely useful. Kept as the workaround while this is built. |
| **A small alert strip instead of the panel** | **Chosen.** The alert stays visible, in a fraction of the space. |

## What already exists to build it on

The dock already knows when a plugin has an alert — the mechanism is there,
it just does nothing about size:

- The frame relays `window.fit` to the dock: `onFit(fitted)` sets `d.alert`
  and opens that plugin's tab (`pluginDock.js:210`), and the tab is marked
  (`.dockTabAlert`, `pluginDock.css:60`).
- A plugin **in a window of its own** can already be shrunk to the height of
  its alert: `plugin_window_fit` resizes that window, and Event Timers uses
  it (`event-timers/plugin.js:1469`, `a2.window.fit(height)`).
- **The dock ignores it**: `plugin_window_fit`'s dock branch returns early
  with "the dock keeps its size" (`plugins/mod.rs:1668`). That comment is the
  bug.
- Widgets already have the rule the alert wants: `never_activate` keeps them
  from coming in front of the game (`plugins/widgets.rs`, "Never in front of
  the game: an alert icon appearing must not tab the player out of it").

An alert lives at the **top** of a plugin's page — Mantra Watch's banner is the
first element in its `<body>`, Event Timers' banner likewise — so a dock
clipped to a strip's height shows the alert and nothing else.

## The design

**A docked plugin that asks to be shown gets an alert strip: the dock shrinks
to a short height, the plugin's tab opens and is marked, and the game's top
slot is left alone.**

| | Today | New |
|---|---|---|
| Docked plugin calls `show()` in a fight | the whole dock, 380×520, TOPMOST over the game | the dock shrunk to a strip, with that plugin's tab open |
| Docked plugin calls `fit(h)` | ignored | the dock shrunk to `h` |
| The plugin puts its window back (`fit()`, `hide()`) | the dock stays at its full size | the dock returns to the size it had |
| The game's top slot | taken by the dock | left to the game (like the widgets) |

The strip keeps the dock's own behaviour: it is the same window, the same
page, the same tab strip — only shorter, so the alert is the only thing it
shows.

### The height

- When the plugin gives one (`fit(h)`), that is the height.
- When it does not (Mantra Watch only calls `show()`), the platform needs a
  default. **Open question 1.**

## Open questions (to settle before implementing)

1. **The height of a strip without a `fit` call.** A fixed default (say
   96–140 px, the tab bar plus the plugin's banner)? Or should the platform
   ask the plugin's page how tall its alert is — a new API the plugin would
   have to answer, which Mantra Watch (whose source is not in this repo)
   cannot answer yet?
2. **Should the strip take the game's top slot?** The recommendation is no:
   the game's top slot belongs to the game, and the widgets already work that
   way. But then the strip is *behind* the game, and the player sees the
   alert only when the game is not covering that corner. Or should the strip
   be TOPMOST but small enough not to matter (a 380×120 strip at the dock's
   place)?
3. **What happens when the alert ends.** The dock returns to the size it had
   before, or does it hide altogether? Today the plugin's tab stays "shown"
   (`remember_window`), so the dock stays up after the alert — that is part of
   what the player complained about ("it stays fixed").
4. **Click-through.** While the strip is over the game, do clicks reach the
   game or the strip? Mantra Watch's banner is a button (click to dismiss
   until the mantra is back), so it must be clickable; the rest of the strip
   could let the clicks through.
5. **The stacked layout.** The dock can stack its plugins instead of showing
   tabs (`prefs.layout === "stack"`). Does the strip work there, and what does
   "the plugin's tab opens" mean?

## Out of scope

- **The plugins themselves.** Mantra Watch and Event Timers are installed
  artefacts (downloaded from the catalog into
  `%APPDATA%/com.a2tools.dps-meter/plugins`); their source is not in this
  repository. The platform has to carry this change alone — which is why the
  default height (question 1) matters: a docked plugin that only calls
  `show()` must still get a small alert.
- The meter itself, the Minimal HUD, and the OBS overlay.

## Also noted in the same test session

Not part of this design, but found while looking into the same report:

- The **meter hides itself after 15 s without damage** — the idle rule from
  the Minimal HUD spec, on by default (`dpsMeter.hideWhenIdle` absent from
  `settings.json` means on). The window is *minimized*, not left behind the
  game, so it looks the same to the player. It comes back with the first hit,
  with `Ctrl+Alt+P` (the pin), or by turning "Hide when nothing is happening"
  off in Settings → Meter settings.
- `dpsMeter.autoHideMeter` is **off** in `settings.json`, so the meter is not
  hiding because the game took the focus.
