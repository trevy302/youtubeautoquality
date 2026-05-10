# YouTube Auto Max Quality

Chrome extension that automatically sets YouTube videos to the highest available quality, including Premium and Enhanced Bitrate options.

I built this instead of using an existing extension to avoid third-party trust issues — extensions can be sold, inject telemetry, or silently change behavior after install.

## How It Works

1. **Trigger** — the extension activates on YouTube video pages via the `yt-navigate-finish` event, `popstate`, or when an ad finishes
2. **Wait for player** — polls until the video element has metadata (`readyState >= 1`) and the settings button is present
3. **Wait for Auto to settle** — waits 10 seconds for YouTube's Auto quality to select its resolution before intervening
4. **Skip ads** — if an ad is playing, waits for it to finish before proceeding
5. **Read current quality** — opens the settings menu (hidden via CSS so the user doesn't see it) and reads the current quality from the Quality row's display text (e.g., "Auto (1080p60 Premium)")
6. **Find best available** — opens the quality submenu, parses all options, extracts resolution and Premium status, and sorts by resolution (highest first) then Premium (preferred over non-Premium at the same resolution)
7. **Compare** — if the current quality already matches the best available option (same resolution and Premium status), or the best option is already checked, the extension closes the menu and does nothing
8. **Switch** — if a better option exists, clicks it to lock in the highest quality
9. **Cleanup** — closes any open menus and removes injected CSS
10. **Track** — marks the video as processed so it isn't re-checked on the same page

The extension retries up to 3 times if a quality-setting attempt fails (e.g., menu didn't render in time).

## Performance

- Runs at `document_idle` — does not block page load
- All DOM polling uses short-lived loops with timeouts
- The only persistent listener is a single `MutationObserver` on the player's class attribute (for ad detection)
- No network requests, no external dependencies, no telemetry

## Install

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**, select the folder
