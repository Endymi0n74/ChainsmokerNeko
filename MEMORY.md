# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 4 septembre 2026 (v3.0.3 — probe harvest volumes complets + fix page N+1 + bump 3.0.3)

---

## 1. Le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. **Web app** (TypeScript, Svelte + quelques composants Vue)
dans un shell **Electron** (Chromium 150, Node 26 local / 24 CI).

- **Repo** : [Endymi0n74/ChainsmokerNeko](https://github.com/Endymi0n74/ChainsmokerNeko)
- **Upstream** : `manga-download/haruneko`
- **Version** : 3.0.3 (4 septembre 2026) — bumpé dans les 3 `package.json` (check:versions CI) + CHANGELOG ; release/tag 3.0.3 publié par la CI au prochain push master
- **Release 3.0.1** : [GitHub Releases](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.1) — Windows x64/x86/ARM (zip + NSIS) + Linux AppImage/deb + macOS DMG x64/arm64

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
| JapScan | `JapScan.ts` | ✅ validé | Probe harvest volumes complets (204/204), poll delay 4s |
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

### WidgetGone / hadWidget / CDP Cookie Check
- `widgetGone = isChallenge && !hasRealWidget` fonctionne pour MangaFire (Turnstile disparaît après résolution)
- Le garde `hadWidget` (tracker si widget déjà vu) cassait CrunchyScan : challenge managé sans widget → `hadWidget` jamais true → jamais résolu
- Revert : retour au `widgetGone` simple + délai initial poll augmenté à 4s
- Délai 4s laisse le temps au Turnstile de charger avant le premier check
- **Fix v3.0.1+**: le revert hadWidget a aussi supprimé le CDP cookie check (`Network.getCookies` → `cf_clearance`). Sans ce fallback, JapScan était bloqué car le Turnstile interactif reste dans le DOM après résolution (`hasRealWidget=true` → `widgetGone=false`). Restauration du CDP check avec timeout 5s (`Promise.race`) pour ne pas bloquer le loading screen
- Parenthesization fix: `widgetGone || (CF gone && antiScraping None)` — widgetGone seul peut contourner la détection site
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

### JapScan
- Puzzle interactif (#jc-overlay) + Cloudflare Turnstile interactif
- **Reader-first extraction** : une seule fenêtre visible avec DRM bootstrap en preload ; le script protégé du site décode la liste complète des pages une fois le puzzle résolu — pas de 2e fenêtre DRM (budget 30s toujours dépassé par captcha_d.js async)
- **Page-selector walk** : quand le lazy-load drain plafonne à ~110 images malgré l'indicateur du sélecteur de pages (volume), l'extraction récupère les pages restantes en fetchant les URLs du sélecteur same-origin dans la fenêtre déjà déverrouillée (3 workers, 15s/timeout, 100s budget)
- **Source-breakdown diagnostics** : `ReaderExtraction` expose `drm`, `dom`, `selector` pour diagnostiquer d'un coup d'oeil si la récupération a échoué
- Scroll limit 500 steps, stable detection 20 steps, timeout 300s
- Cloudflare résolu via plugin navigateur (Interactive mode)
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
- `Interactive` → `win.Show()` + poll 4s jusqu'à résolution
- `Automatic` → reload auto (pas de popup)
- Cache `cf_clearance` >200 chars requis

### ChallengeReload (`ChallengeReload.ts`)
- Poller 5s, max 3 reloads, budget partagé globalement
- Arrêt pollers au `destroy()`

## 5b. Export amélioré + Omnibus (31 août)
- **État git** : export/PDF/CBZ/omnibus + CloudFlareRenewal COMMITTÉS dans `dff45a7a7` (feat(export)). JapScan v3.0.2 (`FetchProviderCommon.ts`, `JapScan.Extract.ts`, CHANGELOG, bumps 3.0.2) encore NON committés en local.

### PDF amélioré (`PortableDocumentFormatExporter.ts`)
- Settings: `PDFTheme` (White/Sepia/Dark) + `PDFDoublePage` (double-page spread)
- Double-page: chaque image = moitié du spread (halfWidth), gutter central, centrage vertical
- Écritures stream explicites (pas de promesses flottantes dans events `data`)

### CBZ streaming (`ComicBookArchiveExporter.ts`)
- Écriture image-par-image dans le zip stream (pas de buffer mémoire complet)
- Fermeture/abort propre du writable si échec mid-stream

### Omnibus / Collection (`CollectionDownloadTask.ts` + `CollectionExporter.ts`)
- Regroupe plusieurs chapitres en un seul volume CBZ/EPUB/PDF
- Dossier par chapitre dans l'archive, fallback nom `Chapter-N` (index réel d'itération)
- Chapitres en échec `Update()` ignorés; si aucun chargé → tâche échoue
- UI: menu Download → « Download selected as omnibus (N) » (une seule entrée, pas de doublon) + menu contextuel

### Cloudflare
- `FetchProviderCommon.ts`: challenge sans widget ≠ résolu pour CrunchyScan/JapScan — confirmation via `cf_clearance` requise
- `app/electron/src/ipc/CloudFlareRenewal.ts` (nouveau): renouvellement périodique cf_clearance en arrière-plan sans fenêtre

### JapScan fix (31 août, v3.0.2)
- Retour au chemin séquentiel avec fallback : `ExtractPagesFromReader` (scroll) puis fallback `CreateImageLinks` si reader échoue — plus de double fenêtre parallèle qui bloquait
- Regex CDN élargie `japscan.*` (domaine TLD variable)
- **Fix puzzle non proposé (v3.0.2)** : le puzzle `#jc-overlay` est rendu ASYNCHRONE (AJAX anti-bot quelques secondes après DOMReady, typiquement sur la 2e requête consécutive du lecteur) → détection unique au DOMReady = `None` trop tôt. Fix : période de grâce dans `FetchWindowPreloadScript` — si `ShouldUseForkChallengeHandling && show`, win.Show() puis re-poll de `CheckAntiScrapingDetection` toutes les 2s pendant 16s ; upgrade vers Interactive/Automatic (enterInteractive/enterAutomatic refactorés en closures) dès apparition. Log `[KUMO] redirect (grace re-check)`.
- **Fix pages manquantes + 404 CDN (v3.0.2)** : fin de collecte = `atBottom && stable` (8 rounds, au lieu de `atBottom || stable`) ; pause de la collecte tant que `#jc-overlay`/`__captcha.needed` visible (l'utilisateur résout dans la fenêtre visible), sortie anticipée si vraies images re-décodées (`decodedBodySize > 10ko` — l'overlay peut persister dans le DOM après résolution comme le Turnstile) ; collecte élargie aux holders `[data-src]/[data-original]/[data-lazy-src]` non-img ; garde-fou 80 rounds sans nouvelle URL.
- ⚠️ Piège : backticks dans les commentaires DANS un template literal ferment le template → TS1005. Mots simples dans ces commentaires.
- Lint : parenthèses redondantes retirées dans `cleared = widgetGone || ...` (precedence `&&`/`||` inchangée) — CI lint doit rester vert.
- **Validation utilisateur : JapScan OK** ✅ (PDF ✅, omnibus UI ✅) — v3.0.2 en attente de validation volume 24 Dreamland (e2e ajouté, timeout 300s)

### Screenshots doc
- `scripts/take-screenshots.mjs` (Puppeteer, captures UI réelles 49-99 KB)
- `docs/screenshots/` embarquées dans README.md + README.en.md

### E2E offline
- `ExportPipeline_e2e.ts` : plugin synthétique → chapitres → pages → CBZ streaming + omnibus, 3/3 vert (Electron réel + Puppeteer)
- ⚠️ `page.evaluate` : passer un STRING script, pas une fonction (sérialisation)

### Bugs environnement (Windows/Git Bash)
- `tasklist`, `wmic`, `cmd //c`, `ps -W` et curl/netcat se figent souvent → utiliser `powershell -NoProfile -Command "Get-CimInstance Win32_Process ..."` (fonctionne parfois, sinon réessayer)
- `build-app.mjs` purge `app/electron/build` → TOUJOURS relancer `vite build` (main+preload) APRÈS, puis recopier `web/build` → `app/electron/build/web`
- Ordre build fiable : `vite build` (web) → `build-app.mjs` → `vite build` (main+preload) → copier web/build → build/web → lancer electron.exe
- Lancement app : `node .tmp/launch-app.mjs` (détaché, profil `.user-data`, log `.tmp/electron-launch.log`)

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

- **Langue : français uniquement** — répondre toujours en français à l'utilisateur, quel que soit le modèle
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

- `build-app.mjs` fait `purge(dirBuild)` → efface `main.js` et `preload.js` de Vite. **Ordre obligatoire** : `build-app.mjs` D'ABORD (copie web/build + package.json), puis `vite build` APRÈS (crée main.js + preload.js).

- `PatternLinkGenerator` est infini (`for (let page = start; true; page++)`). `isMissingLastItemFrom` compare le dernier élément entre pages — si le site retourne des items différents à chaque page (pas de pagination triée), la comparaison ne matche jamais → **loop infini → 3+ Go de RAM**. Fix : ajouter `maxPages` au decorator `MangasMultiPageCSS` (défaut 0 = infini) + throttle + break si page vide.

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
- Le `ReloadStalledCloudFlareChallenge` ne doit tourner QUE pour le mode `Automatic`. En mode `Interactive`, un reload reset le Turnstile et crée un loop visible (fenêtre qui clignote). Le reload est maintenant déclenché uniquement dans le case `Automatic` du switch.
- En mode `Automatic` + `ShouldUseForkChallengeHandling`, il faut `win.Show()` pour que le challenge Cloudflare puisse se résoudre. Sans ça, le challenge tourne en background sans fenêtre → timeout → loop. JapScan et CrunchyScan ont besoin de cette fenêtre.
- Le CDP cookie check dans `PollForChallengeResolution` détecte la résolution via `cf_clearance` quand le Turnstile vit dans un subframe (DOM parent ne voit jamais le widget).


### ScanManga
- Cookie `sessionT` déclenche page réduite → sentinel `__hkn_no_session_cookies__`
- API bqj: fingerprint WebGL + effectiveType, payload encodé base64→gzip→reverse→base64
- Injection cookies uniquement pour le renderer (pas les fenêtres distantes)

---
Session du 1er septembre 2026 — JapScan + Timeouts de téléchargement

DIAGNOSTIC (avant modifications)

    JapScan FetchPages (web/src/engine/websites/JapScan.ts) : L'arbre de travail contenait une exécution PARALLÈLE de Promise.allSettled([ExtractPagesFromReader, drm.CreateImageLinks]) — une régression par rapport au chemin séquentiel vérifié (§4/§5b : reader → DRM fallback). Un DRM en parallèle ouvre une seconde fenêtre de navigateur → duplication de fenêtres, blocages, puzzle inutile.

    File d'attente de téléchargement (web/src/engine/DownloadManager.ts) : Process() exécute await task.Run() SANS timeout — une tâche bloquée (ex. fenêtre/réseau JapScan) bloque TOUTE la file d'attente indéfiniment. Exigence du CDC : un timeout de blocage (stall) de 15s par tâche, pas sur la file d'attente.

    DownloadTask.Run / CollectionDownloadTask.Run : item.Fetch() et Media.Update() sans timeout par élément — attente infinie possible.

SOLUTION (générique, pas seulement JapScan)

    DownloadTask.ts : Dans Run(), chaque item.Fetch() est enveloppé dans WaitForWithTimeout(fetch_coro, 15s) (fonction auxiliaire wait_with_timeout) : au bout de 15s, le fetch est annulé via AbortController (signal déjà transmis à Fetch), l'erreur est écrite dans errors, la page est ignorée — la tâche continue les autres pages. Media.Update() dispose aussi d'un timeout de 15s → sinon toute la tâche échoue avec une erreur claire, statut Failed, la file d'attente avance.

    DownloadManager.Process() : await task.Run() a-t-il été remplacé par await wait_with_timeout(task.Run(), 15s) ? NON — 15s pour toute la tâche est trop court (un chapitre de plusieurs pages prend plus de temps). La bonne approche : détection de blocage (stall-detect). Implémenté : Process() attend task.Run() avec un watchdog : si la tâche ne modifie pas Progress/Status pendant plus de 15s → task.Abort() + wait_with_timeout(abort_wait, 5s) → statut Failed, la file continue. Détection de progression : comparaison du snapshot (status, progress) toutes les 1s.

    CollectionDownloadTask.Run : chapter.Update() est déjà dans allSettled — ajout d'un timeout de 15s sur chaque Update (même wait_with_timeout), un Update échoué = chapitre ignoré (déjà le cas), mais ne reste plus bloqué indéfiniment.

    Tous les timeouts utilisent la constante DOWNLOAD_STALL_TIMEOUT_S = 15.0 dans DownloadTask.ts, importée par le gestionnaire.

FICHIERS MODIFIÉS

    web/src/engine/DownloadTask.ts : +wait_with_timeout(), +DOWNLOAD_STALL_TIMEOUT_S, timeouts par page et Update, transmission de l'Abort.

    web/src/engine/DownloadManager.ts : Watchdog sur la progression dans Process().

    web/src/engine/CollectionDownloadTask.ts : Timeout sur chapter.Update().

    web/src/engine/websites/JapScan.ts : FetchPages est revenu en SÉQUENTIEL (reader → DRM fallback), comme dans §5b.

POURQUOI CELA NE CASSE PAS LES AUTRES SITES

    Timeout uniquement sur l'INACTIVITÉ (stall) : la progression réinitialise le watchdog. Un téléchargement lent mais actif (listing MangaFire 70k, DRM CrunchyScan) n'en souffre pas.

    L'annulation (Abort) est déjà prise en compte dans tous les Fetch (AbortSignal est transmis à item.Fetch et Media.Update).

    Le TaskPool (listing/chapitres) N'EST PAS touché — uniquement la file d'attente de téléchargement.

TESTS (exécutés le 1er sept., aucune autre source modifiée à part les timeouts)

    tsc --noEmit (web) ✅ et tsc -p app/electron/tsconfig.json ✅ (0 erreur)

    ESLint : La commande avec --ext .ts,.svelte,.vue est INCORRECTE pour ce dépôt — la configuration flat (eslint.config.js) ignore .svelte/.vue (fichiers dans ignores), et --ext n'est pas appliqué → 50 « Parsing error: Unexpected token < ». La bonne commande = CI : eslint . depuis web/ (= check:lint).

        Il reste 1 erreur de lint — PRÉEXISTANTE (commit dff45a7a7), en dehors de la zone timeouts/JapScan : web/src/engine/exporters/ExportPipeline_e2e.ts:3 — import inutilisé Chapter. Non touché (demande de l'utilisateur : uniquement timeouts/JapScan).

    DownloadTask_test + DownloadManager_test : 7 échecs auparavant → 40/40 ✅.

        BUG (dans ce travail), trouvé et corrigé : WithTimeout faisait SetTimeout(...).then(...), mais vitest.setup.ts simule (mock) BackgroundTimers avec le setTimeout natif (renvoie un objet Timeout, pas une Promise !) → TypeError synchrone dans l'executor → la promesse du timeout était rejetée IMMÉDIATEMENT → tout fetch avec du retard (setTimeout ≥ 5ms) perdait la course → erreur, tâche en Failed, le Store n'était pas appelé, le statut restait bloqué sur downloading. Correctif dans DownloadTask.ts : if (ret instanceof Promise) ret.then(id => ...) (le vrai BackgroundTimers.SetTimeout renvoie une Promise — le comportement en prod reste inchangé ; sous le mock, nous ne nettoyons simplement pas le timer). Leçon : ne jamais faire de .then sur le retour d'un wrapper de SetTimeout sans vérifier son type.

        ⚠️ Pas de "nouveaux" cas de blocage sur 15s dans les fichiers de test (les deux fichiers sont inchangés, dernier commit d16a90f9b) — le timeout par page n'est vérifié qu'indirectement ; un cas de blocage dédié = TODO.

    E2E websites : ScanManga 5/5 + MangaNova 7/7 = 12/12 ✅ (réseau réel).

        Commande (DEPUIS LA RACINE haruneko/, pas depuis web/) : export PATH="/c/Program Files/nodejs:$PATH" && node node_modules/vitest/vitest.mjs run --config test/vitest.websites.ts ScanManga_e2e MangaNova_e2e

        Pièges : Sans node dans le PATH, vite.cmd plante avec « 'node' n'est pas reconnu » → le serveur preview ne démarre pas → Electron ERR_CONNECTION_REFUSED sur https://localhost:5000 → globalSetup timeout → « No test files found ». Avant l'exécution, tuer les processus bloqués : taskkill //F //IM electron.exe + le processus sur le port 5000. Le serveur preview sert du HTTPS (certificat de vite.config.ts) — c'est normal.

BUILD (1er sept., ordre du §7 respecté — les 4 étapes)

    vite build (web) ✅ — uniquement un avertissement sur la taille des chunks

    build-app.mjs ✅ — ⚠️ La version actuelle du script est DÉJÀ SANS npm install (main.js intègre commander/websocket-rpc ; build/node_modules n'est PAS nécessaire — la note du §7 concernant build/node_modules est obsolète)

    vite build main ✅ (main.js) + vite build --config vite.preload.config.ts preload ✅ (le preload est compilé avec une config SÉPARÉE — vite.preload.config.ts, non suivi dans ce travail ; la compilation conjointe cassait : rolldown extrayait un chunk commun → le preload exigeait ./main.js)

    cp -r ../../web/build/. build/web/ ✅ (après vite build, car le build principal ne nettoie pas)

    Résultat dans app/electron/build/ : main.js, preload.js, package.json (manifeste), web/

LANCEMENT (1er sept.)

    node .tmp/launch-app.mjs (depuis la racine) → pid 16272, profil app/electron/.user-data, log .tmp/electron-launch.log

    [LocalServer] D:\Codex\haruneko\app\electron\build\web → [http://127.0.0.1:64210](http://127.0.0.1:64210) → HTTP 200 ✅, processus actif (netstat LISTENING), aucune erreur fatale

    Bruit dans le log (non fatal) : RemoteBrowserWindowController::* — Failed to find window with id 38 (BrowserWindow.fromId → null, handlers après fermeture de la fenêtre, ~10 lignes au démarrage) et ERR_BLOCKED_BY_CLIENT (publicité a-ads.com).

    EXE : build dev D:\Codex\haruneko\node_modules\electron\dist\electron.exe (app : app/electron/build) ; aucun bundle empaqueté/NSIS réalisé durant cette session.

    ✅ Deuxième passage complet confirmé (le même jour) : tsc ×2 OK, eslint (1 erreur préexistante), 40/40, e2e 12/12, build 4 étapes OK, nouveau lanceur pid 15372, HTTP 200, [CloudFlareRenewal] japscan.foo clearance renewed (511 chars) — l'actualisation en arrière-plan du cf_clearance fonctionne.

    Test manuel (JapScan : puzzle au 1er lancement + le téléchargement bloqué se libère au bout d'environ 15s, la file ne se bloque pas) — EN COURS DE VALIDATION PAR L'UTILISATEUR (interactif, point 3-3 de la tâche).

STATUT

    [x] Diagnostic

    [x] JapScan séquentiel restauré

    [x] Timeouts de 15s

    [x] Exécution des tests (40/40 moteur + e2e 12/12 + tsc ×2 + eslint : 1 erreur préexistante hors zone)

    [x] Build + EXE + Lancement (build OK, lancement OK, HTTP 200 ; test manuel JapScan côté utilisateur)

---

## 13. Session 2 septembre 2026 — Bundle multi-arch Windows complet + fix PATH Windows + timeout JapScan

### Bundle complet multi-arch (`npm run bundle` dans `app/electron`) ✅
- Les 6 artefacts sont dans `haruneko/app/electron/bundle/` :
  - `ChainsmokerNeko-v3.0.2-win32-{ia32,x64,arm64}.zip` (portables, ~124/139/141 Mo)
  - `ChainsmokerNeko-v3.0.2-win32-{ia32,x64,arm64}-setup.exe` (NSIS per-user, ~94/105/100 Mo)
- Prérequis machine : **NSIS absent** → NSIS portable 3.10 téléchargé dans `app/electron/.tmp/nsis/nsis-3.10` (SourceForge), détecté via env var `MAKENSIS` (`findMakensis` le prend). 7-Zip présent (`C:/Program Files/7-Zip/7z.exe`) → zips OK.
- Cache Electron partagé : `HAKUNEKO_ELECTRON_CACHE=D:\Codex\.electron-cache` (les 3 archives v43.3.0 déjà téléchargées = pas de re-download).
- Log : `app/electron/.tmp/bundle-full.log` (fini proprement sur le dernier makensis arm64).
- ✅ **Rebuild final corrigé (2 sept., ~16:07-16:13)** : ⚠️ le 1er rebuild (pid 489, log `bundle-full2.log`) avait produit des artefacts SANS le fix — `npm run bundle` NE reconstruit PAS web (il copie `web/build`, encore pré-fix). Correctif : `haruneko/.tmp/bundle-full-fixed.ps1` = `npm run build:web` PUIS `npm run bundle` (PATH registre propre + `MAKENSIS` portable, log `app/electron/.tmp/bundle-full3.log`). Résultat : 6 artefacts frais (mtimes 16:07-16:13), zéro erreur, et fix **vérifié dans les 3 zips + web/build** : asset `resources/app/web/MTK66PBE/DownloadTask.js` (nouveau hash → le build a bien changé) contient `Q=15e3,$=3e5` (per-page 15s + chapter-update 300s ; les installateurs NSIS embarquent le même `resources/app`). ⚠️ Piège retenu : vérifier le fix DANS les artefacts, pas seulement les mtimes ; esbuild minifie les constantes (`300000` → `3e5`, `15000` → `15e3`).

### Fix « 'npm' n'est pas reconnu » (cause racine Windows) ✅
- **PATH MACHINE corrompu** : 2 entrées invalides — un guillemet nu `"` et `C:\Program Files\nodejs\"` (guillemet final) → `cmd.exe` (utilisé par TOUS les lifecycle scripts npm) ne résolvait plus npm/node → tout `npm run` imbriqué échouait (ex. `npm run build` dans le script `bundle`).
- Fix : `haruneko/.tmp/fix-machine-path.ps1` (élevé, approuvé par l'utilisateur) filtre les entrées contenant un guillemet → vérifié `Residual quotes? False`, `C:\Program Files\nodejs\` conservé.
- Preuve : `npm run bundle:x64` à la racine en UNE commande = exit 0 (web build → build-app → vite main+preload → rcedit → 7z).
- ⚠️ Le shell de l'agent Freebuff garde le PATH obsolète (processus long) → en session : `export PATH="$(echo "$PATH" | tr -d '"')"` avant toute commande npm/cmd ; les NOUVEAUX terminaux sont OK sans workaround.

### JapScan « Chapter update … timed out after 120000ms » ✅ (nécessite rebuild)
- **Cause** : `CHAPTER_UPDATE_TIMEOUT_MS` (120s) bornait `Media.Update()` dans `DownloadTask.Run()`, alors que le pipeline JapScan (puzzle interactif `#jc-overlay` ≈ 150s + drain lazy-load ≈ 90s + page-selector walk ≈ 100s) a besoin de jusqu'à 300s. Le timeout externe expirait avant les budgets internes. Les autres sites résolvent en <1s → seul JapScan échouait.
- **Fix** (`CHAPTER_UPDATE_TIMEOUT_MS = 300_000` = budget du fetch provider reader `FetchWindowPreloadScript`) :
  - `web/src/engine/DownloadTask.ts` : constante portée à 300s, commentaire mis à jour
  - `web/src/engine/CollectionDownloadTask.ts` : `WaitForUpdate()` (collection/omnibus) sur la même constante
  - Le stall PAR PAGE reste 15s (`STALL_TIMEOUT_MS`) — une image bloquée ne fige pas la file ; un connecteur cassé reste borné (5 min max).
- **Vérifs** : `tsc --noEmit` web ✅ ; vitest `DownloadTask_test` (27/27) + `DownloadManager_test` (13/13) = **40/40 ✅** ; tous les tests web (2154/2154 ✅).
- ⚠️ À re-tester en app réelle (JapScan — Dreamland Volume 24) + rebuild bundle requis.
- **Pré-chauffage `FetchMangas` (2 sept., après-midi)** : ouvre `/mangas/?p=1` en fenêtre visible (`FetchWindowScript(request, 'true', 2s, 300s, show)`) pour résoudre le challenge Cloudflare interactif avant la pagination HTTP ; fallback silencieux (try/catch). Intégré depuis `C:\Users\endymion\Downloads\JapScan.ts` (diff = 1 seule vraie modif). tsc ✅, eslint --fix (4× no-multi-spaces) ✅. Non committé. Notes : pas de cache session « pré-chauffé » (fenêtre rouverte à chaque ouverture) ; `2_000` = délai avant injection (le commentaire « poll interval » est imprécis) ; commentaire FR→EN.
- **Rebuild final 2 (2 sept., 16:39-16:46)** : `bundle-full-fixed.ps1` (build:web + bundle) après intégration du pré-chauffage → 6 artefacts frais (mtimes 16:40-16:46), 0 erreur, nouveau hash `MTK7DAO5`, **vérifié contenu** : `3e5` dans `DownloadTask.js` (ia32) + `mangas/?p=1`/`FetchWindowScript` dans `HakuNeko.js` (ia32 et x64). Les installateurs NSIS embarquent le même `resources/app`.
- **e2e JapScan (2 sept., 16:35-16:41)** : 🚫 BLOQUÉ — `FetchProvider_Fetch_CloudFlareChallenge` sur `jujutsu-kaisen/` et `king-game/` (8 échecs / 2 init OK, retry identique) : l'IP est challengée et le e2e tourne avec un profil temporaire vierge (pas de `cf_clearance`/extension, l'Utilisateur ne peut pas résoudre le puzzle interactif dans le timeout). Env. NON lié au pré-chauffage (le fixture teste `FetchMangaCSS` mono-URL, chemin intact). Validation runtime du pré-chauffage = manuel (ouvrir l'onglet Mangas dans l'app).

### Réparation index git (2 sept., après-midi) ✅
- **Symptôme** : `git status` montrait TOUS les fichiers en `D ` (suppression stagiée) + les mêmes en `??` (untracked), y compris des fichiers existants.
- **Cause** : le fichier `.git/index` avait DISPARU (vérifié : absent de `.git/`, `git ls-files` = 0 entrées, HEAD/objects/refs intacts, HEAD = 1dfea5555, 2945 fichiers).
- **Fix** : `git reset` (mixed, non destructif — réécrit l'index depuis HEAD, working tree INTACT) → index recréé (312 Ko), `git status --short --untracked-files=no` = 15 entrées ` M` seulement (0 suppression).
- **Vérifié** : mes modifs présentes (`CHAPTER_UPDATE_TIMEOUT_MS` dans DownloadTask.ts + CollectionDownloadTask.ts, MEMORY.md §13) + modifs préexistantes non committées (§5b/§12) intactes.
- **Suite (même jour)** : commit `0ce03b955` « chore(build): track preload vite config and ignore electron user-data » — a ajouté `app/electron/.user-data/` au `.gitignore` (CRLF respecté) et committé `app/electron/vite.preload.config.ts` (requis par `vite build --config vite.preload.config.ts`). Les 15 fichiers ` M` restants (fix JapScan, DownloadTask/CollectionDownloadTask timeouts, MEMORY.md) sont TOUJOURS non committés (choix utilisateur).

---

## 14. Session 3 septembre 2026 — JapScan reader-first + page-selector walk + diagnostics

### Reader-first volume extraction (`c3289d7fe`)
- **Avant** : FetchPages ouvrait DRM en parallèle du reader pour les volumes (régression par rapport au séquentiel de §12). Le DRM ouvrait une 2e fenêtre dont le budget 30s expirait toujours sur captcha_d.js async.
- **Après** : une seule fenêtre visible reader avec le DRM bootstrap en preload (`JapScan.DRM.preload.ts`). Le script protégé du site décode la liste complète des pages via CustomEvent une fois le puzzle résolu — pas de 2e fenêtre.
- **Fallback** : si le reader sous-livre (< 5 pages ou < total), `CreateImageLinks` (DRM provider) est tenté en dernier recours.

### Page-selector walk (`JapScan.Extract.ts`)
- **Problème** : les lecteurs volume JapScan montent lazy-load les images par écrans et plafonnent à ~110 images, même avec drain, alors que le sélecteur de pages (`select#pages`) annonce le vrai total (~204 pour Dreamland vol. 24).
- **Solution** : `ReadPageSelectorURLs()` — helper sérialisable qui lit les URLs du sélecteur de pages (value, data-url, data-href, href), filtrées same-origin, chapter-subtree, dédupliquées. `enumeratePageSelectorImages()` — fetch same-origin de chaque page URL dans la fenêtre déjà déverrouillée (3 workers, 15s abort, 100s budget), parsing DOM de la réponse pour extraire l'image CDN. Pages ordonnées par position sélecteur, fusionnées avec les pages DOM.
- **Précédence** inchangée : DRM payload > DOM drain > selector walk > host-side CreateImageLinks fallback.

### Source-breakdown diagnostics
- `ReaderExtraction` : nouveaux champs `dom` (pages DOM avant selector walk) et `selector` (nouvelles pages récupérées par le walk). Log : `[JapScan] /path/ -> N pages (drm: X, dom: Y, selector: Z, total: T)`
- Lecture instantanée : `drm: 204` = DRM complet ; `drm: 0, dom: 110, selector: 94, total: 204` = lazy-load stall récupéré par walk ; `drm: 0, dom: 85, selector: 0, total: 204` = walk échoué.

### Fichiers modifiés
- `web/src/engine/websites/JapScan.DRM.preload.ts` (nouveau) : bootstrap DRM sérialisable pour le reader window
- `web/src/engine/websites/JapScan.Extract.ts` : TransformDRMPayload, ReadPageSelectorURLs, scanFetchedPage, enumeratePageSelectorImages, dom/selector counts dans finalize()
- `web/src/engine/websites/JapScan.Extract_test.ts` : 15 tests (OrderPageLinks, TransformDRMPayload, ReadTotalPageIndicator, ReadPageSelectorURLs)
- `web/src/engine/websites/JapScan.ts` : FetchPages reader-first sans DRM parallèle, log source-breakdown
- `web/src/engine/websites/JapScan_e2e.ts` : fixture Dreamland volume 24 (timeout 300s)

### Validation
- `tsc --noEmit` web ✅ et electron ✅ (0 erreur)
- Vitest : JapScan_test 4/4 + JapScan.Extract_test 15/15 + DownloadTask_test 27/27 + DownloadManager_test 13/13 = **59/59 ✅**
- E2E JapScan : 🚫 BLOQUÉ (Cloudflare interactif, profil temporaire) — fixture Dreamland ajouté, validation runtime = manuelle
- Commit `c3289d7fe` : 5 fichiers, 467 insertions, 32 suppressions

### Tests manuels à valider
1. Lancer l'app (`node .tmp/launch-app.mjs`)
2. Ouvrir JapScan → Dreamland → Volume 24
3. Résoudre le puzzle `#jc-overlay`
4. Vérifier log console : `~204 pages (drm: X, dom: Y, selector: Z, total: ~204)`
5. Le page-selector walk doit récupérer les pages au-delà de ~110
6. Télécharger et vérifier que les timeouts (15s/page, 300s/chapter) ne bloquent pas

### Rebuild bundle 3 sept (17:50-17:57) ✅
- 6 artefacts Windows régénérés depuis l'arbre de travail : 3 zips + 3 NSIS, hash web `MTLPAGU7`.
- Vérifié dans les 6 artefacts (zip + installateurs) : `3e5` (`CHAPTER_UPDATE_TIMEOUT_MS` 300s) dans `DownloadTask.js` + fix overlay (`getComputedStyle` sur `#jc-overlay`) dans `HakuNeko.js`. Aucun `12e4` résiduel.
- ⚠️ Piège confirmé : le bundle de 12:36 contenait encore `12e4` (120s) — `npm run bundle` copie `web/build` sans le reconstruire ; il faut `build:web` d'abord (ou build depuis l'arbre de travail).

### Log de durée par phase (`JapScan.Extract.ts`)
- `timing = { puzzleMs, drainMs, walkMs, scrollMs }` : temps passé dans `waitWhileBlocked` (puzzle, accumulé sur tous les appels), drain lazy-load, page-selector walk, scroll fallback.
- Log finalize enrichi : `... (drm: X, dom: Y, selector: Z, total: T) puzzle: Xs, drain: Ys, walk: Zs, scroll: Ws`.
- `waitWhileBlocked` : les 3 conditions de sortie fusionnées en une seule (équivalent), pour accumuler le temps de puzzle en un seul point.
- Validation : tsc web ✅ ; vitest 2154/2154 ✅ (dont JapScan.Extract_test 15/15).

### ⚠️ Le log de phase ne remonte pas dans la capture console (mesure Dreamland 24)
- Session 3 sept 19:37-20:13 (pid 18948, build `MTLQVPM0`) : **aucune ligne `puzzle:/drain:/walk:/scroll:` capturée**, et aucun résultat `[JapScan]` pour Dreamland volume-24 (reader chargé 19:57:34, activité arrêtée ~19:59:53, aucune résolution).
- Les 7 lignes `[JapScan]` capturées (one-piece/1192 ×3, dreamland-remaster volume-10 ×4, tous `drm: 0, selector: 0`, `dom: 18` ou `110-113` vs `total: 272` — boucle de retry incomplète ~78s) viennent du log **externe** `FetchPages` (JapScan.ts), pas du finalize du script.
- Cause : le script d'extraction tourne dans la fenêtre reader séparée (`FetchWindowPreloadScript`) ; son `console.log` n'atteint PAS la capture `--enable-logging` (seuls les messages générés par le navigateur — CSP/CORS — y apparaissent). Le log externe `FetchPages` (fenêtre principale) est bien capturé.
- Fix appliqué : les durées remontent désormais **dans l'objet résultat** (`ReaderExtraction.puzzle/drain/walk/scroll` en secondes, ajoutées au retour de `finalize()`), loggées par `FetchPages` (console capturée). Build `MTLW7S2M` (web + app/electron) — nécessite un relaunch de l'app pour mesurer.
- Validation : tsc web ✅ ; vitest 2154/2154 ✅.

### Console des fenêtres reader routée vers le log main (diagnostics sans modifier la page)
- `app/electron/src/ipc/RemoteBrowserWindow.ts` (contrôleur main) : `win.webContents.on('console-message', …)` sur chaque fenêtre ouverte via `FetchWindowPreloadScript`.
- Ligne émise dans la console du processus principal : `[ReaderWindow:<win.id>] [<level>] <message> (<sourceId>:<lineNumber> @ <frame.url>)` — `console.warn` pour warning/error, `console.log` sinon. Greppable dans `.tmp/electron-launch.log` (`grep ReaderWindow`).
- Ne filtre PAS (toute la console de la fenêtre, y compris sous-frames/iframes) ; la capture native `INFO:CONSOLE` reste inchangée → double visibilité, pas de perte.
- Complémentaire du fix résultat-objet : couvre tout futur `console.log` du script d'extraction sans re-instrumenter la page.
- Validation : tsc electron ✅ ; vitest electron 28/28 ✅ ; `npm run build` (app/electron) OK — `ReaderWindow` présent dans `build/main.js`.

### ✅ Mesures réelles Dreamland vol-24 / vol-10 (3 sept 22:14-22:38, build MTLW7S2M + routage [ReaderWindow])
- 8 runs capturés dans `.tmp/electron-launch.log` (lignes `[JapScan] ... -> N pages ... puzzle/drain/walk/scroll` = log externe FetchPages, timings portés par l'objet résultat).
- **vol-24 (5×, identiques)** : `114 pages (drm: 0, dom: 114, selector: 0, total: 204) puzzle: 0s, drain: 4s, walk: 0s, scroll: 5.4s` — 22:14:53 / 22:18:12 / 22:20:59 / 22:28:32 / 22:36:07 (cadence irrégulière 2m47s→7m35s = **re-téléchargements manuels**, PAS une boucle auto ~78s ; le ~78s de la session 19:37 était dominé par l'attente puzzle).
- **vol-10 (3×)** : `110 pages (drain: 18.1s)` puis `114 pages (drain: 9s)` à 10s d'écart (2e run = fenêtre fallback DRM), puis `114 pages (drain: 4s)`.
- **Comparaison budgets** : puzzle mesuré **0s** vs 180s (jamais atteint en session chaude — ne borne que le temps humain) ; drain **4-18s** vs 90s (sortie par garde anti-stall `stallRounds<4`, jamais par le cap) ; walk **0s** vs 100s (**no-op structurel** : 0 URL walkable — options de `select#pages` = numéros nus) ; scroll **5.4s** vs 125s (sortie par stabilité).
- **Conclusion** : total mesuré ~9-24s vs somme des budgets ~495s → **les budgets ne sont PAS le problème** ; les resserrer ne changerait rien. Le problème est la **complétude** : `dom: 110-114` (lazy-loader s'arrête / pagination) + `drm: 0` (payload DRM jamais décodé) + `walk: 0` (sélecteur sans URLs) → ~90-158 pages manquantes par volume.
- **Indice nouveau** : lignes `[ReaderWindow] [error]` = `fetch()` vers `c4.japscan.foo` (CDN images) **bloqué CORS** depuis la page reader — possible cause de l'arrêt du lazy-loader à ~110 (le site fetch-rait les images au-delà).
- **Limite du routage** : les `console.log` du script d'extraction (exécuté via `executeJavaScript`) ne remontent PAS via `[ReaderWindow]` (seuls les logs du contexte page remontent : preload + scripts du site). Aucune ligne `page-selector walk: N walkable URLs found` dans le log — les timings restent fiables car portés par l'objet résultat.

### Synthèse d'URLs de pages volume dans le walk (fix complétude 110/204-272)
- **Cause mesurée** (8 runs 22:14-22:38) : `walk: 0s, selector: 0` — les options de `select#pages` sont des **numéros nus** (`1..N`) sans `data-url` → `ReadPageSelectorURLs()` retourne [] → le walk ne peut rien récupérer au-delà des ~110-114 images montées par le lazy-loader.
- **Fix** (`JapScan.Extract.ts`) :
  - Nouveau helper sérialisé `ReadPageSelectorRange()` : lit la plage `{min,max}` d'un select page-like dont les options sont numériques (ou labels → repli sur options.length). Exporté + testé (5 tests).
  - Dans `enumeratePageSelectorImages` : quand le walk ne trouve aucune URL explicite, **synthèse** de documents de page depuis `location.pathname` via 4 templates (`base+n+'/'`, `base+'page/'+n+'/'`, `base+'?page='+n`, `base+'?p='+n`), **validés par un fetch de probe** (page échantillon au milieu de la plage, 8s abort) : seul un template qui rend une image CDN **inédite** est adopté → marche sur `range.min..max`. Un mauvais pattern ne coûte que ~4 fetchs et ne pollue pas `seen`.
- Sérialisation sûre : code inséré **sans backslash ni backtick** (template literal). Script sérialisé re-syntax-checké (`new Function`, 24.7 KB) OK.
- Validation : tsc web ✅ ; vitest JapScan 24/24 ✅ (Extract 20 dont 5 nouveaux range). Builds : web `MTM3F71N` + app/electron régénérés.
- **À tester** : relancer l'app → Dreamland vol-24 ou vol-10 → la ligne résultat doit montrer `selector: >0` (ex. `dom: 114, selector: ~90, total: 204`) si le template `/manga/.../volume-24/{n}/` existe ; sinon `selector: 0` inchangé + logs probe in-window (non routés) → itérer sur le pattern réel.

### 04/09 diag in-window (walk-synth test + CORS/CSP evidence)

- Test du build MTM3F71N (synthèse d'URLs) : 3 runs vol-24 → selector: 0 partout, walk 0.6-0.7s = les 4 probes rejetés. Le reader volume JapScan n'a PAS de documents par page (SPA lazy) → la marche du sélecteur est une impasse pour les volumes.
- Preuve CORS/CSP du log : le script du site (v1918241/*.js) fait ~206 fetch no-cors distincts de URLs CDN chiffrées c4.japscan.foo pendant le drain (852 violations CSP connect-src 'none' report-only, 14 vrais blocs CORS seulement) → le site connaît ~toutes les 204 pages; seulement ~110 deviennent des <img>. Verrou = montage JS du site, pas la découverte d'URLs.
- Ajout GatherReaderDiagnostics() (JapScan.Extract.ts) : renvoyé dans le résultat (diag JSON, loggé par FetchPages côté host) — conteneur de scroll réel, inventaire img (total/resolvedCDN/lazyUnresolved), état buffer resource-timing (fetchCDN/imgCDN), select#pages, overlay. Build MTMN6DGP.

### ✅ Bug: reader diag JSON was computed but never surfaced (2026-09-04, build MTMON4N9)

`GatherReaderDiagnostics()` in the serialized script computed the diag block and `finalize()` put it in its
result object, but the host-side `ExtractPagesFromReader()` return statement dropped the `diag` field, so the
`[JapScan] reader diag {...}` host log never fired (only the 4 `-> N pages` lines appeared in the launch log
on build MTMN6DGP, at 09:58-10:04, all 110-114 pages, and one DownloadTask 300s timeout fired on the
drain: 23.2s run). Fixed: forward `diag: result?.diag ?? undefined` in the return. Rebuilt → MTMON4N9 served.

### ✅ Dreamland vol-24 diag run on MTMON4N9 (2026-09-04 ~11:28)

Run: `/manga/dreamland/volume-24/ -> 110 pages (drm: 0, dom: 110, selector: 0, total: 204) ... drain: 5s`.
`[JapScan] reader diag` captured at last (single run, fresh log): `win:{innerHeight 761, docScrollHeight 2617,
scrollY 1856}` (= bottom reached, window IS the scroller), `scrollers:[div.ss-list client 200 scroll 864,
div.ss-list client 200 scroll 7344]` (both horizontal dropdown lists, 7344 ≈ 204×36 = the 204-option page list,
NOT an image scroller), `images:{total 5, resolvedCDN 2, lazyUnresolved 1}` (= NO 204 placeholders in DOM;
the reader recycles nodes — only ~a screenful mounted at any instant), `buffer:{total 250, fetchCDN 108,
imgCDN 108, otherCDN 3}` (buffer FULL → overflowed; visible counts post-eviction), `select:{found, options 204,
min 1, max 203}`, `overlay false`, `drmPages 0`, `domSeen 110`.

Interpretation (both candidate theories eliminated):
1. Scroll-target theory DEAD — window scrollable and scrolled to bottom; the only inner scrollers are the
   horizontal 204-item dropdown lists.
2. Placeholder theory DEAD — DOM holds ~5 imgs, never 204 placeholders; virtualization recycles as it mounts.
3. Correction: earlier "~206 distinct CDN URLs during drain" was a miscount of duplicate CSP violation lines.
   Buffer shows ~108 fetch + ~108 img = ~110 materialized URLs — the site builds exactly the ~110 URLs we
   collect, and NEVER builds URLs for pages 111-204 in a session.
4. The only channel that could deliver the full ordered 204 (the DRM payload bootstrap) still fires 0
   (`drmPages: 0`) → DRM decode investigation is now the sole remaining path to completeness.

### ✅ DRM bootstrap dissection — why drmPages stays 0 (2026-09-04, static)

Deobfuscated `JapScan.DRM.js` + `JapScan.DRM.preload.ts` (decoders `P`/`G` extracted,
constants decoded via the files' own string tables; artifacts `.tmp/deobfuscate-drm.mjs`,
`.tmp/decode2.mjs`, `.tmp/decode3.mjs`):

- **DRMProvider methods (decoded)** : `Initialize` = `FetchWindowScript('/manga/-/', '')`
  (session warm-up) ; `CreateChapterList` = DOM scraper (querySelectorAll + computed-style
  visibility filter + chapter links) — NO payload involved ; `CreateImageLinks` =
  `FetchWindowPreloadScript(chapterURL, preload, script, 0, 30000, true)`.
- **The preload (identical in reader AND DRM window)** : patches **`String.prototype.replace`**
  with a Proxy. On any `replace` call whose RETURN value is base64 of `{"ax": [...], "pi": n}`:
  `ax.splice(parseInt(pi), 1)` (drops the honeypot at index pi), then
  `setInterval(() => window.dispatchEvent(new CustomEvent(<random 8-char name>, {detail: ax})), 250)`.
  Filter markers `_banner_` + `/e44j82.jpg` in `CreateImageLinks` match `TransformDRMPayload`'s
  exclusions → the payload format is self-consistent with the captured site structure.
- **Deployment is correct (NOT the bug)** : `app/electron/src/ipc/RemoteBrowserWindow.ts`
  `OpenWindow` writes the preload string to a temp file and sets `webPreferences.preload`
  → real Electron preload, runs BEFORE page scripts ; `contextIsolation:false` = main world
  (patch lands on the page's String) ; `nodeIntegrationInSubFrames:true` = patch installed in
  EVERY frame → **wrong-frame hypothesis EXCLUDED**.
- **Verdict (stale hook most likely; puzzle/per-batch gating still possible)** : `drmPages: 0`
  on every run (12+ across 3 days) means **no replace call in the window's lifetime ever
  returned an `{ax, pi}` payload**. The site's obfuscated reader scripts VARy between requests
  (two different anti-debug layers observed in one session: `a[f[13]][k][f[40]]` vs
  `_0x4e62f3` decoder), image tokens rotated (`xc` → `va`/`vy` in live CDN URLs), and the DRM
  provider's own window has NEVER delivered on the current site either (30s budget always
  expires) — zero evidence the hook ever fired against the current site. NOT excluded:
  (a) puzzle-gating — the decode may only run inside the `#jc-overlay` solve flow, and every
  measured run was warm (`puzzle: 0s`, `overlay: false`) so the gate was never opened;
  (b) per-batch gating — the site materializes only ~110 URLs per session, so even a working
  hook may only ever see ~110 entries, not the full 204.
- **Decisive next test (one instrumented run)** : extend `GatherReaderDiagnostics` with
  `replaceProxyActive` (`String.prototype.replace.toString()` returns the spoofed string when
  our Proxy is live vs `[native code]` if the site reverted it) + a second lightweight
  replace-wrapper counting calls whose return atob-decodes to `{ax, pi}` — carried back in the
  diag JSON. That separates stale-hook (0 payload calls, proxy active) from patch-neutralized
  (proxy gone) from puzzle-gating (payload calls appear only after a real puzzle solve).

### ✅ URL-construction probe in the reader window (2026-09-04, build MTMW5P9C)

Goal: capture every CDN URL the site itself builds (c4.japscan.foo) and the exact condition
that stops it at ~110, without changing behavior. Added to the serialized script in
`JapScan.Extract.ts` (installUrlProbe, runs at script start, report carried in the diag JSON):

- **fetch wrapper** (window.fetch): records japscan-host URLs at call time + response
  status map (no-cors opaque responses report status 0; network errors report 'err').
- **XHR wrapper** (open/send prototypes): records URL + load/error status.
- **img src setter** + **Element.setAttribute('src'|'data-src'|...)**: records every
  image mount path (data-src assignments count too).
- **IntersectionObserver** subclass: instances, roots, observe() calls, callback
  invocations, isIntersecting count — the lazy-mount mechanism.
- **MutationObserver** subclass: instances + observe() calls — node recycling.
- **error/unhandledrejection** capture (first 5): a silent throw mid-mount-loop would
  show up here.
- Report: fetch/xhr/imgSrc counts, distinct URL list (cap 300, truncated flag), 2s time
  buckets (burst-then-stall pattern), firstMs/lastMs, statuses, io/mo, errors —
  logged by the host as part of `[JapScan] reader diag {...}`.
- The walk's own page probes bypass the wrapper via a saved `nativeFetch` (captured
  before wrapping) so the measurement only sees the SITE's requests.
- Key discriminator for the run: distinct ≈ 204 but imgSrc ≈ 110 → site builds all URLs
  yet mounts ~110 (mount gating); distinct ≈ 110 → site never constructs the rest
  (payload-limited); buckets gap + error captured → exception halted the mount loop.
- Validation: executed-script syntax OK via new Function (34.4 KB, `.tmp/validate-urlprobe.mjs`),
  probe regex verified against real c4.japscan.foo URLs, tsc web clean, vitest JapScan
  24/24. Web hash MTMW5P9C served by the app dir; probe marker confirmed in HakuNeko.js.

### ✅ URL probe moved to PRELOAD time (2026-09-04, build MTMX0G41)

First instrumented run (MTMW5P9C, post-load probe) result: urlProbe all zeros (fetch/xhr/imgSrc/distinct = 0)
while buffer showed 112 fetch + 112 img CDN entries — the site's URL construction happens at page load,
BEFORE the extraction script runs (executeJavaScript is post-load), and/or through references the site
aliases at its init (obfuscator pattern), so a post-load wrapper can never see it. CORS timeline in the
same run: sparse single c4.japscan.foo fetches at 13:52:54 / 13:54:15 / 13:55:03 / 13:55:49 (~1 per 75s,
recurring site ping, unrelated to our scroll), ZERO CSP violations in this run vs the 852-line storm at
07:09 → the site's reader script variants rotate between sessions (confirmed again).

Fix: DRM_URL_PROBE_PRELOAD appended to BuildDRMPreload output (runs BEFORE any page script — real
preload), same wrappers (fetch/XHR/img-src/setAttribute/IO/MO/error) but image-only filter (japscan
host + image extension) so the extraction's own same-origin HTML probes never contaminate; exposed as
window.__jpUrlProbe.report(). Extraction script merges preload report + local post-load capture
(urlProbeReport) into diag.urlProbe. Verified: full preload syntax OK via new Function (14.3 KB,
.tmp/validate-preload-probe.mjs), sandbox run proves fetch wrapper records c4 image URLs and IGNORES
same-origin HTML fetches; extraction script syntax OK, tsc web clean, vitest JapScan 24/24. Hash
MTMX0G41 served. Next run decides: distinct ≈ 204 (site builds all, mounts ~110) vs ≈ 112 (payload-limited).

### ✅ URL-construction probe (MTMX0G41): all 204 URLs exist, mount caps at ~110
- Preload-time probe (installed before ANY page script) wrapped fetch/XHR/img.src/setAttribute/IO/MO on the reader window.
- Two runs (14:19, 14:21) → urlProbe: fetch 208, imgSrc 204, distinct 205, truncated: false. Buckets [0,214,196,...] = the whole construction is ONE burst at page init (2-6s), not progressive.
- Cross-session comparison: after dropping each run's single divergent FIRST url, the remaining **204 URLs are byte-identical and in the same order in both sessions**. The divergent head is a fetch-only warm-up (fetch 208 > imgSrc 204 by 4; distinct 205 = 204 img-assigned + 1 fetch-only). Site construction is deterministic + display-ordered.
- Yet only ~110-115 of the 204 ever fetch/mount (resource-timing buffer ≈ 110, domSeen 110-115, docScrollHeight ~2617px ≈ 5 recycled img nodes). Single IntersectionObserver on one sentinel, callback fired once; 2 silent resource errors (no message). → The ~110 cap is a MOUNT-side artifact of the reader's virtualization; the missing ~94 pages are NOT absent — their URLs exist, deterministic, in order.
- **Fix implication**: DRM channel moot for volumes. The probe's 204 img-assigned URLs (filtered of the fetch-only warm-up head) ARE the complete ordered page list. Harvest them in finalize instead of the DOM mount.
- Prev entry (MTMW5P9C post-load probe): all zeros — site aliases references at init; probe must be preload.

### ✅ Probe harvest fix (MTMXQZ87): full volume page list from the preload probe
- finalize() now adopts the preload probe's `imgUrls` (img-assigned CDN URLs, construction = display order, deterministic across sessions) as the page list when it extends the DOM result by ≥5 AND covers the announced total AND the DOM's first page sits in the probe's first 20% (order-direction anchor; reversed/offset lists fall back to DOM).
- Banner markers (_banner_, /e44j82.jpg) filtered from the probe list; DRM payload still wins when it decodes.
- ReaderExtraction + host log gain `probe: N` (pages beyond DOM). Type + tests green; builds regenerated.
- Expected next run: 204 pages (probe: ~94) instead of ~110-115.

### ✅ V24 run MTMXQZ87 (14:52-14:58) — probe: 0 malgré imgUrls 204, + timeout 300s
- Deux runs terminés : 110/114 pages, `probe: 0` alors que le diag montre `urlProbe: {fetch 206, imgSrc 204, distinct 205, imgUrls: 204 unique, statuses {fetch:200: 205}, firstMs 3311, lastMs 4035, buckets [0,390,20]}` = le site construit TOUTES les URLs en un seul burst ~700ms à +3.3s, dans un ordre déterministe inter-sessions. `localAfter` présent = c'est bien le rapport du probe preload.
- Cause du rejet : le garde `probeOrderOK` exigeait `domLinks[0]` dans les 20% premiers de probePages (match exact). Échec = soit premier img monté est un banner (_banner_ filtré de probePages → indexOf -1), soit ordre de construction ≠ ordre de montage (inversé/décalé), soit variante URL au montage (redirect/query).
- 3e run (ReaderWindow:12, 14:53:16) : AUCUNE ligne de finalize → le pire-cas des budgets internes (puzzle 180s + drain 90s + walk 100s + scroll 125s = 495s) dépasse le budget hôte FetchWindowPreloadScript ET le timeout DownloadTask (300s) → carte rouge "timed out after 300000ms". Fenêtre verrouillée (puzzle non résolu) = brûle les 300s.
- Fix (build MTN00M4F) dans JapScan.Extract.ts finalize() :
  - Ancre robuste : essaie les 5 premières URLs DOM (contourne un banner en tête), match sans query (variantes token/redirect), détecte forward (index ≤ 20%) OU reversed (index ≥ 80%, liste retournée), exige overlap ≥ 50% des pages montées présentes dans la liste probe.
  - Diag enrichi : `probeHarvest {domLen, domFirst, probeLen, anchorIdx, reversed, overlap, adopt}` → si rejet persistant, la prochaine run dit exactement pourquoi.
  - Deadline dure 240s : EXTRACT_DEADLINE clamp chaque budget de phase (waitWhileBlocked/drain/walk/scroll) et un hardTimer resolve(finalize()) inconditionnel → plus jamais de timeout 300s côté script vivant.
- Tests : tsc clean, vitest JapScan 24/24, validateur script OK (new Function), markers vérifiés dans web/build/MTN00M4F et app/electron/build/web/MTN00M4F.
- Relance : `node .tmp/launch-app.mjs`. Run attendu : `204 pages (… probe: 94, total: 204)`.

### ✅ V3 chrome-filter + probe passthrough (MTN3PIJW)

- Après V2 (MTN00M4F) : run Dreamland vol-24 → **208 pages téléchargées** (204 probe + 4 chrome), `probeHarvest {domLen:110, domFirst:[top-banner-728x90.png, donate.png, japys/image-1.jpg], probeLen:204, anchorIdx:0, overlap:0.964, adopt:TRUE}` → l'adoption a fonctionné.
- Bug n°1 : `probe` était **droppé** dans le return host de `ExtractPagesFromReader` (result?.probe manquant, `probe: 0` affiché alors que l'adoption avait eu lieu). Fix : `probe: result?.probe ?? undefined` passe maintenant.
- Bug n°2 : les 4 pages en trop étaient des images chrome du site (www host) apposées au probe list. Fix : le filtre d'append exclut tout lien dont le hostname est `location.hostname` ou `www.*` (chrome), en plus des marqueurs `_banner_`/`e44j82.jpg`. Classes `[.]` au lieu de backslashes → pas de souci d'échappement dans le script sérialisé.
- Piège d'échappement : dans le template literal sérialisé, `\/` → `/` (echo du backslash) → le regex `^https?:\/\/...` (single `\` dans le fichier) cassait la syntaxe ("Unexpected token '?'" sur le `?` après `https`). Contourné via `new URL(link).hostname` + `/^www[.]/i`.
- Tests : tsc clean, vitest JapScan 24/24, validateur `new Function` SYNTAX OK (41.7 Ko), filtre chrome vérifié (CDN append / www skip), markers dans web/build/MTN3PIJW et app/electron/build/web/MTN3PIJW.
- Run attendu : `204 pages (… dom ~110, probe: 94, total: 204)` **sans pages chrome en trop** (pas de 208).

### ✅ Confirmed: probe harvest delivers full volumes (MTN3PIJW, 2026-09-04)

Two passes on Dreamland vol-24 + two passes on Saint Seiya Dark Wing vol-7, all on MTN3PIJW:

- Pass 1 (vol-24, 17:53): `110 pages, probe: 0` — that session's preload probe captured only 165/204 URLs (site session variance: sometimes the full 204 construction burst happens, sometimes ~165), so the harvest guard (probeLen must cover announced total) correctly refused. DOM-only fallback.
- Pass 2 (vol-24, 17:58): `205 pages (drm: 0, dom: 114, selector: 0, probe: 90, total: 204)`, `probeHarvest {adopt: TRUE, probeLen: 204, overlap: 0.965}` — probe caught the full 204-URL burst; harvest adopted it; download folder `Desktop/Dreamland/Volume 24` contains exactly `1.png..204.png` (204 files). The printed 205 = 204 probe + 1 stray DOM append whose filename collided at download and deduped away.
- Passes 3-4 (Saint Seiya Dark Wing vol-7, 18:12/18:13): `157 pages (probe: 46, adopt: TRUE, probeLen: 156, total: 156)` twice — same N+1 stray-append signature.

Remaining wart: one DOM-mounted link (usually a token-refreshed remount of an already-listed page, occasionally site chrome) appends past the probe list on adopted runs → extraction returns announced+1, but the downloader dedupes by filename so folders land exact. Cosmetic; not worth chasing unless extraction-count purity matters.

### ✅ N+1 stray page dropped on adopted probe runs (`c32e7b292`, 2026-09-04)

Fixed the wart: adopted probe runs no longer return `announced+1` pages. The append filter now
excludes any link whose hostname is `location.hostname` or `www.*` (site chrome) in addition to the
`_banner_`/`e44j82.jpg` markers, and only appends when the DOM link is NOT already present in the
probe list (token-refreshed remounts of already-listed pages are dropped, not re-appended).
`OrderPageLinks` guard keeps the order stable. Tests: tsc clean, vitest JapScan 24/24.

### ✅ Version 3.0.3 declared (2026-09-04)

- Bump `3.0.2 → 3.0.3` dans les 3 manifests (`package.json`, `web/package.json`,
  `app/electron/package.json`) — vérifié par `check:versions` (CI, job ci). Le lockfile racine garde
  l'ancienne version upstream 2.1.1 (jamais synchronisée) — ne PAS le toucher.
- CHANGELOG : section `[3.0.3] - 2026-09-04` (reader-first, page-selector walk, probe harvest,
  timeout 300s, overlay résiduel, page N+1).
- README.md + README.en.md : lien Releases → `releases/tag/3.0.3`.
- MEMORY.md : header + §1 Version + ligne JapScan §3 mis à jour.
- Poussé sur `fork` (Endymi0n74/ChainsmokerNeko) → la CI publie la release "ChainsmokerNeko 3.0.3"
  (version lue depuis `app/electron/package.json`, 10 artefacts, `--latest=false`).
- ⚠️ Ne pas oublier : le bundle local `app/electron/bundle/` date de la v3.0.2 (hash MTN3PIJW era)
  — les artefacts 3.0.3 sont produits par la CI (release job), pas localement.
