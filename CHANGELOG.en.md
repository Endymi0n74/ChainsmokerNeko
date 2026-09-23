# Changelog

All notable changes to **ChainsmokerNeko** are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

🇫🇷 [Version française](CHANGELOG.md) · 🇬🇧 English

## [3.0.4] - 2026-09-05

### Added

- **Fork restructured into two branches**: `master` is back to being a pristine mirror of `manga-download/haruneko` (sync = `git pull` fast-forward, never any conflict); the v3 product line (v3.0.x, Cloudflare/Electron platform, kept sites) now lives on `chainsmoker`. `SYNC.md` documents the workflow and the fork-first merge procedure.
- **Upstream integration** (since v3.0.3) via two fork-first merges (`7d94f3a14`, `41431fcc8`): classic UI revamp (Svelte 5 migration, next-item preload in the viewer, faster quickaction fade…), new connectors (Batcave, LeerManhwas, Onisaga, WhyToon, AeroToon, MerlinShoujo, ManhwaNex, RinkoComics, RawFree, NovelDex template…), dozens of site recodes/fixes, removal of dead sites, dependency updates.
- **Sites kept despite their upstream removal**: MangaFury, ManhwaHub, JManga — fork-first policy: we keep and maintain what upstream abandons.

### Fixed

- **svelte-check at 0 errors / 0 warnings**: ported the `ViewerPreloadNextItem` setting (enum key + registry + settings block) missing from the `Settings` store — used by `ImageViewer.svelte`/`viewer/Settings.svelte`; `MediaSelect.svelte`: `scrollTop` made reactive (`$state`) and deprecated `on:scroll` replaced by `onscroll`.
- **13 Crowdin locales realigned with upstream** (`check:rules` forbids editing them by hand); fork-specific keys stay in `en_US.ts` — falls back to the key name while awaiting the Crowdin translation.

### Changed

- **Full validation**: check:ts/eslint/svelte-check/vue-tsc/rules/versions green on all 3 workspaces, 2155+ web unit tests passing, web + electron builds OK and the app launched in a boot test.
- **Safety**: no history lost — the old fork tip `70b2ccb89`/`7d94f3a14` remains covered by the tags `3.0.0`–`3.0.3`, `archive/*` and the `chainsmoker` branch.

> *Note (2026-09-05): after the v3.0.4 release, the `3.0.0`–`3.0.3` and `archive/*` tags were retired from the fork; the history remains reachable via the `chainsmoker` branch and the SHAs preserved in `SYNC.md`.*

## [3.0.3] - 2026-09-04

### Added

- **JapScan — reader-first volume extraction** (`JapScan.DRM.preload.ts`, `JapScan.Extract.ts`):
  a single visible reader window with the DRM bootstrap in preload; the site's protected script
  decodes the page list via CustomEvent once the puzzle is solved — removal of the parallel 2nd DRM
  window that was blocking (30s budget always exceeded by async `captcha_d.js`).
- **JapScan — page-selector walk**: when the reader's lazy-load plateaus (~110 images) while the
  page selector announces the real total, the remaining pages are fetched via the selector URLs
  (3 workers, 15s/timeout, 100s budget).
- **JapScan — source-breakdown diagnostics**: `ReaderExtraction` exposes `drm`/`dom`/`selector`/
  `probe` + phase durations (`puzzle`/`drain`/`walk`/`scroll`) and a `reader diag` JSON (real scroll,
  img inventory, resource-timing, selector, overlay) — log `[JapScan] /path/ -> N pages (...)`.
- **JapScan — full volume recovery via probe preload** (`DRM_URL_PROBE_PRELOAD`):
  a probe installed BEFORE any page script captures the CDN URLs built by the site at init
  (204/204 pages on Dreamland vol-24, 156/156 on Saint Seiya Dark Wing vol-7). The site builds
  all URLs in a single deterministic burst, but only mounts ~110 (reader virtualization);
  the probe recovers the missing ~90-94.

### Fixed

- **JapScan - "Chapter update … timed out after 120000ms" timeout**: `CHAPTER_UPDATE_TIMEOUT_MS`
  raised from 120s to 300s (real pipeline budget of puzzle + drain + walk) in `DownloadTask.ts` and
  `CollectionDownloadTask.ts`; the per-page stall stays bounded at 15s.
