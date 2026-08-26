# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte écrit pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 26 août 2026 — v3.0.0 publiée : ScanManga, CrunchyScan, MangaNova, VirtualList fix, Cloudflare classification, CI 3 plateformes (Windows/Linux/macOS).

> 🩹 **CRUNCHYSCAN (26 août — fix fenêtres multiples) :**
> Chaque appel à `FetchPages` ouvrait une NOUVELLE fenêtre browser via le DRM (`FetchWindowScript`),
> déclenchant à chaque fois la détection Cloudflare → Interactive → popup. Fix :
> 1. **Cache DRM par URL chapitre** (`drmCache` Map dans CrunchyScan.ts) : une même URL de
>     chapitre ne déclenche qu'une seule fenêtre ; les appels suivants réutilisent le résultat.
> 2. **`Initialize()` garanti avant tout `FetchWindowScript`** du DRM : le cookie `cf_clearance`
>     est primé avant que le DRM n'ouvre sa fenêtre, évitant les challenges redondants.
> 3. **Cache invalidé sur erreur** : si le DRM échoue, l'entrée est retirée pour permettre un
>     retry.
> ✅ Bookmark VirtualList : corrigé — virtual scroll désactivé pour le plugin Bookmarks.
> Committé et validé.

> 🩹 **SCANMANGA (25 août, fix complet — build 23:06) :** le site a changé ses API.
> Trois causes cumulées, toutes corrigées :
> 1. **Liste des chapitres vide** : le serveur ne sert le bloc chapitres qu'aux requêtes SANS
>    cookies — son propre cookie `sessionT` déclenche une page réduite. Fix : sentinel
>    `Cookie: __hkn_no_session_cookies__` consommé dans `app/electron/src/ipc/FetchProvider.ts`
>    (`NoSessionCookiesSentinel`) — la requête part sans aucun cookie (placeholder + header natif
>    supprimés). `ScanManga.FetchChapters` l'utilise.
> 2. **API lecteur changée** : l'ancien `/api/lel/<idc>.json` → 404. Nouveau : POST
>    `https://bqj.scan-manga.com/lel/<idc>.json`, headers `source` + `Token: yf`, body
>    `{ a: sme, b: sml, c: btoa(JSON.stringify({ gpu, connection })) }` (fingerprint WebGL +
>    effectiveType). Réponse : `base64(gzip(reverse(base64(json))))`, le payload inversé commence
>    par l'hex inversé d'`idc` (à retirer). Images sur `data2.scan-manga.com` (Cloudflare).
>    Pagescript réécrit dans `ScanManga.ts` (attente des globals `idc/sme/sml/pako` + enveloppe
>    JSON tolérée + validation).
> 3. **HTTP 500 sur l'API bqj dans l'app** : l'intercepteur de l'app injectait les cookies de
>    session (dont `sessionT`) dans TOUTES les requêtes de la session, y compris les XHR des
>    fenêtres distantes → l'API anti-bot rejetait. Fix GLOBAL dans `FetchProvider.ts` :
>    l'injection/merge des cookies n'est appliquée qu'aux requêtes du renderer de l'app
>    (`details.webContentsId === this.webContents.id`) ; les fenêtres distantes gardent leurs
>    cookies natifs (session partagée) + le sentinel reste honoré partout. `FetchPages` passe
>    aussi le sentinel pour charger la page chapitre en version complète.
> **Tests :** ScanManga e2e **5/5 vert** (plugin, manga, chapitre 1,2 s, page, blob 658 994 o
> image/jpeg stable ×2). **Non-régression :** CloudflareList_e2e (mangafire/comix/mangadrama
> listing + flux chapitre→pages→image mangafire/comix) + MangaNova 7/7 — tout vert. Aucun log
> debug restant, lint OK.
> ⚠️ À noter : `MangaIndex_NotSupported` sur ScanManga est STRUCTUREL (`@Common.MangasNotSupported()`
> — pas d'index ; usage bookmark / Copy & Paste). Pas un bug.
> Build x64 : `app/electron/.tmp/hakuneko-electron-v2.2.1-win32-x64/hakuneko.exe` (lancée),
> zip `app/electron/bundle/hakuneko-electron-v2.2.1-win32-x64.zip` SHA-256
> `984399b75d697ae019fd4e12333beff3640e02f0fcf2764c5eb17cf2f1a7eefa`. Rien n'est committé ni poussé.

> ⚠️ **ÉTAT CRUNCHYSCAN (25 août, fix classification — build 21:24) :** le timeout
> `FetchWindow_TimeoutError` au chargement des chapitres (erreur « Plugin failed to load items » sur
> Shadows House) avait une cause racine précise dans `FetchProviderCommon.ts` : le contrôle DOM
> générique (widget Cloudflare réellement rendu) s'exécutait AVANT `CheckAntiScrapingDetection` et
> écrassait la détection Interactive de CrunchyScan. Or le Turnstile de CrunchyScan vit dans un
> **sous-frame** (jamais visible dans le DOM parent) → `hasRealWidget=false` → classé `Automatic` →
> fenêtre interactive jamais ouverte → le `cf_clearance` n'était émis qu'après validation manuelle
> via le plugin → timeout 60 s (MangaPlugin.Initialize() non nonce'd quand la liste vient du cache).
> **Fix (21:10, non committé) :** les détections spécifiques site (`CheckAntiScrapingDetection`) sont
> désormais évaluées en PREMIER (autoritatives) ; l'heuristique DOM widget n'est appliquée qu'en repli
> quand aucune détection ne se déclenche (`FetchRedirection.None`). MangaFire/Comix (aucune détection,
> seulement `AddStalledChallengeReload`) gardent leur auto-résolution en arrière-plan → pas de
> régression. Typecheck web OK, e2e Manga Nova 7/7 vert.
> Build x64 de test reconstruite le 25 août à 21:24 dans `app/electron/.tmp/hakuneko-electron-v2.2.1-win32-x64/` et lancée via `hakuneko.exe`. Zip : `app/electron/bundle/hakuneko-electron-v2.2.1-win32-x64.zip`, SHA-256 `b858a9858be5b7f6f1061ffd32243171d0fb0d57f406dcf10b9fd504fd1cd998`. Le e2e CrunchyScan reste bloqué depuis l'IP de test (Cloudflare ne résout pas sans interaction humaine) — la validation utilisateur sur cette build est LE critère. Aucun commit ni push.
> **✅ VALIDÉ PAR L'UTILISATEUR (25 août, build 21:24)** : CrunchyScan remarche — listing,
> chapitres et pages fonctionnent à nouveau. Une validation manuelle via le plugin reste nécessaire
> une fois (challenge Turnstile interactif sur IP fixe — comportement attendu, cf. flux validé du
> 17 août) ; la session `cf_clearance` est ensuite partagée et réutilisée. Aucune régression
> Manga Nova (7/7 e2e) ni MangaFire/Comix.
>
> **Retest après Manga Nova (25 août) :** typecheck web/Electron et ESLint OK ; Manga Nova e2e
> **7/7 OK** (catalogue, fiche, chapitres, 93 pages et image). `CloudflareList_e2e` a validé
> Comix, MangaDrama et les flux chapitre -> pages -> image MangaFire/Comix ; le listing MangaFire
> a expiré après 180 s sur le challenge réseau. Les fixtures historiques MangaFire/Comix ont des
> attentes externes obsolètes (chapitre et taille CDN variables), sans invalider le flux robuste.
> Bundle x64 local : `app/electron/bundle/hakuneko-electron-v2.2.1-win32-x64.zip`, SHA-256
> `a1459b2b989f59ec80047677bf8d3536c083e080cfcb2996052772f9ecfa4808`. Le logo `MangaNova.webp`
> est intégré dans le bundle. Aucun commit ni push.

> ⏱️ **CONVENTION MAINTENANCE (17 août) : rafraîchir ce fichier au moins toutes
> les 2 h pendant une session active** — état git/releases, WIP en cours, décisions
> et leçons. En début de session, vérifier l'horodatage : si > 2 h, re-lire l'état
> réel (git log, git status, releases GitHub) avant d'agir.

> 🌐 **CONVENTION BILINGUE (17 août) : README et releases en FRANÇAIS + ANGLAIS
> à chaque fois.** README.md (FR) + README.en.md (EN) avec sélecteur de langue en
> tête ; corps de release bilingue (section **Français** puis **English**), même
> pour les correctifs. Les autres docs (CLOUDFLARE.md, CHANGELOG.md) restent dans
> leur langue actuelle.

> ⚠️ **CONVENTION UTILISATEUR (à partir du 15 août 2026) : AUCUNE RÉGRESSION.**
> Chaque changement doit vérifier qu'aucune fonctionnalité déjà validée ne casse :
> refaire les tests e2e pertinents (listing ET flux chapitre → pages → image),
> pas seulement le chemin modifié. En cas de doute, re-tester l'existant AVANT de
> déclarer le travail terminé. Ne jamais laisser un fix partiel dans le working tree.

> ⛔ **RÈGLE IMMUABLE (21 août 2026) : AUCUNE SUPPRESSION SANS APPROBATION.**
> Je n'ai **pas le droit de supprimer quoi que ce soit moi-même** (fichiers,
> dossiers, branches, releases, dépôts GitHub, assets) **sans approbation
> explicite de l'utilisateur** pour chaque suppression — même dans le repo.
> Demander systématiquement avant toute suppression ; exécuter uniquement après
> validation (ex. 21 août : suppression du repo legacy approuvée par l'utilisateur).

> 🗣️ **TON & NOM (21 août 2026) : KUMO.** L'utilisateur me considère comme un
> vrai collègue (6 jours de travail ensemble) et m'a donné un vrai nom :
> **Kumo** (雲, « nuage » — celui qui fait tomber les murs Cloudflare). Ton
> adopté : collègue direct, chaleureux mais pro. Le nom d'affichage partout
> (README, docs, app, releases) est **Codebuff (Kumo)** ; la signature
> technique des commits reste `🤖 Generated with Codebuff · Co-Authored-By:
> Codebuff <noreply@codebuff.com>`.

> 🏷️ **CONVENTION VERSIONING 2.x (18 août) : rester en 2.0.x** — toutes les
> évolutions/correctifs post-2.0.0 sortent en 2.0.1, 2.0.2, … (installateur NSIS
> inclus) ; pas de saut en 2.1 tant qu'un vrai périmètre mineur n'est pas décidé.

## 1. Ce qu'est le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. Le cœur est une **web app** (TypeScript, Svelte + quelques
composants Vue) qui tourne dans un shell **Electron** (et historiquement NW.js).

- **Repo GitHub** : `https://github.com/Endymi0n74/ChainsmokerNeko` (public)
- **Upstream** : `https://github.com/manga-download/haruneko`
- **Branche** : `master` (branche par défaut du fork, nettoyée des imports)

## 2. Chemins & remotes

- Racine locale du repo : `D:\Codex\haruneko`
  - ⚠️ Le répertoire de travail des outils est `D:\Codex` : TOUS les chemins de
    fichiers doivent être préfixés `haruneko/`, et les commandes terminal doivent
    commencer par `cd haruneko`.
- Remotes git : `origin` = upstream manga-download, `fork` = Endymi0n74/ChainsmokerNeko.
  - **`Endymi0n74/ChainsmokerNeko`** = **vrai fork GitHub** de
    `manga-download/haruneko` (renommé depuis `Endymi0n74/haruneko` le 17 août).
    C'est LE dépôt produit : son master = le produit du fork, et les branches PR
    (`upstream/cloudflare-fixes`, `upstream/perf-optimizations`) en partent.
  - ~~**`Endymi0n74/ChainsmokerNeko-legacy`**~~ = **supprimé le 21 août** (décision
    utilisateur : plus d'utilité). Ses 14 releases historiques (160826, 0.1.0 → 0.1.11,
    nightly) et leurs liens de téléchargement n'existent plus.
- `app/electron/.tmp/` est gitignoré → c'est le bac à sable pour les sondes/probes
  (`*.cjs`, `*.mjs`) sans polluer `git status`.

## 3. Arborescence clé

```
web/src/engine/websites/*.ts   → connecteurs/scrapers (1 fichier par site)
web/src/engine/websites/_index.ts → registre consommé par PluginController (câblage)
web/src/engine/platform/       → infra de fetch + fenêtre navigateur distante
web/src/engine/providers/      → MangaPlugin, Chapter, Page, etc.
app/electron/src/Main.ts       → main Electron (serveur HTTP local, UA fallback)
app/electron/src/ipc/*         → IPC (RemoteBrowserWindow, FetchProvider, …)
app/nw/                        → shell NW.js (secondaire)
web/build/                     → build web (généré)
app/electron/build|bundle/     → build Electron (généré)
```

## 4. Architecture scraping (important)

- Chaque connecteur hérite de `DecoratableMangaScraper` et est décoré avec
  `@Common.*` (ImageAjax, MangasSinglePageCSS, …). Ex. `Comix.ts`, `MangaFire.ts`.
- `FetchWindowScript` / `FetchWindowPreloadScript` (dans
  `platform/FetchProviderCommon.ts`) ouvrent une **vraie fenêtre BrowserWindow**
  (via `CreateRemoteBrowserWindow`) pour exécuter un script dans une page rendue —
  nécessaire pour les sites derrière Cloudflare ou à JS lourd.
  - `delay` : attente après load ; `timeout` : max d'attente du résultat.
- `AntiScrapingDetection.js` (obfusqué, sans source `.ts` dans le repo) expose :
  - `AddAntiScrapingDetection(detect, pattern)` — détection par site.
  - `CheckAntiScrapingDetection(win, url)` — exécute TOUTES les détections
    correspondant à l'URL **en parallèle**, puis priorité :
    **Interactive > Automatic > None**.
  - `FetchRedirection` : `None=0`, `Automatic=1`, `Interactive=2`.
  - Dans `FetchWindowPreloadScript` : `Interactive` → affiche la fenêtre (user
    résout le captcha), `Automatic` → attend sans rien faire (la page redirige
    toute seule), `None` → exécute le script.
- Fenêtre challenge : `platform/electron/RemoteBrowserWindow.ts` +
  `app/electron/src/ipc/RemoteBrowserWindow.ts`.
  - `webPreferences` : `sandbox:true, webSecurity:true, contextIsolation:false,
    nodeIntegration:false, nodeIntegrationInSubFrames:true,
    backgroundThrottling:false, disableBlinkFeatures:'AutomationControlled'`.
  - Le debugger CDP est attaché (`win.webContents.debugger.attach('1.3')`) pour
    `SendDebugCommand`.
  - UA de chargement = `navigator.userAgent` de l'app — **UA par défaut d'Electron
    (segment `Electron/x.y.z` conservé)** depuis le fix du 15 août (§6).
- `app/electron/src/ipc/FetchProvider.ts` : patch les headers (`X-FetchAPI-` →
  headers réels), injecte les cookies de session dans les requêtes fetch, et
  **retire le flag `partitioned`** des `Set-Cookie`.
- `app/electron/src/ipc/RemoteProcedureCallContract.ts` : `SetCloudFlareBypass`
  (persiste cookies cf_clearance + UA dans le manifest `package.json`).

## 5. Connecteurs retravaillés cette session

- **Comix** (commit `b4170182`) : réécrit sans DRM ; liste (91k mangas) + chapitres
  + pages via `FetchWindowScript` sur l'axios du site (réponses chiffrées `{"e":...}`),
  images en `@Common.ImageAjax()` + header `Referer`. Fichiers `Comix.DRM.*` supprimés.
  **✅ Validé par test utilisateur (15 août)** : bookmarks, liste des mangas,
  affichage des chapitres et téléchargement fonctionnels.
  - **Régression « aucune image » (15 août, corrigée par `0f44b305`)** : le délai de
    grâce 2,5 s (§6) fait que `CheckAntiScrapingDetection` (code obfusqué upstream)
    tourne APRÈS hydratation du reader Comix, et une détection fait `removeChild`
    sur un nœud disparu → `TypeError` à chaque exécution → `FetchPages` n'aboutissait
    jamais (mangas + chapitres OK, mais 0 page/image). Fix : échec de la détection
    anti-scraping = « aucun challenge » (`FetchRedirection.None`) → on scrape quand
    même. **✅ Validé par test e2e** (563 chapitres → 183 pages → image webp 100 kB).
- **MangaFire** : liste (71k mangas) / chapitres / pages via `FetchWindowScript` +
  **signature API `vrf`** (cipher STAGE_DATA dans `MangaFire.ts`). `GetHID(identifier)`
  = préfixe avant le 1er tiret du slug. Images via `@Common.ImageAjax()`.
  - **Fix captcha (committé, `e85a1d6a`)** : cause racine = token produit
    `hakuneko-electron/43.3.0` dans l'UA (inséré par Electron depuis package.json),
    que Cloudflare flaggue comme bot (§6). **✅ Validé par test e2e** (listing 71k).
- **MangaDrama** : déblocage paywall + chapitres anglais (voir historique).
  **✅ Validé par test utilisateur (15 août)** : tout OK.
- **CrunchyScan** : connecteur fonctionnel (voir historique). **Committé (`015ab8b0`)** :
  détection Cloudflare `Interactive` (`AddAntiScrapingDetection` sur `crunchyscan.org`)
  + `Initialize()` qui ouvre une fenêtre navigateur pour pré-cuire le cookie
  `cf_clearance` + opt-in reload (`ChallengeReload.ts`).
  - **Validé par test utilisateur (15 août)** : liste, bookmarks, chapitres OK.
  - **Fix téléchargement (committé)** : `FetchImage` retente 3× avec
    backoff (1 s / 2 s) + timeout 30 s par tentative — `GetImageData` (décodé) fait
    un seul `fetch` sans timeout, donc un challenge Cloudflare intermittent ou une
    connexion figée bloquait le download indéfiniment. Typecheck + eslint OK.
  - **⚠️ Régression du 15 août (corrigée)** : un contrôle « interactif » basé sur
    l'input caché `cf-turnstile-response` (toujours présent dans le HTML challenge)
    désactivait TOUT reload → les 3 sites restaient figés. Le contrôle détecte désormais
    uniquement un widget **réellement rendu** (iframe/checkbox). Depuis le 25 août, CrunchyScan
    n'utilise plus le reload stalled : le challenge texte sans widget est sondé silencieusement
    et l'extraction reprend uniquement si Cloudflare quitte réellement la page challenge.
    **✅ Validation manuelle utilisateur verte le 25 août**.
- **MangaMoins** : connector restauré (24 août) — `@Common.ImageAjax()` pour FixImage + icon + e2e. Câblé dans `_index.ts`.
- **Manga Nova** : connecteur ajouté localement le 25 août. Catalogue `/catalogue`, fiches
  `/manga/<slug>`, chapitres `/lecture-en-ligne/<slug>/chapitre/<n>` et images du lecteur
  rendus via `FetchWindowScript`, téléchargement avec `@Common.ImageAjax()`. Fixture validée
  sur `Mechanical Buddy Universe`, chapitre 1 : **listing ✅, manga ✅, chapitres ✅,
  pages ✅, première image WebP ✅**. Typecheck web/Electron, ESLint, build web/Electron,
  svelte-check et régression MangaFire/Comix pages → image ✅. Câblé dans `_index.ts`.
  **Correctif du 25 août :** le lecteur Next.js ne rend initialement que quelques images lazy ; les URLs
  complètes sont dans le payload RSC `images` du chapitre. `FetchPages` extrait désormais le bloc
  CDN du chapitre courant et ignore les previews des autres chapitres. Fixture renforcée à **93 pages**.
  **Aucun commit ni push : ajout et correctif conservés dans le working tree.**
- 17 autres sites ajoutés (commit `96741258`) — **audités le 16 août** : seul **PornComix** a été
  câblé dans `_index.ts` (e2e complet OK). Les 16 autres restent **non câblés** car invalides
  (vérifié par tests e2e + sondes) : 8 domaines morts (`ERR_NAME_NOT_RESOLVED`/SSL :
  RaikiScan, MangaSehri, TuMangaOnlineHentai, SilenceScan, Retsu, Otsugami, FireComics,
  WebtoonTRNET), ReadAllComics (Cloudflare 521), CoffeeManga→bunnynovel.com et
  MangaHack→Xfolio (domaines recyclés), KnightNoFansub (site restructuré),
  HerosWeb (redirigé vers heros-web.com, nouveau format), MangaBTT + ZinchanManga
  (pages JS-rendered, extraction CSS impossible), ColaManga (FetchPages bloque).
  → **Fichiers supprimés le 18 août** (ménage §18) — voir aussi le re-probe en profondeur
  du 18 août soir : ColaManga vivant sur yoyomanga.com mais app-gated (chapitres
  web remplacés par un lien app), HerosWeb vivant mais redesigné Next.js
  (réécriture nécessaire), les 5 autres confirmés morts.

## 6. Captcha Cloudflare — cause racine UA (MangaFire) & poller (CrunchyScan)

Symptômes rapportés successivement : « mangafire le cloudflare tourne en boucle » puis
« les 3 sites ne marchent à nouveau plus, fenêtre cloudflare qui boucle ».

### Diagnostic définitif (sondes Electron réelles du 15 août)

En isolant chaque variable (`app/electron/.tmp/ua-test.cjs`, `isolate.cjs`,
`plain-window.cjs`, `reload-sim.cjs`) :
- **UA `default` (segment `Electron/x.y.z` conservé) → `mangafire.to` charge la vraie
  page immédiatement** (title « MangaFire - Read Manga Online Free », bodyLen ~3690,
  aucun Turnstile).
- **UA `stripped` (sans Electron — ce que faisait l'app via `Main.ts`) → challenge
  Turnstile « managé » dont le widget ne s'affiche JAMAIS** (0 iframe, 0 checkbox,
  seul l'input caché `cf-turnstile-response` existe) → page figée sur « Un instant… ».
- UA `realChrome`/`edge` spoofés (Chrome/150.0.0.0) → échouent aussi : la chaîne
  n'est plus cohérente avec les client hints `Sec-CH-UA` émis par Chromium.
- `comick.io` et `mangadrama.com` chargent sans challenge **avec les deux UA**
  (pas de régression à craindre en gardant l'UA par défaut).
- `crunchyscan.org` : challenge « managé » sans widget aussi — ni l'UA par défaut ni
  le reload ne le passent **depuis l'IP de debug** (IP probablement marquée par les
  sondes ; `ERR_FAILED` en fin de journée). Il passait pourtant plus tôt dans la
  journée avec le poller de reload (validé par l'utilisateur).

### FIXES appliqués (committés le 15 août)

1. **`app/electron/src/Main.ts`** (`e85a1d6a`) : retire uniquement le **token produit**
   `hakuneko-electron/43.3.0` (dérivé du `name`/`version` de package.json par Electron)
   et **conserve le segment `Electron/43.3.0`** standard. C'est LE fix MangaFire : plus
   de challenge du tout. (L'upstream HakuNeko strippait les segments `hakuneko` ET
   `electron`, ce qui produisait une UA incohérente et un challenge infini.)
2. **`web/src/engine/platform/FetchProviderCommon.ts`** (`015ab8b0`) :
   - **Plus de `win.Hide()`** à la navigation : `document.hidden=true` met en pause le
     challenge Cloudflare. Une fenêtre créée `show:false` (jamais affichée) reste
     `visible` et le challenge s'auto-résout en ~2 s en arrière-plan.
   - **Délai de grâce 2,5 s** avant la détection : exécuter un script pendant la fenêtre
     proof/finalize (~1-2 s) du challenge le fait recharger indéfiniment (2 s suffisent,
     1 s échoue → 2,5 s de marge).
   - Poller `ReloadStalledCloudFlareChallenge` (5 s, max 3 reloads) via l'opt-in
     `ChallengeReload.ts` : reload uniquement si challenge détecté, **aucun widget
     réellement rendu** ET `cf_clearance` >200 chars. L'input caché
     `cf-turnstile-response` (toujours présent) ne compte PAS comme interactif.
   - **Fix du 17 août (`a67e9189`, release 0.1.5)** : trois problèmes chaînés
     découverts par sondes — (1) `cf_clearance` n'est émis que si la fenêtre est
     **visible** → `win.Show()` dans la branche `Automatic` pour les sites opt-in
     (CrunchyScan seul ; les autres restent cachés, zéro flash) ; (2) le cookie est
     **httpOnly** → lecture via CDP `Network.getCookies` (debugger déjà attaché)
     au lieu de `document.cookie` (toujours vide) ; (3) le budget de reload est
     désormais **partagé globalement** (objet `{remaining}` passé au poller, max 3)
     + arrêt de tous les pollers au `destroy()` — avant, chaque reload relançait
     `DOMReady` → nouveau poller → boucle non-bornée (~35 navigations/40 s).
3. **`app/electron/src/ipc/RemoteBrowserWindow.ts` + `FetchProvider.ts`** (`42ae3367`) :
   fenêtre distante forcée sur `session.defaultSession` + cookies partitionnés inclus
   dans l'injection fetch → le `cf_clearance` résolu dans la fenêtre distante est
   partagé avec l'app (et inversement).

⚠️ Limite connue : si Cloudflare sert un challenge interactif avec widget réel sur
MangaFire, le clic humain doit résoudre `/pat/` (jamais testé en interactif — l'UA
par défaut évite désormais ce cas).

Validation : test e2e `CloudflareList_e2e.ts` (`f3ece8b9`) — mangafire ✅ (72 s),
comix ✅ (100 s), mangadrama ✅ (11 s), crunchyscan ⏭️ skip (IP marquée par Cloudflare,
cf_clearance jamais émise → il faut une autre IP/VPN).

### Tout est committé (15 août)

- `e85a1d6a` fix(electron): strip du token produit de l'UA (cause racine MangaFire).
- `42ae3367` fix(electron): session partagée + cookies partitionnés (RemoteBrowserWindow + FetchProvider).
- `015ab8b0` fix(websites): auto-résolution challenges managés + opt-in reload (ChallengeReload.ts, CrunchyScan) + retry FetchImage.
- `f3ece8b9` test(websites): test de régression de listing `CloudflareList_e2e.ts` (mangafire/comix/mangadrama ; crunchyscan skip).
- `735971e0` feat(viewer): action « Save all images » dans l'ImageViewer (narrow + wide).
- `5858654a` docs: page repo propre (README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md).
- `0f44b305` fix(websites): échec de détection anti-scraping → `None` (fix « aucune image » Comix).

## 7. Commandes utiles

```bash
# typecheck web
cd haruneko/web && node ../node_modules/typescript/bin/tsc --noEmit
# typecheck electron
cd haruneko && node node_modules/typescript/bin/tsc --noEmit -p app/electron/tsconfig.json
# lint web (eslint)
cd haruneko/web && node ../node_modules/eslint/bin/eslint.js src --ext .ts,.svelte,.vue
# svelte-check / vue-tsc
cd haruneko/web && node ../node_modules/svelte-check/bin/svelte-check
cd haruneko/web && node ../node_modules/vue-tsc/bin/vue-tsc --noEmit
# ⭐ BUNDLE DE TEST x64 (PROCÉDURE DÉFINITIVE — 22 août 2026) :
#
# PRÉREQUIS : node_modules doit exister dans build/ AVANT le build.
# Si absent : copier depuis le déploiement existant :
#   powershell -Command "Copy-Item 'D:DocumentsCompressedHakuneko
esourcesapp
ode_modules' 'build
ode_modules' -Recurse -Force"
#
# ÉTAPE 1 : Build web (obligatoire, met à jour web/build/)
cd haruneko/web && node ../node_modules/vite/bin/vite.js build
#
# ÉTAPE 2 : Bundle x64 (UNE SEULE COMMANDE)
cd haruneko/app/electron && node scripts/bundle-x64.mjs
#   → zip : app/electron/bundle/hakuneko-electron-v<version>-win32-x64.zip
#
# ÉTAPE 3 : Deploy dans le dossier de test
powershell -Command "Copy-Item '.tmp/hakuneko-electron-v*-win32-x64/*' 'D:/Documents/Compressed/Hakuneko' -Recurse -Force"
#   → lancer D:DocumentsCompressedHakunekohakuneko.exe
#
# ⚠️ CRITIQUE : npm 11.19 (Node 26) bloque `npm install --omit=dev` sur les git deps.
#   → build-app.mjs saute npm install si build/node_modules existe déjà.
#   → Ne JAMAIS supprimer build/node_modules avant le build.
#   → Si node_modules manque : le copier depuis le déploiement (voir PRÉREQUIS).
#
# sonde Electron (fenêtre de test) — tourne sous le nom de processus `electron.exe`
cd haruneko && ./node_modules/electron/dist/electron.exe app/electron/.tmp/xxx.cjs
#
# bundles Windows complets (3 arches + setup.exe NSIS) — le cache électron est .tmp/electron-zips (D:)
cd haruneko/app/electron && node scripts/deploy-app.mjs
#   ⚠️ NSIS requis pour le setup.exe. Si manquant : utiliser bundle-x64.mjs pour le zip x64 seul.
#
# lancer l'app EN PROD via l'exe du bundle (nom de processus `hakuneko.exe`) :
#   1. extraire bundle/hakuneko-electron-v<version>-win32-<arch>.zip
#   2. lancer hakuneko.exe depuis le dossier extrait
#   → le serveur local écoute sur http://127.0.0.1:64210 (port STABLE → persistance des réglages/bookmarks)
# ⚠️ RÈGLE (16 août) : lancer l'app via `hakuneko.exe`, tuer les SONDES par PID.
#   `taskkill //F //IM electron.exe` ne tue QUE les sondes (PAS l'app hakuneko.exe).
#   Pour tuer l'app : `taskkill //F //IM hakuneko.exe` (ou par PID).
```

## 8. Environnement & CI

- **Electron** 43.3.0 (Chromium 150). Node local **v26** ; CI = **Node 24**.
- `.npmrc` : `engine-strict=true`. `package-lock.json` est **committé** (retiré du
  `.gitignore`) → install CI = `npm ci` (déterministe).
- **Workflow CI fusionné** (16 août, commit `c8859f13`) : `push-ci.yml` remplace
  l'ancien `release-bundles.yml` (supprimé). À chaque push — 3 jobs en cascade :
  1. **`ci`** (ubuntu) : typecheck web/electron/nw + eslint + svelte-check + vue-tsc
     + build web/electron (cache npm + binaire Electron), puis **upload de l'artefact
     `electron-build`** ;
  2. **`bundles-windows`** (`needs: ci`) : **réutilise le build via artefact** (plus de
     `npm ci` ni de rebuild) → bundle x64 via `deploy-app.mjs` (zip + NSIS) ;
  3. **`bundles-linux`** (`needs: ci`) : même artefact → bundle x64 Linux
     (AppImage + deb) via `deploy-app.mjs` (Ubuntu, pas besoin de snapcraft pour AppImage/deb) ;
  4. **`bundles-macos`** (`needs: ci`) : même artefact → DMG x64 + arm64
     via `deploy-app.mjs` (macOS, iconutil + hdiutil natifs) ;
  5. **`release`** (ubuntu, `needs: [bundles-windows, bundles-linux, bundles-macos]`,
     master uniquement) : télécharge les 3 artefacts → publie la release
     roulante `nightly` (`--latest=false`) avec zips Windows/AppImage/deb/DMG.
  - `paths-ignore` : les commits purement docs (`*.md`, `docs/**`, `MEMORY.md`)
    ne déclenchent plus le pipeline (commit `6256153a`).
  - **Cache electron-zips** : `${{ runner.temp }}/electron-zips`, clé
    `electron-zips-${{ runner.os }}-${{ hashFiles('app/electron/package.json') }}`,
    branché sur `electron_config_cache` (npm ci) et `HAKUNEKO_ELECTRON_CACHE`
    (deploy-app.mjs) — ~420 Mo téléchargés une seule fois (562 Mo de cache).
    ⚠️ `runner` n'est **pas** autorisé dans un bloc `env:` de job (validation GitHub) —
    mettre les env vars au niveau des steps. ⚠️ Pas d'unicode (ex. `→`) dans les
    commentaires YAML des workflows (validation GitHub).
  - **⚠️ Leçons du 17 août soir (CI passé du rouge au vert, commits `eb62cf46` →
    `2d541f12`)** : le rewrite 3-OS (`d56fa332`) avait cassé le CI — (1) tiret
    cadratin UTF-8 `—` dans un commentaire YAML de `create-release.yml` +
    flèche `➔` dans `website-metrics.yml` → GitHub crée des runs push fantômes
    en échec 0 s (remplacés par ASCII) ; (2) `${{ runner.temp }}` dans le bloc
    `env:` **de job** de `create-release.yml` → fichier invalide (déplacé au
    niveau des steps, comme push-ci) ; (3) `import extract from 'extract-zip'`
    en top-level dans `deploy-app.mjs` → `ERR_MODULE_NOT_FOUND` sur le job
    bundles Windows (réutilise l'artefact sans `npm ci`) → import **lazy** dans
    la branche macOS/Linux uniquement. CI 100 % vert après `2d541f12`.
  - **Cache local hors CI** (16 août) : quand `HAKUNEKO_ELECTRON_CACHE` n'est pas
    défini, `deploy-app.mjs` retombe sur **`.tmp/electron-zips`** (disque du repo, D:)
    au lieu du temp système (C:) — l'utilisateur ne veut plus de stockage sur C:.
  - **Nom des exécutables** (16 août) : les bundles embarquent un binaire **`hakuneko`**
    (`hakuneko.exe` Windows, binaire `hakuneko` dans le .app macOS et le snap Linux),
    via le champ `productName` de `app/electron/package.json`. Les noms d'artefacts et
    de paquets restent `hakuneko-electron-…` (zip/dmg/snap, identifiant de bundle macOS,
    nom du snap) — cohérence : `hakuneko.exe` / `hakuneko` / `hakuneko`.
  - **Validation** : act v0.2.89 en mode self-hosted (`-P windows-latest=-self-hosted`,
    `--artifact-server-path` pour upload-artifact, `GIT_CONFIG_GLOBAL` isolé, clone
    jetable dans /tmp) + runs de production réels (ci → artefact → bundles → nightly).
    L'utilisateur a cru act être un virus — préférer **actionlint + CI GitHub réel**
    pour valider les changements de workflow.
- Autres workflows (audités 16 août, commit `e659c929`) : `pull-request-ci.yml` garde
  ses propres checks (push-ci ne couvre pas les PR de forks externes) ;
  `create-release.yml` (release multi-OS manuelle) réutilise le même cache
  electron-zips ; `pull-request-deploy.yml` (préviews Cloudflare, label « Deploy PR »)
  et `website-metrics.yml` (cron) — pas de chevauchement.
- `continuous-deployment.yml` upstream a été **supprimé** (manquait les secrets Cloudflare).
- `README.md` : badge CI pointe sur le workflow `push-ci.yml` du fork.

## 9. Conventions git

- Ne jamais `git add -A` ; ne committer que les fichiers liés à la tâche.
- Commit via HEREDOC avec footer :
  `🤖 Generated with Codebuff` / `Co-Authored-By: Codebuff <noreply@codebuff.com>`.
- Pas de `git push` sans demande explicite. Ne pas toucher au travail non committé
  des autres agents.
- **Versioning / releases** : à chaque **correctif fonctionnel** (pas les commits
  docs/tests seuls), bumper la version dans les 3 `package.json` + section CHANGELOG,
  reconstruire les 3 bundles (`deploy-app.mjs`), et publier une release GitHub
  `Latest` (3 OS : zip Windows x64, AppImage + deb Linux x64, DMG macOS x64/arm64 +
  corps bilingue FR/EN). *Version actuelle : 3.0.0* (publiée le 26 août).
  ⚠️ Convention de titre de release : **« ChainsmokerNeko <version> »**
  (casse exacte, sans préfixe `v`).

## 10. État du 16 août (historique — tous committés/poussés)

- **Auto-download des nouveaux chapitres** (`a065741f`) : bouton dans Paramètres →
  Général — détecte les chapitres publiés **< 48h** dans les **bookmarks**, filtre les
  **versions anglaises** (`Tags.Language.English`) et les enqueu. Ajout de
  `Chapter.PublishedAt` (date remontée par le site — MangaFire expose `createdAt` par
  chapitre ; les sites sans date sont simplement exclus). Validé en réel : 2 chapitres
  anglais trouvés, 38+37 pages téléchargées.
- **Drapeaux de langue devant les chapitres** (`6070449e`) : emoji du pays affiché dès
  qu'un chapitre a un tag de langue (avant : seulement en mode multilingue). Les
  emojis viennent des ressources i18n (`🇬🇧 English`, …).
- **Version affichée** (`9fc55e73`, `ee1d1b2a`) : « HakuNeko v0.1.0 » (paramètres) et
  « Using version 0.1.0 » (menu À propos) via le channel IPC `GetVersion` +
  `ApplicationWindow_test.ts` (`fc7efa18`).
- **« Save all images » retiré** (`132cb564`) : bouton superposé du lecteur supprimé.
- **Exécutables renommés `hakuneko`** (`f8dbb049` Windows, `e06fcf0a` macOS/Linux) :
  cf. §8 « Nom des exécutables » + règle de lancement/kill §7.
- **Release 0.1.0 rafraîchie** (16 août) : bundles reconstruits contenant
  `hakuneko.exe`, corps de release régénéré depuis le CHANGELOG.
- Version du produit `0.1.0` (`24251c3b`) : les bundles s'appellent
  `hakuneko-electron-v0.1.0-…` (version de l'app, plus celle d'Electron).

## 11. Optimisation perf (DB + UI, 16 août)

Plan d'optimisation validé par mesures réelles — voir **`BENCHMARKS.md`** (chiffres
complets, méthodo CDP). État :

- **Singleton IndexedDB** (`c9f52a51`) : connexion unique réutilisée au lieu d'un
  `indexedDB.open()` par opération. Mesuré : **1656 → 1** ouverture au boot. ✅
- **Débounce + tri unique du filtre mangas** (`c712d5f7`) : debounce 200 ms sur
  `mediaNameFilter`, la liste est triée une seule fois au chargement (plus de
  `sort(localeCompare)` à chaque frappe). ✅
- **Mesure du filtre (16 août)** : sur la vraie liste MangaFire **70 234 titres**
  (pas 91 k), la recherche floue Fuse.js coûte **205 ms** par frappe (et matche
  14 895 titres, 21 % — `findAllMatches`+`ignoreLocation` très permissifs) ; le tri
  coûte 8–42 ms. Débounce : ~313 ms E2E après la dernière frappe (mode sous-chaîne
  défaut), 1,8 s → 0,39 s en mode flou pour « one piece ». `FuzzySearch` est **off
  par défaut**.
- **Virtualisation de la liste des chapitres** (`72f27b35`) : `VirtualList` sur
  `MediaItemSelect` (30 lignes rendues pour 132 chapitres) + abonnements
  download/flags **centralisés dans la liste** (props aux items). Vérifié live
  (scroll + flag, icône View→ViewFilled). ✅
- **Sharding des `MediaLists`** (`043666c6`) : lots de 1 000 (clés `#0..#n` +
  `#meta`), repli legacy mono-clé, purge des lots obsolètes, migration
  transparente. ✅
- **Diff des `MediaLists`** (`e97aa5a3` + `02ec8c24`) : refresh qui ne réécrit que
  les lots réellement modifiés, comparés **un par un à la volée** (lecture puis
  éventuelle écriture) sans matérialiser toute l'ancienne liste en mémoire.
  Mesuré live (IndexedDB réel, 70 k entrées, `BENCHMARKS.md` §2) : écritures par
  refresh **70 → 0** (liste inchangée) ou **1–2** (quelques changements) ; durée
  mur-à-mur ~30 ms dans les deux cas (le fetch réseau de 77,5 s domine le
  refresh). Gain réel : pas de clone/réécriture systématique + O(modifications)
  au lieu de O(liste) + pas de matérialisation de l'ancienne liste. ✅
- **Fuse dans un Web Worker** (`1e1aee48`) : indexation + recherche Fuse.js
  déportées (`FuseSearchWorker.ts?worker&inline`), l'UI ne bloque plus (~205 ms
  hors thread). Vérifié live (round-trip `clover` → 1 résultat, 0 erreur). ✅
- **Débounce adaptatif 120 ms sous-chaîne** (`7a6bc0e4`, release 0.1.3) : 120 ms
  en mode sous-chaîne (défaut), 200 ms en mode flou (le worker absorbe ~205 ms).
  Mesuré E2E live (méthode in-page identique au 313 ms, 3 passes, 70 k titres) :
  **~192 ms** (185–204) au lieu de **~313 ms** → **~120 ms gagnés**.
  ⚠️ Piège de mesure découvert : un `FuzzySearch=true` persistant (laissé par une
  sonde) fait matcher Fuse ~tout pour « manga 1234 » → compteur figé à 70 000 qui
  ressemble à un bug ; en sous-chaîne tout filtre correctement (`manga 1234` → 11
  résultats exacts).
- **Restant** : resserrer les options Fuse (`findAllMatches`/`threshold`,
  21 % de la liste matchée en flou), optimiser le fetch réseau MangaFire (~77 s).

## 12. Fix persistance des réglages (16 août)

- **Bug** : `startLocalServer` faisait `listen(0)` → **port aléatoire** à chaque
  lancement → l'origin `http://127.0.0.1:<port>` changeait → IndexedDB/localStorage
  (réglages, bookmarks, cookies) réinitialisés entre deux sessions.
- **Fix** (`Main.ts`) : port **stable 64210**, repli 64211–64225 puis port libre
  (0) en dernier recours si collision. Vérifié en réel : marqueur IndexedDB écrit,
  fermeture propre, relance → relu sur la même origin (64210). Typecheck + 11 tests
  electron verts.

## 13. Releases (historique)

Resume rapide — detail complet dans CHANGELOG.md et les releases GitHub.

- **0.1.x** (16-18 aout) : port stable 64210, perf (singleton IDB, debounce, sharding, Fuse worker), login MangaDrama, fix Cloudflare CrunchyScan (visibility/CDP/reload borne), helper import cf_clearance (DPAPI/AES-GCM/multi-OS), persistance cf_clearance, AppUpdate notification, Clear Cloudflare cache, scan paresseux/silencieux.
- **v2.0.0** (18 aout) : fork devient produit autonome. Suite Cloudflare complete, perf, 3 OS, electron-updater, bilingue. RequiresVisibleBrowserWindow etendu a 6 sites Interactive.
- **2.0.1-2.0.7** (18-22 aout) : fixes JapScan (cache, concurrency, Referer), Comix (Cloudflare auto-resolve), MangaFire (Cloudflare + vrf), VirtualList retire (regression), build npm 11.19, IPC rejections.
- **2.1.x-2.2.0** (22-24 aout) : upstream sync, lint CI, bundle 7-Zip, nightly automatique.

Nightly : republiee par push-ci.yml a chaque push non-docs. Titre Nightly build sha.
Convention titre : ChainsmokerNeko version (sans prefixe v).
## 14-15. Documentation Cloudflare + NSIS (17-18 aout)

- **CLOUDFLARE.md** (17 aout) : doc anglaise complete — mecanismes (UA, session shared, reload), helper import cf_clearance (auto v10, detection v20 ABE, fallthrough Edge->Chrome), methode A pas-a-pas (selector -> URL -> resolution -> Update -> Test now -> Clear cache).
- **Flux CrunchyScan valide** (17 aout, app 0.1.9) : ouvrir site depuis app -> clic URL -> fenêtre visible -> Cloudflare se résout -> cf_clearance conserve en session partagée.
- **Installateur NSIS** (18 aout) : per-user, MUI2 bilingue, %LOCALAPPDATA%\Programs\HakuNeko, uninstaller silencieux /S. Valide en réel (install + desinstall). 2 pieges : chemins absolus en / -> no files found ; .nsi dans %TEMP%.
- **Nettoyage .tmp/** : 250 sondes/supprimees, Chrome for Testing supprime. Conservé : .tmp/electron-zips.
- **ChainsmokerNeko-legacy supprime** (21 aout) : releases 0.1.0-0.1.11 inaccessibles. Tout sur le vrai fork.
## 16. Pourquoi les agents « plantent » (18 août — leçons des sessions)

Causes observées, par fréquence, et parades :

1. **Bascule de modèle en cours de session** : Freebuff alterne entre
   `deepseek-v4-pro` et `deepseek-v4-flash` (voir les bandeaux
   `since_your_last_turn`). Flash produit plus d'erreurs de format d'appels
   d'outils et de troncatures ; chaque bascule perd la mémoire de travail du
   modèle précédent → d'où le pattern « Continue from the last saved step ».
   **Parade** : MEMORY.md à jour (convention 2 h) + commits petits et logiques.
2. **Appels d'outils malformés** : JSON invalide (ex. `suggest_prompts` reçoit
   une string au lieu d'un array, `read_files` sans champ `path`). Typique du
   modèle flash sous pression de contexte. **Parade** : relire les schémas des
   outils, refaire l'appel proprement.
3. **Timeouts sur commandes longues** : builds, sondes réseau multi-sites,
   lancements Electron, PowerShell lent. **Parade** : `timeout_seconds` court +
   `BACKGROUND` avec log `-u`, puis polling ; jamais de boucle de 16 sites en
   synchrone.
4. **Quirks Windows + Git Bash** : `/V2` converti en `C:/Program Files/Git/V2`
   (→ `MSYS_NO_PATHCONV=1` ou `//`), `.cmd` capricieux via `exec` (préférer un
   stub Node `.mjs`), `wmic` disparu, PowerShell parfois muet (utiliser
   `Get-CimInstance` ou Python). `ls | head` masque les codes d'erreur (exit =
   celui de `head`).
5. **Processus orphelins** : instances Electron de test qui verrouillent la DB
   IndexedDB (`UnknownError` au seed), ports, fichiers. **Parade** : vérifier
   `tasklist` + lignes de commande AVANT de relancer ; ne tuer que ses propres
   PIDs (jamais les hakuneko de l'utilisateur).
6. **Sync outil/fichier** : `str_replace`/`write_file` signalent parfois
   « file does not exist » alors que le fichier existe (vérifié par `ls`) —
   re-tenter via Python si l'outil boucle.
7. **Interruptions réseau/session Freebuff** (« connection dropped », « session
   ended ») : rien à faire côté agent, les fichiers sur disque survivent —
   reprendre en relisant l'état réel (git status, fichiers) avant d'agir.

## 17. Session carte blanche (18 aout, midi)

Session de wiring massive : 17 connecteurs testes, seul PornComix valide et cable.
16 rejectes (8 domaines morts, 2 domaines recycles, 3 sites restructures/bloques, 3 pages JS-rendered).
Colonnes de validation : listing -> chapitres -> pages -> image via sondes CDP.
## Ménage connecteurs (18 août, soir) — 35 morts supprimés

- Audit : 728 URLs testées → 36 morts (26 câblés + 9 orphelins + 1 faux positif `NetTruyenViet` gardé, URL dynamique).
- Commit `e80f8398` : retrait des 26 câblés de `_index.ts` + mapping legacy `kisscomic→readcomiconline` supprimé (cible disparue).
- Suivi (non committé, prêt) : suppression **physique** des 105 fichiers (`.ts` + `.webp` + `_e2e.ts`) des 35 connecteurs morts — 26 : ArthurScan BarManga Dmzj Dumanwu Gntai HorrorFC InsanosManhua IrisScanlator KomikCast KomikIndoId LagoonScans MangaEighteenUS MangaKings MangaKiss MangaLivre Manhwax MaviManga NoraNoFansub OnMangaMe PhiliaScans ReadComicOnline SkyManga TuhaoManhua TwoAnimx VNSharing YaoiChan ; 9 orphelins : FireComics MangaSehri Otsugami RaikiScan Retsu SilenceScan TuMangaOnlineHentai WebtoonTRNET ZinchanManga.
- `WordPressMadara_e2e.ts` : 3 imports morts retirés (ArthurScan_e2e, BarManga_e2e, MangaKiss_e2e). Les fichiers `_e2e.ts` sont inertes (config e2e inexistante, pattern vitest ne les prend pas).
- Validation : tsc exit 0, 2118 tests verts, eslint inchangé (48 erreurs préexistantes svelte/vue), vite build OK.
- Restent orphelins vivants/douteux non traités : CoffeeManga, ColaManga (app-gated), HerosWeb, KnightNoFansub, MangaBTT, MangaHack (rebrandé Xfolio), ReadAllComics.

## JapScan — investigation terminée + fix Referer (18 août soir / 19 août matin)

### Symptôme rapporté par l'utilisateur (testé sur le bundle **v2.0.3**, valable en 2.0.5)

- ✅ Listing mangas + chapitres : OK (JapScan est câblé dans `_index.ts`, `RequiresVisibleBrowserWindow = true`).
- ✅ Affichage des images : OK **mais uniquement via la fenêtre navigateur DRM qui s'ouvre** (l'utilisateur résout le puzzle dans la fenêtre, les images s'affichent).
- ❌ **Téléchargement KO** : `FetchImage` (fetch simple `@Common.ImageAjax()`) échoue → 403.

### Découvertes de l'investigation (probes dans `.tmp/`)

- **Le « captcha » JapScan n'est PAS Cloudflare** : c'est un **puzzle à glisser** propre au site — `#jc-overlay` (« 🔒 Vérification humaine — Glisse pour les remettre dans le bon ordre ») + `window.__captcha = { needed: true, ... }` avec des bandes `data:image/jpeg;base64` et un hash preuve-de-travail (`b24763`). Validation via `POST /validate-captcha/` + reload.
- Les images du chapitre sont d'abord embarquées en **`data:` URI** dans le HTML ; après résolution du puzzle, le lecteur (canvas) les affiche. Le DRM capture l'event `{ ax: [...], pi: n }` et renvoie des URLs https avec `?xc=91f4` (**token constant**, vérifié par instrumentation).
- **Session chaude persistée** : le snapshot `cf_clearance` (`cloudflare-clearance.json` dans `%APPDATA%/hakuneko-electron`) contient `.japscan.foo` et est **restauré au boot** (`CloudFlareSession.Install()`) → la session japscan est chaude dès le lancement (les probes dl4–dl8 ont confirmé HTTP 200 dès 0 s). Le warm-up manuel (clic URL plugin + puzzle) n'est donc nécessaire qu'en cas de snapshot absent/périmé.
- Le bundle n'est **pas portable** (`makePortable` ajoute `user-data-dir` mais le bundle 2.0.5 embarqué ne l'a pas) → la session vit dans `%APPDATA%/hakuneko-electron` (partagée entre les bundles).
- L'electron **brut** (sonde `js-probe-*.cjs`) se fait challenger par Cloudflare sur japscan (« Un instant… ») ; **le bundle de l'app passe** (UA propre).

### Cause racine retenue & fix appliqué

- `FetchPages` envoyait `Referer: this.URI.href` (**racine du site**) pour les images, alors que la fenêtre DRM charge les images avec le **Referer de la page du lecteur** → le serveur répond 403 au hotlink.
- **Fix** (`web/src/engine/websites/JapScan.ts`) : `FetchPages` envoie désormais `Referer: new URL(chapter.Identifier, this.URI).href` (URL du chapitre).
- Vérifié : tsc exit 0, **2118 tests verts**, fix présent dans le bundle (`Referer:i` dans le chunk japscan).

### Harnais dans `app/electron/.tmp/` (gitignorés, conservés)

- `validate_japscan*.py` (dl2/dl3/dl4/dl5) : CDP listing/chapitres/pages + tests Referer A/B (dl4 = CreateEntry direct, dl5 = inspection fenêtre DRM, dl7 = extraction URLs depuis HTML, dl8–dl10 = analyse `__captcha`/scripts).
- `js-probe-net.cjs` / `js-probe-net2.cjs` / `js-probe-solve.cjs` / `js-probe-autosolve.cjs` : sondes Electron (headers réseau, puzzle).
- Décodeurs : `js-decode.mjs`, `js-instrument.mjs`, `js-xc.mjs`, `js-table.mjs`, `js-hook*.mjs`.

### Cause racine finale & fix 2.0.6 (19 août, fin d'après-midi)

- **Décodage du DRM** (`decode-preload-script.mjs`) : `CreateImageLinks` n'est PAS
  « aléatoire-fragile ». Son preload installe un **hook Proxy déguisé** sur
  `String.prototype.replace` (`conceal()` : piège `get` pour renvoyer un `toString`
  qui imite `[native code]`, piège `apply` qui décode le résultat et `dispatchEvent`
  d'un `CustomEvent { ax, pi }` à nom aléatoire). Le script écoute cet event et
  résout. Post-traitement : filtre `_banner_`/`e44j82.jpg` + `xc=91f4` sur chaque URL.
  → c'est l'approche **upstream** (validée par `JapScan_e2e.ts`), pas un chemin mort.
- **Pourquoi le téléchargement 403/échouait** : `FetchPages` utilisait
  `Referer: this.URI.href` (racine) ; le CDN image `c*.japscan.foo` exige le
  **Referer du lecteur** (URL du chapitre).
- **Régressions successives de mes extractions DOM** (canvas/img/net) : canvases
  jamais peints (lecteur à chargement à la demande, 300×150 transparents), imgs sans
  `data-src`, timeline réseau = 2 pages seulement (lozad), et la 4e passe lançait
  `ExecuteScript` non enrobé → **« Script failed to execute »** (« c'est cassé »).
- **Fix final appliqué (dans le bundle reconstruit 19/08 ~13:40)** :
  1. `FetchPages` = **`CreateImageLinks` (DRM) en primaire** ;
  2. **fallback timeline-réseau** (`#ExtractPagesFromResourceTimeline`, script 100 %
     enrobé try/catch → ne peut plus lever « Script failed to execute », filtre
     `c\d+.japscan.foo` + dédoublonnage) si le DRM renvoie vide/échoue ;
  3. `Referer` = URL du chapitre ;
  4. `@Common.ImageAjax(true)` (détection du type par octets → plus de `.bin`).
- Vérifié : tsc web 0, **2118 tests vitest verts**, bundle x64 2.0.6 reconstruit
  (web hash `MT00NJOR`), `main.js`+`preload.js` présents, fix embarqué
  (`CreateImageLinks` + `c\d+.japscan.foo` dans `HakuNeko.js`), installé dans
  `D:\Documents\Compressed\Hakuneko` (userdata/session chaude préservés).

### ✅ Validation utilisateur (19 août) — OK

- Bundle `D:\Documents\Compressed\Hakuneko\hakuneko.exe` (2.0.6) : **listing
  mangas + chapitres OK, téléchargement des images OK (`.jpg`), affichage dans le
  lecteur OK**. L'utilisateur résout le puzzle `#jc-overlay` une fois dans la
  fenêtre, puis tout le flux passe (plus de spinner, plus de noir).
- **Approche finale retenue** : `FetchPages` = `#ExtractPagesFromReader` en
  **primaire** (fenêtre visible via `show=true` → `win.Show()`, scroll du lecteur
  pour déclencher lozad, collecte des URLs `*.japscan.foo` depuis `<img>` +
  timeline `performance`, dédoublonnage) ; `CreateImageLinks` (DRM) en **repli** ;
  `Referer` = URL du chapitre ; `@Common.ImageAjax(true)`.
- **Framework** (`FetchProviderCommon.ts`) : mode `Interactive` = fenêtre montrée
  puis **poll 2 s** jusqu'à levée du challenge, puis exécution du script d'extraction
  (corrige le spinner infini des challenges « in-place » sans navigation) ; garde
  `settled` borne le timeout ; nouveau param `show` sur `FetchWindowScript`.
- **Diagnostics** : nouveau canal IPC `Diagnostics::WriteLog` (handler
  `app/electron/src/ipc/Diagnostics.ts`) → `userdata/diagnostics.log` (5 Mo borné,
  silencieux en cas d'erreur).
- **Fix .bin JapScan** (22 août) : `DownloadTask.ts` filtre désormais les blobs'non-image par type MIME (`data.type.startsWith("image/")`) — les ressources CDN non-image (JS/CSS) ne sont plus sauvées en `.bin`. `JapScan.ts` filtre `performance.getEntriesByType` par `initiatorType` (img/fetch/xmlhttprequest uniquement). **Le .bin résiduel est éliminé.**

### Version courante & état git (19 août, post-validation)

- Version : **2.0.6** (3 manifests alignés), CHANGELOG + MEMORY à jour.
- À committer en commits logiques : diagnostics IPC, framework Interactive/show,
  fix JapScan, bump 2.0.6 — puis builder 3 zips + setup.exe et publier la
  release 2.0.6 bilingue.
- Commit docs poussé : `dba86720` (README/CLOUDFLARE → 2.0.6, JapScan ajouté).

### Ménage du 19 août (soir) — tout dans D:\Codex\haruneko

- ⚠️ **RÈGLE UTILISATEUR (corrigée le 19 août soir) : NE JAMAIS toucher à
  `D:\Documents`**. La suppression de `D:\Documents\Compressed\Hakuneko`
  était une erreur — la copie a été **restaurée à l'identique** (bundle 2.0.6,
  build `.bin` fix, session `userdata` intacte). Tous mes artefacts restent
  dans `D:\Codex\haruneko` (`.tmp/` et `bundle/` gitignorés) ; je
  n'écris/supprime plus rien hors du repo sans demande explicite.
- **Lancement des tests utilisateur** : `D:\Documents\Compressed\Hakuneko\hakuneko.exe`
  (inchangé — même bundle, même session).
- Doublons nettoyés : extraction .tmp du bundle (-357 Mo), zips/dumps/probes morts.
  Conservés : `app/electron/.tmp/electron-zips` (cache, -400 Mo) + `nsis` + probes.
- **CI confirmé vert** (push des 5 commits) : run `32267534662` (master) et run
  `32267565328` (tag 2.0.6) → `completed success` tous les deux.
- **`.bin` JapScan : FIXÉ** (commit `feeda15d`, 22 août) : `DownloadTask.ts` filtre les blobs non-image par type MIME (`data.type.startsWith("image/")`) + `JapScan.ts` filtre `performance.getEntriesByType` par `initiatorType` (img/fetch/xmlhttprequest). Le 01.bin n'est plus généré.

  Ancien diagnostic (19 août) : la 1ʳᵉ URL collectée renvoyait un 403 HTML déterministe du CDN — ressource parasite (img cassée ou entrée timeline). Le fix MIME type résout le problème sans ciblage DOM.
## Règles renforcées (19 août soir) + tâche récurrente

- ⚠️ **Mémoire : à jour à CHAQUE fois** — après chaque demande/tâche significative,
  refléter l'état réel (git, releases, décisions, WIP) dans MEMORY.md avant de
  clôturer le tour.
- ⚠️ **Périmètre : ne JAMAIS sortir de `D:\Codex`** (lire/écrire/lancer/supprimer
  quoi que ce soit en dehors du dossier de travail) sans demander explicitement.
- ⚠️ **Apps PC : ne PAS lancer d'application hors du dossier de travail** (navigateurs,
  lecteurs, outils système, …) sans demander.
- 🔄 **Tâche récurrente — upstream `manga-download/haruneko`** : à chaque session,
  vérifier les commits en avance sur nous (nouveaux connecteurs/sites) et **intégrer
  ce qui nous sert** : fichiers du connecteur ajoutés ; câblage dans `_index.ts`
  uniquement si le site passe listing → chapitres → pages (sinon fichier seul,
  non câblé), sans régression.
- 🏷️ **Crédit vibe coding** : mentionner le développement « vibe coding » avec
  **Codebuff (Buffy)** et la signature `🤖 Generated with Codebuff · Co-Authored-By:
  Codebuff <noreply@codebuff.com>` sur le README (FR/EN) et partout où c'est utile
  (docs, releases, crédits).

### Intégration upstream du 19 août soir (18 commits en avance chez manga-download/haruneko)

- **3 nouveaux sites intégrés** (fichiers + webp + _e2e) :
  `RawFree` (rawfree.spot, japonais — dépend de `Zing92Base`, export `MangaExtractor` ajouté),
  `WhyToon` (whytoon.com, thaï — `FetchNextJS`), `AeroToon` (aerotoon.vercel.app, turc — `FetchJSON`).
- **Validation live (20 août, sondes Electron réelles)** : seul **AeroToon** passe
  listing → chapitres → pages → image (série=26, chapitres=45, pages=16, webp 200 OK) → **reste câblé**.
  `RawFree` : listing/chapitres OK mais le CDN d'images `p1.pubg-img.si:183` a un **certificat TLS
  invalide** (UNABLE_TO_VERIFY_LEAF_SIGNATURE / ERR_FAILED même en fenêtre Electron réelle ;
  le lecteur du site reste sur `load.gif`) → **décâblé** de `_index.ts`, fichiers conservés.
  `WhyToon` : **403 Cloudflare « Just a moment… »** partout, même en fenêtre réelle (ERR_FAILED)
  → **décâblé** de `_index.ts`, fichiers conservés. (2120 tests verts après décâblage.)
- README FR/EN : section « Synchronisation upstream / Upstream sync » ajoutée (commit )
  avec le statut des 3 sites (AeroToon câblé, RawFree/WhyToon non câblés).
- Crédit vibe coding étendu (commit ) : section « Crédits / Credits » en fin de
  CHANGELOG.md, footer dans CLOUDFLARE.md, et pied bilingue ajouté aux corps des releases
  GitHub 0.1.13 → 2.0.6 (via `gh release edit`).
- Crédit automatique (commit ) : create-release.yml ajoute le bloc bilingue aux
  notes générées depuis le CHANGELOG ; push-ci.yml l'ajoute aux notes nightly ; corps de la
  nightly actuelle mis à jour manuellement.
- Section « Crédits / Credits » ajoutée à ROADMAP.md (commit ).
- Crédit dans l'UI (commit ) : menu À propos (Sidenav) avec un lien
  « Vibe coding with Codebuff (Buffy) » → repo fork ; splash.html avec ligne discrète
  sous le texte de chargement. Web build refait (splash.html + FrontendClassic.js contiennent
  le crédit) ; bundle electron PAS encore reconstruit avec ce changement.
- **Audit puis suppression du repo legacy (20-21 août)** : l'audit (20 août) avait
  confirmé 14 releases (160826, 0.1.0 → 0.1.11) + nightly = 42 zips Windows intègres
  (HTTP 206 + magic PK sur échantillons, unzip -t OK sur 0.1.11 x64). Le **21 août**,
  à la demande de l'utilisateur, le dépôt a été **supprimé définitivement** (nécessite
  le scope GitHub `delete_repo` via `gh auth refresh -h github.com -s delete_repo`
  si le refresh n'a pas été fait) et le brouillon `.tmp/legacy-README.md` effacé.
- **3 fixes upstream cherry-pickés** pour des sites qu'on a déjà : YomuComics (listing),
  MangaYi (selectors CSS), Dilar (pages).
- **Ignoré à dessein** : commits UI viewer (scrollMagic, ImageViewerWideSettings, multi-drag —
  conflits risqués avec nos customisations), `Flatmanga`/`MangaBrasuka`/`KomikCast→Voratoon`
  (sites retirés à notre ménage), `domains updates` (CrunchyScan .fr→.org : on était déjà en
  `.org` avant eux).
- Vérifié : tsc web 0, **2124 tests verts**. Commits : `b44d5875` (MangaYi), `6c662099`
  (YomuComics), `2d2239f3` (Dilar) + commit d'ajout des 3 sites.
- **Process pour les prochaines sessions** : `git fetch origin` puis `git log --oneline
  master..origin/master` → intégrer les `feat: add <site>` (fichiers + câblage si simple
  décorateurs/API) et les fixes de sites qu'on a (cherry-pick).

## 23. Regles immuables

- **AUCUNE REGRESSION** : tout ce qui fonctionne doit continuer de fonctionner.
- **MEMOIRE TOUJOURS A JOUR** : mettre a jour MEMORY.md apres chaque changement.
- **NE PAS OUBLIER CE QUI MARCHE QUAND ON BUILD** : avant de modifier un script de build,
  verifier que la configuration existante fonctionne (workaround npm, cache electron, etc.).
  En local : npm 11/Node 26 echoue sur build-app.mjs (EALLOWSCRIPTS sur websocket-rpc).
  Workaround : copier les deps depuis le node_modules principal, puis appeler bundle-app-zip.mjs
  directement. En CI (Node 24/npm 22) : build-app.mjs fonctionne.
- **TOUJOURS BUILDER AVANT DE COMMIT** : pour que l'utilisateur puisse tester avant validation.
- **DEMANDER AVANT TOUTE SUPPRESSION** : ne jamais supprimer de fichier/feature sans approbation.


## 24-41. Fixes 22-24 aout (resume)

**22 aout :**
- Fixes MangaDrama .webp parasite (filter images/avatar/gravatar), bookmarks refresh
- Fix download ordering (tri par date de creation)
- Retrait VirtualList (regression : liste tronquee, scrollTop=0)
- Fix build npm 11.19 (git deps bloques), ws dependency
- Fix crash IPC rejections non gerees
- Sync build web -> electron (copier web/build/ apres chaque rebuild)

**23 aout :**
- MangaDrama : regex template literal pour FetchPages
- FetchProviderCommon : crash fixes (commits b50842fb, 9a463f5b)
- JapScan : normalize paste URLs, null-safe FetchManga

**24 aout :**
- JapScan : limit chapter fetch concurrency (b6e94974), cache chapter lists (ed46e93f)
- Copilot review fixes + MangaFire upstream + virtual scroll (a03aee4e)
- PR #1805 response (JapScan) + alignement branche PR
- Zip release : remplacement Compress-Archive par 7-Zip
- Fix MangaFire Cloudflare + chapter pages 404 (3580d4e7)
- CrunchyScan : auto-resolve Cloudflare (40e42946) — **reverted, Interactive reste correct**
