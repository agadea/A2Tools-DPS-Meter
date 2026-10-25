# Minimal HUD — what to check by hand

The redesign of the meter that sits over the game (branch `feature/minimalism-ui`) was built and reviewed without ever running the app: this machine had no MSVC toolchain, so the Rust was compiled for Windows with `cargo check --all-targets` and tested on Linux in WSL, and the frontend was verified by unit tests and by reading the code.

Everything below needs a person with the game running. **The branch is not to be merged before this list is walked.**

## 0. Build and launch

Install the MSVC toolchain, then `npm run tauri dev` with the game running.

Looking for: the app starts at all, and the meter appears with **three** rows and a visibly smaller panel. Everything below depends on this.

## 1. The compact look

The header is one line (boss name, HP %, camera icon, buttons); the boss HP is a 3 px hairline; the rows are 24 px (20 px in slim); the bars have no lit edge.

Looking for: the boss name is not squeezed to nothing by the HP %; the % ticking does not make the header jitter; the meter covers noticeably less of the screen than before.

## 2. The hover

Put the pointer on the meter.

Looking for: the header/footer chrome fades in over ~140 ms; the class icon, the badges and the combat power fade in; the rest of the party appears below the three; **and the window grows promptly** — the expansion used to be clipped for up to half a second, and the rows must now follow the window as it resizes.

## 3. The trim

Park the meter near the **bottom** of the screen — the case the trim exists for — and hover.

Looking for: the expansion stops at the screen edge; the window never grows past the bottom and gets shoved back by the window manager (the flicker of issue #11). Repeat with "Max players shown" = 12 and a full party.

## 4. Your own row

Be outside the top three (stand still or die in a group).

Looking for: your row takes the third place, shows your **real** rank (not 3), and the third-ranked player is the one that disappeared.

## 5. The percentage

Toggle the footer metric button to HPS/HEAL and then STAG.

Looking for: in HEAL the percentage is the healing share (a healer no longer shows 0 %); in a fight where nobody has healed the percentage is **empty**, not "0.0 %"; and the same row's percentage does **not** change between the compact and the expanded meter — the denominator is the whole party either way.

## 6. The pin, by button and by hotkey

Click 📌, then press `Ctrl+Alt+P`.

Looking for: the meter stays expanded with the extra data after the pointer leaves; the pin takes the accent colour; clicking again unpins; Settings → Keybinds shows `Ctrl+Alt+P`, rebinding it works, and "Restore defaults" puts it back.

## 7. The pin while the overlay is locked

Turn on the click-through lock (Settings → "Show click-through lock button").

Looking for: clicks pass through to the game everywhere except over the lock and pin buttons; clicking the pin while locked still expands the meter and pins it; the lock button still unlocks.

This is the one thing no automated test can reach — the pointer watch in `app.rs` is what keeps those buttons clickable while the window ignores the mouse.

## 8. The idle rule

With the game open and nothing happening for 15 s: the meter goes away; one hit brings it back.

Then press the Show/Hide hotkey while it is hidden: it comes back and stays for roughly a full idle window. Then press it again: it goes **off** and stays off.

Looking for: no inverted hotkey, no meter that flickers between hidden and shown.

## 9. The idle rule's escape hatches

Pin the meter and wait 30 s with no damage (it must stay). Open Settings or Details in the meter and wait (it must stay — a panel must not go with the window). Drag the meter by its header while idle (it must not vanish mid-drag).

## 10. The other hide reasons still work

With "Hide while AION2 is closed" on: close the game (the meter hides) and reopen it (it comes back). With "Show only in a party" on: leave the party (it hides) and rejoin (it comes back).

Looking for: no regression from the three reasons now being tracked apart.

## 11. A fresh install

Clear the settings and start the meter with the game open but no fight.

Looking for: the meter shows for a **full 15 s** before it hides — not two seconds after launch.

## 12. The unchanged things

"Max players shown" still caps the *expanded* meter and its dropdown is untouched; the Details panel still shows the whole party with the skill breakdown; the OBS overlay is unchanged; the themes (especially `aion2-classes-vivid`, which keeps its own gradient bar) and the bar-texture setting still work; the new settings and the pin keybind read correctly in all ten languages.
