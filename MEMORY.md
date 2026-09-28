# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 28 septembre 2026 — état courant **v3.0.7** (release poussée **et validée en réel**) ; sessions du 1→4 sept condensées en §12 ; règles durables → AGENTS.md, leçons techniques → LESSONS.md
> 📚 Structure doc : **MEMORY.md** = état courant · **AGENTS.md** = règles durables · **LESSONS.md** = leçons techniques — carte complète des docs racine en §0
> Dernière mise à jour (état) : 28 septembre 2026 (fix boucles Cloudflare CrunchyScan **puis JapScan** — voir addenda ci-dessous ; v3.0.7 poussée, validée au premier coup)
> ⚠️ **Règles durables** (langue, git/commits, push, suppressions, régression, versioning, release, i18n, build/CI, tests, pratiques agent) → voir **`AGENTS.md`**
> ⚠️ **Leçons techniques** (plateforme, Cloudflare, sites, CI/CD) → voir **`LESSONS.md`**

---

## 0. Carte des documents (racine)

| Fichier | Rôle |
|---|---|
| `README.md` / `README.en.md` | Présentation produit FR/EN — features, installation, releases |
| `MEMORY.md` | État courant du projet (ce fichier) — à lire en début de session |
| `AGENTS.md` | Règles durables agents — langue, git/commits, versioning, build/CI, tests |
| `LESSONS.md` | Leçons techniques — plateforme, Cloudflare, sites, CI/CD, JapScan, exporters |
| `SYNC.md` | Procédure de sync upstream + structure 2 branches (master vierge / chainsmoker) |
| `CLOUDFLARE.md` | Guide utilisateur bypass Cloudflare — cf_clearance, puzzles, status 0.1.5→3.0.0 |
| `CHANGELOG.md` / `CHANGELOG.en.md` | Journal des versions FR/EN |
| `BENCHMARKS.md` | Mesures de perf réelles via CDP — filtre liste (70k titres), viewer |
| `ROADMAP.md` | Vision produit / feuille de route (v3.0.0) |
| `CONTRIBUTING.md` | Guide de contribution — workflow, conventions |
| `SECURITY.md` | Politique de signalement des vulnérabilités |

---

## 1. Le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. **Web app** (TypeScript, Svelte + quelques composants Vue)
dans un shell **Electron** (Chromium 150, Node 26 local / 24 CI).

