# Cloudflare bypass — status & how-to

> Status documented on 19 August 2026 — versions **0.1.5 → 2.0.6**.

This document explains how **ChainsmokerNeko** handles Cloudflare challenges
(the "Just a moment…" page that blocks some sites), and in particular how to
reuse the `cf_clearance` cookie your real browser has already obtained.

**Download the app**: the current stable release (**2.0.6**) ships **10 bundles
for 3 OS** — Windows portable zips + NSIS installers (ia32/x64/arm64), macOS
dmg (Intel/Apple Silicon), Linux AppImage and snap (x64) — all listed in the
README and on the fork's
[Releases page](https://github.com/Endymi0n74/ChainsmokerNeko/releases); the
`nightly` build is the latest `master`, `Latest` is the newest stable version.

---

## 1. The problem

Some sites (CrunchyScan, occasionally MangaFire/Comix) serve a **"managed"**
Cloudflare challenge: a "Just a moment…" page with no interactive widget.
This challenge resolves itself **only** for high-trust sessions (a real browser
that has already passed the challenge and accumulated history). A fresh
Electron session starts from scratch and can loop forever.

The `cf_clearance` cookie is the key: as soon as Cloudflare issues it, the site
loads. The app therefore has **two layers**:

1. built-in automatic mechanisms (user-agent, shared session, opt-in reload);
2. a helper to **reuse the cookie from your real browser**.

---

## 2. Built-in automatic mechanisms

| Mechanism | Role |
|-----------|------|
| **Standard user-agent preserved** | The app keeps the `Electron/x.y.z` segment instead of stripping it (stripping triggered the challenge on MangaFire). |
| **Shared session** | Remote windows share the app session; cookies (including `cf_clearance`) are injected into fetch requests, and the `partitioned` flag is removed from `Set-Cookie`. |
| **Auto-resolution of managed challenges** | The challenge resolves itself in the background without a window flash (the window is hidden only for widget-less sites). |
| **Opt-in per-site reload** | Only sites that opt in (CrunchyScan) reload the page while the challenge is stuck — budget capped at **3 navigations**, cookie read via the CDP debugger (`Network.getCookies`) because `cf_clearance` is **httpOnly**. |

These mechanisms are enough for MangaFire and Comix (validated live). For
CrunchyScan, the widget-less "managed" challenge may not resolve from an
untrusted IP/session — that is where the helper below comes in.

---

## 3. Helper "Import cf_clearance from the browser"

Location: **Settings → General → Cloudflare bypass**.

It reuses the `cf_clearance` cookie that your real browser (Edge/Chrome) has
already obtained for `crunchyscan.org`, and injects it into the app session.

### 3.1 Two import paths

| Path | How it works | Reliability |
|------|--------------|-------------|
| **Automatic import** (button) | Reads the cookie from the browser's encrypted SQLite store, recovers the platform-specific AES key (DPAPI on Windows, Keychain + PBKDF2 on macOS, passphrase/keyring on Linux) and decrypts it. | **Windows / macOS / Linux**, browsers Edge, Chrome and Chromium. Browser must be **closed**. On Windows, an Edge using **App-Bound Encryption (v20)** cannot be read automatically. |
| **Manual paste** (field + Inject button) | Copy the `cf_clearance` value from DevTools (`F12` → Application → Cookies → crunchyscan.org → cf_clearance) and paste it. | **Universal** — works in all cases, browser open or not. |
| **Test now** (button) | Fetches the site's home page through the shared session and reports whether the real page loaded or the site is still challenged. | Verifies in one click that the injected cookie actually works. |

### 3.2 Automatic import pipeline (v10)

1. Locates the browser profiles per platform:
   - Windows: `%LOCALAPPDATA%\Microsoft\Edge\User Data`, `%LOCALAPPDATA%\Google\Chrome\User Data`;
   - macOS: `~/Library/Application Support/Microsoft Edge`, `~/Library/Application Support/Google/Chrome`;
   - Linux: `~/.config/microsoft-edge`, `~/.config/google-chrome`, `~/.config/chromium`.
2. Recovers the platform-specific AES key:
   - Windows: **DPAPI** key (`os_crypt.encrypted_key` blob from `Local State`,
     unwrapped via `CryptUnprotectData` — PowerShell, built into Windows; Electron
     `safeStorage` is unusable here as it produces its own incompatible v10 format);
   - macOS: **Keychain** password ("Chrome Safe Storage") read via `security`, then
     **PBKDF2-HMAC-SHA1** derivation (1003 rounds, salt `saltysalt`);
   - Linux: **PBKDF2** derivation (1 round, salt `saltysalt`) from the `peanuts`
     passphrase (v10) or the Secret Service keyring (v11, via `secret-tool`).
3. Copies the `Default/Network/Cookies` database (locked while the browser runs)
   to a temporary file, then reads `cf_clearance` via SQLite (`node:sqlite`,
   read-only).
4. Decrypts the cookie: **v10 AES-256-GCM** on Windows (`v10` + 12-byte nonce +
   ciphertext + 16-byte tag), **v10/v11 AES-128-CBC** on macOS/Linux (IV = 16
   fixed spaces), then **strips the 32-byte integrity prefix** that Chromium
   (DB ≥ 24) adds to values before encryption.
5. Injects the cookie into the shared session: `httpOnly`, `secure`,
   `sameSite=no_restriction`, ~30-day lifetime.

### 3.3 The "v20" case (App-Bound Encryption)

Recent Edge/Chrome versions can encrypt cookies with **v20**
(*App-Bound Encryption*): the key is derived by the browser's elevation service,
bound to the app identity, and **not decryptable from the outside**. The helper
detects this format (`v20` prefix) and returns a clear message instead of
failing silently:

> *"App-Bound Encryption (v20) is enabled — paste the cf_clearance value manually instead."*

In that case, **manual paste remains the reliable path**.

### 3.4 Multi-browser fallthrough

The import **tries every browser** before giving up: if Edge fails (locked or
v20), Chrome is tried next, and vice versa. The success message states the
source ("Imported … from Chrome"); failures are aggregated into a summary.

---

## 4. Scenario matrix

| Browser | Encryption | Browser open? | Auto-import result |
|---------|------------|---------------|--------------------|
| Chrome / Chromium (Windows) | v10 | Closed | ✅ decrypt + inject |
| Chrome / Chromium (Windows) | v10 | Open | ⚠️ "store locked" → close Chrome or paste manually |
| Edge (old / ABE disabled) | v10 | Closed | ✅ decrypt + inject |
| Edge (recent, ABE enabled) | v20 | Closed | ⚠️ v20 message → paste manually |
| Edge (recent, ABE enabled) | v20 | Open | ⚠️ v20 message → paste manually |
| Chrome / Edge (macOS) | v10 (Keychain + PBKDF2) | Closed | ✅ decrypt + inject (allow Keychain access on first run) |
| Chrome / Edge / Chromium (Linux) | v10 `peanuts` | Closed | ✅ decrypt + inject |
| Chrome / Edge (Linux, keyring) | v11 | Closed | ✅ if `secret-tool` is installed |
| No browser detected | — | — | ⚠️ "No Chromium browser profile found" → paste manually |

---

## 5. Known limitations

- **A real `cf_clearance` is required**: the helper moves a cookie you already
  obtained; it does not fabricate one. If your browser hasn't passed the
  challenge yet (e.g. the IP is flagged by Cloudflare), there is nothing to
  import.
- **`cf_clearance` can be issued without the challenge being solved** (false
  positive): its presence does not guarantee unblocking — only a real listing
  test confirms it (use the **Test now** button).
- **macOS auto-read**: the first run may trigger the Keychain authorization
  prompt ("security" wants to read "Chrome Safe Storage") — allow it once.
- **Linux auto-read**: the v10 path (`peanuts`) needs nothing; the keyring (v11)
  requires `secret-tool` (package `libsecret-tools`).
- **Windows + Edge v20**: App-Bound Encryption — see §3.3, manual paste required.
- **Auto-read = browser closed**: the cookie store is locked (`EBUSY`) while the
  browser runs.

---

## 6. Version history

| Version | Change |
|---------|--------|
| **0.1.5** | Fixed the CrunchyScan Cloudflare loop (visible window, httpOnly read via CDP, bounded reload budget). |
| **0.1.6** | Added the import helper (`ImportFromBrowser` + manual paste) and the "Cloudflare bypass" section. |
| **0.1.7** | Fixed the `expires_utc` crash (`RangeError` as soon as Edge/Chrome was closed). |
| **0.1.8** | Multi-browser fallthrough (Chrome tried when Edge fails) + v10/ABE documentation. |
| **0.1.9** | Fixed the 32-byte integrity prefix (Chromium 130+): the injected value is clean. |
| **0.1.11** | `cf_clearance` **persisted on disk**: once warmed up, the cookie survives restarts (re-injected with a 1-month expiry). |
| **0.1.12** | **Clear Cloudflare cache** button in Settings → General → Cloudflare bypass (wipes the snapshot + session cookies). |

---

## 7. How to unblock CrunchyScan

### Method A — warm up the session from the app (simplest, validated)

This is the **native flow**: the site's `Initialize()` opens a real visible
browser window, Cloudflare resolves there, and the `cf_clearance` cookie lands
in the app's shared session. Enough when your IP already has trust with
Cloudflare (validated live on 17 August 2026).

**Step by step:**

1. **Open the website selector** — click **Plugins** in the sidebar, then the
   **CrunchyScan** plugin.
2. **Click the site's URL** — next to the CrunchyScan name, click the
   **URL** link (or the **Open** button). A real browser window opens on
   `crunchyscan.org`.
3. **Let Cloudflare resolve** — wait in that window until the site actually
   loads (a few seconds; solve the checkbox/check manually if one is shown).
   The page title changing to the real CrunchyScan is the sign it worked.
4. **Close the window** — the `cf_clearance` cookie is now in the app's
   **shared session**. It is also **saved to disk** automatically
   (`cloudflare-clearance.json` in the app's user data folder), so you only
   need to do this once per network/IP, not per launch.
5. **Refresh the listing** — go back to CrunchyScan → **Update**: the manga
   list loads, and chapters/pages/downloads work.
6. *(Optional, to confirm)* — **Settings → General → Cloudflare bypass →**
   **Test now**: it should report **Unblocked**.
7. *(If it ever stops working)* — a stale cookie can make the site re-challenge.
   Click **Clear Cloudflare cache** in the same settings section, then redo
   steps 1–5.

> The warm-up survives restarts: the persisted cookie is re-injected at boot
> with a fresh 1-month expiry. If Cloudflare has revoked it server-side, the
> challenge flow simply restarts — redo the warm-up (or use Method B).

### Method B — reuse a `cf_clearance` from your real browser (fallback)

Use this when Method A keeps looping (e.g. the IP is flagged):

1. In your real browser, open `crunchyscan.org` and pass the challenge (the page
   loads normally).
2. Open DevTools (`F12`) → **Application** → **Cookies** → `crunchyscan.org` →
   copy the **`cf_clearance`** value.
3. In the app: **Settings → General → Cloudflare bypass** → paste the value →
   **Inject**.
4. Click **Test now** and confirm it reports "Unblocked".
5. Go back to CrunchyScan → **Update**: the listing loads.

> If your browser is **Chrome** (or Edge with ABE disabled) **closed**, the
> **Import cf_clearance from browser** button does the same without copying.


Developed with vibe coding, assisted by **Codebuff (Buffy)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.