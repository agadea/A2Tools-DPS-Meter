# Plugin alerts — a strip instead of the panel

**Date:** 2026-10-25
**Branch:** `feature/plugin-alert-strip` (off `feature/minimalism-ui`)
**Status:** the design is settled (the questions below are answered). Nothing
is implemented yet; the implementation plan is next.

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
- **The dock already folds itself to a strip**: `dock_fold` (`dock.rs:211`)
  shrinks it to the height of its tab bar and puts the size back when it
  unfolds. The strip is that, with the plugin's page showing under the bar
  instead of the bar alone.
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
to a short height over the game, with that plugin's tab open and its banner
showing.**

| | Today | New |
|---|---|---|
| Docked plugin calls `show()` in a fight | the whole dock, 380×520, TOPMOST over the game | a strip of ~82 px (34 of bar + 48 of banner), with that plugin's tab open |
| Docked plugin calls `fit(h)` | ignored | a strip of 34 + `h` |
| The plugin puts its window back (`fit()`, `hide()`) | the dock stays at its full size | the dock returns to exactly what it was: its size, whether it was up, and the state of the plugin's tab |
| The plugin says nothing | the dock stays up for good | the strip closes itself after 2 minutes, and every new alert restarts that clock |
| Clicks over the strip | — | the whole strip takes them (the banner is a button) |
| The game's top slot | taken by the dock | taken by the strip: it stays on top, as the meter's own windows do. The player rejected the hidden strip: an alert behind the game is no alert at all. |

The strip keeps the dock's own behaviour: it is the same window, the same
page, the same tab strip — only shorter, so the alert is the only thing it
shows.

### The height

- The bar of tabs is 34 px (`.dockBar`, fixed in CSS).
- The plugin's own alert is 48 px when the plugin gives no height (Mantra
  Watch only calls `show()`): its banner is ~30 px tall, so 48 leaves it
  room.
- When the plugin gives one (`fit(h)`, Event Timers), the strip is 34 + `h`.

The platform cannot ask the plugin's page how tall its alert is: the banner
is in a cross-origin frame, and a new API the plugin would have to answer
cannot be answered by Mantra Watch (whose source is not in this repo). So
the default is a constant.

### What the plugins do (read from the installed sources)

The plugin sources are not in this repo, but they are on the machine, in
`%APPDATA%/com.a2tools.dps-meter/plugins`:

- **Mantra Watch's banner is the first element of its `<body>`**
  (`<button class="banner">`), so a strip showing the top of the plugin's
  page shows the banner.
- **Mantra Watch says when the alert is over**: it calls `hide()` when the
  mantra is back (`plugin.js:250`) — but only when the player has not used
  the panel in the last 60 s (`hideAfterAlert`). So the strip cannot have a
  short fixed life: the alert lasts as long as the mantra is down, which is
  minutes. The 2 minutes are a safety net for a plugin that never says
  anything, and every alert restarts them.
- **Event Timers** uses `fit(h)`, and `fit()` without a height when the
  alert is over.

## The questions, settled

1. **The height of a strip without a `fit` call.** The bar (34 px) plus a
   default of 48 px for the alert. A plugin that gives its height (`fit(h)`)
   gets the bar plus `h`.
2. **Should the strip take the game's top slot?** Yes: it stays on top, as
   the meter's own windows do, and it is small enough not to matter. The
   player had already rejected the alternative — a strip behind the game is
   no alert at all.
3. **What happens when the alert ends.** The dock goes back to exactly what
   it was before: its size, whether it was up, and the state of the plugin's
   tab ("shown"/"hidden"). The guard that keeps the dock up when its last
   tab hides ("no other way back") does not apply to the strip: the dock was
   only up because of the alert. A plugin that never says anything gets a
   2-minute safety net, restarted by every alert.
4. **Click-through.** The whole strip takes the clicks: the banner has to be
   clickable (Mantra Watch's banner is a button that dismisses the alert).
   Only the strip's own area is affected; the rest of the screen stays the
   game's.
5. **The stacked layout.** The strip shows one plugin only — the one that
   alerted — whichever layout the dock is in. The stacked layout comes back
   when the alert is over.

Two more rules the answers led to:

- **The dock already open** (the player opened it): the alert only opens the
  plugin's tab. Nothing shrinks; the dock is up by the player's own choice.
  The strip is for when the dock would appear because of the alert.
- **A strip already up** and another plugin alerts: the strip shows the new
  plugin (the last one to ask) and the clock restarts.

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
