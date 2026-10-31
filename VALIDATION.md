# Validation status

- TypeScript build: passed.
- History tests: 13 passed, 0 failed.
- Observer lifecycle tests: 2 passed, 0 failed.
- Metadata detection tests: 19 passed, 0 failed.
- Background integration tests: 2 passed, 0 failed.
- Real Chromium player fixture: passed (`npm run test:player`). Exercises serialized MAIN-world detector against page DOM and player metadata, not the live site.
- Real MV3 Chromium smoke test: blocked. Browser-level `Extensions.loadUnpacked` returned `Loading of unpacked extensions is disabled by the administrator.` The runtime's installed Chromium cannot perform this check under current policy. The test remains available as `npm run test:browser` on a compatible developer machine.
- Popup UI regression check: passed (`npm run test:ui`) in Chromium using real popup assets with mocked extension APIs. Verified no native dialogs, inline cancel/confirm/Escape, focus, cross-tab typing, 300-entry rendering, storage failure/retry, and layout at 360/400 CSS pixels.
- Actual YouTube Music playback: user confirmed version 0.1.1 logging in Brave, including album/playlist browsing with a generic tab title; continuous playback, playback pause/resume without duplicates, A → B → A, replacing the tab, and pause logging. User reported a browser lockup during the native clear-history confirmation. User subsequently confirmed version 0.1.2 inline cancellation, clear-history and improved sizing in Brave without freezing. Repeat-one failed in 0.1.2. Version 0.1.3 also failed repeat-one in the user’s Brave session. Version 0.1.4 also failed in Brave; diagnostics showed old tracker fields as undefined and raw media duration changing from 26 to 449 seconds. Version 0.1.5 adds tracker schema replacement and identity-matched full-track timing. Version 0.1.5 also failed repeat-one in Brave, despite tracker v5, valid duration and incoming timeupdate events. Version 0.1.6 live diagnostics confirmed an accepted repeat but no history addition. Version 0.1.7 fixes a reproducible recorder bug in which a buffering probe consumed the cycle before logging. User confirmed v0.1.7 repeat-one produces separate history entries in Brave. v0.1.8 adds regular YouTube watch-page support; live YouTube verification is pending.
- Chromium repeat playback fixture: passed (`npm run test:repeat`): tracker migration without an extra history entry, stable track duration despite changing raw stream duration, three real native loops, site-managed pre-completion rewinds without native looping or ended events, no duplicate on seek/pause, and replay after completion counted even without polling the ended state. This is generated local media, not the live YouTube Music implementation.
- Regular YouTube fixtures: passed. Verified video title/channel attribution with empty artist, stale navigation rejection, exact-origin validation, storage and repeat buffering behavior. Chromium DOM fixture and popup channel rendering passed; these do not establish live YouTube behavior.
- Twitch/backend: not implemented; deferred until Phase 1 feasibility and reliability pass.

These results do not establish Phase 1 completion. See README for the manual acceptance checklist and known repeat/transition limitations.

## Phase 2 (v0.2.0)

- Clean `npm ci --ignore-scripts` succeeds with the committed lockfile on Node 24.
- `npm test`: **44 passed, 0 failed, 0 skipped**, including extension history/observer/detection/background checks, runtime publishing-client tests, and 5 backend test groups. Worker integration executes in Miniflare/workerd with SQLite Durable Objects and mocked Twitch HTTP; retention/alarm boundary checks use an injected storage fixture.
- Backend checks cover browser-bound OAuth state, single-use state and handoff codes, PKCE, Twitch identity binding, cross-channel rejection, foreign-origin rejection, separate metadata approval, strict input validation, deduplication, safe public rendering, reauthentication, session expiry, 50-play/24-hour retention, physical alarm cleanup, request bounds, IP/channel rate limits, and revocation even after budgets are exhausted.
- Publishing-client checks confirm zero requests in default local-only mode, no upload upon login, explicit approval, no expiry uploads, offline revocation stopping local uploads, deletion retry, and recovery from an already-invalid session.
- `npm run build:worker`: dry-run bundle succeeds; **no deployment**.
- Local `npm run dev:worker` startup verified using HTTP requests: `/health` returns 200/ok, `/api/recent/broadcaster` returns an empty list, and `/oauth/start` returns 503 while OAuth is unconfigured.
- `npm run test:ui` and `npm run test:sharing-ui`: pass in Chromium with mocked browser APIs. Cover existing history controls and the new chosen-host permission, broadcaster login, separate approval checkbox, public-page link, and offline deletion warning/retry.
- `npm run test:browser`: **blocked by environment policy**, not passed. The installed Chromium has managed `ExtensionInstallBlocklist: ["*"]`; CDP reports that unpacked extensions are disabled by the administrator. Policy was not changed.
- During this initial local validation, no Worker deployment, Twitch registration, real credentials, live OAuth callback, or live-source metadata verification was performed. The subsequent deployment and ready-to-load v0.2.0 ZIP are documented below and in the root README. See `worker/README.md` for setup and security/privacy limits.

## Broadcaster-reported deployed validation

After the initial local validation, WhyTrashEarth supplied screenshots and confirmed:

- Successful Cloudflare GitHub-connected deployment and runtime configuration, followed by the real Twitch consent flow in Brave with extension v0.2.0 and the configured extension ID.
- Login initially leaves sharing off; separate metadata approval enables public publishing.
- A newly observed YouTube Music track appears locally and on the public channel page with artist attribution.
- Regular YouTube entries appear as videos with uploader/channel attribution, alongside distinct YouTube Music entries.
- Clearing local history leaves the public list intact, consistent with the separate controls.
- Stop-sharing/delete followed by refreshing the public page produces **No shared plays**. This confirms visible public deletion; screenshots alone do not prove every subsequent unauthorized request is rejected (the automated suite covers that boundary).
- Reconnecting and approving sharing again allows new public entries.
- A standard Twitch About text panel links successfully to the public recent-plays page. The list is not embedded in Twitch and the page requires refresh for updates.

These are user-reported live results with screenshot evidence, not independently executed remote checks from the Codex runtime. Other Twitch accounts/installations, browser-restart recovery, live retention/expiry, cancellation, and live network-outage recovery are not established by these screenshots. The single configured extension ID remains a distribution constraint. The root README now distinguishes self-hosted broadcaster use from a generally available hosted service.
