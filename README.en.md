# ChainsmokerNeko 🚬🐱

> Personal fork of **HaruNeko** — manga, anime & novel downloader (desktop app).

[![Push (CI)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml/badge.svg)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml)
![Release](https://img.shields.io/github/v/release/Endymi0n74/ChainsmokerNeko?display_name=tag)
![Downloads (latest release)](https://img.shields.io/github/downloads/Endymi0n74/ChainsmokerNeko/latest/total?label=downloads)
![License](https://img.shields.io/badge/license-Unlicense-blue)

**🌐 Language / Langue :** [**English**](README.en.md) · [Français](README.md)

---

## About

ChainsmokerNeko is a personal fork of **HaruNeko** (the successor of HakuNeko):
a desktop app for scraping and downloading manga, anime and novels.

- **Core**: web app (TypeScript, Svelte + a few Vue components)
- **Desktop shell**: Electron (the NW.js shell remains available but secondary)
- **Upstream**: [manga-download/haruneko](https://github.com/manga-download/haruneko)

This fork does not aim for maximal upstream coverage: it focuses on a small set
of websites **reworked in depth** (DRM-free connectors, Cloudflare bypass,
paywall bypass), made reliable and covered by regression tests.

## Download

The current stable release is **2.0.6** — 10 bundles, 3 OS (direct links):

| Platform | File |
|---|---|
| Windows x64 (portable) | [hakuneko-electron-v2.0.6-win32-x64.zip](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-x64.zip) |
| Windows x64 (installer) | [hakuneko-electron-v2.0.6-win32-x64-setup.exe](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-x64-setup.exe) |
| Windows ia32 (portable) | [hakuneko-electron-v2.0.6-win32-ia32.zip](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-ia32.zip) |
| Windows ia32 (installer) | [hakuneko-electron-v2.0.6-win32-ia32-setup.exe](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-ia32-setup.exe) |
| Windows ARM (portable) | [hakuneko-electron-v2.0.6-win32-arm64.zip](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-arm64.zip) |
| Windows ARM (installer) | [hakuneko-electron-v2.0.6-win32-arm64-setup.exe](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-win32-arm64-setup.exe) |
| macOS Intel | [hakuneko-electron-v2.0.6-darwin-x64.dmg](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-darwin-x64.dmg) |
| macOS Apple Silicon | [hakuneko-electron-v2.0.6-darwin-arm64.dmg](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-darwin-arm64.dmg) |
| Linux (AppImage) | [hakuneko-electron-v2.0.6-linux-x64.AppImage](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-linux-x64.AppImage) |
| Linux (snap) | [hakuneko-electron-v2.0.6-linux-x64.snap](https://github.com/Endymi0n74/ChainsmokerNeko/releases/download/2.0.6/hakuneko-electron-v2.0.6-linux-x64.snap) |

All releases are published on the fork's **Releases page**:

👉 **https://github.com/Endymi0n74/ChainsmokerNeko/releases**

The latest stable version is marked `Latest`; the `nightly` release contains the
build of the latest push to `master`. Older versions (0.1.0 → 0.1.11) remain
downloadable from the archived [ChainsmokerNeko-legacy](https://github.com/Endymi0n74/ChainsmokerNeko-legacy) repo.

## Features

- 📚 Browse, search and bookmark tens of thousands of manga
- ⬇️ Download chapters and images (pages) in one click
- 🖼️ Built-in image viewer (app version shown in the sidebar and window title)
- 🛡️ **Cloudflare challenge** handling: standard user-agent preserved, shared
  session, `cf_clearance` cookie persisted across restarts, import from your real
  browser, "Test now" and "Clear Cloudflare cache" buttons
- 🔌 Connector architecture: one file per website, registered in `_index.ts`

## Reworked websites

| Website | Notes |
|---------|-------|
| **MangaFire** | ~71,000 manga; `vrf` API signature; reliable listing, chapters and pages |
| **Comix (comix.to)** | ~91,000 manga; connector rewritten **DRM-free** |
| **MangaDrama** | Coin paywall bypassed; English chapters; account login (purchased chapters unlock) |
| **CrunchyScan** | "Managed" Cloudflare challenge: resolution window, `cf_clearance` import, download retry |
| **JapScan** | Reliable listing/chapters/pages; "drag" puzzle solved in a visible window; download fixed (chapter Referer, `.jpg` images) |

Most of the upstream connectors remain available in
`web/src/engine/websites/_index.ts`, but **with no guarantee** —only the 5 websites above are reworked and tested by this fork.

## Cloudflare bypass (cf_clearance)

When a website loops on a "managed" Cloudflare challenge ("Just a moment…"), the
`cf_clearance` cookie your real browser already obtained can be reused:
**Settings → General → Cloudflare bypass**.

- **Open the website from the app**: in the website selector, pick the website
  then click its **URL** — a window opens where the challenge resolves, and the
  cookie is kept in the shared session. This is the simplest way to unblock
  CrunchyScan.
- **Import cf_clearance from browser**: reads the cookie from Edge, Chrome or
  Chromium and injects it into the app session (Windows/macOS/Linux — DPAPI,
  Keychain or passphrase, no external dependency). Close the browser first: its
  cookie store is locked while it runs. ⚠️ On Windows, recent Edge versions
  encrypt cookies with "v20" (App-Bound Encryption), which cannot be read
  automatically → paste the value manually.
- **Paste manually**: the reliable path in all cases. DevTools (`F12`) on the
  website → Application → Cookies → copy the `cf_clearance` value → paste it
  into the field and click **Inject**.
- **Test now**: verifies in one click whether the injected `cf_clearance`
  actually unblocks the website.
- **Clear Cloudflare cache**: wipes the `cloudflare-clearance.json` snapshot and
  the `cf_clearance` cookies from the session (use it when the cookie is stale).

The cookie is **persisted to disk**: once warmed up, it survives app restarts
(re-injected with a 1-month expiry). If it becomes stale server-side, the normal
challenge flow simply kicks in again.

Full status, scenario matrix and version history: see
[`CLOUDFLARE.md`](CLOUDFLARE.md).

## Quick start

Requirements: **Node.js ≥ 24**, **npm ≥ 11.3**.

```bash
# 1. Install dependencies (deterministic: package-lock.json is committed)
npm ci

# 2. Build (web first, then electron — order matters, electron copies web/build)
npm run build --workspace=web
npm run build --workspace=app/electron

# 3. Run the app (built-in local HTTP server on 127.0.0.1:<port>)
./node_modules/electron/dist/electron.exe ./app/electron/build
```

## Development

### Quality checks

```bash
npm run check --workspace=web           # typecheck + eslint + svelte-check + vue-tsc + rules
npm run check --workspace=app/electron  # typecheck + lint (Electron)
npm run check --workspace=app/nw        # typecheck + lint (NW.js)
```

### Tests

```bash
npm run test            # unit tests (vitest)
npm run test:websites   # website connector tests (listing, chapters, pages, images)
npm run test:e2e        # web app tests (real Electron app)
```

The regression test [`CloudflareList_e2e.ts`](web/src/engine/websites/CloudflareList_e2e.ts)
verifies that the Cloudflare websites (mangafire, comix, mangadrama) list their
manga in the real app flow — any listing regression breaks the CI.

### Continuous integration

[`.github/workflows/push-ci.yml`](.github/workflows/push-ci.yml): on every push —
three chained jobs (purely documentary commits `*.md` / `docs/**` are ignored):
1. **Typecheck & Build** (`ubuntu-latest`): typecheck (web/electron/nw) + eslint +
   svelte-check + vue-tsc + web/electron build (npm cache + Electron binary);
2. **Windows bundles** (after CI): reuses the build via artifact, produces
   **Windows** (ia32/x64/arm64: portable zips + NSIS installers);
3. **Release** (`master` only): publishes the bundles to the rolling **`nightly`**
   release (`latest` stays reserved for tagged versions).

Other workflows: [`pull-request-ci.yml`](.github/workflows/pull-request-ci.yml) (checks
+ e2e/websites tests on PRs), [`create-release.yml`](.github/workflows/create-release.yml)
(manual multi-OS release — macOS dmg + Linux AppImage/snap included), [`pull-request-deploy.yml`](.github/workflows/pull-request-deploy.yml)
(Cloudflare previews, "Deploy PR" label) and [`website-metrics.yml`](.github/workflows/website-metrics.yml)
(periodic website metrics).

## Project structure

```text
web/src/engine/websites/   → website connectors/scrapers (1 file per website)
web/src/engine/platform/   → fetch infrastructure + remote browser window
web/src/engine/providers/  → MangaPlugin, Chapter, Page, …
app/electron/src/          → Electron main (local server, IPC, user-agent)
app/nw/                    → NW.js shell (secondary)
docs/                      → documentation (VitePress)
```

## Versions

Stable versions are tagged (`2.0.x`) and published on the
[Releases](https://github.com/Endymi0n74/ChainsmokerNeko/releases) page with the
three-OS bundles. Older versions (0.1.0 → 0.1.11) remain downloadable from
[ChainsmokerNeko-legacy](https://github.com/Endymi0n74/ChainsmokerNeko-legacy)
(archived, kept as the historical release archive).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Unlicense](UNLICENSE) — public domain.

## Credits

Derived from [HaruNeko](https://github.com/manga-download/haruneko) / [HakuNeko](https://github.com/manga-download/hakuneko).
