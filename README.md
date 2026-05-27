# Timer Clock

A self-contained, single-file browser clock with interval alerts and a full alarm system. No dependencies to install — open the HTML file and it works.

---

## Introduction

Timer Clock is a feature-rich clock application built as a single standalone HTML file. It runs entirely in the browser with no backend, no build step, and no npm packages. All state persists across sessions via `localStorage`.

**Features:**

- **Digital clock** with animated second and minute rings, date display, and 12-hour format
- **Tick sound** — an optional metronome click every second
- **Interval alert** — plays a sound every N seconds or minutes with a live progress bar and countdown; supports loop mode
- **Alarm system** — set multiple alarms at specific times with per-alarm repeat schedules (once, every day, weekdays, weekends, or custom days), labels, and individual sound selection
- **6 alert sounds** — Chime, Bell, Pulse, Zen, Alarm, Ping (all synthesized via Web Audio API, no audio files needed)
- **Dark mode** — follows the system preference automatically
- **Responsive** — works on desktop and mobile screens
- **Fully offline** — only the Google Fonts and Tabler Icons CDN links require internet; everything else runs locally

---

## Usage

### Running the app

Download `index.html` and open it in any modern browser. No server required.

```
double-click index.html
# or
open index.html
```

### Clock

The clock face is always visible. The outer teal ring tracks seconds; the inner purple ring tracks minutes.

### Settings panel

Click **Show settings** to expand the controls. Click again to collapse. The open/closed state is remembered.

### Tick sound

Toggle **Tick: Off** to enable a click sound every second. The volume icon in the clock status bar reflects the current state.

### Interval alert

1. Choose a unit — **Seconds** (5–300) or **Minutes** (1–60)
2. Set the interval with the slider or number input
3. Select a sound from the grid (clicking previews it)
4. Click **Alert: Off** to start the countdown
5. Enable **Loop** to repeat indefinitely; otherwise the alert fires once and stops

### Alarms

1. Pick a time using the time picker
2. Optionally add a label
3. Choose a repeat schedule:
   - **Once** — fires one time only
   - **Every day** — repeats daily
   - **Weekdays** — Mon–Fri
   - **Weekends** — Sat & Sun
   - **Custom** — pick any combination of days using the day pills
4. Click **Add**

Each alarm row has a toggle switch to enable/disable, a sound selector, an edit (✏️) button, and a delete (🗑) button.

When an alarm fires, it plays the chosen sound for 30 seconds, the row pulses green, and a toast notification appears at the top of the screen. Click **Done** on the row or **Dismiss** on the toast to stop it early.

Repeating alarms reset automatically at midnight. Once-only alarms stay dismissed permanently until manually re-enabled.

### Sound unlock

Browsers block audio until the user interacts with the page. If you load the page with Tick or Alert already enabled from a previous session, a yellow banner appears — tap it once to unlock audio.

---

## Collaborate

Contributions are welcome. Because the entire project is a single HTML file, the workflow is straightforward.

### Getting started

```bash
git clone https://github.com/sambathprak789/timer-clock.git
cd timer-clock
# Open index.html in your browser — no install step needed
```

### Project structure

```
index.html   # Everything: HTML, CSS, and JavaScript in one file
README.md    # This file
```

The file is organized in clearly commented sections:

| Section | What it covers |
|---|---|
| `:root` CSS variables | Theme tokens — colours, radii, fonts |
| Clock CSS | Ring SVG, digit display, status dots |
| Settings CSS | Panel, buttons, interval card, sound grid |
| Alarms CSS | Form, repeat presets, day pills, alarm list items, toast |
| HTML | Markup structure |
| LocalStorage helpers | `loadBool`, `loadInt`, `loadStr`, `save` |
| Clock JS | `updateClock`, ring animation |
| Settings JS | `toggleSettings`, `setUnit`, `applyInterval` |
| Sound JS | `note`, `playTick`, `playAlertSound` |
| Repeat form JS | `setRepeatPreset`, `toggleDayPill`, `repeatLabel` |
| Alarms JS | `addAlarm`, `startEdit`, `renderAlarms`, `checkAlarms`, `fireAlarm` |
| Boot | Initialisation sequence |

### Guidelines

- **Keep it one file.** External scripts and stylesheets defeat the point of a portable single-file app.
- **No frameworks.** Vanilla HTML, CSS, and JavaScript only.
- **Null-guard DOM access inside `setTimeout` / `setInterval` callbacks** — elements may not exist when a deferred callback runs.
- **Use `localStorage` helpers** (`loadBool`, `loadInt`, `loadStr`) rather than raw `localStorage.getItem` to avoid type-coercion bugs (everything in localStorage is a string).
- **Test audio in-browser** — the Web Audio API behaves differently across Chrome, Firefox, and Safari, especially around `AudioContext` suspension.

### Reporting issues

Open an issue describing:
1. Browser and version
2. Steps to reproduce
3. Expected vs actual behaviour
4. Any console errors

### Feature requests

Open an issue with the `enhancement` label. Please check existing issues first to avoid duplicates.
