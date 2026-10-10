# LESSONS.md — Leçons techniques (fork ChainsmokerNeko / Haruneko)

> Connaissances techniques : fonctionnement de la plateforme, pièges et fixes par site, CI/CD.
> Référencé depuis `MEMORY.md` (qui ne garde que l'état courant). À relire quand on touche une zone concernée.
> Les règles durables (process, git, release) sont dans `AGENTS.md`.

## Plateforme & scraping

- Connecteurs héritent de `DecoratableMangaScraper` avec décorateurs `@Common.*`
- `FetchWindowScript` / `FetchWindowPreloadScript` : ouvrent une BrowserWindow réelle (sandbox, CDP debugger) pour exécuter un script dans une page rendue.
- `AntiScrapingDetection.js` (obfusqué) : `CheckAntiScrapingDetection()` → **Interactive > Automatic > None**. Priorité détections spécifiques site AVANT l'heuristique DOM widget.
- `ChallengePolicy.ts` (les `Add…` et le budget par origine restent dans `ChallengeReload.ts`) : **une table déclarative par site** (upsert : une seconde déclaration complète la première ; un site qui ne déclare rien garde l’upstream) — reload auto des challenges managés (sans widget rendu, `cf_clearance` >200 chars), fork handling, reload après clearance, gate `requireSolveToken`.
- **UA par défaut** Electron (segment `Electron/x.y.z` conservé) — fix MangaFire le 15 août.
- **⚠️ Deux garde-fous posés par le même commit qui se contredisent** (fix 28 sept, v3.0.7) : `cf615186f` (2 sept.) a introduit d'une part `CHAPTER_UPDATE_TIMEOUT_MS = 300_000` (« JapScan est légitimement long ») et d'autre part un stall guard `PROCESS_STALL_TIMEOUT_MS = 20_000` dans `DownloadManager.RunWithStallGuard` (« annuler une tâche dont le progress est figé pour ne pas bloquer la file »). Or pendant `Media.Update()` **aucun** progress n'est produit — c'est la phase où la fenêtre de lecteur s'ouvre, où l'utilisateur résout le puzzle et où le lazy-load construit les URLs. Le guard tombait ~20 s après le clic et annulait le signal **pendant** que `WithTimeout(300 s)` continuait en arrière-plan : `Chapter update … timed out after 300000ms` alors que l'extraction finissait par rendre 204/204 ; les pages ensuite lancées recevaient un signal déjà annulé et échouaient **toutes** (204 erreurs en 17 ms), `errors` non vide → `Media.Store()` jamais appelé → rien sur le disque → l'utilisateur reclic, et cette fois ça marche parce que le puzzle est déjà résolu et qu'`Update()` passe sous les 20 s. Chaque page annulée remontait `null` comme message : `new DOMException(null, 'AbortError')` → WebIDL convertit `null` en la chaîne `"null"`. Correctif : décision sortie dans `StallTimeoutFor(status, progress)` — tant qu'aucune page n'est passée c'est la borne de résolution, ensuite les 20 s. **Règle** : un garde-fou doit savoir *quelle phase* il surveille (« pas de progress » n'est un stall que depuis que le progress aurait dû commencer), et quand deux bornes sont posées ensemble il faut vérifier leur ordre — 300 s sous 20 s ne sert jamais. **Corollaire** : une tâche dont les erreurs ne sont jamais journalisées est indiagnosticable ; `[DownloadTask] N error(s)` et `poll#N cf=… clr=…` ont été ajoutés dans la foulée, et c'est ce qui a rendu ce diagnostic possible en une session au lieu de trois.
- **⚠️ Le budget de page de l'engine inclut la file du pool d'images** (relevé 8 oct, v3.0.19) : `DownloadTask` enveloppe `item.Fetch(...)` entier dans `WithTimeout(STALL_TIMEOUT_MS = 15_000)`, or les connecteurs placent leur requête derrière `imageTaskPool` (throttle + workers) — l'attente en file **compte dans le budget**, alors que le budget n'**annule jamais la requête** elle-même (il ne rejette que la promesse, le worker continue de tourner). Deux conséquences mesurées sur Comix : (1) tout chapitre dont `pages × cadence de démarrage > 15 s` perd sa queue sans jamais avoir lancé les requêtes — throttle 4/s → plafond ~57 pages, le chapitre 232 de 183 pages en récupérait **58** alors que l'hôte répondait en 50 ms ; (2) une page tuée par le budget laisse sa requête dans le worker — sur un hôte mort les 4 workers restent bloqués bien après le rétablissement et **toute la suite** des téléchargements échoue, y compris sur des hôtes sains (chapitre suivant : **0/20** au banc). **Règle pour tout connecteur** : poser la borne *à l'intérieur de la tâche du pool* (attemptSignal + timer propre) et calibrer le throttle pour `pages max / cadence < STALL_TIMEOUT_MS`. Correctif Comix v3.0.19 (borne 15 s par requête + refroidissement 20 s par hôte + throttle 20 req/s), validé par le banc `ComixBench_e2e` (0/20 → 20/20 ; 58/183 → 183/183, créé pour la mesure puis supprimé après validation) ; la borne de l'engine reste inchangée car elle est partagée par tous les connecteurs.

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

### Un seul propriétaire par fenêtre (10 oct.)
- **La maladie, pas les symptômes** : les addenda 18→27 de `MEMORY.md` décrivent six pannes différentes (F5 perdu, quatre pollers sur une fenêtre, deux rechargements + l'échec dépensés en 1,5 s, rechargement âge-seul parasite, rotation prise pour un solve, un poller qui ignore la décision d'un autre) — toutes sont **plusieurs acteurs décidant du même document** avec leurs propres drapeaux. Un correctif de plus en cachait toujours un autre.
- **Architecture retenue** : `ChallengePolicy.ts` = **une table déclarative par site** (upsert : une seconde déclaration *complète* la première, elle ne la réinitialise pas — c'était la classe de bug) ; `ChallengeDecisions.ts` = constantes + planificateurs purs ; `ChallengeSession.ts` = **l'unique propriétaire** de l'état d'une fenêtre (budgets, génération, baseline, classification) et de **toutes** les décisions ; `FetchProviderCommon.ts` = transport qui **observe et exécute** ; `ChallengeReload.ts` = vocabulaire de déclaration des connecteurs + budget par **origine** (le seul état qui doit survivre à une fenêtre).
- **Deux invariants qui étaient des bugs** : (a) chaque décision reçoit la **génération** du document qu'elle a lu — si une navigation l'a remplacée, elle rend `ignore` (plus de tour fantôme qui recharge, échoue ou extrait sur un document disparu) ; (b) `Stop()`/`Settle()` sont vérifiés **dans** chaque décision, donc le `stop()` d'un poller suffit même si un `ExecuteScript` déjà en vol ne peut pas être annulé.
- **Règle générale** : quand le même état est lu et écrit par N composants, le correctif n'est pas un drapeau de plus, c'est **un propriétaire** et des décisions pures que les autres appellent. Un état partagé qui vit « dans » l'acteur qui agit (compteur de rechargements dans un poller que le rechargement reconstruit) ne peut pas borner sa propre boucle.

### Diagnostic : la trace va sur le disque, jamais dans une capture d'écran (10 oct.)
- **Coût du symptôme** : ~30 décisions `console.warn('[KUMO] …')` n'étaient lisibles que dans `F12` → chaque session a produit une capture d'écran manuelle, et six addenda ont été écrits à partir de captures. Le canal `Diagnostics.App.WriteLog` **existait déjà et n'était appelé nulle part**.
- **Ce qui existe maintenant** : la console de la fenêtre principale est miroirée dans `diagnostics.log` (rotation 5 Mo) avec filtres (`[KUMO]`, `[JapScan]`, `[ReaderWindow`, tout `error`), et `HAKUNEKO_TRACE_DIR` redirige la trace vers `haruneko/.tmp/traces/<session>/` ; `ChallengeTrace.TraceChallenge` écrit **une ligne greppable par décision** (`console.warn` conservé pour `F12` + sink non attendu vers le canal `WriteLog`, protégé par un `try`).
- **Format** : `[KUMO] trace t=… origin=… gen=2 phase=challenge reloads=0/2 doc=challenge age=6724ms cf=rotated widget=0 frames=child=0 nav=0 token=0 site=Interactive cleared=0 decision=poll` — `cf=` (`none`/`present`/`issued`/`rotated`/`reappeared`/`unreadable`) est la case que l'ancienne ligne `clr=unchanged:0` ne savait pas exprimer.
- ⚠️ **Ne pas écrire deux fois la même ligne** : les lignes `[KUMO] trace ` sont exclues du miroir console parce qu'elles arrivent **déjà** par le canal (`ChannelWrittenPrefixes`) — sinon chaque décision était dupliquée et la rotation de 5 Mo n'en gardait que la moitié. C'est le seul recouvrement entre les deux chemins : les autres lignes `[KUMO]`, `[JapScan]`, `[ReaderWindow` n'ont, elles, aucun canal.
- **Règle** : toute décision d'un flux non reproductible (challenge, réseau, WAF) doit laisser **une ligne de fichier**, pas un état d'UI. Une observation n'a de valeur que si elle peut être `grep`ée après coup et relue par un autre agent que celui qui l'a produite.

### Harnais de rejeu (`scripts/challenge-replay.mjs`, 10 oct.)
- Lance le **vrai build** (`app/electron/build`) sur le **vrai profil** (`app/electron/.user-data`) et conduit l'engine par sa surface publique (`window.HakuNeko.PluginController`, comme les `*_e2e.ts`) — pas une copie du flux.
- Écrit dans le répertoire de session `trace.log`, `console.log`, `cookies.json` (**métadonnées seules**, jamais une valeur), `frames.json`, `screenshots/`, `session.json` ; chaque étape est bornée par son propre budget (`page.evaluate` n'a sinon que le `protocolTimeout` de 300 s).
- Refuse de démarrer si le port 64210 est pris ou si une instance tourne sur ce profil (`--force` pour passer outre) ; `--listing` est **opt-in** (walk de catalogue = requête lourde et agressive, inutile à la trace du challenge) ; il ne **clique jamais** Turnstile — la validation est humaine.
- ⚠️ Piège rencontré : une variable `steps` déclarée dans le bloc du `for` masquait l'accumulateur de résultats du même nom → `steps.push(...)` alimentait la liste en cours d'itération → boucle infinie `Unknown step: [object Object]`. Ne jamais `push` dans la collection qu'on parcourt.

### Leçons Cloudflare
- UA stripped → challenge infini (MangaFire). UA Electron native → pas de challenge.
- `cf_clearance` est `httpOnly` → lire via `Network.getCookies` (CDP), pas `document.cookie`.
- `document.hidden = true` pause le challenge (jamais `win.Hide()`).
- Délai 2.5s avant extraction: challenge finalize en 1-2s, 1s trop court.
- Widget réel (iframe) ≠ input caché `cf-turnstile-response` (toujours présent).
- Recharger un challenge n'est utile **que** si le `cf_clearance` a changé depuis le début du document (baseline re-lue à chaque `DOMReady`) ; recharger avec un cookie inchangé reset le widget en cours = flash loop (voir §CrunchyScan, fix 27 sept).

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
- **Client HTTP repéré par forme, jamais par nom d'export** (7 oct.) : le chunk `env-` est rebâti à chaque déploiement ; l'export `x`, qui portait l'instance axios, est devenu un helper `e=>aa(t,e)` — le garde `typeof === 'function'` passait donc et `.get` manquait (`__axios.get is not a function`). Chercher l'objet dont `get/post/put/patch/delete` sont des fonctions (sinon une instance axios brute : `request` + `interceptors`), et désencapsuler selon la forme de la réponse (`status` number + `headers` + `config` → `.data`, sinon la valeur telle quelle) : selon le build, `get` renvoie la réponse axios complète ou directement la payload.
- Images : **sans aucun `Referer`** — le CDN (hébergeurs tournants `*.softvisualstudio.site`, `*.kkplayer.wtf`) répond `403` (hotlink protection) à tout `Referer` non vide, y compris réduit à l'origine de l'image, et `200` sans referer. `@Common.ImageAjax()` joint toujours un `Referer` → remplacé par un `FetchImage` maison avec `referrerPolicy: 'no-referrer'`.
- **Hébergeur image mort = timeout, pas une régression** : `rnn-d.kkplayer.wtf` (31.43.191.33) ne répond plus depuis la machine, le navigateur ni curl, avec une résolution DNS publique identique — le site lui-même ne peut plus l'afficher ; repointer les fixtures e2e sur un chapitre hébergé ailleurs plutôt que de conclure à un bug du connecteur.
- **Fix "aucune image"** (`0f44b305`): échec détection anti-scraping → `FetchRedirection.None` (on scrape quand même)
- Anciens fichiers `Comix.DRM.*` supprimés
- **Topologie du CDN images sondée (8 oct.)** : les jetons `/hi/<jeton>` sont **liés à un cluster de stockage, pas à un hôte** — échangeables entre deux hôtes d'une même famille (`rxn.*` ↔ `rxn.*` : 200 avec les mêmes octets), `404` en dehors (`rxn` ↔ `447.*` ↔ `c150.kkplayer.wtf`) : le préfixe d'hôte *est* la famille. L'API ne tourne jamais les hôtes (4 appels consécutifs → identiques), aucun frère DNS (`c149/c151.kkplayer.wtf` → NXDOMAIN) : **un chapitre peut n'avoir qu'un seul hôte**, point de défaillance unique. Le site n'a **aucun** miroir (ni `onerror`, ni `srcset`, ni champ miroir dans l'API) → toute résilience vient du connecteur.
- **Jetons images : multi-usage, déterministes, valides ≥ 14 min sans renouvellement** (sondé à la minute sur `c150.kkplayer.wtf` : 200 constant pendant 14 min, l'API revoie les mêmes jetons) — aucun code de renouvellement nécessaire ; un `404` massif vient presque toujours d'un jeton retranscrit **à la main**, toujours prendre les URL directement depuis la payload de l'API.
- **Fix aléatoire (8 oct., v3.0.19)** : panne d'hôte en cascade + plafond des gros chapitres → voir la leçon « budget de page / file du pool » en § Plateforme & scraping et MEMORY §16 ; banc éphémère `ComixBench_e2e` (panne simulée par interception CDP, gros chapitre 183 pages) créé pour la mesure puis supprimé après validation.

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
- **Loop « fenêtre qui clignote » = baseline `cf_clearance` manquante** (fix 27 sept) : `ReloadStalledCloudFlareChallenge` comparait le cookie à `budget.lastReloadedClearance` initialisé à `''` → dès le 1er check (~5 s) l'**ancien cookie persisté** passait pour « frais » → `window.location.reload()` → le Turnstile repartait de zéro et l'utilisateur ne pouvait plus finir la validation (→ timeout). Fix : re-baseliner le `cf_clearance` à chaque `DOMReady` (`clearanceBaseline`, lu via CDP) et recharger **uniquement** si la valeur a changé depuis cette baseline (une clearance émise par CE document = le vrai signal « résolu mais jamais redirigé »). Un cookie inchangé ne peut rien débloquer (la requête qui a servi le challenge le contenait déjà).
- Historique : `6b0b3a531` avait tenté de résoudre le symptôme en restreignant le reload au mode `Automatic`, puis `851d04f36` l'avait annulé le soir même (CrunchyScan est classé `Interactive`, le reload devenait donc jamais déclenché). La baseline traite la cause racine et garde la récupération dans les deux modes.
- **Série de timeouts = une fenêtre DRM par chapitre sans garde** (fix 27 sept) : `CrunchyScan.DRM.CreateImageLinks` ouvre sa propre fenêtre par chapitre ; session non débloquée → N fenêtres × 150 s. Fix : drapeau `challengeSuspected` posé à l'échec, puis, avant toute nouvelle fenêtre, probe **sans fenêtre** (statut 403/503 + header `CF-Mitigated` + `<title>` interstitiel) : toujours challengé → `Exception(FetchProvider_Fetch_CloudFlareChallenge)` rapide ; session réchauffée (lien URL du plugin ou import `cf_clearance`) → la porte se rouvre toute seule.
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
- **Detection du puzzle = VISIBILITÉ, pas existence** (fix 27 sept, v3.0.7) : `#jc-overlay` **persiste dans le DOM après résolution** (masqué en CSS — cf. 3.0.3). Tester `!!querySelector(...)` dans `JapScan.ts` (la détection qui *classe* la fenêtre) faisait retoumer `Interactive` à jamais → `CheckAntiScrapingDetection` ne rendait jamais `None` → `cleared` faux dans `PollForChallengeResolution` → timeout 150 s → nouvelle fenêtre → **boucle**. Aligné sur `isBlocked()` de `JapScan.Extract.ts` : nœud présent → trancher sur `display`/`visibility`/`opacity`/`offsetHeight` ; nœud **absent** → `window.__captcha.needed` (l'annonce pré-rendu, où le n'existe pas encore). ⚠️ 3 lieux doivent rester cohérents : `JapScan.ts` (classification), `JapScan.Extract.ts` `isBlocked` (pause du scroll), `GatherReaderDiagnostics` (diag).
- **Baseline `cf_clearance` aussi dans `PollForChallengeResolution`** (fix 27 sept, v3.0.7) : `lastClearance` initialisé à `''` → la 1ʳᵉ lecture CDP (~4 s) faisait passer l'ancien cookie **persisté** pour frais → `cleared = true` prématuré → `runScript()` pendant la validation → fenêtre détruite → extraction sur page verrouillée → fallback DRM → 2ᵉ fenêtre → un nouveau puzzle. **Même cause racine que le reload CrunchyScan** : une clearance déjà présente au `DOMReady` ne peut rien prouver (la requête qui a servi le challenge la contenait déjà). Baseline = `clearanceBaseline` lue au `DOMReady` + fallback « première lecture réussie » ; logique en `NormalizeClearance()` / `NextClearanceState()`.
- **`win.Show()` obligatoire en mode Automatic pour tout site fork-handled** : perdu par le refactor `1dfea5555` (1er sept.) qui ne l'appliquait plus qu'à l'opt-in « stalled reload », alors que `1bb8d2fc1` (28 août) l'avait ajouté pour tous et que la règle est documentée plus bas (§ CrunchyScan, point « `win.Show()` en Automatic »). Sans affichage, le challenge tourne en background → jamais résolu → timeout → re-ouverture en boucle.
- **Reader-first extraction** : une seule fenêtre visible avec DRM bootstrap en preload ; le script protégé du site décode la liste complète des pages une fois le puzzle résolu — pas de 2e fenêtre DRM (budget 30s toujours dépassé par captcha_d.js async)
- **Page-selector walk** : quand le lazy-load drain plafonne à ~110 images malgré l'indicateur du sélecteur de pages (volume), l'extraction récupère les pages restantes en fetchant les URLs du sélecteur same-origin dans la fenêtre déjà déverrouillée (3 workers, 15s/timeout, 100s budget)
- **Source-breakdown diagnostics** : `ReaderExtraction` expose `drm`, `dom`, `selector` pour diagnostiquer d'un coup d'oeil si la récupération a échoué
- Scroll limit 500 steps, stable detection 20 steps, timeout 300s
- Cloudflare résolu via plugin navigateur (Interactive mode)

### JapScan — probe harvest & DRM (sept. 2026)
- **Plafond ~110 = artefact de MONTAGE, pas de construction** : le site construit les ~204 URLs CDN en UN burst unique à l'init de la page (~700ms à +3.3s, déterministe, ordre d'affichage, identique inter-sessions) ; le reader ne monte que ~110-115 (virtualisation : ~5 <img> recyclés, IntersectionObserver unique sur sentinel).
- **Probe obligatoirement en PRELOAD** : un wrapper post-load (executeJavaScript) ne voit RIEN (références aliasées à l'init) → `DRM_URL_PROBE_PRELOAD` (`__jpUrlProbe`) enregistre fetch/XHR/img-src/setAttribute/IO/MO, filtre image-only.
- **Harvest** (`finalize()` JapScan.Extract.ts) : la décision est encodée dans `ProbeAdoption(probeLen, domLen, total, anchor, overlap)` — (a) il apporte **≥5 pages de plus** que le DOM (lecteur de volume), (b) il **couvre le total annoncé** (chapitre courant : probe = total, DOM = total+1), ou (c) il est **partiel** mais domine le DOM, couvre ≥ 70 % du total et recouvre le DOM à ≥ 90 % (construction interrompue : 167/204 accepté, 130/204 refusé) — dans tous les cas avec ancre d'ordre (5 premières URLs DOM, match sans query, forward/reversed, overlap ≥ 50%) puis plafonnement à `total`. Une session où le probe reste très en dessous (< 70 % du total) est toujours refusée proprement.
- **Filtres** : chrome (`location.hostname`/`www.*`), `_banner_`, `/e44j82.jpg` ; N+1 stray (remount token-refreshé) droppé (`c32e7b292`).
- **⚠️ Un filtre n'existe que dans UNE branche = il n'existe pas** (fix 27 sept, v3.0.7) : l'anti-chrome (host du document/`www.*` + marqueurs) était écrit **à l'intérieur** de la branche `adoptProbe`. Or cette branche n'est prise que si `probe >= DOM+5` **et** `probe >= total` **et** une ancre d'ordre existe — sur un chapitre courant (dom: 17, probe: 14, total: 13) elle est refusée → chute dans `else { links = domLinks }` qui renvoyait la liste **brute** → les images de chrome du lecteur (`/images/top-banner-728x90.png`, `/images/donate.png`, créas `/imgs/japys/`), qui passent le test CDN générique (hôte JapScan + extension), comptaient comme des pages : « toujours 4 vignettes parasites » avec `dom: 17` contre `total: 13`. Filtré une fois, en amont de toutes les branches : `FilterSiteChrome(rawDomLinks, location.hostname)` (exporté, testé, marqueurs + host/apex hors `/manga/` + répertoires d'assets statiques + noms de chrome). **Règle** : une règle de correction doit être appliquée à la source (liste produite), jamais à une branche de fusion ; et toute logique de correction doit laisser une trace mesurable (`chrome: N` + `chromeDropped` dans la diag) — c'est ce qui a rendu le diagnostic immédiat a posteriori.
- **⚠️ Un candidat qu'aucune règle ne peut attraper → comparer à la liste de référence** (fix 27 sept, v3.0.7) : après `FilterSiteChrome` il restait **toujours 1 page de trop** (dom 17 → chrome 3 → **14** livrées contre `total: 13`, overlap 0,929). La sonde `probeMiss` (URLs DOM absentes de `imgUrls`) montre que ce résidu est une URL **fetchée par le site mais jamais affectée à un `<img>`** — c'est la même qui déclenche l'erreur CORS du log. Elle passe toutes les règles hôte/chemin puisqu'elle est légitime côté CDN ; seul le *fait qu'elle ne soit jamais montée* la distingue. **Règle** : quand une règle « à la main » ne peut pas séparer deux choses, comparer à la liste déjà détenue et jugée complète (ici `imgUrls`, de longueur exactement `total`) plutôt que d'ajouter une règle de plus. Le garde existant (`probe >= DOM+5`) empêchait précisément ce cas : il supposait qu'un probe plus petit ne pouvait être que faux.
- **⚠️ Un compteur d'arrêt qui lit un ensemble qu'on filtre ENsuite = décalage permanent** (fix 27 sept, v3.0.7) : drain, marche du sélecteur et scroll testaient `seen.size >= total`, alors que `seen` contient **aussi** le chrome (3-4 entrées) que `finalize()` retirera. L'arrêt tombait N URLs trop tôt → `links.length = total - N` → `IsIncompleteReaderResult` déclenchait le fallback DRM, et l'utilisateur devait « relancer 2-3 fois sur les gros chapitres jusqu'au timeout ». C'est une **régression introduite par le fix précédent** : avant, le chrome comptait comme page et le total tombait juste par accident. **Règle** : toute condition d'arrêt doit mesurer la même chose que ce qui sera livré (`contentSize()` = même filtration que `finalize()`). Un correctif qui retire des éléments doit vérifier **tous** les compteurs qui supposaient leur présence.
- **⚠️ Le script d'injection n'est type-checké par personne** (fix 27 sept, v3.0.7) : le corps vit dans un template literal de ~800 lignes → `tsc` ne le voit pas, aucun test ne l'évalue, et **un backtick dans un commentaire le ferme prématurément** (3ᵉ occurrence de ce piège — voir l.108). Survenu une nouvelle fois sur nos propres commentaires de fix. **Règle** : sortir le template dans une fonction exportée (`BuildReaderScript(eventName)`) et lui adjoindre un test qui fait `new Function(script)` — la moindre coquille ressort immédiatement, y compris celles des fonctions interpolées via `.toString()`.
- **⚠️ Un test d'arrêt qui ne voit que la moitié de la source** (fix 28 sept, v3.0.7) : `contentSize()` (fix précédent) corrigeait le décalage chrome/DOM, mais le DOM n'est **pas** la source d'autorité sur un volume — il plafonne à ~110 montages alors que le lecteur continue de construire les URLs annoncées. Sur `dreamland/24` le drain est sorti sur `stall` à 24,1 s, **au moment exact où le site achevait sa construction** (dernière affectation d'`<img>` à 33,4 s, `fetch:404 = 2` côté site contre 0 sur les deux réussites) → `finalize()` coupé en plein travail, 167 URLs retenues sur 204. Fix : `progressSize()` = `max(contentSize(), probeSize())` tant que `0 < probe < total`, appliqué au drain et au scroll ; **dès que le probe couvre le total il cesse de piloter l'attente**, donc le chemin normal garde exactement son ancien rythme (les réussites ont un probe déjà complet avant le drain). **Règle** : une condition d'arrêt doit observer *toutes* les sources dont le résultat dépend, pas seulement celle qui a causé le dernier bug — et le signal d'attente doit re-devenir neutre quand la source qu'on ajoute n'a plus rien à dire, sinon on rallonge tous les cas sans exception.
- **⚠️ Un refus qui jette ce qui existe** (fix 28 sept, v3.0.7) : `adoptProbe` exigeait `probe >= total`, donc les 167 URLs déjà construites étaient abandonnées pour les 106 liens DOM — la moitié du chapitre, pour un écart que la règle était censée gérer. La décision est sortie dans `ProbeAdoption(probeLen, domLen, total, anchor, overlap)` (pure, exportée, testée, sérialisée via `.toString()`) avec une 3ᵉ voie `partial` (domine le DOM de +5, ≥ 70 % du total, overlap ≥ 90 %) ; la diag marque `adopt: "partial"` et `budget.probeAtDrain` dit si le déficit venait du site ou de notre arrêt. **Règle** : quand une condition de confiance est binaire, écrire ce qui se passe quand elle échoue — un rejet doit chuter vers la *meilleure* liste disponible, pas vers la seule autre branche ; et sortir la décision dans une fonction pure rend ces seuils discutables et testables au lieu d'être noyés dans un template literal.
- **DRM payload toujours 0** (`drmPages: 0`) : le preload patche `String.prototype.replace` (Proxy) en attendant un retour base64 `{"ax":[...],"pi":n}` ; déploiement correct (preload réel, main world, tous les frames) → hook stale le plus probable, puzzle/per-batch gating possibles. Test décisif : `replaceProxyActive` (`toString()` spoofé) + compteur de calls atob→`{ax,pi}`.
- **Deadlines** : budgets internes ≈ 495s > budget hôte/timeout DownloadTask 300s → `EXTRACT_DEADLINE` 240s (clamp de chaque phase) + hardTimer resolve(finalize()) inconditionnel.
- **Console** : les logs du script d'extraction (executeJavaScript) ne remontent PAS (fenêtre séparée) → timings portés par l'objet résultat + routage `[ReaderWindow]` pour les logs du contexte page.
- **Pièges de sérialisation** : backticks dans les commentaires DANS un template literal → TS1005 (3ᵉ occurrence le 27 sept. — attrapé désormais par le test `BuildReaderScript` qui parse le script rendu) ; `\/` → `/` (échappement) → `new URL(link).hostname` + `/^www[.]/i` ; `page.evaluate` = STRING pas fonction ; pas de `.then` sur wrapper SetTimeout sans vérif de type (mock vitest → objet Timeout).
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
- **Mises à jour : 1 requête GitHub/heure maximum** (8 oct., v3.0.20) — l'API `api.github.com` **non authentifiée** n'accepte que **60 requêtes/heure par IP** (`X-RateLimit-Reset` donne l'heure de remise à zéro en Unix), et chaque clic sur « Check for updates » déclenchait une requête neuve via `AppUpdate.Check()` : quota épuisé → `403` → `if (!response.ok) return null` → **l'échec s'affiche « Up to date »** — mensonge volontaire du panneau (*« an unreachable update service must not break the UI »*). Diagnostic : sonder l'endpoint exact de l'app (`releases/latest`, même User-Agent `chainsmokerneko-update-checker`) et `/rate_limit` ; `gh` CLI est **authentifié** (quota 5000/h séparé) — ne pas le confondre avec la limite de l'app. Fix : `UPDATE_CHECK_INTERVAL_MS = 60 min` revendiqué **avant** l'envoi, dans le main electron (seul point réseau : le build nw renvoie `null` statique, les notes « What's new » viennent du changelog embarqué) — tous les déclencheurs (démarrage, clics, appels concurrents) reçoivent le dernier résultat sans réseau, **échec compris** : un service hors ligne ou limité n'invite jamais une tempête de re-essais. Règle à retenir : aucun bouton ne doit pouvoir générer un appel réseau non borné, et un état d'erreur mériterait d'être distinguable d'un « à jour » dans l'UI (non fait, proposé).

- `PatternLinkGenerator` est infini (`for (let page = start; true; page++)`). `isMissingLastItemFrom` compare le dernier élément entre pages — si le site retourne des items différents à chaque page (pas de pagination triée), la comparaison ne matche jamais → **loop infini → 3+ Go de RAM**. Fix : ajouter `maxPages` au decorator `MangasMultiPageCSS` (défaut 0 = infini) + throttle + break si page vide.
- Bundle Windows local : NSIS portable via `MAKENSIS`, cache Electron partagé `HAKUNEKO_ELECTRON_CACHE` ; `npm run bundle` NE reconstruit PAS web (copie `web/build`) → `build:web` d'abord, vérifier le fix DANS les artefacts (esbuild minifie : `300000`→`3e5`).
- PATH machine Windows : guillemets nus dans le PATH registre cassent tous les lifecycle npm imbriqués ; filtre via `.tmp/fix-machine-path.ps1` ; le shell agent garde un PATH obsolète → `export PATH="$(echo "$PATH" | tr -d '"')"`.
