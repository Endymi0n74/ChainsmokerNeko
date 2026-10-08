# Changelog

All notable changes to **ChainsmokerNeko** are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

🇫🇷 [Version française](CHANGELOG.md) · 🇬🇧 English

## [3.0.20] - 2026-10-08

### Fixed

- **The update check now queries GitHub at most once per hour**: every click on "Check for updates" (sidenav entry or "What's new" panel) issued a fresh request to the GitHub API, which allows only 60 unauthenticated requests per hour per IP — the budget was quickly exhausted, the check then failed with a `403`, and **the failure was displayed as "Up to date"** (the panel lied to stay quiet). The application's single entry point now claims the hourly budget (`UPDATE_CHECK_INTERVAL_MS = 60 min`) *before* sending the request: every trigger within the hour — startup check, clicks, concurrent calls — shares one single query and receives the last known outcome without touching the network, **failures included** — an offline or rate-limited service never invites a retry storm. The check can no longer exceed one request per hour. The release notes of the "What's new" panel are read from the bundled changelog (no request).

## [3.0.19] - 2026-10-08

### Fixed

- **A dead image host no longer poisons every subsequent Comix download**: `FetchImage` ran unbounded once queued into the image pool (the download task's 15 s budget only rejects the promise, it never cancels the request), so four requests left in flight against a dead domain — the rotating `*.kkplayer.wtf` CDNs drop without notice — kept the pool workers pinned, and every following page, including pages of other chapters served by perfectly healthy hosts, died waiting for a worker after 15 s, long after the host had recovered. Each image request is now bounded at 15 s from its own start (cancellation via `AbortController`), and a host whose request failed at the network level enters a 20 s cooldown: the remaining pages fail immediately with a clear error instead of stacking new waits on a dead host, and downloads resume by themselves once the host is back. Transient network errors get a single retry after 500 ms.
- **Chapters with more than ~57 pages no longer lose their tail**: the download task's 15 s budget starts when every page is launched, while the Comix pool only started requests at 4 per second (250 ms throttle) — beyond roughly 57 pages, all remaining pages died in the queue with `timed out after 15000ms` without ever having been requested, even though the host answered in 50 ms (measured on the 183-page chapter 232: 58 pages recovered). The pool throttle now runs at 20 requests/s (50 ms): concurrency stays at 4 simultaneous requests, only the start cadence increases — the ceiling now exceeds 300 pages and small chapters get faster (15 pages in 0.9 s instead of 3.7 s). `FetchImage` also rejects non-`ok` HTTP responses with the status instead of letting them masquerade as images: a broken page becomes a visible error rather than a silent hole.

## [3.0.18] - 2026-10-07

### Fixed

- **The Comix connector works again**: comix.to's 1 October build re-bundled its exports — the axios instance was no longer exposed as the `x` export (which had become a plain `e=>aa(t,e)` helper, passing the `typeof === 'function'` check while having no `.get`), hence the `TypeError: __axios.get is not a function` thrown for every title, chapter and page listing. The connector scripts now locate the HTTP client **by shape** — the bag of `get/post/put/patch/delete` verbs, falling back to a raw axios instance — instead of by an export name that changes on every deploy, with adaptive unwrapping: depending on the build, `get` resolves either to the full axios response or directly to the payload.
- **Comix images can be downloaded again**: the image CDN (rotating hosts such as `*.softvisualstudio.site`, `*.kkplayer.wtf`) answers `403` (hotlink protection) to any request carrying a non-empty `Referer`, even one reduced to the image's own origin, while the connector always attached `Referer: https://comix.to/` — so every page download hit `FetchProvider_Fetch_Forbidden`. `FetchPages` no longer attaches a `Referer` to the pages and `FetchImage` downloads with `referrerPolicy: 'no-referrer'`, the way the site's own reader loads its images.

### Changed

- **The Comix e2e fixtures target a healthy image host**: chapter 66, used by the fixtures, is served from `rnn-d.kkplayer.wtf`, a host which no longer answers (TCP timeout, unchanged public DNS resolution) — the "fetch valid blob" test could only ever time out. `Comix_e2e` and the full flow of `CloudflareList_e2e` now use chapter 232, hosted on a reachable CDN node, with a note to avoid falling back onto a dead host.

## [3.0.17] - 2026-10-01

### Fixed

- **Simple requests blocked by Cloudflare are resolved through the plugin window again**: a simple request rejected with `CF-Mitigated` or `403` used to fail without offering any resolution — once `cf_clearance` expired, pasting a media URL and the listings silently did nothing. The fetch provider now resolves those failures through the site's challenge window (the fork flow), retries the request exactly once, concurrent requests join the window which is already open, and a cooldown prevents one window per request; challenge pages served with a success status are detected in `FetchHTML` and handled the same way. The media list surfaces the paste error as a notification instead of the console only.
- **A Cloudflare challenge which renders no control no longer stalls until the timeout**: when Cloudflare issues a `cf_clearance` without ever rendering a widget and without redirecting the interstitial, the stalled reload was gated on a fresh clearance — a probabilistic signal firing only about half the time, which left the window pinned until its timeout. `PlanStalledChallengeReload` now decides between two cases: no control ever rendered → deterministic reload after a 12 s render grace with no clearance gate (the widget itself stays in charge, reloading a checkbox the user is about to click only resets it), a control seen first and then a fresh clearance → unchanged behaviour for CrunchyScan. Empty chapter lists are no longer cached (an extraction run against a still-challenged document cannot pin "0 items") and JapScan opts into the stalled reload.
- **Every reader window close is now explicit**: the flow logs its reason (timeout, script settled, script failed, open failed) before closing, and a window which disappears without our command — a click, a renderer crash, the OS — announces itself in the console with the crash reason when there is one. A poller's `Failed to find window with id N` can no longer be mistaken for our own cleanup.

### Added

- **Challenge stall diagnostics**: the probe line now also reports the document age, the markers which decided the classification, the challenge scripts and elements with their source and visibility, and — while no widget is visible — the real frame tree as the debugger sees it (`cdpFrames=`), which reaches frames hidden inside a shadow root that no DOM query can see. On the Electron side, reader window consoles are relayed into the application console, errors included.

## [3.0.16] - 2026-09-30

### Fixed

- **Intermittent JapScan chapter timeouts**: when the site navigates (post-clearance redirect) 7 to 13 seconds after the extraction script is injected, the document — and with it the execution context — disappears: `ExecuteScript` never resolves, the chapter update burns its 300 seconds without a single reply from the reader window and the whole chapter fails (observed on chapters 86, 94, 115.5 and 116, **always after an anti-bot challenge was solved** — chapters that succeed, on the other hand, load without a challenge). Any main-frame navigation during a pending injection now unblocks the flow at the next `DOMReady` (challenge detection, grace period, `runScript`), re-dispatching the script onto the new clean document. Every attempt carries a number — only the most recent one may resolve or fail the request, a superseded attempt is discarded with a trace — and a navigation-induced failure waits for the new document instead of failing the chapter; the `runScript: inject/returned attempt=N after Xms` milestones tell a successful injection apart from an execution that never gives control back.

### Added

- **Timeout diagnostic probe**: every sensitive stage (`chapter-update` 300 s, `page-stall` 15 s, `reader-extract` 300 s, `drm-pages` 30 s, `chapter-list` 30 s) leaves a filterable, timestamped (`+M:SS.s`) `[probe]` trail with stage milestones and a 30 s heartbeat; on every timeout an automatic recap replays the trail from the start of the stage (1.5 s lead-in, 30 lines max) mixed with the relayed console lines (`[KUMO]`, `[ReaderWindow:`, `[JapScan]`, `[DownloadTask]`, a 300-line ring). The reader window's console is relayed to the renderer — that relay is how the root cause above was identified.

## [3.0.15] - 2026-09-30

### Added

- **A “What's new” panel on the home page**: the “Guides / Advanced / Support” block now shows the release notes of the running version, read from `CHANGELOG.en.md` **bundled into the build** — hence offline, with no request to `hakuneko.download` — together with the current version, a “Check for updates” button (same store as the “About” entry and the banner: only one check ever in flight, and the banner is raised as soon as a newer release exists) and a link to every release of the repository. The notes live in a scrollable `16em` box, so they never push the page down (the longest section, 3.0.7, measures 1746 px of content inside a 202 px box). Validation: pure helper `lib/changelog.ts` plus 14 tests — section extraction that cannot confuse `3.0.1` / `3.0.10` / `3.0.11`, HTML escaping (no injected element), bold/code/links, nested bullets, and a guard which fails the suite when the changelog stops documenting the version of the application; `npm run check` green, 2300 web tests + 30 Electron tests green, `vite build` green (the changelog is present in `FrontendClassic.js`).

### Changed

- **The home page card now speaks for the fork**: “ChainsmokerNeko is a fork of HaruNeko: same interface, same connectors, and its own releases — the application updates itself from them”, with the “ad-hoc consumption” philosophy reworded (replacing the upstream text “was made to help users who download media for circumstances that requires offline usage”); the HaruNeko/HakuNeko credits are kept.

### Removed

- **The upstream documentation panel** (`Documentation.svelte` + `stores/Documentation.ts`): it was fetching `https://hakuneko.download/docs/haruneko/`, a page labelled “Temporary documentation” dated December 1, 2023, filled with “Temporary filler” and lorem ipsum (“Find your source”, “Select a plugin”, “Download”, the whole Support block), written for HakuNeko — one weekly network call with a one-week `localStorage` cache to display dead text.

## [3.0.14] - 2026-09-29

### Fixed

- **Update banner: the “Download on GitHub” link broke mid-word** (“Downloa / d on / GitHub” on the user's screenshot) — `.update-actions` is a flex row **without `flex-wrap`** and the “Install” button refuses to shrink (`white-space: nowrap`), so the link absorbed the whole squeeze, fell below the width of its text and broke in the middle of a word. The banner now uses `width: max-content` (capped at `24rem` so it can never overflow a narrow window), the action row uses `flex-wrap: wrap` and the link `white-space: nowrap`: it therefore occupies its own row at its natural width. Validated with a **before/after harness** reproducing Carbon's toast DOM (`sidenav-harness/toast.html`, shown in the review pane): **2 broken lines / link squeezed to 65 px before → one full line / 133 px after**, box at 304 px under the 384 px cap.

## [3.0.13] - 2026-09-29

### Fixed

- **CI: detaching the DMG disk image failed at times on the macOS runner** — `hdiutil detach` returned `Resource busy` (exit 16) right after `sync`, failing the “Create macOS Bundles” job even though the same job succeeded on a rerun (flakiness observed on 3.0.11). Detaching now goes through the new `detachVolume()` function: 3 attempts, escalating to `-force` from the second one, 5 s of waiting between attempts, and the last error is rethrown so a corrupted disk image is never shipped silently. No application change: this release also serves as the **trigger** to exercise auto-update from 3.0.12 (“About” menu → “Check for updates”).

## [3.0.12] - 2026-09-29

### Added

- **Manual update check in the “About” menu**: a new “Check for updates” entry (*Renew* icon) below the merged entry, whose label doubles as its own status — `Check for updates` → `Checking for updates...` → `Up to date — v3.0.12` or `Update available — v3.0.13` — and raises the bottom-right banner whenever a newer release exists. The check state is shared through the store (`update`, `updateOpen`, `CheckForUpdate()`), so the startup notification and this entry stay in sync, and only one query is ever in flight: clicking while the automatic check runs awaits the same promise instead of getting a premature `null` that would report “Up to date”. The entry reuses the `.about-line` class to wrap over several lines (harness: OK, nothing truncated, “Maintainers” control kept at 32 px).

### Fixed

- **The update banner never showed, for anyone** (since the beginning, hence in 3.0.9, 3.0.10 and 3.0.11 as well): `Store.WindowController` was assigned **after** `mount(App)` while `UpdateNotification` triggered its check inside `onMount` — `UI.WindowController` was still `undefined` there, and the optional chain `UI.WindowController?.CheckForUpdates()` short-circuited silently: no request, no error, no log. Every other consumer goes through `$effect`/`$derived`, which re-run at assignment time — hence the version correctly displayed in the title, which masked the bug. Fixed twice over: the assignment now happens **before** the mount (`FrontendClassic.ts`) and `UpdateNotification` relies on a reactive `$effect`, with an invariant test (`FrontendClassic_test.ts`) locking the order of both.
- **Validation**: `npm run check` green (versions + ts + eslint + svelte-check + vue-tsc + coding rules) and 2,286 web tests + 30 Electron tests green.

## [3.0.11] - 2026-09-29

### Fixed

- **“About” menu: the merged entry was truncated** — Carbon forces `height:2rem` on menu links and `white-space: nowrap` with an ellipsis on their label, so “Using version 3.0.10 — Vibe coding with Codebuff (Kumo) 🤖” did not fit and was cut off. The label now goes through the `SideNavLink` slot (`<span class="about-line">`) and three targeted `:has(.about-line)` rules allow line wrapping and an automatic entry height, **leaving the other entries untouched**. Validated with a measurement harness (without the rules: truncated; with them: the whole label is visible and “Maintainers” stays at 32 px).

## [3.0.10] - 2026-09-29

### Changed

- **Single “About” menu entry**: the version and the credit now share one line — “Using version 3.0.10 — Vibe coding with Codebuff (Kumo) 🤖” — replacing the two separate entries, and it opens `https://github.com/Endymi0n74/ChainsmokerNeko` instead of the `https://todo.com` placeholder.

### Fixed

- **Auto-update locked to the fork**: the update channel (latest-release query as well as archive download) used to follow the manifest's `repository` field; it is now bounded by the `UPDATE_REPOSITORY = Endymi0n74/ChainsmokerNeko` constant and the manifest is no longer read. No configuration value can therefore redirect an update to the upstream project (`manga-download/*`), and an installed application does pick up the releases published on this repository — three tests lock down both the API URL and the archive URL.

## [3.0.9] - 2026-09-29

### Added

- **Composed translated overlays (KomaScans)**: the speech bubbles of French and Spanish chapters are genuinely translated into English, both on screen and in downloads. The `@Common.ImageAjax` decorator is replaced by an overloaded `FetchImage` (`Common.FetchImageAjax.call(this, page, priority, signal, true)` + composition): the `translationOverlay` request carried by `Page.Parameters` stacks a text layer over the source image (canvas `fillText`, `convertToBlob({ type: 'image/webp', quality: 0.9 })`), and any failure — font, translation or rendering — silently falls back to the base image. The site's fonts (Comic Relief, Koma Patrick Hand SC, Oswald, Barlow Condensed) are read from the page's CSS properties (URL in single quotes, regex `[\w-]+`), cached through a shared `Map<string, Promise<void>>` so concurrent compositions await the same load, and guarded by `if (!keys.size)` against the race that emptied the index — three bugs found and fixed by the visual harness. Validated on GEED ch.1 FR: 7 regions composed (722,316 bytes of webp, ~700 ms), identical output under concurrency.
- **Language flags in the list**: every entry shows the Unicode flag of its locale (🇬🇧🇫🇷🇪🇸🇮🇩🇩🇪🇵🇹🇸🇦🇹🇷…), visible from startup without a refresh — including for Manga rebuilt from the cache. The shared helper `lib/flags.ts` (`ExtractUnicodeFlagFromTags`) recognises `^[\p{RI}\p{Extended_Pictographic}\uFE0F]+` sequences and avoids the `slice(0, 4)` "🌐 M" artefact. Root bug fixed additively: `MangaPlugin.Prepare()` rebuilds Manga from the local cache through `CreateEntry(id, title)` without tags, hence the `MangaScraper.GetMangaTags(identifier)` hook (default `[]`, no impact on other connectors) propagated by `MangaPlugin.CreateEntry`; KomaScans overrides `GetMangaTags` with `[MapLanguageTag(identifier)]`. Cache format unchanged.

### Changed

- **“ChainsmokerNeko” identity throughout the application**: title bar, header, home page, startup guide, settings window, content-area breadcrumb, Electron splash and boot screen now display ChainsmokerNeko, as do the bookmark export (`ChainsmokerNeko (date).bookmarks`), the EPUB `generator` metadata and the NW.js build title. The 13 Crowdin locales stay untouched: the name replacement is applied once when the resources are bound in `Localization.ts` (`ApplyBrandName`), Arabic transliteration « هاكونيكو » included, while the external “HakuNeko Assistant” extension keeps its name in every language (guard on the `assistant`/`asistente`/`助理`/`مساعد` forms). Credits for the original project added on the home page (HaruNeko, then HakuNeko, both linked) and kept in `og:description`; `productName` becomes `ChainsmokerNeko` → `ChainsmokerNeko.exe` and local zip `chainsmokerneko-electron-v{version}-win32-x64.zip`, with the user profile `%APPDATA%\ChainsmokerNeko` unchanged. Internal identifiers (`window.HakuNeko`, theme key `hakuneko`, IndexedDB `HakuNeko`, RPC path `/hakuneko`) are kept so nothing breaks.
- **Validation**: `npm run check` green (versions + ts + eslint + svelte-check + vue-tsc + coding rules) and 2,285 tests green across 37 files.

### Fixed

- **Auto-update returning 404**: `AppUpdate` built `hakuneko-{platform}.zip` while the release publishes `ChainsmokerNeko-v{version}-{platform}.zip` — so the update download from the banner always failed. The asset name, the User-Agents and the temporary directory now follow the real product name, the `repository` config already targeting `Endymi0n74/ChainsmokerNeko`.

## [3.0.8] - 2026-09-28

### Added

- **New KomaScans connector** (`komascans.com`): the catalogue is rebuilt from the sitemaps — `series-0.xml` for English (8,176 series) and `series-{locale}.xml` per locale (~156 entries each), taking ~3 s, with titles reconstructed from the slugs (`Log-Leveling-Lawyer` → `Log Leveling Lawyer`, ~90 % fidelity), sorted alphabetetically by the connector (the UI does not sort) and tagged with each locale's language (the site is already declared multilingual: `Tags.Language.Multilingual`). Chapters use a **fast-then-complete hybrid**: the series page only hydrates a maximum of 50 chapters (~1.5 s is enough for Nano Machine), and when `firstChapter` is missing from that partial list (truncated series: 331 real chapters for 50 hydrated) completion falls back to the `chapters-N.xml` (English) / `chapters-{locale}-N.xml` (other locales) sitemaps, in batches of 4 requests to bound memory — ~45 s for the full Nano Machine. Chapters are ordered **descending** (engine convention) and carry no `publishedAt` (the sitemaps' `lastmod` is an import date, not a publication date). Pages are extracted from the episode's RSC payload and ordered by `position` (the HTML only holds the video players), images are served through `ImageAjax` with real type detection; `Initialize()` opens no browser window (the API is public) and `ValidateMangaURL` also accepts `/read/...` URLs (normalised to `/series/...`). **Localized chapter labels**: the chapter title stored by the site is English for *every* locale (its translation only exists in the rendered HTML — "Chapitre 1 VF", "Capítulo 1 en español"), hence the pure function `LocalizeChapterWord`, which swaps the `Chapter` word for the one the site itself uses for that locale: `Chapitre` (fr) and `Capítulo` (es) **only**, the seven remaining locales being displayed as `Chapter` on the site — the connector therefore never diverges from the source, and titles without a chapter word (`Start Reading`, `107: Special Forces <4>`) or already localized are left untouched. **Known limitation — content not composed outside English**: the translation only exists **rendered by the site** (`<img src={page.url}>` plus an SVG overlay drawn in the browser from `translationOverlay.cleanLayerUrl`, the patch layer, and `translationOverlay.translation.regions[]`, the positioned text); no server-side composite is exposed (the APIs are limited to `audience`/`views`/`progress`/`comments`, `renderKind: null`, no export), and `pages[].url` points to **the very same file** as the English version (`sameUrl: true`, 622,704 bytes of webp for chapter 1 of *The Greatest Estate Developer*): HakuNeko therefore downloads the base image, **the content of the fr/es/de/id/pt/ar/tr chapters stays English** — only the labels are localized. Scope: 8,181 English series against 19 French and 22 per other locale (1 to 4 chapters each). +31 unit tests over the exported pure functions (`SeriesTitleFromSlug`, `MapChapterNumber`, `MapChapterTitle`, `LocalizeChapterWord`, `ResolveSeriesIdentifier`, `HydratedChapter`) and an e2e fixture; `npm run check` with 0 errors and 0 warnings, 2,232 unit tests green, e2e 5/5.

## [3.0.7] - 2026-09-27

### Fixed

- **JapScan — the download aborted itself while the pages were still being resolved** ("the chapter shows up in the viewer, I solve the puzzle, then the download times out"): two safety nets coming from the **same** commit contradicted each other. `CHAPTER_UPDATE_TIMEOUT_MS` (300 s) allowed `Media.Update()` to be long, but the `DownloadManager` stall guard (20 s without progress) cancelled the task **before** it — yet during `Update()` there is *no* progress at all, and that is expected: JapScan opens a visible reader window, waits for the user to solve the puzzle, then lazy-loads the pages. The task was therefore aborted ~20 s after the click while `Update()` kept running as a zombie until its 300 s, hence `Chapter update for Volume 22 timed out after 300000ms` even though the extraction eventually succeeded (204/204). The pages started afterwards were given an already-cancelled signal and **all** of them failed (204 errors in 17 ms); since `errors` was non-empty `Media.Store()` was never called: nothing was written to disk, and you had to click again — the second time the puzzle is already solved, `Update()` finishes under 20 s and everything works. The decision is now the exported pure function `StallTimeoutFor(status, progress)`: as long as no page has been fetched (`Downloading` with no progress) the bound is the resolution one, and the 20 s applies again as soon as a page has gone through or the task stores its result — the original intent ("never block the queue") is preserved, only its contradiction removed.
- **JapScan — the Cloudflare loop is gone ("puzzle to solve too often" + window looping while validating)**: two complementary causes, neither sufficient on its own.
  - **Puzzle detection tested existence instead of visibility**: `JapScan.ts` used `!!document.querySelector('#jc-overlay')` while the node **lingers in the DOM after resolution** (hidden via CSS — already documented in 3.0.3 for the collection). `CheckAntiScrapingDetection` therefore never returned `None`, `cleared` never became true in `PollForChallengeResolution` (which requires `antiScraping === None`), every window ended on a 150 s timeout and the connector re-opened a new one. Detection is now decided on the overlay's **visibility** (display/visibility/opacity/offsetHeight), exactly like `isBlocked()` in `JapScan.Extract.ts`; the pre-render announcement via `window.__captcha.needed` is still detected because the node does not exist yet at that point.
  - **A pre-existing `cf_clearance` was taken for a fresh one**: `PollForChallengeResolution` initialized `lastClearance` to `''`, so the **first** CDP read (~4 s after the window opened) made the previously **persisted** cookie look like a fresh clearance → `cleared = true` → `runScript()` ran **while the user was still validating**, the window destroyed itself, the extraction ran on a locked page (few pages) and triggered the next DRM window → another challenge to validate, in a loop. Same root cause as the 27 Sept CrunchyScan fix. The baseline is now the value read at `DOMReady` (same source as `ReloadStalledCloudFlareChallenge`) and only a genuine change or a clearance issued after that baseline ends the poller.
- **JapScan — window not shown in Automatic mode**: the Automatic branch of `FetchWindowPreloadScript` only called `win.Show()` for the opt-in "stalled reload" sites, whereas `1bb8d2fc1` had added it for every fork-handled site and `LESSONS.md` documents it as required ("JapScan and CrunchyScan need this window"). The `1dfea5555` refactor lost it along the way → the Cloudflare challenge ran in the background with no window → never resolved → timeout → re-opening. All fork-handled sites show the window again before starting the poller.
- **JapScan — parasitic thumbnails on chapters** (up to 4 extra pages: blank tiles, an ad, "Resource is not an image"): the reader mounts its own chrome images (`/images/top-banner-728x90.png`, `/images/donate.png`, ad creatives under `/imgs/japys/`) on the site host, and they pass the generic CDN test (JapScan-owned host + image extension) → the DOM path reported them as pages. The chrome filter only existed in the `adoptProbe` branch (taken only when the probe covers DOM+5 and the site's own announcement), so the three other branches (`drm`, plain DOM) returned the raw list — hence the "still 4 parasitic thumbnails" report while `dom: 17` was announced against `total: 13`. The filter is now an exported pure function `FilterSiteChrome()` applied **once** to `domLinks` before every branch: the `_banner_`/`/e44j82.jpg` markers, the document host / `www.` / apex outside the `/manga/` tree, the static asset directories (`/images/`, `/imgs/`, `/ad/`, …) and chrome file names on any other host; a `/manga/` entry on the document host is kept so the result can never be emptied if the site moves to a same-origin proxy. The log and diagnostics now report `chrome: N` plus `chromeDropped` to show exactly what was removed.

- **JapScan — the 4th parasitic thumbnail (fetched but never mounted)**: probe reading on a real chapter — `dom: 17` → `chrome: 3` removed → **14** delivered against `total: 13`, with a probe/DOM overlap of 0.929: exactly one DOM URL was missing from the site's `imgUrls` list, and that list held *exactly* `total` entries (matching the reader's own selector). It is a URL the site **fetches but never assigns to an `<img>`** (the very one raising the CORS error in the log): never displayed by the reader, therefore a candidate — and no host/path rule can tell it from a real page. `adoptProbe` only fired when the probe was **at least 5 links longer** than the DOM; the condition now also accepts the case where the probe **covers the announced total**, which yields exactly `total` pages in the site's own order. All 4 original thumbnails are now handled: 3 by `FilterSiteChrome`, the 4th by probe adoption.
- **JapScan — big chapters (200+ pages) needed 2-3 attempts until a timeout**: every stop condition (lazy-loader drain, page-selector walk, scroll loop) tested `seen.size`, which **also contains the site chrome** (3-4 entries passing the CDN test). The stop therefore fired N URLs too early, `finalize()` then stripped that chrome from the result, and `links.length` came back below `total` → `IsIncompleteReaderResult` triggered the DRM fallback window (or a failure) while every page was in fact there. The three conditions now use `contentSize()`, which applies **exactly** the same filtering as `finalize()`: the count being tested and the list being delivered can no longer disagree. Probes added on request: `probeMiss` (DOM URLs absent from the probe's `imgUrls` list, i.e. candidates that are not pages) and `budget` — active phase, `DEADLINE` when the 240 s hard timer won, why the drain stopped (`total`/`stall`/`budget`/`drm`), URLs found by the walk, budget left when it started and why it stopped (`timeout`/`complete`/`blocked`/`drm`/`no-urls`) — with a dedicated `[JapScan] … budget:` log line.
- **JapScan — extraction safety nets**: `filterSiteChrome` is wrapped in a `try/catch` (a filter error must never cost the whole chapter; falls back to the raw list) and `finalize()` now cancels the hard timer — without it a normal finalize was followed 240 s later by the timer, which re-ran `finalize()` and overwrote the reported phase.
- **JapScan — the drain stopped while the site was still building its URLs**: the waiting conditions (lazy-loader drain and scroll loop) only measured the DOM, which plateaus around ~110 images on a volume while the reader keeps assigning the announced pages' URLs. On a Cloudflare-throttled chapter the drain exited on `stall` at 24.1 s, **at the very moment the site completed its construction** (last assignment 33.4 s after the window opened, `fetch: 404 = 2` on the site's side) → `finalize()` cut the extraction mid-work. Both loops now use `progressSize()`, which returns `max(contentSize(), probeSize())` while the probe is still below the announced total: construction growth blocks the stall, and as soon as the probe covers the total it stops driving the wait — the normal path therefore keeps its previous timing exactly (on the successful attempts the probe is already complete before the drain). New `probe@drain` probe (construction size when the drain gave up) in the `[JapScan] … budget:` log line.
- **JapScan — a partial probe was rejected in favour of the DOM alone**: `adoptProbe` required the probe to **cover the announced total**, so an interrupted construction (167 URLs out of 204, see the fix above) was discarded entirely and the result fell back to the 106 DOM links — half the chapter, even though the other 61 URLs existed. The rule is now an exported pure function `ProbeAdoption(probeLen, domLen, total, anchor, overlap)` with a third way in: a **partial** probe is accepted when it still dominates the DOM (+5 links), covers at least 70% of the announced total and overlaps the DOM by 90% — beyond those thresholds the extra URLs are page content, not unrelated traffic. The result stays incomplete (the DRM fallback window is therefore still attempted), but the host now reports the long list instead of the short one. The diagnostics mark `adopt: "partial"` to tell this case apart from a full adoption, and `budget.probeAtDrain` shows whether the shortfall came from the site or from our own stop.

### Changed

- **Task logging**: `DownloadTask` never wrote its errors to the renderer log, so a failed task was indistinguishable from a slow one when reading the output — which made it impossible to tell a resolution timeout, a page timeout and a cancellation apart. A `[DownloadTask] <title>: N error(s) -> …` line is now emitted in the `finally`, and `PollForChallengeResolution` logs **on every round** `[KUMO] poll#N cf=… widget=… site=… clr=… cleared=…` to show which of its two conditions is holding. No behaviour change.
- **Readable cancellation message**: `DeferredTask` rejected with `new DOMException(null, 'AbortError')` — WebIDL converts `null` to the literal string `"null"`, so every cancelled page reported `null` as its error message without ever hinting at a cancellation. The message is now `Aborted` (already used by CrunchyScan).
- The `cf_clearance` baseline decision was extracted into exported pure functions (`NormalizeClearance`, `NextClearanceState`), the JapScan detection script into an exported constant (`JAPSCAN_CHALLENGE_DETECTION_SCRIPT`), the chrome filter into an exported pure function (`FilterSiteChrome`), the probe acceptance rule into an exported pure function (`ProbeAdoption`) and the stall guard decision into an exported pure function (`StallTimeoutFor`) so unit tests can cover them; the reader injection script is now exported as `BuildReaderScript` — its body lives in a template literal that `tsc` does **not** type-check, so one stray backtick in a comment closes it early and the break only shows up at injection time, invisible to `tsc` and to every other test. +4 guard tests (the rendered script must parse as JavaScript; the stop conditions must no longer read `seen.size`; the wait must follow the site's own construction; the script must go through the adoption rule that is itself under test) +4 tests for the resolution bound and the cancellation message; +35 tests (2199 total).

## [3.0.6] - 2026-09-27

### Fixed

- **CrunchyScan — Cloudflare loop gone (flashing window)**: the challenge reload compared `cf_clearance` against an empty baseline, so the previously **persisted** cookie triggered a `window.location.reload()` about 5 s after the window opened → the Turnstile restarted from scratch (flash) and any validation the user was in the middle of completing was cancelled → timeout. The baseline is now re-read on every `DOMReady` (CDP read guarded by a 5 s timeout) and the reload only happens when a **fresh** clearance was issued by the current document — the real "solved but never redirected" stall. Budget unchanged (1 navigation for CrunchyScan, 3 for the other opt-in sites).
- **CrunchyScan — no more series of timeouts**: every chapter opened its own DRM window (150 s each) while the session was not warmed up → one Cloudflare popup per downloaded chapter. After a failure, a **window-less probe** (403/503 status, `CF-Mitigated` header, interstitial title) now precedes any new window: still challenged → immediate failure with the localized Cloudflare message; session warmed up (plugin URL link or `cf_clearance` import) → the gate reopens by itself. An `Initialize()` failure is no longer cached for the whole session, which used to keep the connector broken until restart.

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