- **JapScan - residual overlay blocking collection**: collection no longer starts while the
  `#jc-overlay` puzzle is displayed and no longer stays stuck if the overlay persists in the DOM after
  resolution.
- **JapScan - parasitic N+1 page**: runs adopted by the probe no longer return `total+1` pages
  (a chrome image of the site or a token-refreshed remount was appended to the list) — `www.*` filters
  and `_banner_`/`e44j82.jpg` markers on the append.
- **JapScan - robust probe adoption guard**: anchored on the first 5 DOM URLs, match without
  query (token/redirect variants), forward/reversed detection, overlap ≥ 50%, hard deadline 240s
  (`EXTRACT_DEADLINE`) to never exceed the 300s host budget again.

## [3.0.2] - 2026-08-31

### Fixed

- **JapScan - puzzle not offered on volume change**: the anti-bot
  `#jc-overlay` puzzle is rendered asynchronously (AJAX call a few seconds after
  DOMReady, typically on the reader's 2nd consecutive request — download a volume
  then request another). The single DOMReady detection returned
  `None` too early: extraction started on a page about to be
  locked. Added a grace period in `FetchWindowPreloadScript`
  (fork-handled sites + visible window): re-polling of the site detection every
  2s for 16s, upgrade to Interactive/Automatic handling as soon as the
  puzzle appears. Lint: redundant parentheses removed in the
  `cleared` condition (`&&`/`||` precedence unchanged).
- **JapScan - missing pages + CDN 404s**: collection stopped on `atBottom`
  OR stability without waiting for the lazy-load to finish (pending images lost), and
  ran on a puzzle-locked page. Now: collection pauses while the puzzle is displayed
  (the user solves it in the visible window) with early exit if real images
  (`decodedBodySize > 10 ko`) are re-decoded (the overlay can persist in the DOM after
  resolution, like Turnstile); end of collection = bottom of page REACHED and stable (8 rounds);
  collection extended to generic `data-src` holders.

## [3.0.1] - 2026-08-28

### Fixed

- **Cloudflare PollForChallengeResolution**: revert of the hadWidget guard that blocked
  managed challenges (CrunchyScan). Back to the original widgetGone which works
  for all sites. Initial poll delay increased from 2s to 4s to let the
  Turnstile load.
- **JapScan - missing pages**: large chapters (150+ images) lost pages
  because the scroll stopped too early. DRM extraction + scroll launched in parallel,
  results merged and deduplicated. Scroll limit increased from 80 to 500 steps,
  stability detection added (20 steps without new images), timeout raised to 300s.

## [3.0.0] - 2026-08-26

> **Major.** Non-regression fixes, new connectors, advanced Cloudflare fix,
> virtual scroll bookmarks and complete repo cleanup.

### Added

- **MangaNova connector**: listing, chapters, pages (93 pages tested), WebP logo.
- **17 connectors wired** in `_index.ts`: Alphapolis, JapScan, MangaLi, MangaLink,
  MangaTR, MangaTilkisi, MangaTube, RainDropFansub, TruyenQQ — opt-in fork challenge
  handling for custom Cloudflare detection.
- **MangaNova e2e regression test**: 7 tests (catalog, chapters, pages, image).
- **ScanManga e2e regression test**: 5 tests (chapter, pages, image).
- **Cloudflare e2e regression test**: full manga → chapters → pages → image
  flow for MangaFire, Comix, MangaDrama.
- **VirtualList bookmarks fix**: the VirtualList component no longer activates when the
  Bookmarks plugin is selected — bookmarks all display without forced scroll.

### Fixed

- **ScanManga — sentinel cookies**: the server only serves chapters to requests
  without cookies. New sentinel `Cookie: __hkn_no_session_cookies__` consumed in
  the Electron `FetchProvider`.
- **ScanManga — reader API**: new endpoint `bqj.scan-manga.com/lel/<idc>.json`
  with `yf` token, WebGL/connection fingerprint, gzip decoding. Pagescript rewritten.
