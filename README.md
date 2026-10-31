# Local Music Log

WhyTrashEarth · Codex x TwitchCon Hackathon 2026

A local-first Brave/Chrome extension that records playback metadata from an explicitly selected YouTube Music or regular YouTube tab. Keep history private in your browser, or connect Twitch and separately approve publishing new plays to a public recent-plays page. A Twitch channel panel can link viewers to that page without viewer login.

**Working development prototype · v0.2.0.** The broadcaster has confirmed the deployed flow in Brave: Twitch login, explicit sharing approval, public publishing from both YouTube Music and regular YouTube, deletion through stop-sharing, reconnecting and publishing again, and access through a Twitch panel link. These are user-reported live checks with screenshots, alongside automated tests; they do not establish reliability across all browsers, accounts or source-page variations.

- **YouTube Music:** track title and page-provided artist.
- **YouTube:** video title and uploader, labeled **YouTube video · Channel**. Uploaders are not inferred to be song artists.
- **Local-first:** sharing starts off; Twitch login alone does not upload history. No audio is captured or uploaded.
- **Public sharing:** only new plays after approval, newest 50 plays from the last 24 hours, with source links. Refresh the public page for updates.
- **Control:** local history and shared history have separate deletion controls. Stop-sharing revokes publishing and deletes the public list.

