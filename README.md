# Local Music Log

WhyTrashEarth · Codex x TwitchCon Hackathon 2026

A local-first Chromium Manifest V3 extension for recording tracks from a YouTube Music tab you explicitly select. **Phase 1 prototype; live YouTube Music detection is not yet verified.** Twitch integration is not implemented.

## Develop

Node.js 24 and npm are used in this environment.

```sh
npm ci --ignore-scripts
npm test
npm run test:browser
```

`npm test` builds the extension and runs history, observer, metadata detection and background integration checks. The browser smoke test uses `/usr/bin/chromium`, loads the unpacked extension, and checks the popup, persistence and rejection of an unsupported tab. It requires an environment where Chromium subprocesses can start.

## Download for Brave or Chrome

Download the ready-to-load prototype from [downloads/local-music-log-0.1.3.zip](downloads/local-music-log-0.1.3.zip) using GitHub’s **Download raw file** button. Extract the ZIP. In Brave, open `brave://extensions` (Chrome: `chrome://extensions`), enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. No Node.js installation is needed for this ZIP. This is a development prototype, not a browser-store release. Live YouTube Music detection remains unverified.

## Install from source

1. Run `npm run build`.
2. Open Chrome's extension management page, enable Developer mode, and choose **Load unpacked**.
3. Select this project's `dist` folder.
4. Open YouTube Music, open the extension popup, and press **Use this YouTube Music tab**.
5. Play a song. Wait for valid player metadata; reopen the popup to see history.

After refreshing/navigating the page, restarting the browser, or reloading the extension, select the tab again. There is no persistent website host permission and no automatic injection into other tabs.

## Updating the unpacked extension

Download and extract the newest ZIP. To preserve history, **replace the files in the folder your existing unpacked extension uses**, then click that extension's **Reload** button in `brave://extensions`. Confirm version **0.1.3** on its details page. Refresh YouTube Music, start a song, open the popup and select that tab again. If logging was paused, resume it. Removing/reinstalling the extension instead will erase its local history. You do not need to disable Brave Shields. If detection fails, report the exact popup status.

## Controls and permissions

- `activeTab`: temporary access to the tab you select through the extension action.
- `scripting`: install the metadata observer into that selected YouTube Music page.
- `storage`: keep history, selection and logging state in `chrome.storage.local`.

Pause logging does not pause music. Clear history opens an inline confirmation panel with **Keep history** and **Delete history** controls. Escape cancels; keyboard focus is not trapped and no native browser dialog is opened. Successful deletion announces its result; a failed deletion leaves a retry option. Clear history deletes stored events while retaining the current playback marker to prevent immediately re-adding the same play. The newest 300 events are retained; older entries are removed first. Timestamps mean **observed at**, not the exact start time of a song already playing when selection occurs.

## Metadata feasibility gate

The observer requests a local probe from the extension worker. The worker executes a read-only function in the selected page's main JavaScript world to inspect `#movie_player.getVideoData()` when available, the `ytmusic-player-bar` DOM (including `/browse/` artist links), Media Session metadata, and video playback state. A player-provided track ID works even while browsing album or playlist pages. These are page-provided, undocumented interfaces; none is a supported YouTube API. If an ID is unavailable, a valid player watch link or current watch URL is required. It never interprets a browser tab title, album page title or arbitrary uploader text as an artist. Missing metadata produces a waiting status and no history entry. The DOM is undocumented and can change.

Before calling Phase 1 complete, test with an actual playable YouTube Music session:

- Initial page load, delayed metadata, play/pause, seek and next/previous tracks.
- Playing while browsing album/playlist pages and while the tab is in the background.
- Continuous playback without duplicates; A → B → A retains both A plays.
- Repeat-one and replay after completion. The player observer listens for completion/restart events between polling intervals. Native HTML repeat-one is detected from an observed end-boundary wrap with looping enabled, plausible timing and no recent pointer/key input. Seeking alone is not a repeat. Undocumented site-specific looping that emits no completion event and does not enable native looping may still be missed. Background throttling or multiple very short loops between probes can also cause missed entries; no historical timestamps are invented.
- Pause logging, resume, clear, reload, tab switch and tab closure.
- Popup keyboard navigation, readable status updates and narrow viewport.

Fixture tests validate the implementation against simulated DOM data, not YouTube Music's current live markup. Ads, podcasts, casting, unavailable songs, unusual artist links and player transitions require further testing. The prototype does not distinguish all non-song media or guarantee attribution during an asynchronous track transition. Do not use its output for automatic public publishing yet.

## Privacy

No microphone, audio recording, recognition service, analytics, ads, cloud backup or export. The extension makes no application network requests. Metadata and playback observations pass from the selected page to the extension; history remains in browser-local extension storage. Storage is not encrypted by this app. Other people with access to your browser profile may access it. Clear history removes events; uninstalling removes extension storage. Browser loading of YouTube Music itself remains subject to that site's behavior.

## Version 0.1.3

Adds event-derived playback cycle tokens so the worker can recognize consecutive plays even if its one-second polling misses the ended state. Captures native media completion/restart and native HTML loops; maintains deduplication for continuous playback, seeks and observer reinjection. `npm run test:repeat` plays a generated local WAV in Chromium and checks three native loops, seeking, and Replay after completion. Live YouTube Music repeat-one needs a Brave retest. Regular YouTube support is the next source adapter after this gate; its video/channel metadata must not be misrepresented as verified song/artist information. Spotify remains outside scope.

## Version 0.1.2

Replaces the blocking native clear-history confirmation, reported to leave Brave unresponsive, with an inline panel. Fixes popup shrink-to-fit sizing, uses a single scrolling region, and keeps keyboard focus on usable controls after cancellation or deletion. `npm run test:ui` exercises the actual popup HTML/CSS/JavaScript in Chromium with mocked extension APIs: 300 entries, cancellation, Escape, keyboard confirmation, cross-tab typing, storage failure/retry, successful deletion, pause, and 360/400px layouts. This does not substitute for a full Brave extension check.

## Version 0.1.1

Addresses restrictive artist-link detection and track identity while browsing album/playlist pages. Reselecting replaces the observer timer. Missing metadata is reported field by field; ads detected by the player are skipped. `npm run test:player` exercises the serialized detector in real Chromium against a local player fixture. Actual Brave/YouTube Music behavior still requires verification.

## Next phases

Only after live-site reliability passes: broadcaster Twitch OAuth, authenticated channel-bound writes, explicit sharing approval, short-retention Cloudflare storage, rate limits, immediate publishing revocation, and a public read-only recent-tracks page. Viewer login will not be required.

## Submission record

Preserve the originating Codex conversation/session ID in the final Devpost submission. A reliable session ID has not been exposed to this implementation; copy it from the Codex UI when preparing the submission. Do not substitute a cloud environment ID. No competition eligibility or submission requirements have been independently verified here.
