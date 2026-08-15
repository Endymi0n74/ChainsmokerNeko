# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte écrit pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 15 août 2026.

> ⚠️ **CONVENTION UTILISATEUR (à partir du 15 août 2026) : AUCUNE RÉGRESSION.**
> Chaque changement doit vérifier qu'aucune fonctionnalité déjà validée ne casse :
> refaire les tests e2e pertinents (listing ET flux chapitre → pages → image),
> pas seulement le chemin modifié. En cas de doute, re-tester l'existant AVANT de
> déclarer le travail terminé. Ne jamais laisser un fix partiel dans le working tree.

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
    désactivait TOUT reload → les 3 sites restaient figés. Le contrôle actuel ne
    détecte qu'un widget **réellement rendu** (iframe/checkbox) → le reload est
    rétabli pour les challenges « managés » sans widget. **✅ Corrigé et committé**.
- 17 autres sites ajoutés (commit `96741258`) — **audités le 16 août** : seul **PornComix** a été
  câblé dans `_index.ts` (e2e complet OK). Les 16 autres restent **non câblés** car invalides
  (vérifié par tests e2e + sondes) : 8 domaines morts (`ERR_NAME_NOT_RESOLVED`/SSL :
  RaikiScan, MangaSehri, TuMangaOnlineHentai, SilenceScan, Retsu, Otsugami, FireComics,
  WebtoonTRNET), ReadAllComics (Cloudflare 521), CoffeeManga→bunnynovel.com et
  MangaHack→Xfolio (domaines recyclés), KnightNoFansub (site restructuré),
  HerosWeb (redirigé vers heros-web.com, nouveau format), MangaBTT + ZinchanManga
  (pages JS-rendered, extraction CSS impossible), ColaManga (FetchPages bloque).
  → Fichiers conservés (revival possible) mais non exportés.

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
# build web puis electron (ordre imposé : electron copie web/build)
cd haruneko/web && node ../node_modules/vite/bin/vite.js build
cd haruneko/app/electron && node ./scripts/build-app.mjs
cd haruneko/app/electron && ../../node_modules/.bin/vite build   # main.js + preload.js
# sonde Electron (fenêtre de test)
cd haruneko && ./node_modules/electron/dist/electron.exe app/electron/.tmp/xxx.cjs
# lancer l'app (serveur local + HTTP)
#   → l'app écoute sur http://127.0.0.1:<port> ; relancer via taskkill //F //IM electron.exe
```

## 8. Environnement & CI

- **Electron** 43.3.0 (Chromium 150). Node local **v26** ; CI = **Node 24**.
- `.npmrc` : `engine-strict=true`. `package-lock.json` est **committé** (retiré du
  `.gitignore`) → install CI = `npm ci` (déterministe).
- Workflow `.github/workflows/push-ci.yml` : typecheck (web/electron/nw) + eslint +
  svelte-check + vue-tsc + build web/electron, avec cache npm/electron.
- `continuous-deployment.yml` upstream a été **supprimé** (manquait les secrets Cloudflare).
- `README.asciidoc` : badge CI pointe sur le workflow `push-ci.yml` du fork.

## 9. Conventions git

- Ne jamais `git add -A` ; ne committer que les fichiers liés à la tâche.
- Commit via HEREDOC avec footer :
  `🤖 Generated with Codebuff` / `Co-Authored-By: Codebuff <noreply@codebuff.com>`.
- Pas de `git push` sans demande explicite. Ne pas toucher au travail non committé
  des autres agents.