- **Repo** : [Endymi0n74/ChainsmokerNeko](https://github.com/Endymi0n74/ChainsmokerNeko)
- **Upstream** : `manga-download/haruneko`
- **Version courante** : **3.0.7** (28 septembre 2026) — fix boucle Cloudflare JapScan + cause racine du timeout de téléchargement (stall guard vs `CHAPTER_UPDATE_TIMEOUT_MS`), commit `b448bd64c`, tag + release GitHub (Latest, 10 artefacts CI), CI verte ; validée en réel au premier coup. Versions antérieures : 3.0.6 (27 sept., boucle CrunchyScan) ; voir §12 addenda.
- **Release courante** : [ChainsmokerNeko 3.0.4](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.4) — 10 artefacts CI (3 zips + 3 NSIS Windows, AppImage, .deb, 2 DMG) ; releases 3.0.0→3.0.3 retirées le 5 sept (SHA préservés dans SYNC.md §1)

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
→ Déplacé vers `LESSONS.md` (§ Plateforme & scraping).

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
| + 17 upstream | divers | non câblés | Domaines morts/bloqués (historique dans git) |

## 4. Connecteurs — détails techniques

→ Déplacé vers `LESSONS.md` (§ Sites — Comix, MangaFire, CrunchyScan, ScanManga, JapScan, MangaNova). Le tableau de câblage (statut par site) reste en §3.

## 5. Cloudflare — Architecture

→ Déplacé vers `LESSONS.md` (§ Cloudflare & challenges) : fix UA, shared session, classification `FetchProviderCommon.ts`, ChallengeReload, widgetGone/CDP cookie check.

## 5b. Export amélioré + Omnibus (31 août)
- Export/PDF/CBZ/omnibus + `CloudFlareRenewal` : `dff45a7a7` (feat(export)). Japon : puzzle/collecte v3.0.2 : `1dfea5555` ; timeouts 300s + pré-chauffage : `fd0f5608c`/`cf615186f` ; reader-first : `c3289d7fe`. Détails techniques : `LESSONS.md` §Exporters + §JapScan. Récapitulatif : §12.

## 6. Frontend — Fixes

### VirtualList Bookmarks (`MediaSelect.svelte`)
- Virtual scroll désactivé pour plugin Bookmarks (`VThreshold * 2` bypass)
- CSS `.no-scroll { overflow-y: visible; }` quand Bookmarks sélectionné
- Validé : 103+ bookmarks tous visibles sans scroll forcé ✅

## 7. CI/CD (`push-ci.yml`)

Pipeline **5 jobs en cascade** à chaque push non-docs (paths-ignore : `*.md`, `docs/**`, `MEMORY.md`) — en pratique sur `chainsmoker` (jamais de push direct sur `master`, upstream vierge) ; PRs via `pull-request-ci.yml`:

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
- **Déclenchement release** : push d'un tag `3.*` sur `chainsmoker` (condition `startsWith(github.ref, 'refs/tags/3.')`) — jamais sur `master` (pristine) ; la release prend le nom du tag poussé (`github.ref_name`)
- ⚠️ Pas d'unicode dans commentaires YAML GitHub
- ⚠️ Pas `${{ runner.* }}` dans bloc `env:` de job

### Local build
⚠️ Ordre fiable (AGENTS.md §6) : `vite build` (web) → `build-app.mjs` → `vite build` (main) → `vite build --config vite.preload.config.ts` (preload, config SÉPARÉE) → copier `web/build` → `build/web`.
```bash
# Web
cd haruneko/web && node ../node_modules/vite/bin/vite.js build
# App (purge build/, copie web/build + package.json)
cd haruneko/app/electron && node ./scripts/build-app.mjs
# Main
cd haruneko/app/electron && ../../node_modules/.bin/vite build
# Preload (config séparée — la compilation conjointe cassait)
cd haruneko/app/electron && ../../node_modules/.bin/vite build --config vite.preload.config.ts
# Copier le web build APRÈS (le build principal ne nettoie pas)
cp -r ../../web/build/. build/web/
# Bundle x64
cd haruneko/app/electron && node scripts/bundle-x64.mjs
# Full deploy (3 arches)
cd haruneko/app/electron && node scripts/deploy-app.mjs
```

⚠️ `makePortable()` supprimé — zips ne contiennent plus de `userdata/`.
⚠️ `npm run bundle` NE reconstruit PAS web (copie `web/build`) → `npm run build:web` d'abord, et vérifier le fix DANS les artefacts (AGENTS.md §6).

## 8. Tests

```bash
cd haruneko/web && node ../node_modules/typescript/bin/tsc --noEmit           # web
cd haruneko && node node_modules/typescript/bin/tsc --noEmit -p app/electron/tsconfig.json  # electron
cd haruneko/web && node ../node_modules/vitest/vitest.mjs run                  # unit (2153 passed, 6 sept 2026)
cd haruneko/web && npm run check:lint                                          # eslint (depuis web/, PAS --ext .ts,.svelte,.vue)
cd haruneko/web && node ../node_modules/svelte-check/bin/svelte-check
cd haruneko/web && node ../node_modules/vue-tsc/bin/vue-tsc --noEmit
```

### E2E (test/Puppeteer*)
- Commande (DEPUIS la racine `haruneko/`, PATH node exporté) : `node node_modules/vitest/vitest.mjs run --config test/vitest.websites.ts <Site>_e2e` — tuer electron.exe + port 5000 avant (AGENTS.md §7)
- `CloudflareList_e2e.ts`: listing mangafire ✅, comix ✅, mangadrama ✅, crunchyscan (skip si IP Cloudflare)
- `MangaNova_e2e.ts`: catalogue, fiche, chapitres, 93 pages, image
- `ScanManga_e2e.ts`: 5/5 vert (plugin, manga, chapitre 1-2s, page, blob 658k)
- **Convention anti-régression**: → voir `AGENTS.md` (§ Tests) — chaque changement vérifie les e2e existants AVANT déclaration terminé
- **CDP timeout 300s** (`PuppeteerFixture.ts`) pour listings longs (mangafire 70k+)

## 9. Conventions

→ **Règles durables déplacées vers `AGENTS.md`** (§ Conventions & process) : langue française, pas de `git add -A`, format de commit, pas de push sans demande, aucune suppression sans approbation, aucune régression, versioning 3 manifests + CHANGELOG, release « ChainsmokerNeko <version> », pas de userdata dans les bundles, rafraîchissement MEMORY.md ≥ 2×/heure.

## 10. Outils & environnement

- Electron 43.3.0 (Chromium 150), Node 26 local, CI Node 24
- `.npmrc`: `engine-strict=true`, `package-lock.json` committé (`npm ci` en CI)
- `app/electron/.tmp/` : builds de test, sondes, cache electron-zips (D:)
- `app/electron/bundle/` : zips/dmg/appimage de distribution (local = ère v3.0.2, voir §12)
- Env bundle : `MAKENSIS` (NSIS portable), `HAKUNEKO_ELECTRON_CACHE=D:\Codex\.electron-cache`
- ⚠️ Windows quirks: `//` au lieu de `/` pour paths Git Bash, `taskkill //F //IM` pour tuer l'app
- Lancement app : `node .tmp/launch-app.mjs` (détaché, profil `.user-data`, log `.tmp/electron-launch.log`)
- Sonde = `electron.exe app/electron/.tmp/xxx.cjs`, PID identifiable via `tasklist | grep electron`

## 11. Leçons techniques

→ Leçons CI/CD & bundling, Cloudflare, CrunchyScan, ScanManga déplacées vers **`LESSONS.md`**.
→ Pratiques agent/outils : voir **`AGENTS.md`** (§ Pratiques agent/outils).

## 12. Travaux récents (sept. 2026)

> Résumé des sessions du 1er → 4 sept. Détails techniques : `LESSONS.md`. Règles : `AGENTS.md`. Historique complet : git.

### Statut & points ouverts
- **v3.0.4** (5 sept.) : fusion upstream fork-first (`48cf9aebd`) + restructuration 2 branches (master vierge / `chainsmoker` produit) + suite de checks verte — voir la procédure de sync ci-dessous.
- **v3.0.3** (4 sept.) : bump 3 manifests + CHANGELOG, poussé sur `fork` → release CI « ChainsmokerNeko 3.0.3 » (10 artefacts). ⚠️ Bundle local `app/electron/bundle/` = ère v3.0.2 (hash MTN3PIJW) — les artefacts 3.0.3+ sont produits par la CI.
- **Validé utilisateur (6 sept.)** : JapScan v3.0.4 — chapitres téléchargés complets (puzzle au 1er lancement, Dreamland vol-24 = 204 pages, file non bloquée par les timeouts). Reste à confirmer au prochain volume : ligne log `[JapScan] … (probe: N, total: 204)` dans `.tmp/electron-launch.log`.
- **E2E** : ScanManga 5/5 + MangaNova 7/7 ✅ ; JapScan e2e 🚫 bloqué (Cloudflare interactif, profil temporaire sans `cf_clearance`) → validation runtime manuelle.
- **Vérification CDP automatisée abandonnée sur instruction** : la validation manuelle est la seule preuve acceptée.
- **Clôture (6 sept.)** : tout est validé ✅ — le projet est mis de côté (aucune tâche active prévue).

### JapScan — volumes complets via probe harvest
- **Reader-first** (`c3289d7fe`) : une seule fenêtre reader visible avec bootstrap DRM en preload ; fallback DRM séquentiel (`CreateImageLinks`).
- **Probe preload** : la construction des URLs CDN (burst unique ~700ms, déterministe, ordre d'affichage) n'est visible qu'en PRELOAD (`__jpUrlProbe`) — le reader ne monte que ~110-115 des ~204 pages (virtualisation). `finalize()` adopte `imgUrls` si ≥5 pages de plus que DOM + couvre le total annoncé + ancre d'ordre OK.
- **Résultat** : Dreamland vol-24 → `1.png..204.png` (204 fichiers) ; Saint Seiya Dark Wing vol-7 → 157/156. Filtres chrome + `_banner_`/`e44j82.jpg` ; N+1 stray supprimé (`c32e7b292`).
- **DRM payload** : `drmPages: 0` (12+ runs) — hook `String.prototype.replace` jamais déclenché ; non bloquant (test décisif `replaceProxyActive` : LESSONS.md §JapScan).
- **Diag** : `drm/dom/selector/probe` + `[JapScan] reader diag` + timings `puzzle/drain/walk/scroll` portés par l'objet résultat + console reader routée `[ReaderWindow]`.

### Timeouts de téléchargement (1 sept.)
- Stall 15s/page (`wait_with_timeout` + `STALL_TIMEOUT_MS`), watchdog `DownloadManager.Process()` (inactivité 15s → Abort → Failed, la file avance), `CHAPTER_UPDATE_TIMEOUT_MS = 300s`. Tests : 40/40 moteur, 2154/2154 web.

### Export & omnibus (31 août, `dff45a7a7`)
- PDF thèmes White/Sepia/Dark + double-page ; CBZ streaming image-par-image ; omnibus (Collection → 1 volume CBZ/EPUB/PDF). `CloudFlareRenewal.ts` : renouvellement périodique `cf_clearance` en arrière-plan. Détails : LESSONS.md §Exporters.

### Bundles & environnement Windows (2 sept.)
- Bundle multi-arch : 3 zips + 3 NSIS dans `app/electron/bundle/` ; NSIS portable via `MAKENSIS` ; cache Electron partagé `HAKUNEKO_ELECTRON_CACHE` ; ⚠️ `npm run bundle` ne reconstruit PAS web (AGENTS.md §6).
- PATH machine réparé (guillemets corrompus) via `.tmp/fix-machine-path.ps1` ; index git recréé (`git reset` après disparition de `.git/index`) ; commit `0ce03b955` (preload config + `.user-data` ignoré).

---

## 📋 Procédure de sync upstream (documentée le 2026-09-05)

### Structure des branches (restructuration du 2026-09-05)

- **`master` (local + fork) = upstream vierge** `manga-download/haruneko` — ZÉRO commit fork.
  Tracking : `origin/master`, `pull.ff only` configuré (jamais de merge auto sur master).
  Sync = `git checkout master && git pull` → fast-forward, zéro conflit possible.
- **`chainsmoker` (local + fork) = ligne produit v3** (356+ commits fork : releases 3.0.x, couche
  Cloudflare/électron, sites conservés, viewer perf…). Tracking : `fork/chainsmoker`.
- **Tags retirés le 2026-09-05** (nettoyage releases + tags, seul `3.0.4` reste) : les tags
  `3.0.0` … `3.0.3` (releases supprimées) et `archive/*` (snapshots des branches `upstream/*`
  des PRs fermées #1797 cloudflare, #1798 perf, #1804 crunchyscan, #1805 japscan, variante
  -local) n'existent plus sur le fork ; leurs SHA sont préservés dans `SYNC.md` §1.

### Politique de fusion fork-first (pour intégrer upstream dans chainsmoker)

Contexte : le fork et l'upstream ont divergé **architecturalement** (refactor IPC/FetchProvider
upstream incompatible avec la couche Cloudflare du fork ; l'upstream supprime des sites que le
fork maintient). Une fusion naïve casse le build. Politique appliquée lors du merge 7d94f3a14 :

1. `git checkout chainsmoker && git merge origin/master --no-commit --no-edit`
2. **Conflits de contenu → garder le fork** : `git checkout HEAD -- <fichier>` pour chaque
   fichier en conflit de la liste `git diff --name-only --diff-filter=U`.
3. **Modify/delete → trancher selon le sens** : fork a supprimé → `git rm -f` ; upstream a
   supprimé un fichier que le fork utilise → `git checkout HEAD -- <fichier> && git add`.
4. **Sous-système platform/IPC → fork integral** : si le merge casse les types
   (`FetchConcealed`, `InterProcessCommunication`), restaurer TOUTE la couche depuis HEAD :
   `git checkout HEAD -- web/src/engine/platform app/electron/src app/nw/src app/src/ipc
   app/electron/vite.config.ts` et supprimer les fichiers ajoutés par l'upstream non utilisés
   (ex: `FetchConcealedRequest.ts`, `InterProcessCommunicationChannels.ts`, `CookieHelper.ts`).
5. **Fichiers supprimés par upstream mais utilisés par le fork** → restaurer depuis HEAD
   (sites web, workflows). Comparer : `git ls-tree -r --name-only HEAD` vs l'index du merge.
6. **i18n : ne JAMAIS éditer les 13 locales Crowdin** (ar_SA, de_DE, es_ES, fil_PH, fr_FR,
   hi_IN, id_ID, ja_JP, pt_PT, th_TH, tr_TR, zh_CN, zu_ZA) — `check:rules` compare au master
   upstream et refuse toute modification. Les clés fork-specific vont UNIQUEMENT dans `en_US.ts`
   (seule locale exemptée). Les autres langues afficheront la clé brute jusqu'à traduction.
7. **Valider** : `tsc --noEmit` dans web, app/electron, app/nw (binaire : `node_modules/.bin/tsc`
   à la racine) puis `npm run check --workspaces` (versions, eslint, svelte-check, vue-tsc,
   coding-rules).
8. Commiter le merge, pousser sur `fork/chainsmoker` — JAMAIS sur master.

### Leçons du merge 7d94f3a14

- `-X ours` ne suffit pas : l'upstream injecte quand même ses hunks non-conflictuels dans les
  fichiers semi-modifiés → restaurer explicitement depuis HEAD les fichiers qui doivent rester
  100% fork (vérifier avec `git rev-parse HEAD:<fichier>` vs `:0:<fichier>`).
- 44 fichiers en conflit + 37 fichiers platform/IPC différents + 31 fichiers restaurés :
  s'attendre à ce volume à chaque sync, la divergence est structurelle.
- `check:rules` crée une branche temporaire `master-local` depuis l'URL upstream en dur —
  échoue si pas d'accès réseau à github.com.
- Les settings du viewer fork (ex: `ViewerPreloadNextItem`) doivent être déclarés dans
  `stores/Settings.svelte.ts` (enum Key + Initialize + SettingStore) ET dans `en_US.ts`, sinon
  svelte-check échoue sur ImageViewer/Settings.svelte.

### Addendum 23 sept. — v3.0.5, dead-code, CI

- **Sync amont + release 3.0.5** (`2b408c48e`, `a129ea9c6`) : 91 commits upstream, dead-code knip (`+5 -376`), tag + release `3.0.5` (zip win32-x64 buildé localement, JapScan 0 touch).
- **Push CI rouge → vert** (`86511e874`, `0206d27a3`, `d856bc03e`, `138f1cd33`, run `35842839549` SUCCESS 12m11s le 23 sept.) : (1) le merge avait committé 84 marqueurs `<<<<<<<` dans `package-lock.json` → `npm ci` EUSAGE ; (2) postinstall `nw@0.116.0-sdk` (`yauzl-promise`/`@node-rs/crc32` natif) crashait sur ubuntu — fausses pistes `--ignore-scripts` (cassait le `prepare` de `websocket-rpc`) et Node 24 latest (npm ignore `allowScripts`) ; vraie cause : lock régénéré sous Windows sans les variantes Linux/macOS → `npm update @node-rs/crc32` (1.10.6→1.10.8, 13 plateformes enregistrées). Leçon : régénérer un lock multi-plateforme se vérifie par audit des `optionalDependencies`, pas au jugé.
- **Jobs nettoyés** : `Continuous Deployment` déjà supprimé d'upstream (plus de fichier sur master) ; `Website Status/Metrics` désactivé via API le 23 sept. (schedule rouge 2×/sem., bug npm `edgesOut` sur master sans lockfile — irréparable sans toucher master pristine). Restent actifs : `Push (CI)`, `Pull Request (CI)`.
- **Clé `CatharsisWorld.ts:91` (alerte secret GitHub)** : clé API publique du site héritée d'upstream (`cd4a4e19c`), pas un credential privé — alerte à dismiss en faux positif, rien à purger.

---

## Addendum 27 sept. — CrunchyScan : boucle Cloudflare (flash + timeouts en série)

**Symptôme remonté (release 3.0.5 installée)** : la fenêtre challenge Cloudflare « clignote » et les tentatives s'enchaînent en timeouts (~150 s).

1. **Flash = baseline `cf_clearance` manquante** (`web/src/engine/platform/FetchProviderCommon.ts`) : le poller comparait le cookie à `budget.lastReloadedClearance = ''`, donc l'ancien cookie **persisté** passait pour « frais » dès le 1er check (~5 s) → `window.location.reload()` → le Turnstile repartait de zéro, l'utilisateur ne pouvait plus valider → timeout. Fix : nouvelle `ReadClearance()` (CDP) dont la baseline est **re-lue à chaque `DOMReady`**, reload uniquement si la valeur a changé depuis cette baseline (= clearance émise par ce document). Budget toujours 1 pour CrunchyScan. Historique : `6b0b3a531` avait restreint le reload au mode `Automatic`, `851d04f36` l'avait annulé le soir même — la baseline traite la cause racine (détail dans `LESSONS.md`).
2. **Série de timeouts = une fenêtre DRM par chapitre** (`web/src/engine/websites/CrunchyScan.ts`) : `CrunchyScan.DRM.CreateImageLinks` ouvre une fenêtre par chapitre, sans garde → N × 150 s. Fix : drapeau `challengeSuspected` posé à l'échec + probe **sans fenêtre** avant toute nouvelle ouverture (403/503, header `CF-Mitigated`, `<title>` interstitiel « Just a moment / Un instant ») : toujours challengé → `Exception(FetchProvider_Fetch_CloudFlareChallenge)` immédiate (message localisé existant) ; session réchauffée (lien URL du plugin = `window.open`, ou import `cf_clearance` en Settings) → la porte se rouvre d'elle-même. `initializePromise` n'est plus cachée en échec (retry possible après réchauffage).

**Validations** : `tsc --noEmit` web ✅ + electron ✅ · `eslint .` ✅ · vitest **2164 passed** ✅ · **`CloudflareList_e2e` 5 passed / 1 skipped** ✅ (mangafire + comix + mangadrama : couvre le code plateforme partagé, rejoué 2× dont 1× après le garde timeout CDP 5 s) · `CrunchyScan_e2e` : 9/10 échecs avec le fix contre **10/10 sur HEAD propre** → échec antérieur, environnemental (IP marquée par Cloudflare, cas déjà `it.skip` dans `CloudflareList_e2e`) — **aucune régression**.
⚠️ `web/build` reconstruit (nécessaire pour tout e2e) ; fichiers **non committés** : `FetchProviderCommon.ts`, `CrunchyScan.ts`, `LESSONS.md`, `CLOUDFLARE.md`, `MEMORY.md`.

---

## Addendum 27 sept. (2) — JapScan : boucle Cloudflare (puzzle trop souvent + fenêtre qui tourne)

**Symptômes remontés** : « puzzle à résoudre trop souvent » et « fenêtre cloudflare qui tourne en boucle quand on valide ». **Deux causes complémentaires — aucun des deux correctifs ne suffit seul** :

1. **Détection du puzzle par existence au lieu de visibilité** (`web/src/engine/websites/JapScan.ts`) : `!!document.querySelector('#jc-overlay')` alors que le nœud **persiste dans le DOM après résolution** (masqué en CSS — déjà documenté en 3.0.3 pour la *collecte*, mais la **classification** n'avait jamais été alignée). `CheckAntiScrapingDetection` ne retournait donc jamais `None` → dans `PollForChallengeResolution`, `cleared = widgetGone || (isChallenge !== true && antiScraping === None)` restait faux (et `widgetGone` est de toute façon forcé à `false` sur `japscan.`) → **40 tentatives puis timeout de 150 s** → le connecteur rouvre une fenêtre → boucle visible. Fix : trancher sur la **visibilité** (`display`/`visibility`/`opacity`/`offsetHeight`), exactement `isBlocked()` de `JapScan.Extract.ts` ; l'annonce pré-rendu `window.__captcha.needed` reste couverte car le n'existe pas encore à ce stade. Script exporté en `JAPSCAN_CHALLENGE_DETECTION_SCRIPT` pour être testable.
2. **`cf_clearance` persisté pris pour « frais »** (`web/src/engine/platform/FetchProviderCommon.ts`, `PollForChallengeResolution`) : `let lastClearance = ''` → la **première** lecture CDP (~4 s) faisait passer l'ancien cookie pour une clearance fraîche → `cleared = true` → `runScript()` **pendant la validation**, fenêtre détruite, extraction sur page verrouillée (peu de pages) → `ShouldCompleteWithDRM` → fenêtre DRM suivante → un nouveau challenge. **Même cause racine que le fix CrunchyScan du 27 sept** (§ addendum précédent), juste une autre occurrence. Fix : baseline = valeur lue au **`DOMReady`** (même `clearanceBaseline` que `ReloadStalledCloudFlareChallenge`), plus un fallback « première lecture réussie » si cette lecture a échoué ; seuls un **changement réel** ou une clearance **émise après** la baseline terminent le poller. Logique extraite en `NormalizeClearance()` / `NextClearanceState()` (pures, exportées, testées).
3. **`win.Show()` perdu en mode Automatic** (régression `1dfea5555` du 1er sept., qui avait écrasé `1bb8d2fc1` du 28 août) : la branche Automatic n'affichait la fenêtre que pour les sites opt-in « stalled reload ». `LESSONS.md` pourtant explicite : « JapScan et CrunchyScan ont besoin de cette fenêtre » → sans affichage, le challenge tourne en arrière-plan, ne se résout jamais → timeout → re-ouverture. Désormais **tous** les sites fork-handled affichent la fenêtre avant le poller.

**Retour utilisateur intermédiaire** : « clairement bien mieux » (boucle Cloudflare réglée) **mais « toujours les 4 vignettes parasites sur les chapitres »** → 4ᵉ correctif, 4ᵉ cause distincte :

4. **Vignettes parasites = images de chrome du lecteur remontées comme des pages** (`web/src/engine/websites/JapScan.Extract.ts`, `finalize()`) : sur `one-piece/1194`, le log montrait `-> 17 pages (dom: 17, total: 13)` et la diag `probeHarvest.domFirst` = `www.japscan.foo/images/top-banner-728x90.png`, `.../images/donate.png`, `.../imgs/japys/image-1.jpg` — soit **exactement les 4 pages en trop**, et l'image de pub visible dans le viewer est une créa `japys` servie depuis l'hôte du site (elle passe donc le test CDN « hôte JapScan + extension d'image »). Le filtre anti-chrome existait **uniquement à l'intérieur de la branche `adoptProbe`** (refusée ici : probe 14 < dom 17+5) → les trois autres branches (`drm`, DOM simple) renvoyaient la liste brute. Fix : fonction pure exportée **`FilterSiteChrome(links, documentHost)`**, appliquée **une fois** à `domLinks` avant toutes les branches (marqueurs `_banner_`/`/e44j82.jpg` · hôte du document/`www.`/apex hors arbre `/manga/` · répertoires d'assets statiques · noms de chrome sur tout autre hôte ; `/manga/` sur l'hôte du document conservé → un futur proxy same-origin ne peut pas vider le résultat) + trace mesurable : `chrome: N` dans le log et `chromeDropped` dans la diag. `domFirst` affiche désormais le chrome brut (avant filtrage) et `filteredLen` la longueur retenue.

**Retour utilisateur suivant** : « ça fonctionne » (le chapitre se lance bien) **mais « je dois relancer 2-3 fois sur certains gros chapitres en attendant un timeout jusqu'à ce qu'il charge les 200+ pages »** → 5ᵉ et 6ᵉ correctifs, plus les sondes demandées :

5. **La 4ᵉ vignette = une URL fetchée par le site mais jamais affectée à un `<img>`** : la nouvelle sonde montrait `dom: 17 → chrome: 3 → 14 livrées contre total: 13`, overlap probe/DOM **0,929** → une seule URL DOM absente de `imgUrls`, alors que cette liste contenait *exactement* `total` entrées. C'est la même URL que celle qui provoque l'erreur CORS du log (`…z937z31.jpg`) : le script du site la fetch, n'affecte jamais d'`<img>`, donc le lecteur ne l'affiche pas — mais elle entre dans `seen` via le resource timing et aucune règle hôte/chemin ne peut la distinguer d'une vraie page. Fix : `adoptProbe` accepte désormais aussi le cas **« le probe couvre le total annoncé »** (au-delà de l'ancien « probe ≥ DOM+5 »), ce qui donne exactement `total` pages dans l'ordre du site, plafonnées à `total`.
6. **Les conditions d'arrêt lisaient un ensemble que `finalize()` filtre ensuite** : `seen.size >= total` dans le **drain**, dans la **marche du sélecteur** et dans le **scroll** — alors que `seen` contient aussi les 3-4 entrées de chrome que `FilterSiteChrome` retirera. Arrêt N URLs trop tôt → `links.length = total - N` → `IsIncompleteReaderResult` → fenêtre DRM de secours / échec, d'où les relances. **C'est une régression du correctif 4** (avant, le chrome comptait comme page et le total tombait juste par accident). Fix : `contentSize()`, qui applique exactement la même filtration que `finalize()` (avec repli sur `seen.size` si le filtre lève).
7. **Garde-fous** : `filterSiteChrome` enveloppée d'un `try/catch` (une erreur de filtre ne doit jamais coûter tout le chapitre) et `clearTimeout(hardTimer)` en tête de `finalize()` (sinon le timer de 240 s ré-exécutait `finalize()` après un finalize normal et écrasait la phase rapportée).
8. **Sondes ajoutées à la demande** : `probeMiss` (URLs DOM absentes de `imgUrls`, c'est-à-dire les candidates qui ne sont pas des pages) et l'objet `budget` — phase active, `DEADLINE` si le timer dur a gagné, `drainExit` (`total`/`stall`/`budget`/`drm`), `walkUrls`, budget restant au démarrage de la marche (`walkRemainMs`) et `walkStop` (`timeout`/`complete`/`blocked`/`drm`/`no-urls`) — avec une ligne de log dédiée `[JapScan] … budget:`. Le script d'injection est désormais exporté **`BuildReaderScript(eventName)`** pour qu'un test le parse : son corps est un template literal que `tsc` ne type-check pas, et **un backtick dans un commentaire le ferme prématurément** — cette 3ᵉ occurrence du piège a été commise… pendant l'écriture de ces correctifs, et n'aurait été visible qu'à l'injection en production.

**Validations** : `npm run check` ✅ (tsc web + electron, eslint, `check:rules`, svelte-check 0/0, vue-tsc) · vitest **2185 passed** (+21 au total : 9 `FetchProviderCommon_test`, 4 `JapScan_test` détection, 6 `FilterSiteChrome`, 2 garde `BuildReaderScript`) ✅ · `check:versions` 3.0.7 ✅ · `npm run bundle:x64` ✅ → `app/electron/bundle/hakuneko-electron-v3.0.7-win32-x64.zip` (139 MiB, 104 fichiers), code nouveau vérifié présent dans `build/web/MUJMZ7LB/HakuNeko.js` · app relancée **pid 44144** (log `.tmp/electron-launch.log`, rotation faite). `CloudflareList_e2e` 5 passed / 1 skipped · `JapScan_e2e` 15 failed **= 15 failed sur HEAD propre** → échec antérieur/environnemental (IP marquée par Cloudflare) — **aucune régression**. ⚠️ Validation live **impossible depuis l'environnement** : IP marquée → le puzzle, les vignettes, le budget et les logs `[KUMO]`/`[JapScan]` ne peuvent être observés qu'en local par l'utilisateur (le test de syntaxe du script d'injection, lui, tourne dans la CI).

✅ Version **3.0.7 poussée et validée** : commit `b448bd64c` (19 fichiers, +981/−130), branche `fork/chainsmoker` + tag `3.0.7` léger, **CI verte** sur les deux runs, release **Latest** avec 10 artefacts ; arbre local **propre** (local == remote).

---

## Addendum 28 sept. — JapScan : le déficit venait du site, et nos conditions d'arrêt ne le voyaient pas

**Retour utilisateur** : « à nouveau le téléchargement de dreamland tome 24 a fonctionné après 2 timeout ». Recoupement des 3 `reader diag` du log `.tmp/electron-launch.log` (11:59:05 OK 204 p., 12:04:42 ECHEC 106 p., 12:10:04 OK 204 p.) :

- Tentative ratée : `probeLen=167 / total=204`, `domLen=109 -> filteredLen=106`, `overlap=0.991`, `anchorIdx=0`, `adopt=false`, `drain: 24.1s drainExit=stall`, `budget.walkRemainMs=215867` (215 s de budget inexploité).
- Côté site : `fetch:200=170` + **`fetch:404=2`** (les deux réussites : `fetch:200=205`, zéro 404), `imgSrc=167`, `firstMs=3500`, **`lastMs=33392`** contre 16 728 ms et 4 818 ms. Le site était ralenti (challenge interactif de 12:04:03) et s'est arrêté **de lui-même** à 167.
- Chronologie : dernière affectation d'<img> à 33,4 s après l'ouverture = **au moment exact** où le drain cédait sur `stall` (12:04:12 + 24,1 s = 12:04:36), soit 5,6 s avant `finalize()` (12:04:42). Les 37 URLs manquantes n'existent nulle part côté hôte.

**Deux défauts distincts, aucun ne suffisant seul :**

9. **Le stall ne voyait pas la construction du site** : `contentSize()` (fix du 27 sept.) ne mesure que le DOM, qui plafonne à ~110 montages sur un volume alors que le lecteur continue d'affecter les URLs des pages annoncées. Fix : `progressSize()` = `max(contentSize(), probeSize())` tant que `0 < probe < total`, appliqué au drain (`grown`) et au scroll (`currentCount` + condition de sortie) ; **dès que le probe couvre le total il cesse de piloter l'attente**, donc `progressSize()` retombe sur `contentSize()` et le chemin normal garde exactement son ancien rythme (les réussites ont un probe déjà complet avant le drain). `probeSize()` applique les mêmes marqueurs que `finalize()` (`_banner_`, `/e44j82.jpg`) ; `imgUrls` étant plafonné à 300 dans le rapport, aucune boucle d'attente infinie possible. Sonde `budget.probeAtDrain`.
10. **Un probe partiel était jeté au profit du seul DOM** : `adoptProbe` exigeait `probePages.length >= total`, donc les 167 URLs déjà construites étaient abandonnées pour 106 liens DOM — la moitié du chapitre. Décision sortie dans **`ProbeAdoption(probeLen, domLen, total, anchor, overlap)`** (pure, exportée, testée, sérialisée dans le script via `.toString()`) avec une 3e voie `partial` = `!coversTotal && total && dominates && overlap >= 0.9 && probeLen >= Math.ceil(total * 0.7)` ; cas réel : `ProbeAdoption(167, 106, 204, 0, 0.991).adopt === true` alors que `ProbeAdoption(130, 106, 204, 0, 0.991).adopt === false`. Le résultat reste incomplet (la fenêtre DRM de secours reste tentée), mais l'hôte reçoit la liste longue au lieu de la liste courte. Diag : `adopt: "partial"`.

**Piège reproduit puis corrigé** : en sortant la décision de `finalize()`, le bloc de déclarations du probe a été **dupliqué** (deux `const probe` / `const probePages` au même scope) — détecté à la relecture avant même `tsc`. Toute extraction de code depuis l'intérieur du template literal doit revérifier qu'aucune déclaration n'a été recopiée.

**Hors de portée (confirmé)** : `walkUrls=0` en permanence — `ReadPageSelectorURLs` ne renvoie rien (options = numéros nus) et la synthèse de templates (`base+n/`, `page/n/`, `?page=n`, `?p=n`) ne trouve aucune image fraîche dans le HTML brut, le lecteur construisant ses images en JS. Sur ce volume, c'est le site qui décide de la complétude : on ne peut que mieux récupérer ce qu'il a construit.

**Les « 2 timeout » restent non attribuables depuis l'environnement** : `grep Chapter update` / `Page fetch` / `timed out after` = 0 occurrence dans le renderer — `DownloadTask` ne `console.log` jamais ses erreurs, elles vont dans `this.errors` (statut UI uniquement). Intervalles entre tentatives : 4 min 58 s et 4 min 53 s, proches de `CHAPTER_UPDATE_TIMEOUT_MS` (300 s) alors que `Media.Update()` était rendu bien avant, et aucun mécanisme de relance automatique n'existe dans `web/src/engine`. **Question à poser à l'utilisateur : le texte exact des 2 messages.**

**Validations** : `npm run check` OK (tsc web + electron, eslint, `check:rules`, svelte-check 0/0, vue-tsc) · vitest **2195 passed** (+10 : 2 garde `BuildReaderScript` supplémentaires + 8 `ProbeAdoption`) · `check:versions` 3.0.7 OK · `node .tmp/check-script-syntax.mjs` -> `SCRIPT_SYNTAX_OK chars=50656 lines=820` OK · `npm run bundle:x64` OK -> `app/electron/bundle/hakuneko-electron-v3.0.7-win32-x64.zip` (139 MiB, 104 fichiers), nouveau hash **MUKRJWB1** (l'ancien MUJMZ7LB n'est plus dans `web/build`), code neuf vérifié dans `HakuNeko.js` (`probe@drain`, `ProbeAdoption`, `progressSize`, `partial`) -> app relancée **pid 20180**, log `.tmp/electron-launch.log` remis à zéro.

-> **Arbre non committé** ; commit/push/tag 3.0.7 uniquement après « ok on envoi ».


---

## Addendum 28 sept. (soir) - Le téléchargement s'annulait lui-même : deux bornes contradictoires

**Symptôme restant après les fixes d'extraction** : « le chapitre s'affiche dans le viewer, je résous le puzzle, le téléchargement timeout ; je reclic sur télécharger, nouveau puzzle, cette fois il se télécharge. »

**Instrumentation (fix J)** - deux logs ajoutés, **zéro** changement de comportement :
- `PollForChallengeResolution` logue **à chaque tour** : `[KUMO] poll#N cf=… widget=… site=… clr=… cleared=…`
- `DownloadTask` logue ses erreurs au `finally` : `[DownloadTask] <titre>: N error(s) -> …`

**Ce que le log a montré (Volume 24, 08:19-08:20, session pid 6708)** :
```
08:19:12  poll#1 cf=false widget=false site=Interactive clr=changed cleared=true
08:20:02  [JapScan] volume-24 -> 204 pages (total: 204, drain 39.3s)   <- extraction REUSSIE
08:20:02  [DownloadTask] Volume 24: 204 error(s) -> null | null | null
```
- Le poller **ne bloque pas** (résolu au 1er tour) : l'hypothèse du matin (« PollForChallengeResolution ne conclut jamais ») ne concernait que le cycle de 07:14, pas celui-ci.
- **204 erreurs en 17 ms** = impossible pour du vrai réseau -> signal déjà annulé.
- Message `null` = `new DOMException(null, 'AbortError')` dans `DeferredTask.RejectWhenAborted` : WebIDL convertit `null` en la chaine `"null"`.

**Cause racine** : `DownloadManager.RunWithStallGuard` (commit `cf615186f`, 2 sept.) annule toute tâche dont le progress n'a pas bougé depuis `PROCESS_STALL_TIMEOUT_MS = 20_000`. Or pendant `Media.Update()` **aucun** progress n'est produit - et c'est normal (fenêtre de lecteur visible, résolution du puzzle par l'utilisateur, lazy-load des URLs). Abort a ~20 s alors que le `WithTimeout(CHAPTER_UPDATE_TIMEOUT_MS = 300_000)` du **meme** commit continue en arriere-plan -> `Chapter update ... timed out after 300000ms` alors que l'extraction finit par rendre 204/204 ; les pages lancees ensuite recoivent un signal deja annule, echouent toutes, `errors` non vide -> `Media.Store()` **jamais** appele -> rien n'ecrit sur le disque. Le reclic reussit parce que le puzzle est deja resolu et qu'`Update()` passe sous 20 s. Le poller survit a l'abort et n'est tue qu'a la destruction de la fenetre (`Failed to find window with id 25`, 12 min 32 s apres son demarrage) - d'ou l'illusion d'un poller bloque.

**Fix K** : decision sortie dans la fonction pure exportee `StallTimeoutFor(status, progress)` - `Downloading` avec progress <= 0 (phase de resolution) -> `CHAPTER_UPDATE_TIMEOUT_MS + 30_000` ; sinon 20 s (download avec au moins une page, ou `Processing`). **Fix L** : `new DOMException('Aborted', 'AbortError')`.

**Lecons** (detail dans `LESSONS.md`, section Plateforme) : un garde-fou doit savoir **quelle phase** il surveille (« pas de progress » n'est un stall que depuis que le progress aurait du commencer) ; deux bornes posees ensemble doivent etre ordonnees (300 s sous 20 s ne sert jamais) ; une tâche dont les erreurs ne sont jamais journalisees est indiagnosticable - les deux logs ont rendu ce diagnostic possible en une session au lieu de trois.

**Validations** : `npm run check` OK (tsc x2, eslint, check:rules, svelte-check 0/0, vue-tsc) -> vitest **2199 passed** (+4 `StallTimeoutFor` + 2 assertions `message === 'Aborted'`) -> `npm run bundle:x64` OK -> `app/electron/bundle/hakuneko-electron-v3.0.7-win32-x64.zip` (139 MiB, 104 fichiers), nouveau hash **MUKWFCXB** ; code verifie dans le build (`StallTimeoutFor` dans `HakuNeko.js` = `t===Downloading&&r<=0?WA:UA` avec `WA = CHAPTER_UPDATE_TIMEOUT_MS+3e4` ; `new DOMException('Aborted','AbortError')` dans `InterProcessCommunication.js`) -> app relancee **pid 74708**.

**Validé par l'utilisateur le 28 sept.** : volume-24 (204 pages) télécharge **du premier coup**, sans reclic — extraction 204/204, drain 4.1 s (vs 39,3 s avant), **0** erreur de tâche, **0** timeout 300 s, **0** `stopping poller` anormal (session pid 74708, `MUKWFCXB`, 09:14:05). Le `[DownloadTask] N error(s)` n'est émis que si `errors.length > 0` : son absence = `Status.Completed` = `Media.Store()` appelé.