[View WhyTrashEarth’s recent plays](https://localmusiclog.whytrashearth.workers.dev/recent/whytrashearth) · [Download v0.2.0](downloads/local-music-log-0.2.0.zip) · [Backend setup and security model](worker/README.md)

The public example may be empty when sharing is off or plays expire. This is a prototype, not a browser-store release or a generally supported hosted service.

## Can another broadcaster use this?

**Yes, with configuration.** Publishing is bound to the Twitch account that signs in; it is not hardcoded to WhyTrashEarth. Each broadcaster gets a public page at `/recent/<their-lowercase-twitch-login>` and can add its link to their own Twitch panel.

**The current deployment is not plug-and-play for arbitrary installations.** The backend permits exactly one configured browser `EXTENSION_ID`. An unpacked extension's ID can differ on another computer or if it is loaded from a different folder. Installing the ZIP alone does not guarantee it can authenticate against the example backend. Do not replace the demo backend's extension ID to accommodate another installation; that would prevent the existing installation from completing OAuth.

For another broadcaster, the documented path is to deploy their own Cloudflare Worker, register a confidential Twitch app with that Worker's callback, configure their own browser extension ID, then connect their Twitch account and approve sharing. They do not need to be streaming to use it. Their viewers only need the public link. See the setup below and the [backend guide](worker/README.md). A stable distributed extension identity and a supported multi-installation onboarding flow remain future work; other broadcasters have not yet been live-tested.

## Optional Twitch sharing setup

Local logging needs no Cloudflare or Twitch account setup. To publish:

1. Deploy the Worker using [the backend guide](worker/README.md). If connecting a GitHub repository in Cloudflare Workers Builds, the backend files must be on the selected branch. From the repository root, leave the build command blank, use `npx wrangler deploy --config worker/wrangler.jsonc` as the deploy command, and disable preview builds for this prototype. Keep the project name and Wrangler `name` consistent. Review the existing demo-specific public settings in `worker/wrangler.jsonc` and replace them for your own deployment.
2. Register a **Confidential** Twitch application with callback `https://YOUR-WORKER.workers.dev/oauth/callback`. Configure `PUBLIC_ORIGIN` (the HTTPS origin without a path or trailing slash), `TWITCH_CLIENT_ID`, and `EXTENSION_ID` for the Worker. Add `TWITCH_CLIENT_SECRET` directly in Cloudflare's **Production runtime variables and secrets**, with type **Secret**. A build variable or suggested Wrangler snippet is not a substitute for a deployed runtime setting. Never embed real secrets in the extension or repository.
3. Load v0.2.0 and copy its ID from `brave://extensions` or `chrome://extensions` with Developer mode enabled. It must match the backend's `EXTENSION_ID`.
4. In the extension popup, expand **Optional Twitch sharing** and enter only your backend origin, such as `https://YOUR-WORKER.workers.dev`. Do not enter `/recent/...` or `/oauth/callback` in this field.
5. Click **Connect Twitch**, grant access to that backend host, and authorize your broadcaster account. Reopen the popup and verify the username. **Sharing should still be off.**
6. Read the disclosure, check the approval box, and click **Enable metadata sharing**. Select your YouTube/Music tab and start a new play. Existing history is never backfilled.
7. Open `https://YOUR-WORKER.workers.dev/recent/YOUR_LOWERCASE_TWITCH_LOGIN` to see newly shared plays. Refresh for updates.

The runtime publishing credential is held in browser session storage. Browser restart requires reconnecting and fresh approval; the server session expires after seven days. Reconnecting also replaces the previous channel session and clears its public list. A full source-page reload or extension reload requires selecting the source tab again.

## Add a Twitch channel panel

This is a standard Twitch **text/image panel containing a link**. It does not embed a live list inside Twitch; an embedded panel would require a separate Twitch Extension. No Twitch Extension has been registered or released by this project.

1. Open your Twitch channel's **About** page while logged in.
2. Turn on **Edit Panels**, click the large **+**, and choose **Add a Text or Image Panel**.
3. Use a title such as **What's Playing? · Local Music Log**. An image is optional.
4. Paste the following into **Description**, replacing the URL with your own public page:

```markdown
See my recently shared YouTube Music tracks and YouTube videos.

[Open my recent plays](https://YOUR-WORKER.workers.dev/recent/YOUR_LOWERCASE_TWITCH_LOGIN)

No viewer login required. Only metadata I explicitly choose to share is published.
```

5. Scroll within the form, click **Submit**, turn off **Edit Panels**, and test the link. The public page opens outside Twitch. It requires a manual refresh for updates.

## Clear local history vs. remove shared plays

| Control | Effect |
| --- | --- |
| **Clear history** | Deletes the extension's browser-local history. It does not delete already published plays or stop sharing. |
| **Pause logging** | Stops new local entries and therefore new uploads. Existing public entries remain until deleted or expired. |
| **Stop sharing and delete public plays** | Stops uploads locally, revokes the backend session, and deletes the public list when the request succeeds. Refresh the public page to see the change. |

If deletion cannot reach the backend, the extension stops uploads locally and displays a retry warning; remote plays remain until successful deletion or expiry. Already viewed or copied data cannot be recalled. Stop-sharing is separate from revoking an app in Twitch settings; use the extension's stop/delete control to revoke this app's publishing session.

## Develop

Node.js 24 and npm are used in this environment.

```sh
npm ci --ignore-scripts
npm test
npm run test:browser
```

`npm test` builds the extension and runs history, observer, metadata detection, background integration, publishing-client, and Worker tests. The Worker suite runs with mocked Twitch responses in Miniflare/workerd. `npm run build:worker` bundles without deploying. `npm run test:ui` and `npm run test:sharing-ui` exercise popup fixtures in Chromium. The loaded-extension smoke test (`npm run test:browser`) requires a browser environment that permits unpacked extensions; managed Chromium policy blocks it in the development cloud environment. See [validation evidence and limits](VALIDATION.md).

## Download for Brave or Chrome

Download [local-music-log-0.2.0.zip](downloads/local-music-log-0.2.0.zip) using GitHub’s **Download raw file** button. Extract it. To preserve history and the extension ID, replace the files inside the folder your existing unpacked extension uses, then click **Reload** in `brave://extensions` or `chrome://extensions`. Confirm version **0.2.0**. Do not remove/reinstall the extension or select a different folder. For a new install, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.

This is a development prototype. Sharing remains off by default; optional Twitch sharing requires the configured backend and explicit metadata approval. No Node.js installation is needed for this ZIP.

## Install from source

1. Run `npm run build`.
2. Open Chrome's extension management page, enable Developer mode, and choose **Load unpacked**.
3. Select this project's `dist` folder.
4. Open YouTube Music or a regular YouTube watch page, open the extension popup, and press **Use this YouTube / Music tab**.
5. Play a song. Wait for valid player metadata; reopen the popup to see history.

After refreshing/navigating the page, restarting the browser, or reloading the extension, select the tab again. There is no persistent YouTube host permission and no automatic injection into other tabs. Optional backend access is separate and requested only when connecting Twitch.

## Updating the unpacked extension

Download and extract the newest ZIP. To preserve history, **replace the files in the folder your existing unpacked extension uses**, then click that extension's **Reload** button in `brave://extensions`. Confirm version **0.2.0** on its details page. Refresh YouTube Music, start a song, open the popup and select that tab again. If logging was paused, resume it. Removing/reinstalling the extension instead will erase its local history. You do not need to disable Brave Shields. If detection fails, report the exact popup status.

## Controls and permissions

- `activeTab`: temporary access to the tab you select through the extension action.
- `scripting`: install the metadata observer into that selected YouTube Music or YouTube page.
- `storage`: keep history, selection and logging state in `chrome.storage.local`; runtime publishing credentials use `chrome.storage.session`.
- `identity`: run the optional Twitch authorization flow.
- Optional HTTPS host access: declared for configurable backends, requested at runtime only for the backend origin the broadcaster chooses. No persistent YouTube host permission is requested.

Pause logging does not pause music. Clear history opens an inline confirmation panel with **Keep history** and **Delete history** controls. Escape cancels; keyboard focus is not trapped and no native browser dialog is opened. Successful deletion announces its result; a failed deletion leaves a retry option. Clear history deletes stored events while retaining the current playback marker to prevent immediately re-adding the same play. The newest 300 events are retained; older entries are removed first. Timestamps mean **observed at**, not the exact start time of a song already playing when selection occurs.

## Regular YouTube test workflow

Open a normal `https://www.youtube.com/watch?v=...` video, select it through the popup, then start playback. Entries show the video title and **YouTube video · Channel: [uploader]**. The uploader is not stored as a song artist and the title is not parsed into guessed music credits. The stored `kind` is `youtube-video`, `artist` is empty, and `channel` contains the page-provided uploader. Existing YouTube Music history is retained.

Try continuous playback, pause/resume, a seek, a second video and return to the first, YouTube's Loop control, then pause logging and clear history. Keep the popup closed during part of the test. Check that ads are skipped when detectable, and report the popup status/diagnostics if logging stalls. Select only one source tab at a time. No new permissions, secrets or remote services are required.

This test build supports standard watch pages only. Shorts, embedded players, live video (and videos the player marks as live content), and background miniplayer playback while browsing non-watch pages are excluded. Unavailable or mismatched metadata causes a waiting state. Navigation within YouTube is supported by observing the new player identity; a full document reload requires reselection.

## Metadata feasibility gate

The observer requests a local probe from the extension worker. The worker executes a read-only function in the selected page's main JavaScript world to inspect `#movie_player.getVideoData()` when available, the `ytmusic-player-bar` DOM (including `/browse/` artist links), Media Session metadata, and video playback state. A player-provided track ID works even while browsing album or playlist pages. These are page-provided, undocumented interfaces; none is a supported YouTube API. If an ID is unavailable, a valid player watch link or current watch URL is required. It never interprets a browser tab title, album page title or arbitrary uploader text as an artist. Missing metadata produces a waiting status and no history entry. The DOM is undocumented and can change.

Before calling Phase 1 complete, test with an actual playable YouTube Music session:

- Initial page load, delayed metadata, play/pause, seek and next/previous tracks.
- Playing while browsing album/playlist pages and while the tab is in the background.
- Continuous playback without duplicates; A → B → A retains both A plays.
- Repeat-one and replay after completion. The player observer listens for completion/restart events between polling intervals. Native and site-managed repeat-one are detected from an observed end-boundary rewind, plausible timing and no recent pointer/key input, even through a transient pause. Completion is also observed in the capture phase. Seeking alone is not a repeat. Site-specific looping with no usable completion or boundary evidence may still be missed. An invisible programmatic seek timed exactly at completion cannot always be distinguished from an automatic replay. Background throttling or multiple very short loops between probes can also cause missed entries; no historical timestamps are invented.
- Pause logging, resume, clear, reload, tab switch and tab closure.
- Popup keyboard navigation, readable status updates and narrow viewport.

Fixture tests validate the implementation against simulated DOM data, not YouTube Music's current live markup. Ads, podcasts, casting, unavailable songs, unusual artist links and player transitions require further testing. The prototype does not distinguish all non-song media or guarantee attribution during an asynchronous track transition. Metadata remains unverified. Phase 2 sharing is an explicit opt-in development prototype; review the approval disclosure before enabling it.

## Privacy

No microphone, audio recording, recognition service, analytics, ads, cloud backup or export. By default the extension makes no application network requests and history remains in browser-local storage. Optional Twitch sharing requests access only to the chosen HTTPS backend. Twitch login alone does not publish: a separate metadata approval enables only newly observed plays. Public metadata is retained for 24 hours / 50 plays; stop/delete revokes publishing and removes public history. See [Phase 2 privacy and revocation details](worker/README.md). Storage is not encrypted by this app. Other people with access to your browser profile may access it. Clear history removes events; uninstalling removes extension storage. Browser loading of YouTube Music itself remains subject to that site's behavior.

## Version 0.2.0

Adds opt-in Twitch broadcaster authentication, explicit metadata approval, channel-bound Worker publishing, public recent plays, rate limits, 24-hour retention and stop/delete revocation. The broadcaster has also confirmed the deployed Twitch login, opt-in publishing, public reads, stop/delete, reconnect, and Twitch panel-link flow in Brave. A ready-to-load ZIP is available in `downloads`.

## Version 0.1.8

Adds explicitly selected regular YouTube watch pages using the existing playback tracker and recorder. Introduces video/channel attribution without inferred song artists, exact-origin sender validation for supported YouTube domains, and a navigation identity check to avoid recording stale metadata. Changes the popup heading to Recent plays. Tests include regular YouTube detection, unsupported live/Shorts states, source validation, worker/storage integration, channel display, and preservation of repeat buffering behavior. User confirmed v0.1.7 repeat-one history entries in Brave; this broader source build still needs a live test.

## Version 0.1.7

The user’s v0.1.6 trace confirmed an accepted repeat with no new history entry. Reproduced a recorder bug where a buffering sample consumed an advanced cycle before it was ready to log. The recorder now stores the last recorded playback separately from its last observation, preserving unrecorded cycles across buffering. Tests cover the failing buffering → playback sequence, repeated updates without duplicates, observer-session changes, existing-state migration, and the complete worker/storage flow. Existing missed plays are not reconstructed or backdated. The next completed repeat is the live verification target.

## Version 0.1.6 — diagnostic build

Live repeat-one still failed with tracker v5 and stable duration. This build deliberately keeps detection rules unchanged and records the last three backward playback transitions in the existing local diagnostics. Each retained transition includes before/after position, duration, elapsed event gap, playback rate, playing state, input age, observed peak and acceptance/rejection reason. Media binding count helps identify element replacement. No network telemetry, audio capture or export is added.

To diagnose: update/reload, refresh YouTube Music and select the tab; allow one natural repeat without seeking. Then open Playback diagnostics and report the **Recent transitions** text. The transition remains visible as playback advances, so a precisely timed screenshot is unnecessary.

## Version 0.1.5

Responds to live diagnostics showing an older tracker with undefined fields and a changing raw media duration (26 → 449 seconds). Tracker schema v5 disposes/replaces old listeners on the same element while preserving valid cycle identity. Timing prefers `getCurrentTime()` and identity-matched `getPlayerResponse().videoDetails.lengthSeconds`, followed by `getDuration()`, then the raw media fallback. These are undocumented page APIs. Diagnostics name the clock/duration source and show raw media duration separately. The browser fixture tests old tracker migration and growing raw duration during actual looping. Live YouTube Music repeat-one still needs verification.

## Version 0.1.4

Version 0.1.3 still missed repeat-one in the user’s Brave session. This revision removes the native-loop-only boundary requirement, retains completion evidence through temporary pause/seeking, and captures ended events before page bubble handlers. The Chromium playback fixture now explicitly simulates a site rewinding near completion without setting native loop or emitting ended. A collapsed **Playback diagnostics** section shows current position/duration, native loop flag, observed restart count, last event and restart evidence; it stays local and makes no uploads. Actual YouTube Music behavior remains subject to a Brave retest.

## Version 0.1.3

Adds event-derived playback cycle tokens so the worker can recognize consecutive plays even if its one-second polling misses the ended state. Captures native media completion/restart and native HTML loops; maintains deduplication for continuous playback, seeks and observer reinjection. `npm run test:repeat` plays a generated local WAV in Chromium and checks three native loops, seeking, and Replay after completion. Live YouTube Music repeat-one needs a Brave retest. Regular YouTube support is the next source adapter after this gate; its video/channel metadata must not be misrepresented as verified song/artist information. Spotify remains outside scope.

## Version 0.1.2

Replaces the blocking native clear-history confirmation, reported to leave Brave unresponsive, with an inline panel. Fixes popup shrink-to-fit sizing, uses a single scrolling region, and keeps keyboard focus on usable controls after cancellation or deletion. `npm run test:ui` exercises the actual popup HTML/CSS/JavaScript in Chromium with mocked extension APIs: 300 entries, cancellation, Escape, keyboard confirmation, cross-tab typing, storage failure/retry, successful deletion, pause, and 360/400px layouts. This does not substitute for a full Brave extension check.

## Version 0.1.1

Addresses restrictive artist-link detection and track identity while browsing album/playlist pages. Reselecting replaces the observer timer. Missing metadata is reported field by field; ads detected by the player are skipped. `npm run test:player` exercises the serialized detector in real Chromium against a local player fixture. Actual Brave/YouTube Music behavior still requires verification.

## Next steps

Polish the extension and public-page interface, make the local/public deletion distinction clearer, and record the hackathon demo. Additional-browser/account testing, broader source-metadata edge cases, and multi-installation onboarding remain outstanding. The current Twitch panel links to the public page; embedded Twitch Extensions and automatic page updates are not implemented.

## Submission record

Preserve the originating Codex conversation/session ID in the final Devpost submission. A reliable session ID has not been exposed to this implementation; copy it from the Codex UI when preparing the submission. Do not substitute a cloud environment ID. No competition eligibility or submission requirements have been independently verified here.
