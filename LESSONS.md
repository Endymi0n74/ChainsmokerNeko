# LESSONS.md — Leçons techniques (fork ChainsmokerNeko / Haruneko)

> Connaissances techniques : fonctionnement de la plateforme, pièges et fixes par site, CI/CD.
> Référencé depuis `MEMORY.md` (qui ne garde que l'état courant). À relire quand on touche une zone concernée.
> Les règles durables (process, git, release) sont dans `AGENTS.md`.

## Plateforme & scraping

- Connecteurs héritent de `DecoratableMangaScraper` avec décorateurs `@Common.*`
- `FetchWindowScript` / `FetchWindowPreloadScript` : ouvrent une BrowserWindow réelle (sandbox, CDP debugger) pour exécuter un script dans une page rendue.
- `AntiScrapingDetection.js` (obfusqué) : `CheckAntiScrapingDetection()` → **Interactive > Automatic > None**. Priorité détections spécifiques site AVANT l'heuristique DOM widget.
- `ChallengeReload.ts` : reload auto des challenges managés (sans widget rendu, `cf_clearance` >200 chars).
- **UA par défaut** Electron (segment `Electron/x.y.z` conservé) — fix MangaFire le 15 août.

## Cloudflare & challenges

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
- Challenge sans widget ≠ résolu pour CrunchyScan/JapScan — confirmation via `cf_clearance` requise

### ChallengeReload (`ChallengeReload.ts`)
- Poller 5s, max 3 reloads, budget partagé globalement
- Arrêt pollers au `destroy()`

### Leçons Cloudflare
- UA stripped → challenge infini (MangaFire). UA Electron native → pas de challenge.
- `cf_clearance` est `httpOnly` → lire via `Network.getCookies` (CDP), pas `document.cookie`.
- `document.hidden = true` pause le challenge (jamais `win.Hide()`).
- Délai 2.5s avant extraction: challenge finalize en 1-2s, 1s trop court.
- Widget réel (iframe) ≠ input caché `cf-turnstile-response` (toujours présent).

### WidgetGone / hadWidget / CDP Cookie Check
- `widgetGone = isChallenge && !hasRealWidget` fonctionne pour MangaFire (Turnstile disparaît après résolution)
- Le garde `hadWidget` (tracker si widget déjà vu) cassait CrunchyScan : challenge managé sans widget → `hadWidget` jamais true → jamais résolu
- Revert : retour au `widgetGone` simple + délai initial poll augmenté à 4s
- Délai 4s laisse le temps au Turnstile de charger avant le premier check
- **Fix v3.0.1+**: le revert hadWidget a aussi supprimé le CDP cookie check (`Network.getCookies` → `cf_clearance`). Sans ce fallback, JapScan était bloqué car le Turnstile interactif reste dans le DOM après résolution (`hasRealWidget=true` → `widgetGone=false`). Restauration du CDP check avec timeout 5s (`Promise.race`) pour ne pas bloquer le loading screen
- Parenthesization fix: `widgetGone || (CF gone && antiScraping None)` — widgetGone seul peut contourner la détection site

## Sites

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
- Challenge Turnstile vit dans un sous-frame (jamais visible dans DOM parent)
- Détections spécifiques > heuristique DOM
- Cache DRM par URL chapitre = 1 seule fenêtre popup max
- **Fix fenêtres multiples** (`ac6064a0`): cache DRM `drmCache` par URL chapitre
- FetchImage retry 3× backoff 1s/2s, timeout 30s
- IP peut être marquée par Cloudflare → validation humaine requise
- Le `ReloadStalledCloudFlareChallenge` ne doit tourner QUE pour le mode `Automatic`. En mode `Interactive`, un reload reset le Turnstile et crée un loop visible (fenêtre qui clignote). Le reload est maintenant déclenché uniquement dans le case `Automatic` du switch.
- En mode `Automatic` + `ShouldUseForkChallengeHandling`, il faut `win.Show()` pour que le challenge Cloudflare puisse se résoudre. Sans ça, le challenge tourne en background sans fenêtre → timeout → loop. JapScan et CrunchyScan ont besoin de cette fenêtre.
- Le CDP cookie check dans `PollForChallengeResolution` détecte la résolution via `cf_clearance` quand le Turnstile vit dans un subframe (DOM parent ne voit jamais le widget).
- **Validation**: listing + chapitres + pages ✅ (25 août)

### ScanManga
- **Sentinel cookies**: `Cookie: __hkn_no_session_cookies__` (consommé dans `FetchProvider.ts` → `NoSessionCookiesSentinel`)
- Cookie `sessionT` déclenche page réduite → sentinel `__hkn_no_session_cookies__`
- **API bqj**: POST `https://bqj.scan-manga.com/lel/<idc>.json`, fingerprint WebGL + effectiveType, réponse encodée `base64→gzip→reverse→base64`
- **Fix injection cookies**: `details.webContentsId === this.webContents.id` (renderer uniquement, pas les fenêtres distantes)
- **Tests**: 5/5 vert (plugin, manga, chapitre, page, image blob)

### JapScan
- Puzzle interactif (#jc-overlay) + Cloudflare Turnstile interactif
- **Reader-first extraction** : une seule fenêtre visible avec DRM bootstrap en preload ; le script protégé du site décode la liste complète des pages une fois le puzzle résolu — pas de 2e fenêtre DRM (budget 30s toujours dépassé par captcha_d.js async)
- **Page-selector walk** : quand le lazy-load drain plafonne à ~110 images malgré l'indicateur du sélecteur de pages (volume), l'extraction récupère les pages restantes en fetchant les URLs du sélecteur same-origin dans la fenêtre déjà déverrouillée (3 workers, 15s/timeout, 100s budget)
- **Source-breakdown diagnostics** : `ReaderExtraction` expose `drm`, `dom`, `selector` pour diagnostiquer d'un coup d'oeil si la récupération a échoué
- Scroll limit 500 steps, stable detection 20 steps, timeout 300s
- Cloudflare résolu via plugin navigateur (Interactive mode)

### JapScan — probe harvest & DRM (sept. 2026)
- **Plafond ~110 = artefact de MONTAGE, pas de construction** : le site construit les ~204 URLs CDN en UN burst unique à l'init de la page (~700ms à +3.3s, déterministe, ordre d'affichage, identique inter-sessions) ; le reader ne monte que ~110-115 (virtualisation : ~5 <img> recyclés, IntersectionObserver unique sur sentinel).
- **Probe obligatoirement en PRELOAD** : un wrapper post-load (executeJavaScript) ne voit RIEN (références aliasées à l'init) → `DRM_URL_PROBE_PRELOAD` (`__jpUrlProbe`) enregistre fetch/XHR/img-src/setAttribute/IO/MO, filtre image-only.
- **Harvest** (`finalize()` JapScan.Extract.ts) : adopte `imgUrls` du probe si ≥5 pages de plus que DOM + couvre le total annoncé + ancre d'ordre (5 premières URLs DOM, match sans query, forward/reversed, overlap ≥ 50%). Variante session (~165/204) → garde refuse proprement.
- **Filtres** : chrome (`location.hostname`/`www.*`), `_banner_`, `/e44j82.jpg` ; N+1 stray (remount token-refreshé) droppé (`c32e7b292`).
- **DRM payload toujours 0** (`drmPages: 0`) : le preload patche `String.prototype.replace` (Proxy) en attendant un retour base64 `{"ax":[...],"pi":n}` ; déploiement correct (preload réel, main world, tous les frames) → hook stale le plus probable, puzzle/per-batch gating possibles. Test décisif : `replaceProxyActive` (`toString()` spoofé) + compteur de calls atob→`{ax,pi}`.
- **Deadlines** : budgets internes ≈ 495s > budget hôte/timeout DownloadTask 300s → `EXTRACT_DEADLINE` 240s (clamp de chaque phase) + hardTimer resolve(finalize()) inconditionnel.
- **Console** : les logs du script d'extraction (executeJavaScript) ne remontent PAS (fenêtre séparée) → timings portés par l'objet résultat + routage `[ReaderWindow]` pour les logs du contexte page.
- **Pièges de sérialisation** : backticks dans les commentaires DANS un template literal → TS1005 ; `\/` → `/` (échappement) → `new URL(link).hostname` + `/^www[.]/i` ; `page.evaluate` = STRING pas fonction ; pas de `.then` sur wrapper SetTimeout sans vérif de type (mock vitest → objet Timeout).
- **Puzzle** : `#jc-overlay` rendu asynchrone (2e requête) → période de grâce 16s (re-poll `CheckAntiScrapingDetection` 2s) ; fin de collecte `atBottom && stable` (8 rounds) ; pause si overlay/`__captcha.needed` ; sortie anticipée si `decodedBodySize > 10ko` ; garde-fou 80 rounds.

### MangaNova
- Catalogue `/catalogue`, fiches `/manga/<slug>`, chapitres `/lecture-en-ligne/<slug>/chapitre/<n>`
- Images du lecteur extraits via payload RSC `images` du chapitre courant
- Fixture validée **93 pages** (Mechanical Buddy Universe, chapitre 1)

## Exporters (PDF / CBZ / omnibus)

### PDF (`PortableDocumentFormatExporter.ts`)
- Settings : `PDFTheme` (White/Sepia/Dark) + `PDFDoublePage` (double-page spread)
- Double-page : chaque image = moitié du spread (halfWidth), gutter central, centrage vertical
- Écritures stream explicites (pas de promesses flottantes dans events `data`)

### CBZ (`ComicBookArchiveExporter.ts`)
- Écriture image-par-image dans le zip stream (pas de buffer mémoire complet)
- Fermeture/abort propre du writable si échec mid-stream

### Omnibus / Collection (`CollectionDownloadTask.ts` + `CollectionExporter.ts`)
- Regroupe plusieurs chapitres en un seul volume CBZ/EPUB/PDF
- Dossier par chapitre dans l'archive, fallback nom `Chapter-N`
- Chapitres en échec `Update()` ignorés ; si aucun chargé → tâche échoue
- UI : menu Download → « Download selected as omnibus (N) » + menu contextuel
- `WaitForUpdate()` sur `CHAPTER_UPDATE_TIMEOUT_MS` (300s) pour l'Update des chapitres

## CI/CD & bundling

- `path.join()` vs `path.resolve()` dans les scripts de bundle : quand 7z reçoit un `cwd` alternatif, `path.join()` crée un chemin relatif à ce cwd au lieu du répertoire cible. `path.resolve()` résout depuis le process cwd, ce qui est correct.
- `merge-multiple: true` requis sur `download-artifact` pour fusionner les artefacts dans un seul dossier (sinon sous-dossiers par artifact → glob `release-bundles/*` ne les trouve pas).
- `checkout` doit être AVANT les `download-artifact` (sinon le checkout écrase les artefacts téléchargés).
- Les espaces dans les noms de fichiers cassent le glob bash `bundle/*` → utiliser `find` + `mapfile` pour lister explicitement.
- Le snap build nécessite `snapcraft` (absent du runner Ubuntu) → skip avec `command -v snapcraft || exit 0`.
- `build-app.mjs` fait `purge(dirBuild)` → efface `main.js` et `preload.js` de Vite. **Ordre obligatoire** : `build-app.mjs` D'ABORD (copie web/build + package.json), puis `vite build` APRÈS (crée main.js + preload.js).

- `PatternLinkGenerator` est infini (`for (let page = start; true; page++)`). `isMissingLastItemFrom` compare le dernier élément entre pages — si le site retourne des items différents à chaque page (pas de pagination triée), la comparaison ne matche jamais → **loop infini → 3+ Go de RAM**. Fix : ajouter `maxPages` au decorator `MangasMultiPageCSS` (défaut 0 = infini) + throttle + break si page vide.
- Bundle Windows local : NSIS portable via `MAKENSIS`, cache Electron partagé `HAKUNEKO_ELECTRON_CACHE` ; `npm run bundle` NE reconstruit PAS web (copie `web/build`) → `build:web` d'abord, vérifier le fix DANS les artefacts (esbuild minifie : `300000`→`3e5`).
- PATH machine Windows : guillemets nus dans le PATH registre cassent tous les lifecycle npm imbriqués ; filtre via `.tmp/fix-machine-path.ps1` ; le shell agent garde un PATH obsolète → `export PATH="$(echo "$PATH" | tr -d '"')"`.