- **ScanManga — cookie injection**: session cookies are no longer injected into
  remote window requests (they keep their native cookies).
- **CrunchyScan — DRM cache**: DRM results are cached per chapter URL,
  preventing multiple windows.
- **Cloudflare classification**: site detections (AddAntiScrapingDetection) are
  tested in priority before the generic DOM heuristic (ChallengeReload).
- **CDP timeout**: `protocolTimeout` raised to 300s on the puppeteer `connect()` of
  the e2e fixture, to absorb network slowness on large listings (mangafire).

### Changed

- **Restricted cookie injection**: in `FetchProvider`, the merged session cookie
  injection is only applied to the app renderer's requests, not remote windows.
- **Opt-in fork challenge**: 8 custom-detection sites (Alphapolis, JapScan, etc.)
  use the fork challenge handling.

## [2.2.0] - 2026-08-22

### Removed

- **VirtualList**: removed from bookmarks and chapters lists. The component
  wasn't wired in upstream and caused a truncated display
  (scrollTop=0 without overflow-y:auto). Back to the classic {#each}.

## [2.1.2] - 2026-08-22

### Fixed

- **MangaDrama FetchPages**: replace regex literals with string checks to fix "Script failed to execute".
- **FetchProviderCommon**: [KUMO] diagnostic logs for runScript and redirect errors.

## [2.1.1] - 2026-08-20

### Added

- **Auto-update**: an "Install v…" button in the update notification
  downloads the platform zip from GitHub Releases, replaces the app
  and restarts it automatically. Falls back to the GitHub link in NW.js.
- **Improved scroll persistence**: the exact scroll position (pixel)
  is saved per chapter in addition to the image index, for precise
  restoration on webtoons/long strips.
- **Upstream connectors**: DivaScans, RawFree, Voratoon, WhyToon wired
  (cherry-picked from upstream). +8 available sites.
- **Linux .deb package**: added to the release workflow for Debian/Ubuntu
  distros (dpkg-deb).

## [2.1.0] - 2026-08-20

### Improved

- **MangaFire — list loading**: the API per-page limit went
  from 100 to 500 titles, reducing the number of requests from ~702 to
  ~141. Loading time drops from about 77s to ~15s (estimated).
  Graceful degradation if the server enforces a lower limit.
- **Upstream PRs relaunched**: rebased onto upstream/master (18 commits
  behind) — PR #1797 (Cloudflare fixes) and #1798 (perf optimizations)
  ready for review.

## [2.0.7] - 2026-08-20

### Fixed

- **JapScan — residual `.bin` file**: the download produced an empty
  `01.bin` file (0 bytes) next to the real images. Cause: the
  first URL collected by the reader returned an empty blob → MIME
  fingerprint failed → `.bin` extension. Two-layer fix: (1) image
  extension filter (`.jpg/.png/.webp/...`) on JapScan CDN URLs,
  (2) `DownloadTask` ignores empty blobs (`size === 0`) and re-indexes
  the remaining files for contiguous numbering (01, 02, …).

### Improved

- **Fuzzy Fuse.js search**: tightened options (`threshold: 0.4`,
  `minMatchCharLength: 2`, `fieldNormWeight: 0.3`) — far fewer
  false positives in fuzzy mode on the 70k MangaFire titles.
- **Persisted reading position**: the reading position (current image) is
  saved per chapter in `localStorage` and restored on
  opening — resume where you left off.
- **Cloudflare docs**: step-by-step guide for JapScan (anti-bot puzzle,
  initial warm-up) and CrunchyScan (same principle) added in
  `CLOUDFLARE.md` §§7-8.
- **Simplified build**: single script `bash scripts/bundle-x64.sh`
  (web + electron + x64 zip in one command, npm PATH managed).

## [2.0.6] - 2026-08-19

### Fixed

- **JapScan — image download**: `FetchPages` now opens the
  reader in a **visible window**, scrolls it to trigger
  lazy loading, then collects the CDN image URLs `*.japscan.foo`
  (`<img>` + network timeline, deduplicated) — with `CreateImageLinks` (DRM) as
  fallback. The `Referer` is that of the **chapter** (instead of the root) — cause
  of the 403 hotlink. `@Common.ImageAjax(true)` detects the type by bytes
  (`.jpg` files, no more black image).
- **Interactive challenge without navigation**: in `Interactive` mode, the window
  shows, then extraction restarts as soon as the challenge is lifted
  (bounded polling) — fixes the infinite spinner for "in-place" puzzles like
  JapScan's (`#jc-overlay`).
- **Diagnostics**: new `Diagnostics::WriteLog` IPC channel that writes to
  `userdata/diagnostics.log` (bounded at 5 MB, silent on error).
- Still a residual `.bin` at the chapter head (unrecognized non-image URL) —
  cosmetic, no impact on reading.

## [2.0.5] - 2026-08-18

### Added

- **Atomic version bump**: new script `scripts/bump-version.mjs`
  (alias `npm run bump:version`) — updates the three versioned `package.json`
  and inserts the CHANGELOG entry in a single step, refusing any
  execution if the manifests are misaligned, if the version already exists or if
  the semver format is invalid (`--dry-run` to preview). Eliminates the
  version misalignment that the CI guard detects.

## [2.0.4] - 2026-08-18

### Added

- **MangaDrama non-regression tests**: 12 unit tests lock down the
  chapter lock/unlock logic according to `is_purchased`.
  The rule is extracted into a pure `MapMangaDramaChapter` function,
  shared between the connector and the tests — the 🔒 lock can no longer
  regress without failing the suite.
- **CI version guard**: the three versioned `package.json` (root,
  web, electron) must share the same version before any build/release.
  A misalignment fails `push-ci` and `create-release` right from the start.

## [2.0.3] - 2026-08-18

### Fixed

- **MangaDrama**: **unpurchased** chapters show the 🔒
  lock and coin price again — the DOM overlay introduced in 2.0.1 was overriding the REST state
  (DOM items only carry `id`/`title`, so their lock state was
  always false) and visually unlocked every chapter. The app now
  trusts the `is_purchased` field of the API, correctly filled by
  the connected session: locked if not purchased, unlocked if purchased.

## [2.0.2] - 2026-08-18

### Added

- **Suggestions**: "Check for new chapters now" button on the
  Suggestions tile — triggers the bookmark scan without waiting for the configured
  period (still respects the "silent" setting that ignores sites
  requiring a browser window).

### Fixed

- **Linux snap bundle**: the snapcraft staging folders (`parts/`, `stage/`,
  `prime/`, created as root) are removed after the build — the
  3-OS release workflow no longer crashes when trying to attach a folder to the release.

## [2.0.1] - 2026-08-18

### Fixed

- **MangaDrama**: purchased (coin) chapters are no longer displayed as
  locked in the list — the lock state now respects the `is_purchased` field of the API
  and the rendered page (the real state for the connected
  user), instead of the sole `lock_type`.

### Added

- **Windows NSIS installer** (per-user, FR/EN bilingual, Add/Remove Programs,
  Start menu shortcuts, uninstaller): `hakuneko-electron-v2.0.1-win32-{ia32,x64,arm64}-setup.exe`
  in addition to the portable zips.
- **Linux snap bundle** (`.snap`) in addition to the AppImage, attached to the release
  GitHub (upload to the Snap Store stays opt-in via `SNAPCRAFT_STORE_CREDENTIALS`).

## [2.0.0] - 2026-08-18

> **Major.** ChainsmokerNeko is no longer a simple fork of HakuNeko: this
> version marks the move to a standalone product — complete Cloudflare
> bypass suite, massive performance optimizations, 3-OS distribution and
> bilingual releases.

### Added

- **Complete Cloudflare suite**: `cf_clearance` cookie import from
  Chrome/Edge (v10/v20 decryption + DPAPI, multi-browser fallthrough),
  manual paste as fallback, cookie persistence across restarts,
  "Clear Cloudflare cache" button, visible window only when a real
  widget is present.
- **MangaDrama**: account login, coin price display on the
  locked chapters, unlocking purchased chapters.
- **Configurable new-content scan**: recurrence (default 1440 min),
  lazy (triggered when opening the Suggestions view, never at
  boot) and silent (ignores sites requiring a visible window —
  CrunchyScan, JapScan, MangaFire, MangaLink, MangaTilkisi, MangaTR,
  RainDropFansub).
- **Automatic download** of new chapters under 48h from
  bookmarks (English versions only).
- **Automatic update** (electron-updater) with notification and button
  in the app.
- **Localized "no Electron environment" warning** when a
  connector requires a real browser window on a runtime that doesn't
  provide one.
- **Country flags** in front of chapter names.
- **Version displayed** in the sidebar, the reader footer, the
  splash screen and the settings.
- **3-OS distribution**: Windows bundles (ia32/x64/arm64), macOS (dmg),
  Linux (snap) built by CI; executable renamed `hakuneko(.exe)`.
- **FR/EN bilingual releases**, version/download badges, changelog and
  roadmap (`ROADMAP.md`).

### Changed

- **Performance**: virtualized chapter list (VirtualList, centralized
  subscriptions), sharded MediaLists store with on-the-fly diff (no more the
  91k-entry single blob), fuzzy Fuse.js search moved into a Web
  Worker, filter debounce with single sort, shared IndexedDB singleton.
- **Coral accent `#e5484d`** (danger semantics kept).
- **Default UA kept** (`Electron` segment) — eliminates the
  MangaFire challenge.
- **Bookmark scan**: no more Cloudflare window at launch.

### Fixed

- MangaFire / Comix / CrunchyScan Cloudflare loops (UA, reload poller,
  real widget control).
- MangaDrama login (non-shared session).
- Settings persistence on app close.
- v10 import: `RangeError expires_utc` (Edge closed) and 32-byte prefix of
  Chromium cookies.
- New-content scan that opened the window at every start; a failing site
  (e.g. CrunchyScan without `cf_clearance`) no longer blocks
  remembering the check.

## [0.1.15] - 2026-08-18

### Changed

- **Lazy new-content scan**: the bookmark check no
  longer runs at app startup — it only runs when the Suggestions
  view is displayed, at most once per period
  (`check-new-content-period`, default 1440 min). No more CrunchyScan Cloudflare window opening at launch.
- **"Check for new chapters without opening a window" setting**
  (enabled by default): during the check, sites whose
  operation requires a visible browser window (CrunchyScan) are
  ignored — no window opens during the scan. Disableable in
  Settings → General.

## [0.1.14] - 2026-08-17

### Added

- **Localized "no Electron environment" warning**: when a
  connector requires a real browser window (`FetchWindowScript`) on a
  runtime that doesn't provide one (web preview, Deno, Node…), the app displays a
  clear localized message instead of the opaque `InternalError`. Translated in
  the 14 locales, covered by 6 unit tests. Desktop behavior
  (Electron/NW.js) unchanged.

### Fixed

- **CI back to green**: three problems introduced by the 3-OS rewrite
  fixed — non-ASCII characters in YAML comments of workflows (ghost runs
  failing at 0s), `${{ runner.temp }}` in a job `env:` block forbidden, and
  top-level `extract-zip` import breaking the Windows bundles job (moved to
  lazy import, macOS/Linux only).

### Documentation

- Step-by-step **CrunchyScan warm-up guide** (CLOUDFLARE.md §7) + live test
  script verifying the `cf_clearance` snapshot (value, domain, persistence).
- **Release badges** (version + downloads of the latest release) in
  the French and English READMEs; download links verified (HTTP 200/206).

## [0.1.13] - 2026-08-17

### Added

- **"Clear Cloudflare cache" button** in Settings → General → Cloudflare
  bypass: clears in one click the `cloudflare-clearance.json` snapshot and all
  `cf_clearance` cookies of the shared session (to use when the cookie is
  stale and the site re-challenges). Returns a cleanup summary.

### Documentation

- **Bilingual README**: added `README.en.md` (complete English translation)
  with a language selector at the top of both files. Releases follow the
  same FR + EN convention.

## [0.1.12] - 2026-08-17

### Added

- **Update notification**: at launch, the app checks the latest
  GitHub release of the fork (`Endymi0n74/ChainsmokerNeko` via the `repository` field
  of the manifest) and displays a non-blocking toast "Update available — vX.Y.Z"
  with a download link to the release. Silent check on
  failure (offline, rate-limit, network outage) — never a blocking error.
  Semver comparison (`v` prefix tolerated), 15s timeout, a single GitHub API call
  per launch.

## [0.1.11] - 2026-08-17

### Added

- **`cf_clearance` cookie persistence**: the cookie obtained by solving a
  Cloudflare challenge (the "open the site" flow or import) is now
  saved in `cloudflare-clearance.json` (userData folder) and re-injected at
  startup with a fresh 30-day expiration. No more Cloudflare
  warm-up at every launch; a cookie that becomes invalid (revoked
  server-side or tied to another IP/UA) automatically falls back to the normal
  challenge flow that re-populates the snapshot.

### Fixed

- The `cf_clearance` set by the site as a **session cookie** (without expiration)
  was lost at app close → the warm-up restarted from zero at
  every restart.

## [0.1.10] - 2026-08-17

### Added

- **Cross-platform `cf_clearance` import**: automatic import now works
  on **Windows, macOS and Linux** (platform-specific AES key
  retrieval: DPAPI / Keychain + PBKDF2 / `peanuts` passphrase + keyring),
  without external dependency. Edge/Chrome profiles (and Chromium on Linux) are
  detected per OS; cookies decrypt in v10 AES-256-GCM (Windows)
  or v10/v11 AES-128-CBC (macOS/Linux). Algorithms verified against the
  Chromium source. The Windows path is validated for real (Edge v20 → Chrome v10,
  exact injected value, no regression).
- **"Test now" button** in Settings → General → Cloudflare bypass:
  verifies in one click whether the injected `cf_clearance` actually unlocks the site
  (fetch via the shared session + Cloudflare challenge detection).

### Changed

- Cloudflare documentation (`CLOUDFLARE.md` + README section) translated into
  English for non-French-speaking users.

## [0.1.9] - 2026-08-17

### Fixed

- **v10 `cf_clearance` import — integrity prefix removed**: Chromium 130+
  prefixes cookie values with a 32-byte integrity block before
  AES-256-GCM encryption. The v10 decryption did not remove it → the injected
  value contained 32 parasitic bytes. The prefix is now removed after
  decryption (validated for real on Chrome for Testing: Edge v20 import → Chrome
  v10, clean injected value).

## [0.1.8] - 2026-08-17

### Improved

- **Multi-browser `cf_clearance` import**: if Edge fails (locked or
  App-Bound Encryption v20), the import now tries **Chrome** before
  giving up. Documentation added (README + settings help text):
  v10 auto-read only works with **Chrome** or **Edge without ABE**;
  manual paste remains the universal fallback.

## [0.1.7] - 2026-08-17

### Fixed

- **`cf_clearance` import — crash fixed**: `expires_utc` (microseconds
  since 1601) exceeds `Number.MAX_SAFE_INTEGER` → node:sqlite raised a
  `RangeError` as soon as auto-read read a cookie (Edge/Chrome closed).
  The timestamp is now cast to TEXT in the query and parsed as BigInt.

## [0.1.6] - 2026-08-17

### Added

- **`cf_clearance` import from the real browser**: new
  "Cloudflare bypass" section in Settings → General. A button reads the cookie
  `cf_clearance` from Edge/Chrome (DPAPI + AES-256-GCM decryption of the SQLite
  store) and injects it into the shared session of the app; a
  **manual paste** field remains available when the browser is open (locked
  store) or protected by App-Bound Encryption (v20, detected with an
  explicit message).

## [0.1.5] - 2026-08-17

### Fixed

- **CrunchyScan — Cloudflare loop resolved**: three chained problems
  blocked the listing on the "One moment…" challenge:
  - the `cf_clearance` cookie is only issued when the remote window is
    **visible** → the window now shows for opt-in reload sites
    (CrunchyScan), without a flash for other sites (MangaFire,
    MangaDrama, Comix stay hidden);
  - `cf_clearance` is **httpOnly** → the poller reads it via the CDP debugger
    (`Network.getCookies`) instead of `document.cookie` (always empty);
  - reload budget **bounded globally at 3** (instead of an unbounded
    loop: ~35 navigations in 40s) and all pollers stopped at
    `destroy()`.

## [0.1.4] - 2026-08-17

### Added

- **MangaDrama login in the app**: the connector checks the session via
  the REST API (`/wp-json/wp/v2/users/me`). If the user is not logged in,
  a **visible window opens on `/my-account/`** to log in from
  the app — session cookies persist in the shared session and
  **purchased (coin) chapters unlock** (`is_purchased`,
  `InitMangaEncryptedChapter`). The window closes automatically as soon as the
  session is authenticated (5s poll, max ~5 min).

### Changed

- **MangaDrama — coin price visible**: coin-locked chapters
  now display their cost in the list (e.g. "Chapter 76 - Title
  (3 coins)"), information provided by the API (`lock_type`/`lock_value`).

## [0.1.3] - 2026-08-16

### Changed

- **Adaptive manga filter debounce**: the delay goes to **120 ms in substring
  mode** (default) instead of 200 ms — the measured E2E latency typing → list update
  drops from **~313 ms to ~192 ms** (see `BENCHMARKS.md`
  §1). **Fuzzy** mode (opt-in) keeps 200 ms: the Fuse.js search (~205 ms)
  runs in a Web Worker and a longer delay avoids stacking searches.

## [0.1.2] - 2026-08-16

### Changed

- **Differential manga list updates (`MediaLists`)**: on refresh,
  only the batches (`#0`, `#1`, …) whose content actually changed are
  rewritten (comparison `id` + `title`), instead of rewriting the total of
  batches at each update. Each batch is compared **one by one on the fly**
  (read then possible write), without ever materializing the whole old list in memory.
- **Measured gain (live, real IndexedDB — see `BENCHMARKS.md` §2)**: on a
  70,000-entry list, writes per refresh drop from **70** (full shard
  rewrite, v0.1.1) / 1 blob of 70k (mono-key, v0.1.0) to **0** on an
  unchanged list and **1–2** with a few changes. The wall-to-wall duration stays
  ~30 ms on NVMe (the network fetch of the 70k titles, ~77s, dominates the refresh) —
  the gain is structural: no systematic rewrite/clone, writes in
  O(changes) instead of O(list), and the old list is no longer materialized
  in memory. Regression tests also covering the shrink (purge of stale shards
  without rewriting unchanged shards).

## [0.1.1] - 2026-08-16

### Added

- **Automatic download of new chapters** in the settings (General
  tab): a button detects chapters published in the **last 48 hours**
  among the **bookmarks**, filters **English versions** and adds them to the
  download queue.
- `PublishedAt` field on the `Chapter` model: publication date reported from the
  site (MangaFire provides `createdAt` per chapter) and used by the "48h" filter.
- Unit test of the `ApplicationWindow::GetVersion` IPC channel
  (`ApplicationWindow_test.ts`, with `app.getVersion` mocked).
- **Language flags in front of chapters**: the country flag (emoji) is
  now displayed in front of each chapter name with a language tag,
  to distinguish versions (previously reserved for multilingual mode).
- **Version in the title bar and window title**: the app version
  (e.g. `v0.1.1`) is displayed next to the name in the AppBar and in the
  window title (`document.title`).
- **Version in the reader footer**: in fullscreen mode (image reading),
  a discreet footer displays `v0.1.1` at the bottom left.
- **Functional splash screen with version**: the Electron loading window
  (`OpenSplash`) actually displays at startup (it was ignored by
  `ShowWindow` on the main side) and displays the version read via IPC. The window is
  recreated cleanly at each display (fix of the `Object has been destroyed`
  on reload).
- **Minimum splash screen duration**: "Splash screen" setting in the General
  tab of settings that keeps the startup screen visible for at least the
  specified duration (0 = no minimum).

### Changed

- Bundle executables renamed **`hakuneko`** on all platforms
  (`hakuneko.exe` on Windows, `hakuneko` binary in the macOS .app and the Linux
  snap) instead of `hakuneko-electron`: the app runs under a process name
  distinct from `electron.exe`, which avoids closing it when killing test probes.
- **Smoothed manga search**: input is debounced (200 ms) and the list
  is sorted only once at load instead of being re-sorted at each keystroke
  (filtering preserves the already-sorted order).
- **Virtualized chapter list**: the chapter list of a manga now uses
  `VirtualList` (only visible rows are rendered, instead of the
  ~1,200 DOM nodes of a long series). Flag and download queue
  subscriptions are **centralized in the list** (one per list) and the state is
  passed to items via props, instead of ~2 subscriptions per chapter (thousands in total).
- **Sharded manga list (`MediaLists`)**: a site's list (e.g. ~70,000
  entries MangaFire) is no longer loaded/rewritten as a single mono-key blob; it is
  split into batches of 1,000 entries (keys `#0`, `#1`, … + meta `#meta`), with fallback
  on the old mono-key format and purge of obsolete batches upon update.
- **Fuzzy search in a Web Worker**: Fuse.js indexing and search
  now run in a worker (`FuseSearchWorker`) instead of the UI thread — the
  search (up to ~200 ms on 70,000 titles) no longer blocks the interface. The
  worker indexes the titles and returns indices, remapped afterwards to the items.

### Removed

- "**Save all images**" action of the image reader (overlaid button removed: deemed
  superfluous compared to standard chapter downloads).

### Fixed

- **Settings/bookmarks lost on close**: the local server chose a
  **random port** at each launch (`listen(0)`), which changed the origin
  `http://127.0.0.1:<port>` and reset IndexedDB/localStorage (therefore the
  settings and bookmarks) between two sessions. The server now listens on a
  **stable port** (64210, with fallback 64211–64225 then free port in case of collision),
  which preserves the origin and persistence from one session to the next.

## [0.1.0] - 2026-08-16

### Added

- Clean project version (`0.1.0`): bundles are now named
  `hakuneko-electron-v0.1.0-<platform>-<arch>.zip` instead of carrying Electron's version
  (`v43.3.0`); the version is also propagated to the embedded manifest and the snap.
- The app version is displayed in the settings ("HakuNeko v0.1.0") and in the
  "About" menu of the sidebar ("Using version 0.1.0"), read from the manifest
  via the `ApplicationWindow::GetVersion` IPC channel.

- **CrunchyScan** and **MangaDrama** connectors (scrapers + WAF), "New chapters" panel and improved reader UX.
- **Comix** connector fully rebuilt **without DRM** (~91,000 mangas, chapters and pages via the site's axios scripts).
- 17 new connectors.
- Context menu of the image reader: save / copy the image.
- Download button of the items in the classic interface + source display in case of list failure.
- E2E listing regression test for Cloudflare sites (`web/src/engine/websites/CloudflareList_e2e.ts`).

### Fixed

- **Infinite Cloudflare challenges** (MangaFire, Comix, CrunchyScan):
  - Standard UA kept: removal of the produced token (`hakuneko-electron/…`) from the user-agent instead of the `Electron` segment.
  - Shared Electron session with remote windows + partitioned cookies (`cf_clearance`) included in the fetch injection.
  - Auto-resolution of "managed" challenges in the background: removal of the `win.Hide()` (which paused the challenge) and grace delay before inspection of the page.
  - **Opt-in reload** of blocked challenges (`ChallengeReload.ts`, used by CrunchyScan).
- CrunchyScan downloads: retry (3×) with backoff + per-attempt timeout against intermittent Cloudflare 403s.
- **MangaFire** and **MangaDrama** scrapers.
- CrunchyScan moved to `crunchyscan.org`.

### Changed

- The web app is served by a **local HTTP server embedded** in the Electron client.
- Deterministic installation: `package-lock.json` committed + `npm ci` in CI.
- CI: typecheck + lint + svelte-check + vue-tsc + build (web/electron/nw) at each push, with npm cache and Electron binary.
- Removal of the Cloudflare deployment workflow inherited from upstream.

---

## Upstream history

The complete history (3,900+ commits) comes from [HaruNeko](https://github.com/manga-download/haruneko)
and from [HakuNeko](https://github.com/manga-download/hakuneko). This changelog only covers the
changes specific to this fork.


## Credits

Developed with vibe coding, assisted by **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.

Développé en vibe coding avec l'assistance de **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.