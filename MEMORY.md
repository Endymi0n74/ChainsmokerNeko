# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte écrit pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 17 août 2026.

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
# build web puis electron (ordre imposé : electron copie web/build)
cd haruneko/web && node ../node_modules/vite/bin/vite.js build
cd haruneko/app/electron && node ./scripts/build-app.mjs
cd haruneko/app/electron && ../../node_modules/.bin/vite build   # main.js + preload.js
# sonde Electron (fenêtre de test) — tourne sous le nom de processus `electron.exe`
cd haruneko && ./node_modules/electron/dist/electron.exe app/electron/.tmp/xxx.cjs
# bundles Windows (3 arches) — le cache électron est .tmp/electron-zips (disque du repo, D:)
cd haruneko/app/electron && node scripts/deploy-app.mjs
# lancer l'app EN PROD via l'exe du bundle (nom de processus `hakuneko.exe`) :
#   1. extraire bundle/hakuneko-electron-v0.1.0-win32-<arch>.zip
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
  2. **`bundles`** (windows, `needs: ci`) : **réutilise le build via artefact** (plus de
     `npm ci` ni de rebuild — les deps prod commander/websocket-rpc sont du JS pur,
     build portable) → 3 bundles Windows (ia32/x64/arm64) via `deploy-app.mjs` ;
  3. **`release`** (ubuntu, `needs: bundles`, master uniquement) : publie la release
     roulante `nightly` (`--latest=false`).
  - `paths-ignore` : les commits purement docs (`*.md`, `docs/**`, `MEMORY.md`)
    ne déclenchent plus le pipeline (commit `6256153a`).
  - **Cache electron-zips** : `${{ runner.temp }}/electron-zips`, clé
    `electron-zips-${{ runner.os }}-${{ hashFiles('app/electron/package.json') }}`,
    branché sur `electron_config_cache` (npm ci) et `HAKUNEKO_ELECTRON_CACHE`
    (deploy-app.mjs) — ~420 Mo téléchargés une seule fois (562 Mo de cache).
    ⚠️ `runner` n'est **pas** autorisé dans un bloc `env:` de job (validation GitHub) —
    mettre les env vars au niveau des steps. ⚠️ Pas d'unicode (ex. `→`) dans les
    commentaires YAML des workflows (validation GitHub).
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
  `Latest` (3 zips + corps généré depuis le CHANGELOG). **Version actuelle :
  0.1.9** (publiée le 17 août). Prochain bump (0.1.10) dès le prochain correctif
  fonctionnel.

## 10. État récent (16 août, tous committés/poussés)

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

## 13. Releases récentes (16 août)

- **0.1.1** (`a408138e`) : fix persistance (port stable 64210) + perf (singleton
  IDB, débounce, virtualisation chapitres, sharding MediaLists, Fuse worker) +
  renommages/icône/drapeaux/version/splash.
- **0.1.2** (`a288bcbf`) : diff des `MediaLists` (réécriture ciblée, comparaison
  à la volée). Benchmark live consigné dans `BENCHMARKS.md` §2 (70 → 0 écritures).
- **0.1.3** (`7a6bc0e4`) : débounce adaptatif **120 ms sous-chaîne / 200 ms flou**,
  E2E ~313 → **~192 ms**. Release publiée avec les 3 zips.
- **0.1.4** (`f0e218e6`) : **login MangaDrama dans l'app** — `Initialize()`
  vérifie `/wp-json/wp/v2/users/me` ; si non connecté, ouvre une fenêtre visible
  sur `/my-account/` (poll 5 s, auto-fermeture à la connexion, cookies persistés
  en session partagée → chapitres achetés déverrouillés) + **prix en coins**
  affiché sur les chapitres verrouillés. Release **`Latest`** publiée avec les 3
  zips v0.1.4 (hakuneko.exe + manifest vérifiés). CI vert.
