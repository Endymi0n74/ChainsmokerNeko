# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 27 août 2026 (v3.0.0 — zip fix, release 10 artefacts, CI 3 plateformes vert).

---

## 1. Le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. **Web app** (TypeScript, Svelte + quelques composants Vue)
dans un shell **Electron** (Chromium 150, Node 26 local / 24 CI).

- **Repo** : [Endymi0n74/ChainsmokerNeko](https://github.com/Endymi0n74/ChainsmokerNeko)
- **Upstream** : `manga-download/haruneko`
- **Version** : 3.0.0 (26 août 2026)
- **Release** : [GitHub Releases](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.0) — Windows x64/x86/ARM (zip + NSIS) + Linux AppImage/deb + macOS DMG x64/arm64

## 2. Chemins & remotes

- **Racine locale** : `D:\Codex\haruneko`
  - ⚠️ CWD outils = `D:\Codex` → tous les chemins prefixés `haruneko/`, commandes `cd haruneko`
- **Remotes** : `origin` = upstream, `fork` = Endymi0n74/ChainsmokerNeko
- `.tmp/` = gitignoré (sondes, builds de test, electron cache)

## 3. Architecture

```
web/src/engine/websites/*.ts     → connecteurs/scrapers (1 fichier/site)
web/src/engine/websites/_index.ts → registre PluginController
web/src/engine/platform/          → FetchWindowScript, ChallengeReload, AntiScrapingDetection
web/src/engine/providers/         → MangaPlugin, Chapter, BookmarkPlugin, etc.
app/electron/src/Main.ts          → main Electron (UA fix, serveur local port 64210)
app/electron/src/ipc/             → FetchProvider (cookies, sentinel, session), RemoteBrowserWindow
app/electron/scripts/             → deploy-app.mjs, bundle-{x64,ia32,arm64,mjs}, NSIS/AppImage/DMG
.github/workflows/push-ci.yml    → CI complète 5 jobs en cascade
```

### Scraping — points clés

- Connecteurs héritent de `DecoratableMangaScraper` avec décorateurs `@Common.*`
- `FetchWindowScript` / `FetchWindowPreloadScript` : ouvrent une BrowserWindow réelle (sandbox, CDP debugger) pour exécuter un script dans une page rendue.
- `AntiScrapingDetection.js` (obfusqué) : `CheckAntiScrapingDetection()` → **Interactive > Automatic > None**. Priorité détections spécifiques site AVANT l'heuristique DOM widget.
- `ChallengeReload.ts` : reload auto des challenges managés (sans widget rendu, `cf_clearance` >200 chars).
- **UA par défaut** Electron (segment `Electron/x.y.z` conservé) — fix MangaFire le 15 août.

### Connecteurs câblés

| Site | Fichier | Statut | Notes |
|------|---------|--------|-------|
| Comix | `Comix.ts` | ✅ validé | Réécrit sans DRM; images via `@Common.ImageAjax()` |
| MangaFire | `MangaFire.ts` | ✅ validé | API `vrf` + signature, UA fix |
| MangaDrama | `MangaDrama.ts` | ✅ validé | Paywall débloqué |
| CrunchyScan | `CrunchyScan.ts` | ✅ validé | DRM + cache par URL chapitre (fix fenêtres multiples) |
| MangaNova | `MangaNova.ts` | ✅ validé | Next.js RSC extraction, 93 pages fixture |
| JapScan | `JapScan.ts` | ✅ validé | Puzzle + Referer chapitre, CreateImageLinks DRM |
| ScanManga | `ScanManga.ts` | ✅ validé | Sentinel cookies + API bqj |
| PornComix | `PornComix.ts` | ✅ validé | e2e complet |
| MangaMoins | `MangaMoins.ts` | ✅ validé | @Common.ImageAjax |
| + 17 upstream | divers | non câblés | Domaines morts/bloqués (cf. §17 historique) |

## 4. Connecteurs — détails techniques

### Comix (réécrit sans DRM)
- Liste (91k mangas) + chapitres + pages via `FetchWindowScript` sur l'axios du site (réponses chiffrées `{"e":...}`)
- Images: `@Common.ImageAjax()` + header `Referer`
- **Fix "aucune image"** (`0f44b305`): échec détection anti-scraping → `FetchRedirection.None` (on scrape quand même)
- Anciens fichiers `Comix.DRM.*` supprimés

### MangaFire
- API `vrf` avec cipher STAGE_DATA; `GetHID(identifier)` = préfixe avant 1er tiret slug
- **Fix captcha** (`e85a1d6a`): UA default conservé (segment `Electron` non strippé)

### CrunchyScan
- Détection `Interactive` (`AddAntiScrapingDetection` sur `crunchyscan.org`)
- **Fix fenêtres multiples** (`ac6064a0`): cache DRM `drmCache` par URL chapitre
- FetchImage retry 3× backoff 1s/2s, timeout 30s
- **Validation**: listing + chapitres + pages ✅ (25 août)

### ScanManga
- **Sentinel cookies**: `Cookie: __hkn_no_session_cookies__` (consommé dans `FetchProvider.ts` → `NoSessionCookiesSentinel`)
- **API bqj**: POST `https://bqj.scan-manga.com/lel/<idc>.json`, fingerprint WebGL, réponse encodée `base64→gzip→reverse→base64`
- **Fix injection cookies**: `details.webContentsId === this.webContents.id` (renderer uniquement)
- **Tests**: 5/5 vert (plugin, manga, chapitre, page, image blob)

### MangaNova
- Catalogue `/catalogue`, fiches `/manga/<slug>`, chapitres `/lecture-en-ligne/<slug>/chapitre/<n>`
- Images du lecteur extraits via payload RSC `images` du chapitre courant
- Fixture validée **93 pages** (Mechanical Buddy Universe, chapitre 1)

## 5. Cloudflare — Architecture

### Fix UA (15 août)
- `Main.ts`: conserve le segment `Electron/43.3.0` standard (non strippé)
- UA stripped → challenge Turnstile managé sans widget → boucle infinie

### Shared session
- `RemoteBrowserWindow`: `session.defaultSession` + cookies partitionnés
- `FetchProvider`: injection cookies uniquement pour `webContents.id` renderer
- Sentinel `NoSessionCookiesSentinel` : requête sans cookie (ScanManga)

### Classification (`FetchProviderCommon.ts`)
- **Détections spécifiques** (CheckAntiScrapingDetection) évaluées EN PREMIER (autoritatives)
- Widget DOM réel uniquement en repli si `FetchRedirection.None`
- `Interactive` → `win.Show()` + poll 2s jusqu'à résolution
- `Automatic` → reload auto (pas de popup)
- Cache `cf_clearance` >200 chars requis

### ChallengeReload (`ChallengeReload.ts`)
- Poller 5s, max 3 reloads, budget partagé globalement
- Arrêt pollers au `destroy()`

## 6. Frontend — Fixes

### VirtualList Bookmarks (`MediaSelect.svelte`)
- Virtual scroll désactivé pour plugin Bookmarks (`VThreshold * 2` bypass)
- CSS `.no-scroll { overflow-y: visible; }` quand Bookmarks sélectionné
- Validé : 103+ bookmarks tous visibles sans scroll forcé ✅

## 7. CI/CD (`push-ci.yml`)

Pipeline **5 jobs en cascade** à chaque push non-docs sur `master`:

| Job | Runner | Contenu |
|-----|--------|---------|
| ci | ubuntu | typecheck web/electron/nw + eslint + svelte-check + vue-tsc + build web/electron |
| bundles-windows | ubuntu | zip x64 + NSIS (3 arches) via deploy-app.mjs |
| bundles-linux | ubuntu | AppImage + .deb x64 (snap skip si absent) |
| bundles-macos | macos-13 | DMG x64 + arm64 (iconutil + hdiutil) |
| release | ubuntu | publie "ChainsmokerNeko <version>" avec tous les artefacts |

- **Cache**: `${{ runner.temp }}/electron-zips` (clé par OS + `package.json` hash)
- **Artefacts** : 3 zip Windows (x64/ia32/arm64), 3 NSIS (x64/ia32/arm64), AppImage, .deb, 2 DMG (x64/arm64) — 10 fichiers
- **Release** : "ChainsmokerNeko <version>" (release nommée, pas nightly), `--latest=false`, `--generate-notes`
- ⚠️ Pas d'unicode dans commentaires YAML GitHub
- ⚠️ Pas `${{ runner.* }}` dans bloc `env:` de job

### Local build
```bash
# Web
cd haruneko/web && node ../node_modules/vite/bin/vite.js build
# App
cd haruneko/app/electron && node ./scripts/build-app.mjs
# Vite main+preload
cd haruneko/app/electron && ../../node_modules/.bin/vite build
# Bundle x64
cd haruneko/app/electron && node scripts/bundle-x64.mjs
# Full deploy (3 arches)
cd haruneko/app/electron && node scripts/deploy-app.mjs
```

⚠️ `build/node_modules` doit exister AVANT build-app.mjs (npm 11.19 bloque git deps).
⚠️ `makePortable()` supprimé — zips ne contiennent plus de `userdata/`.

## 8. Tests

```bash
cd haruneko/web && node ../node_modules/typescript/bin/tsc --noEmit           # web
cd haruneko && node node_modules/typescript/bin/tsc --noEmit -p app/electron/tsconfig.json  # electron
cd haruneko/web && node ../node_modules/eslint/bin/eslint.js src --ext .ts,.svelte,.vue      # lint
cd haruneko/web && node ../node_modules/svelte-check/bin/svelte-check
cd haruneko/web && node ../node_modules/vue-tsc/bin/vue-tsc --noEmit
```

### E2E (test/Puppeteer*)
- `CloudflareList_e2e.ts`: listing mangafire ✅, comix ✅, mangadrama ✅, crunchyscan (skip si IP Cloudflare)
- `MangaNova_e2e.ts`: catalogue, fiche, chapitres, 93 pages, image
- `ScanManga_e2e.ts`: 5/5 vert (plugin, manga, chapitre 1-2s, page, blob 658k)
- **Convention anti-régression**: chaque changement vérifie les e2e existants AVANT déclaration terminé
- **CDP timeout 300s** (`PuppeteerFixture.ts`) pour listings longs (mangafire 70k+)

## 9. Conventions

- **Pas de `git add -A`** ; committer uniquement les fichiers liés
- **Commit format**: description concise + `🤖 Generated with Codebuff` / `Co-Authored-By: Codebuff <noreply@codebuff.com>`
- **Pas de push** sans demande explicite
- **Aucune suppression** sans approbation utilisateur (fichiers, branches, releases, tags)
- **Aucune régression** : tester l'existant AVANT de déclarer terminé
- **Versioning**: bumper dans les 3 `package.json` + CHANGELOG pour tout fix fonctionnel
- **Release**: "ChainsmokerNeko <version>" (sans v), FR+EN, zip 3 plateformes, 10 artefacts
- **Pas de userdata** dans les bundles distribués
- **MEMORY.md**: rafraîchir ≥ 2x/heure en session active

## 10. Outils & environnement

- Electron 43.3.0 (Chromium 150), Node 26 local, CI Node 24
- `.npmrc`: `engine-strict=true`, `package-lock.json` committé (`npm ci` en CI)
- `app/electron/.tmp/` : builds de test, sondes, cache electron-zips (D:)
- `app/electron/bundle/` : zips/dmg/appimage de distribution
- ⚠️ Windows quirks: `//` au lieu de `/` pour paths Git Bash, `taskkill //F //IM` pour tuer l'app
- Sonde = `electron.exe app/electron/.tmp/xxx.cjs`, PID identifiable via `tasklist | grep electron`

## 11. Leçons techniques
### CI/CD
- `path.join()` vs `path.resolve()` dans les scripts de bundle : quand 7z reçoit un `cwd` alternatif, `path.join()` crée un chemin relatif à ce cwd au lieu du répertoire cible. `path.resolve()` résout depuis le process cwd, ce qui est correct.
- `merge-multiple: true` requis sur `download-artifact` pour fusionner les artefacts dans un seul dossier (sinon sous-dossiers par artifact → glob `release-bundles/*` ne les trouve pas).
- `checkout` doit être AVANT les `download-artifact` (sinon le checkout écrase les artefacts téléchargés).
- Les espaces dans les noms de fichiers cassent le glob bash `bundle/*` → utiliser `find` + `mapfile` pour lister explicitement.
- Le snap build nécessite `snapcraft` (absent du runner Ubuntu) → skip avec `command -v snapcraft || exit 0`.

### Agent/tool
1. Bascules de modèle Freebuff → relire MEMORY.md en début de session
2. `str_replace`/`write_file` peuvent échouer sur fichiers modifiés → re-lire
3. Builds/powershell lents → `timeout_seconds` élevé, `BACKGROUND` pour polling
4. `suggest_prompts` nécessite un array JSON, pas une string
5. Interruptions réseau = fichiers survivent, reprendre via git status

### Cloudflare
- UA stripped → challenge infini (MangaFire). UA Electron native → pas de challenge.
- `cf_clearance` est `httpOnly` → lire via `Network.getCookies` (CDP), pas `document.cookie`.
- `document.hidden = true` pause le challenge (jamais `win.Hide()`).
- Délai 2.5s avant extraction: challenge finalize en 1-2s, 1s trop court.
- Widget réel (iframe) ≠ input caché `cf-turnstile-response` (toujours présent).

### CrunchyScan
- Challenge Turnstile vit dans un sous-frame (jamais visible dans DOM parent)
- Détections spécifiques > heuristique DOM
- Cache DRM par URL chapitre = 1 seule fenêtre popup max
- IP peut être marquée par Cloudflare → validation humaine requise

### ScanManga
- Cookie `sessionT` déclenche page réduite → sentinel `__hkn_no_session_cookies__`
- API bqj: fingerprint WebGL + effectiveType, payload encodé base64→gzip→reverse→base64
- Injection cookies uniquement pour le renderer (pas les fenêtres distantes)
