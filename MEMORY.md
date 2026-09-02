# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 2 septembre 2026 (v3.0.2 — rebuild bundle multi-arch avec fix JapScan 300s)

---

## 1. Le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. **Web app** (TypeScript, Svelte + quelques composants Vue)
dans un shell **Electron** (Chromium 150, Node 26 local / 24 CI).

- **Repo** : [Endymi0n74/ChainsmokerNeko](https://github.com/Endymi0n74/ChainsmokerNeko)
- **Upstream** : `manga-download/haruneko`
- **Version** : 3.0.2 (31 août 2026) — bumpé dans les 3 `package.json` ; release/tag 3.0.2 PAS encore publiés
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
| JapScan | `JapScan.ts` | ✅ validé | DRM+scroll merge (156+ pages), poll delay 4s |
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
- **Fix pages manquantes** : FetchPages lance DRM + scroll en parallègle, fusionne et déduplique les résultats
- Scroll limit 80→500 steps, stable detection 20 steps, timeout 300s
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
- **Validation utilisateur : JapScan OK** ✅ (PDF ✅, omnibus UI ✅) — v3.0.2 en attente de re-validation (volume 24 Dreamland)

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

### JapScan « Chapter update … timed out after 15000ms » ✅ (nécessite rebuild)
- **Cause** : `STALL_TIMEOUT_MS` (15s) bornait AUSSI `Media.Update()` (résolution liste de pages), alors que JapScan ouvre un reader visible, attend le puzzle `#jc-overlay` (budget 180s dans JapScan.Extract) puis scroll en lazy-load → dépasse légitimement 15s. Les autres sites résolvent en <1s → seul JapScan échouait.
- **Fix** (`CHAPTER_UPDATE_TIMEOUT_MS = 300_000` = timeout du fetch provider reader) :
  - `web/src/engine/DownloadTask.ts` : nouvelle constante + `Media.Update()` borné par elle (avec commentaire explicatif)
  - `web/src/engine/CollectionDownloadTask.ts` : `WaitForUpdate()` (collection/omnibus) sur la même constante
  - Le stall PAR PAGE reste 15s (une image bloquée ne fige pas la file) ; un connecteur cassé reste borné (5 min max).
- **Vérifs** : `tsc --noEmit` web ✅ ; vitest `DownloadTask_test` + `DownloadManager_test` = **40/40 ✅**.
- ⚠️ À re-tester en app réelle (JapScan) + rebuild bundle requis.
- **Pré-chauffage `FetchMangas` (2 sept., après-midi)** : ouvre `/mangas/?p=1` en fenêtre visible (`FetchWindowScript(request, 'true', 2s, 300s, show)`) pour résoudre le challenge Cloudflare interactif avant la pagination HTTP ; fallback silencieux (try/catch). Intégré depuis `C:\Users\endymion\Downloads\JapScan.ts` (diff = 1 seule vraie modif). tsc ✅, eslint --fix (4× no-multi-spaces) ✅. Non committé. Notes : pas de cache session « pré-chauffé » (fenêtre rouverte à chaque ouverture) ; `2_000` = délai avant injection (le commentaire « poll interval » est imprécis) ; commentaire FR→EN.
- **Rebuild final 2 (2 sept., 16:39-16:46)** : `bundle-full-fixed.ps1` (build:web + bundle) après intégration du pré-chauffage → 6 artefacts frais (mtimes 16:40-16:46), 0 erreur, nouveau hash `MTK7DAO5`, **vérifié contenu** : `3e5` dans `DownloadTask.js` (ia32) + `mangas/?p=1`/`FetchWindowScript` dans `HakuNeko.js` (ia32 et x64). Les installateurs NSIS embarquent le même `resources/app`.
- **e2e JapScan (2 sept., 16:35-16:41)** : 🚫 BLOQUÉ — `FetchProvider_Fetch_CloudFlareChallenge` sur `jujutsu-kaisen/` et `king-game/` (8 échecs / 2 init OK, retry identique) : l'IP est challengée et le e2e tourne avec un profil temporaire vierge (pas de `cf_clearance`/extension, l'Utilisateur ne peut pas résoudre le puzzle interactif dans le timeout). Env. NON lié au pré-chauffage (le fixture teste `FetchMangaCSS` mono-URL, chemin intact). Validation runtime du pré-chauffage = manuel (ouvrir l'onglet Mangas dans l'app).

### Réparation index git (2 sept., après-midi) ✅
- **Symptôme** : `git status` montrait TOUS les fichiers en `D ` (suppression stagiée) + les mêmes en `??` (untracked), y compris des fichiers existants.
- **Cause** : le fichier `.git/index` avait DISPARU (vérifié : absent de `.git/`, `git ls-files` = 0 entrées, HEAD/objects/refs intacts, HEAD = 1dfea5555, 2945 fichiers).
- **Fix** : `git reset` (mixed, non destructif — réécrit l'index depuis HEAD, working tree INTACT) → index recréé (312 Ko), `git status --short --untracked-files=no` = 15 entrées ` M` seulement (0 suppression).
- **Vérifié** : mes modifs présentes (`CHAPTER_UPDATE_TIMEOUT_MS` dans DownloadTask.ts + CollectionDownloadTask.ts, MEMORY.md §13) + modifs préexistantes non committées (§5b/§12) intactes.
- **Suite (même jour)** : commit `0ce03b955` « chore(build): track preload vite config and ignore electron user-data » — a ajouté `app/electron/.user-data/` au `.gitignore` (CRLF respecté) et committé `app/electron/vite.preload.config.ts` (requis par `vite build --config vite.preload.config.ts`). Les 15 fichiers ` M` restants (fix JapScan, DownloadTask/CollectionDownloadTask timeouts, MEMORY.md) sont TOUJOURS non committés (choix utilisateur).