- **0.1.5** (`3e44c36f`) : **fix de la boucle Cloudflare CrunchyScan** (`a67e9189`)
  — 3 problèmes chaînés : (1) `cf_clearance` n'est émis que si la fenêtre distante
  est **visible** → `win.Show()` pour les sites opt-in du reload (CrunchyScan
  seul ; MangaFire/MangaDrama/Comix restent cachés, zéro flash) ; (2) le cookie est
  **httpOnly** → lecture via CDP `Network.getCookies` (le debugger est déjà
  attaché) au lieu de `document.cookie` ; (3) budget de reload **borné globalement
  à 3** (au lieu d'une boucle non-bornée ~35 navigations/40 s) + arrêt de tous les
  pollers au `destroy()`. Vérifié : 2138 tests web + 11 electron, typecheck/lint
  OK, CI vert,  zips v0.1.5 vérifiés (hakuneko.exe + manifest). Release **`Latest`**
  publiée avec les 3 zips.
- **0.1.6** (`def620c0`) : **helper d'import `cf_clearance`** (`7cb07c8b`) —
  section « Cloudflare bypass » dans Paramètres → Général. Bouton
  « Import cf_clearance from browser » (lecture Edge/Chrome : DPAPI +
  AES-256-GCM sur le store SQLite, via `node:sqlite` du runtime Electron) +
  champ de **collage manuel** (fallback quand le navigateur est ouvert/verrouillé
  ou en **App-Bound Encryption v20**, détecté avec message explicite).
  Câblage : namespace `CloudFlareImport` (`ImportFromBrowser`/`SetClearance`) +
  contrôleur `app/electron/src/ipc/CloudFlareImport.ts` + 2 méthodes sur
  `IAppWindow` (impl Electron + stub NW). Validé en réel : injection httpOnly+
  secure sur le bon domaine, guards hôte/valeur, détection du store verrouillé.
  Release **`Latest`** avec les 3 zips v0.1.6 (hakuneko.exe + main.js + preload.js
  + manifest vérifiés). CI vert.
- **0.1.7** (`255e1dcf`) : **fix du RangeError `expires_utc`** (`8432bc38`) —
  les timestamps Chromium (microsecondes depuis 1601) dépassent
  `Number.MAX_SAFE_INTEGER` → node:sqlite crashait l'auto-lecture dès qu'un
  cookie était lu (Edge/Chrome fermé). Fix : `CAST(expires_utc AS TEXT)` dans la
  requête + parsing BigInt. ⚠️ **Test du 17 août** : l'auto-lecture est bloquée
  sur le profil Edge de l'utilisateur — **tous les cookies sont en App-Bound
  Encryption « v20 »** (non décryptable en v10, verrou sécurité Chromium), et le
  fallback CDP (`--remote-debugging-port` sur profil par défaut) est aussi
  bloqué (Chromium 136+). Le helper détecte v20 et renvoie un message clair →
  **le collage manuel reste le chemin fiable**. Auto-lecture v10 fonctionnelle
  sur Chrome / Edge sans ABE. Release **`Latest`** avec les 3 zips v0.1.7
  (hakuneko.exe + main.js + preload.js + manifest vérifiés). CI vert.
- **0.1.8** (`56147aa4`) : **fallthrough Chrome** (`e276eb07`) — l'import
  `cf_clearance` essaie désormais **Chrome** quand Edge échoue (verrouillé/v20)
  au lieu de s'arrêter au premier échec. Doc README + texte d'aide UI :
  l'auto-lecture v10 ne marche qu'avec Chrome ou Edge sans ABE. Release
  **`Latest`** avec les 3 zips v0.1.8 (hakuneko.exe + main.js + preload.js +
  manifest vérifiés). CI vert.
- **0.1.9** (`856fe85a`) : **fix du préfixe 32 octets** (`70030e84`) — Chromium
  130+ préfixe les valeurs de cookies d'un bloc d'intégrité de 32 octets avant
  AES-256-GCM ; `DecryptCookie` le retirait pas → valeur injectée corrompue.
  **Test du 17 août** : **Chrome for Testing 152** installé (portable,
  `D:\Codex\chrome-for-testing`, profil pointé vers `%LOCALAPPDATA%\Google\Chrome\User
  Data`) pour valider le fallthrough — **Chrome = v10** (pas d'ABE), Edge = v20.
  Import réel **Edge v20 → Chrome v10** : « Imported cf_clearance from Chrome »,
  valeur injectée propre. ⚠️ L'installateur officiel ChromeSetup.exe reste bloqué
  sur un prompt UAC (admin) → utiliser Chrome for Testing. Release **`Latest`**
  avec les 3 zips v0.1.9 (hakuneko.exe + main.js + preload.js + manifest
  vérifiés). CI vert.
- Release précédentes conservées : 0.1.0, 0.1.1, 0.1.2, 0.1.3, 0.1.4, 0.1.5, 0.1.6, 0.1.7, 0.1.8.
- Nightly : republiée automatiquement par `push-ci.yml` à chaque push (mais pas
  sur les commits docs-only `*.md` — `paths-ignore`).
  ⚠️ La release `nightly` n'existe pas encore sur le fork (le job `release` la crée
  à la première exécution master — à vérifier après le prochain push non-docs).

## 14. Documentation Cloudflare + nettoyage (17 août)

- **`CLOUDFLARE.md`** (`dcaedbb3`, réécrit en **anglais** le 17 août) : doc de statut
  utilisateur récapitulant tout le contournement Cloudflare — mécanismes embarqués
  (UA, session partagée, reload opt-in borné), helper d'import `cf_clearance` (auto
  v10 DPAPI+AES-GCM+retrait préfixe 32 octets, détection v20 ABE, fallthrough
  multi-navigateur Edge→Chrome, collage manuel, bouton « Test now »), matrice des
  scénarios, limites connues, historique 0.1.5→0.1.9 et procédure pas-à-pas
  CrunchyScan. Liée depuis le README (section Cloudflare aussi en anglais).
- **Nettoyage du dossier de travail** : `.tmp/` vidé (250 sondes/logs/probes +
  `ChromeSetup.exe` 12 Mo + `chrome-win64.zip` 202 Mo + `robo/`) — **conservé :
  `.tmp/electron-zips`** (cache 400 Mo des 3 binaires Electron, réutilisé par
  `deploy-app.mjs`). `D:\Codex\chrome-for-testing` (428 Mo, portable Chrome de
  test v10) supprimé — à re-télécharger depuis
  https://googlechromelabs.github.io/chrome-for-testing/ si un re-test v10 est
  nécessaire (l'installateur officiel ChromeSetup.exe reste bloqué par l'UAC).
- **État GitHub** : 11 releases conservées (`160826` pré-version + `0.1.0`..`0.1.9`,
  dernière = `Latest`). Pas de release orpheline ni de branche parasite sur le fork
  (`fork/master` seule). Les titres ont une casse incohérente (« ChainSmokerNeko » vs
  « ChainsmokerNeko ») — purement cosmétique, non corrigé (réécrire les releases
  est destructif).
