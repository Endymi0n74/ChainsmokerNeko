# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 30 septembre 2026 — état courant **v3.0.16** (release **poussée et publiée** : fix des timeouts JapScan — ré-injection du script du lecteur après navigation de la fenêtre — + sonde de diagnostic `[probe]` avec récap automatique ; 3.0.15 = panneau « What's new » sur la page d'accueil ; 3.0.14 = fix du lien « Download on GitHub » de la bannière (coupure en plein mot), validé au harnais avant/après ; 3.0.13 = retry `hdiutil detach` en CI + release déclencheur du test auto-update ; 3.0.12 = **fix de la bannière de mise à jour** (jamais affichée) + entrée manuelle « Check for updates » ; 3.0.11 = ligne About affichée en entier ; 3.0.10 = menu About fusionné + auto-update verrouillée sur le fork ; 3.0.9 = composition des overlays traduits + drapeaux de langue + identité ChainsmokerNeko, voir addenda en fin de fichier) ; sessions du 1→4 sept condensées en §12 ; règles durables → AGENTS.md, leçons techniques → LESSONS.md
> 📚 Structure doc : **MEMORY.md** = état courant · **AGENTS.md** = règles durables · **LESSONS.md** = leçons techniques — carte complète des docs racine en §0
> Dernière mise à jour (état) : 30 septembre 2026 (**v3.0.16 publiée** — **fix des timeouts intermittents des chapitres JapScan** : la navigation post-clearance, 7 à 13 s après l'injection, tuait le script d'extraction (`ExecuteScript` ne se résout plus → timeout 300 s sans un seul retour du lecteur, 4 chapitres ratés documentés) → re-dispatch au `DOMReady` suivant avec jeton de tentative `attempt=N`, + **sonde `[probe]`** (horodatage, jalons d'étape, heartbeat 30 s, récap automatique du fil, relais de la console du lecteur) ; tag `3.0.16` poussé, run tag **36704105482** vert, 10 artefacts, **Latest** à 10:55 Z · **v3.0.15 publiée** — panneau « What's new » sur la page d'accueil (changelog embarqué + garde-fou de version) et carte d'accueil réécrite ; tag `3.0.15`, 10 artefacts à 04:26 Z · **v3.0.14 publiée** — fix du lien « Download on GitHub » de la bannière (coupure en plein mot relevée sur la capture utilisateur), validé au **harnais avant/après** (2 lignes cassées / 65 px avant → 1 ligne / 133 px après) ; **✅ auto-update validée en réel 3.0.12 → 3.0.13** : bannière « Update available — v3.0.13 » au lancement → Install → l'utilisateur repassé en 3.0.13 après redémarrage — première exécution complète de la chaîne · **v3.0.13 publiée** — retry `hdiutil detach` (3 essais, `-force`, 5 s d'attente, dernière erreur relancée) contre la flakiness « Resource busy » de la 3.0.11, et release **déclencheur** du test auto-update ; tag `3.0.13` poussé, 2 CI vertes, 10 artefacts, **Latest** à 13:47 Z · **v3.0.12 publiée** — **la bannière de mise à jour ne s'affichait jamais, pour personne** (`Store.WindowController` assigné **après** `mount()` → `onMount` lisait `undefined` → chaîne optionnelle raccourcie sans trace) : correctif double (assignation avant le montage + `$effect` réactif, test d'invariant) **et** nouvelle entrée manuelle **« Check for updates »** dans le menu About (état partagé via le store, requête unique en vol, libellé = statut) ; tag `3.0.12` poussé, 2 CI vertes, 10 artefacts à 13:26 Z · **v3.0.11 publiée** — entrée About affichée en entier (fix troncature Carbon, validé au harnais), tag poussé, release 10 artefacts à 12:28 Z · **v3.0.10 publiée** — menu About fondu en une seule ligne « Using version X — Vibe coding with Codebuff (Kumo) » → GitHub, et auto-update verrouillée sur le fork par la constante `UPDATE_REPOSITORY` ; tag `3.0.10` poussé, 2 CI vertes, 10 artefacts · **v3.0.9 publiée** — composition des overlays traduits KomaScans (validée au harnais ; téléchargement FR en réel : à confirmer) + drapeaux de langue dans la liste (validés en réel) + **rebrand ChainsmokerNeko** dans toute l'UI et `productName`, fix auto-update (404) ; tag `3.0.9` poussé, CI release verte, 10 artefacts ; fix boucles Cloudflare CrunchyScan **puis JapScan** validés au premier coup)
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
- **Version courante** : **3.0.8** (28 septembre 2026) — nouveau connecteur **KomaScans** (`komascans.com` : catalogue sitemaps, chapitres hybrides, pages RSC) + intitulés de chapitre localisés (`LocalizeChapterWord`, fr/es comme le site) ; limite connue documentée : hors anglais `pages[].url` est l'image anglaise (la traduction est un overlay SVG rendu par le site). Commits `2c0d2c48b` (connecteur), `07941b5bc` (bump), `100742064` (localisation), tag + release GitHub (Latest, 10 artefacts CI), CI verte ; KomaScans validé en réel (bookmarks / viewer / téléchargement). Versions antérieures : 3.0.7 (28 sept., stall JapScan) ; 3.0.6 (27 sept., boucle CrunchyScan) ; voir §12 addenda.
- **Release courante** : [ChainsmokerNeko 3.0.8](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.8) — 10 artefacts CI (3 zips + 3 NSIS Windows, AppImage, .deb, 2 DMG), notes FR ; releases 3.0.0→3.0.3 retirées le 5 sept (SHA préservés dans SYNC.md §1)

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

---

## Addendum 29 sept. — v3.0.8 : connecteur KomaScans, intitulés localisés, limite des locales non-en

**Release** : bump 3 manifests + `app/electron/build/package.json` + CHANGELOG FR/EN (`07941b5bc`, lockfile racine intact) → push `fork/chainsmoker` → tag léger `3.0.8` (`100742064`) → CI `36424601913` **verte en 11 min 07 s** (5 jobs : typecheck/build, Linux, macOS, Windows, publish) → release **[ChainsmokerNeko 3.0.8](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.8)** avec les 10 artefacts et des notes FR (écrites après publication via `gh release edit --notes-file`). Run de branche `36424578657` également vert. `origin` et `master` **jamais touchés**.

**KomaScans** (`2c0d2c48b`, 5 fichiers, +485) :
- **Catalogue** : `sitemap.xml` → `series-0.xml` (8 181 séries en) + `series-{locale}-0.xml` (19 fr, 22 par autre locale) ; titres reconstitués depuis les slugs (`SeriesTitleFromSlug`, ~90 % de fidélité), **tri alphabétique** fait par le connecteur (l'UI ne trie pas), tag de langue par locale + `Tags.Language.Multilingual` au constructeur.
- **Chapitres** : mode **hybride** — la page série n'hydrate que 50 chapitres ; si `firstChapter` est absent de cette liste (série tronquée) → scan des sitemaps `chapters-N.xml` (en) / `chapters-{locale}-N.xml` (autres), **par lots de 4 requêtes** (mémoire bornée, ~45 s sur Nano Machine 331/331) ; ordre **décroissant** (convention moteur), **pas de `publishedAt`** (`lastmod` = date d'import, pas de publication).
- **Pages** : payload RSC `pages[]` trié par `position` (le HTML ne contient que les lecteurs vidéo), `@ImageAjax(true)`, `Initialize()` no-op (API JSON publique, aucune fenêtre navigateur), `ValidateMangaURL` accepte `/series/` **et** `/read/` (résolu vers `/series/`).
- ⚠️ **`scripts/website-index.mjs` inutilisable** : régénère un `_index.ts` invalide (exports `registry`/`MangaDramaChapter`, doublon `MyAnimeListManga`, BOM retirée) → ligne insérée **à la main** avant `KomBatch`.

**Intitulés localisés + limite de contenu (décisions utilisateur)** :
- Le site stocke `title` en anglais pour **toutes** les locales ; la localisation n'existe que dans son HTML rendu (« Chapitre 1 VF », « Capítulo 1 en español », et **« Chapter 1 »** pour de/id/pt/ar/tr). → fonction pure exportée **`LocalizeChapterWord(title, locale)`** : `fr → Chapitre`, `es → Capítulo`, **les 5 autres locales restent `Chapter`** (choix explicite : *reproduire le site*, jamais diverger de la source), idempotente, sans effet sur `Start Reading` / `107: Special Forces <4>`.
- **Limite connue** : `pages[].url` est le **même fichier** que l'anglais (`sameUrl: true`, 622 704 o en webp pour GEED ch.1 ; `translationOverlay: null` côté `en` = le fichier EST le chapitre anglais fini). La traduction = `translationOverlay.cleanLayerUrl` (PNG de patch, 45 Ko) + `translation.regions[]` (texte + boîtes + polices), **dessinée en SVG dans le navigateur** par `PageTranslationOverlay` (`<text>`/`<tspan textLength>`, fitting `runtimeFit`). **Aucun composite serveur** : API limitées à `audience`/`views`/`progress`/`comments`, `renderKind: null`, aucun export cbz/zip → HakuNeko ne télécharge que l'octet de `page.url` : **contenu anglais** pour fr/es/de/id/pt/ar/tr, seuls les intitulés sont localisés. Composition via `FetchImage` surchargée = refaire le fitting de texte du site → écartée pour 3.0.8, éventuellement 3.0.9.

**Validations** : `npm run check` **0 erreur / 0 avertissement** · vitest **2232 passed** (+5 `LocalizeChapterWord`) · `KomaScans_e2e` **5/5** (nano-machine, 44,6 s ; titre `Chapter 1 - Start Reading` en `en` inchangé) · `npm run bundle:x64` local ✓ (komascans présent dans le JS buildé) · **validation utilisateur** : « bookmarks ok / affichage viewer ok / téléchargement ok » (recherche « isekai » → 96/8332 titres).

---

## Addendum 29 sept. — v3.0.9 : composition des overlays traduits + drapeaux de langue

**Statut** : **poussé et publié en 3.0.9** (29/09 — commits `8d93aacab` feat + `5bf347a25` release, tag `3.0.9` → CI release verte, artefacts `ChainsmokerNeko-v3.0.9-*`). Validation : `npm run check` **0 erreur / 0 avertissement** · vitest **2285 passed / 37 fichiers** (+9 `GetMangaTags`, +2 `MangaPlugin_test`, +12 invariant i18n) · `bundle:x64` ✓ (zip 145 519 661 o, 29/09 10:57).

**1. Composition des overlays traduits (décision utilisateur : version test en 3.0.9)** — image réellement traduite pour fr/es au lieu de l'image anglaise :
- Transport : `translationOverlay` via `Page.Parameters` ; décorateur `@Common.ImageAjax` **supprimé** ; `FetchImage` **surchargé** : image de base via `Common.FetchImageAjax.call(this, page, priority, signal, true)` puis composition — **tout échec retombe sur l'image de base** (jamais de tâche en erreur, priorité/signal conservés).
- Rendu : canvas 2D `fillText` (pas de SVG), sortie `canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })`. Tout le code reste dans `KomaScans.ts` ; exports publics pour tests : `ComposeTranslatedPage`, `PrepareOverlayTextLayout`, `ParseOverlayFontStacks`.
- **CORS = non-sujet** : le fetch Electron passe par IPC/processus principal (en-têtes `Referer`/`Origin` reformulés via `X-FetchAPI-`) ; `FontFace(arrayBuffer)` ne fait aucune requête réseau.

**2. Trois bugs réels trouvés/corrigés par la validation visuelle** (harnais) :
- La réécriture `url("…")` laissait les guillemets dans l'URL de police → `new Request('"https://…"')` échouait → **aucune police ne se chargeait** (rendu Arial au lieu de Comic Relief) ;
- propriétés CSS personnalisées contenant `_` (`__font`) non reconnues : regex `[a-z0-9-]+` → `[\w-]+` ;
- course entre pages parallèles sur le chargement des polices : `Map<string, Promise<void>>` partagé + garde `if (!keys.size)`.

**3. Harnais de validation** : bundle du code **réel** via **rolldown** (esbuild/rollup absents du dépôt) avec stubs des imports applicatifs, données réelles du site injectées, servi sur `http://127.0.0.1:8137/harness.html` (serveur encore actif). Résultat GEED ch.1 FR : **7 régions composées** (722 316 o webp, ~700 ms), Comic Relief + Koma Patrick Hand SC (9 faces), nettoyage anglais propre, 2 appels concurrents → sorties identiques, polices chargées une fois.

**4. Drapeaux de langue dans la liste (question utilisateur : « comment je différencie les entrées identiques ? »)** :
- `web/src/frontend/classic/lib/flags.ts` (nouveau) : `ExtractUnicodeFlagFromTags` avec regex `^[\p{RI}\p{Extended_Pictographic}\uFE0F]+` (corrige le « 🌐 M » qu'aurait produit `slice(0,4)`) ; affiché devant le titre dans `Media.svelte` (liste des séries), helper partagé réutilisé par `MediaItem.svelte` (suppression du code dupliqué).
- **Bug racine identifié** : au démarrage, `MangaPlugin.Prepare()` recrée les Manga **depuis le cache local** via `CreateEntry(id, title)` → **sans tag de langue** → aucun drapeau jusqu'au 🔄 (qui appelle `FetchMangas()` et remplace la liste). Symptôme constaté par l'utilisateur : « pas de drapeau » sur le build du matin.
- **Correctif additif** (format de cache inchangé) : hook `MangaScraper.GetMangaTags(identifier)` (défaut `[]` → **zéro impact sur les ~900 autres connecteurs**), `MangaPlugin.CreateEntry` propage `...scraper.GetMangaTags(identifier)`, KomaScans surcharge → `[MapLanguageTag(identifier)]`.

**5. Validations** : `check` 0/0 · vitest **2285 passed** · **validation utilisateur en réel** : drapeaux 🇬🇧🇫🇷🇪🇸🇮🇩🇩🇪🇵🇹🇸🇦🇹🇷 affichés **au démarrage, sans refresh** (« parfait ») ; composition embarquée dans le zip 10:57 **et dans la release 3.0.9** (téléchargement FR en réel : toujours à confirmer par l'utilisateur, l'ordre de pousser ayant été donné malgré tout).

---

## Addendum 29 sept. — v3.0.9 publiée : identité « ChainsmokerNeko » + fix auto-update

**Statut** : release **poussée et publiée à la demande de l'utilisateur** — commits `9d6409a23` (rebrand, 18 fichiers) + `5bf347a25` (bump 3.0.9, 6 fichiers), tag léger `3.0.9` → `push-ci.yml` a publié « **ChainsmokerNeko 3.0.9** » (10 artefacts, 29/09 10:06 Z) ; run branche **et** run tag verts ; push uniquement sur `fork/chainsmoker`, `origin`/`master` intacts.

**1. Renommage sans toucher aux locales Crowdin** : `ApplyBrandName()` dans `web/src/i18n/Localization.ts` applique `/\bHakuNeko\b|هاكونيكو/gi → ChainsmokerNeko` **une fois au bind** dans `CreateLocale()` (invariant + variant) — les 13 locales restent intactes (règle Crowdin préservée), la translittération arabe est couverte, et une garde `assistant`/`asistente`/`助理`/`مساعد` (±24 caractères) **préserve l'extension externe « HakuNeko Assistant »** dans toutes les langues (produit réel, documenté dans `docs/user-manual/.../tutorials.md`). 13 assertions `Frontend_Product_Title` mises à jour → `ChainsmokerNeko`.

**2. Chaînes affichées en dur renommées** (hors locales) : `web/index.html` (`<title>`, méta description/author/og, ligne de démarrage « Starting ChainsmokerNeko — fork of HaruNeko »), `static/splash.html`, `document.title` de `AppBar.svelte`, pied `SettingsModal`, page d'accueil `Main.svelte`, modal `StartupGuide`, breadcrumb `ContentPathBar`, `ApplicationWindow.ts` (titre du splash), export favoris (`ChainsmokerNeko (date).bookmarks`), méta `generator` des EPUB, `title` de la build NW.js ; libellé d'import favoris rendu générique (« Import bookmarks from previous version »).

**3. Nom du programme** : `productName: hakuneko → ChainsmokerNeko` (`app/electron/package.json`) → exécutable **`ChainsmokerNeko.exe`** (vérifié dans le zip local, `OriginalFilename` rcedit aussi), zip local renommé `chainsmokerneko-electron-v3.0.9-win32-x64.zip` (`bundle-x64.mjs`). Profil utilisateur **inchangé** (`build/package.json` `name` = `ChainsmokerNeko` depuis toujours). Identifiants internes **conservés** : `window.HakuNeko`, clé de thème `hakuneko`, base IndexedDB `HakuNeko`, chemin RPC `/hakuneko`, CSP des domaines upstream, env `HAKUNEKO_ELECTRON_CACHE`.

**4. Fix auto-update (bug préexistant)** : `AppUpdate.ts` construisait `hakuneko-{platform}.zip` alors que la release publie `ChainsmokerNeko-v{version}-{platform}.zip` → **404 systématique** depuis la bannière ; corrigé (+ User-Agent et répertoire temp `chainsmokerneko-*`), `repository = Endymi0n74/ChainsmokerNeko` déjà juste. Limite : mac/linux n'ont pas d'asset `.zip` en release (dmg/AppImage seulement) → updater inchangé/inopérant hors Windows.

**5. Crédits d'origine** (choix utilisateur : Accueil + Paramètres) : paragraphe `credits` sous le texte d'accueil (fork de **HaruNeko**, rework de **HakuNeko**, liens GitHub) + `og:description` ; pied de la fenêtre Paramètres « ChainsmokerNeko vX ». La **Documentation interne fetch le site upstream** (`https://hakuneko.download/docs/haruneko/`) et les liens guides de `Sidenav` pointent vers `hakuneko.download` : contenu tiers laissé tel quel (pas de docs maison dans le fork). Images de tutoriel (`HakunekoTutorial.avif`) inchangées.

**6. Validation** : `npm run check` EXIT 0 (versions 3.0.9 + ts + eslint + règles de codage) · vitest **2285 passed / 37 fichiers** · `bundle:x64` ✓ (build web 3,26 s, `ChainsmokerNeko.exe`, `<title>ChainsmokerNeko…` dans l'index construit, marque présente dans `FrontendClassic.js` ×8, littéral arabe dans le chunk i18n partagé) · CI release verte (10 artefacts `ChainsmokerNeko-v3.0.9-*`). Zip local : `D:\Codex\haruneko\app\electron\bundle\chainsmokerneko-electron-v3.0.9-win32-x64.zip` (145 520 059 o).

## Addendum 29 sept. — v3.0.10 : menu About fusionné + auto-update verrouillée sur le fork

**Statut** : release **poussée et publiée à la demande de l'utilisateur** — commits `52b162ab1` (sidenav), `0ecb71d27` (verrou auto-update), `23b250038` (bump 3.0.10 : 4 manifests + 2 changelogs), tag léger `3.0.10` → `push-ci.yml` a publié « **ChainsmokerNeko 3.0.10** » (non brouillon, 29/09 10:49 Z, **10 artefacts**) ; run branche **et** run tag vertes. Push uniquement sur `fork/chainsmoker` (jamais `origin`, jamais `master`).

**1. Menu About : une seule ligne** (demande utilisateur, après aller-retours) : les deux entrées « Using version X » (qui ouvrait `https://todo.com`, placeholder) et « Vibe coding with Codebuff (Kumo) 🤖 » sont fondues en **une** : `Using version X — Vibe coding with Codebuff (Kumo) 🤖` → `https://github.com/Endymi0n74/ChainsmokerNeko` (`web/src/frontend/classic/components/Sidenav.svelte`). Le libellé suit `appVersion` → affiche 3.0.10.

**2. Auto-update : fork uniquement** (demande utilisateur) : `AppUpdate` suivait le champ `repository` du manifeste — n'importe quelle valeur aurait redirigé check et téléchargement. La chaîne est désormais bornée par la constante **`UPDATE_REPOSITORY = 'Endymi0n74/ChainsmokerNeko'`** (lecture du manifeste supprimée) ; **3 tests** garantissent que l'URL d'appel API et l'URL d'archive restent celles du fork même si le manifeste vise `manga-download/haruneko` ou ne porte aucun dépôt (`AppUpdate_test.ts`, 30 tests electron). Chaîne complète : `UpdateNotification.svelte` (monté dans `App.svelte`) → `AppWindow.CheckForUpdates` → IPC `AppUpdate.App.Check` → `api.github.com/repos/<fork>/releases/latest` → install via `releases/download/<tag>/ChainsmokerNeko-v<version>-<platform>.zip` (nom identique à ceux publiés par la CI). Aucun `publish`/`owner` upstream n'existe ailleurs dans `app/electron`.

**3. Validation** : `npm run check` EXIT 0 (versions 3.0.10 + ts + eslint + svelte-check 0/0) · electron vitest **30 passed / 9 fichiers** (+3 verrou) · web vitest **2285 passed / 37 fichiers** · CI release verte : `ChainsmokerNeko-v3.0.10-win32-x64.zip` = **145 388 887 o** (cible exacte de l'updater).

**Reste à confirmer** : (a) téléchargement/composition FR en réel — validé depuis la 3.0.9, toujours pas de retour utilisateur ; (b) parcours complet de mise à jour automatique 3.0.9 → 3.0.10 depuis la bannière (canal verrouillé et testé unitairement, mais pas exécuté en local).

## Addendum 29 sept. — v3.0.11 : entrée About affichée en entier (fix troncature)

**Statut** : release **poussée et publiée à la demande de l'utilisateur** (« pour tester l'auto-update ») — commits `8ead44382` (fix) + `78261afd4` (bump 3.0.11 : 4 manifests + 2 changelogs), tag léger `3.0.11` → release « **ChainsmokerNeko 3.0.11** » (non brouillon, 29/09 **12:28 Z**, **10 artefacts**).

**1. Bug remonté par l'utilisateur** : la ligne fusionnée du menu About était **truncée** (« on ne peut pas tout lire »). Cause : Carbon impose `height:2rem` aux liens de menu (`.bx--side-nav__menu a.bx--side-nav__link`) et `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` à leur libellé — 56 caractères ne tiennent pas sur les ~160 px utiles d'un sous-menu de 16 rem.

**2. Correctif** (`Sidenav.svelte`) : le libellé passe par le **slot** de `SideNavLink` (`<span class="about-line">{aboutLabel}</span>`, `aboutLabel` en `$derived` depuis `appVersion`) et **trois règles ciblées** via `:has(.about-line)` (spécificité (0,5,1), supérieure au (0,4,1) de Carbon) remettent `height:auto` + `white-space:normal` **sur cette seule entrée** ; `title` natif donne le texte complet au survol. Les autres entrées ne changent pas.

**3. Validation par harnais de mesure** (`%TEMP%\opencode\sidenav-harness\`, mini-serveur Node port 8177, ouvert via l'outil navigateur) : réplique du DOM Carbon avec les3 règles **extraites du build** → titre de page **`TRUNCATED` sans les règles, `OK` avec** (contrôle : « Maintainers » toujours à 32 px). `npm run check` 0/0 · build web OK (3 règles présentes dans `FrontendClassic.css`) · vitest electron **30** + web **2285**.

**4. CI** : run **tag** vert → release publiée (10 artefacts `ChainsmokerNeko-v3.0.11-*`, dont `win32-x64.zip` 145 389 002 o). Run **branche** rouge sur « Create macOS Bundles » : `hdiutil: couldn't eject "disk7" - Resource busy` (exit 16, `bundle-app-dmg.mjs:80`) — **flakiness du runner macOS**, le même job ayant réussi sur le run tag ; job **relancé** (`gh run rerun --failed`). Correctif possible non appliqué (hors périmètre) : boucle de retry sur `hdiutil detach` (3 essais, `-force`, attentes).

**Reste à confirmer** : (a) **auto-update réelle 3.0.10 → 3.0.11 depuis la bannière** — objectif déclaré de cette release, seul le canal de détection/téléchargement est prouvé unitairement ; (b) ligne About complète dans l'app ; (c) composition/téléchargement FR (depuis 3.0.9).

## Addendum 29 sept. — v3.0.12 : la bannière ne s'affichait jamais + check manuel

**Statut** : release **poussée et publiée** (découpage choisi par l'utilisateur : fix + check manuel en 3.0.12, puis 3.0.13 en déclencheur) — commits `9a43cf83c` (fix bannière), `2c61dc969` (entrée manuelle), `67b3736fc` (bump 3.0.12 : 4 manifests + 2 changelogs), tag léger `3.0.12` → release « **ChainsmokerNeko 3.0.12** » (non brouillon, 29/09 **13:26 Z**, **10 artefacts**, `win32-x64.zip` 145 389 322 o) ; run tag **et** run branche vertes.

**1. Bug racine (depuis toujours, donc aussi en 3.0.9 / 3.0.10 / 3.0.11)** : `Store.WindowController` était assigné **après** `mount(App)` dans `FrontendClassic.ts`, alors que `UpdateNotification` déclenchait son check dans `onMount` → `UI.WindowController` encore `undefined` → la chaîne optionnelle `UI.WindowController?.CheckForUpdates()` **raccourcissait silencieusement** : aucune requête, aucun `catch`, aucun log. Les autres consommateurs passent par `$effect`/`$derived` (Sidenav, AppBar, SettingsModal) qui se ré-exécutent à l'assignation — d'où la version correctement affichée dans le titre, qui masquait le bug. C'est la réponse au reproche « où tu vois une bannière » : elle n'existait pour personne.

**2. Correctif double** : (a) assignation du contrôleur **avant** le montage (`FrontendClassic.ts`) + (b) `$effect` réactif dans `UpdateNotification` (garde `checked` pour ne vérifier qu'une fois) — et **test d'invariant** `FrontendClassic_test.ts` qui lit la source et exige que l'assignation précède `mount(App)` (les `.svelte.ts` ne sont pas testables ici : vitest sans plugin svelte, aucun jsdom/testing-library dans les deps, lock racine intouchable).

**3. Check manuel « Check for updates »** (icône `Renew`, sous l'entrée fusionnée du menu About) : l'état est partagé par le store (`update`, `updateOpen`, `CheckForUpdate()`), si bien que la bannière de démarrage et cette entrée restent synchronisées, et que `pendingUpdateCheck` garantit **une seule requête en vol** — un clic pendant le check automatique attend la même promesse au lieu d'obtenir un `null` prématuré qui afficherait « Up to date » à tort. Quatre libellés : `Check for updates` → `Checking for updates...` → `Up to date — vX` / `Update available — vX`. L'entrée reprend la classe `.about-line` (donc les 3 règles `:has()` de la 3.0.11) pour se retourner sur plusieurs lignes.

**4. Validation** : `npm run check` 0/0 (versions 3.0.12) · web **2286 tests / 38 fichiers** (+1 invariant) · electron **30** · harnais sidenav (port 8177) : **OK, rien de tronqué** — entrée fusionnée 60 px, nouvelle entrée 40 px sur 2 lignes (« Update available — v3.0.13 »), contrôle « Maintainers » 32 px.

**Reste à confirmer** : (a) **le parcours complet d'auto-update depuis la bannière** (objet des releases 3.0.12/3.0.13) → **✅ validé en réel, voir addendum ci-dessous** ; (b) entrée « Check for updates » dans l'app (bannière et ligne About vues en réel) ; (c) composition/téléchargement FR (depuis 3.0.9).

## Addendum 29 sept. — v3.0.13 : retry `hdiutil detach` + déclencheur auto-update

**Statut** : release **poussée et publiée** — commits `9b78d4b76` (retry detach) + `f0e417fc3` (bump 3.0.13 : 4 manifests + 2 changelogs), tag léger `3.0.13` → release « **ChainsmokerNeko 3.0.13** » (non brouillon, 29/09 **13:47 Z**, **10 artefacts**, `win32-x64.zip` 145 389 321 o, marquée **Latest**) ; run tag **et** run branche vertes du premier coup.

**1. Fix CI** (flakiness constatée sur la 3.0.11 : `hdiutil: couldn't eject "disk7" - Resource busy`, exit 16, `bundle-app-dmg.mjs:80`) : le détachement passe par la nouvelle fonction **`detachVolume()`** — 3 tentatives, `-force` dès la seconde, 5 s d'attente entre chacune, et la **dernière erreur est relancée** (jamais de livraison silencieuse d'une image disque corrompue). Syntaxe `node --check` OK ; le chemin macOS lui-même n'est pas exécutable en local, il est validé par la CI.

**2. Rôle de déclencheur** : aucun changement applicatif — la release sert à **éprouver l'auto-update en réel** : installer le zip de la **3.0.12** (seule version corrigée), puis menu About → « Check for updates » → bannière « Update available — v3.0.13 » → Install.

**✅ Confirmé en réel le 29/09 (retour utilisateur, capture à l'appui)** : install du zip **3.0.12** → lancement → bannière « Update available — v3.0.13 » affichée en bas à droite (titre de fenêtre `v3.0.12`, comportement exact attendu) → clic **Install v3.0.13** → l'utilisateur est repassé en **3.0.13** après redémarrage. **Premier test réel de la chaîne complète** : `api.github.com/repos/Endymi0n74/ChainsmokerNeko/releases/latest` → comparaison de versions → téléchargement de `ChainsmokerNeko-v3.0.13-win32-x64.zip` → swap + relance.

**Relevé sur la capture (non corrigé)** : dans la bannière, le lien « Download on GitHub » se coupe **en plein mot** (« Downloa / d on / GitHub ») — `.update-actions` est un flex sans `flex-wrap` et le lien n'a pas de `white-space: nowrap`, d'où un rétrécissement sous la largeur du texte. Correctif minime à glisser dans une prochaine release : `flex-wrap: wrap` + `white-space: nowrap` sur le lien.

**Reste à confirmer** : (a) entrée **« Check for updates »** en conditions réelles (sur la 3.0.13 elle doit afficher `Up to date — v3.0.13` et **ne pas** re-déclencher la bannière) ; (b) composition/téléchargement FR (depuis 3.0.9).

## Addendum 29 sept. — v3.0.14 : fix du lien « Download on GitHub »

**Statut** : release **poussée et publiée à la demande de l'utilisateur** (« tu peux pousser la 3.0.14 avec les corrections ») — commits `50d9b5b95` (memory : validation de l'auto-update en réel + relevé), `febfe797a` (fix du lien), `54fa34f86` (bump 3.0.14 : 4 manifests + 2 changelogs), tag léger `3.0.14`.

**1. Défaut relevé sur la capture de l'utilisateur** : dans la bannière, « Download on GitHub » se cassait **en plein mot** (« Downloa / d on / GitHub »). Cause : `.update-actions` est un flex **sans `flex-wrap`**, le bouton « Install » porte `white-space: nowrap` (donc ne se rétrécit pas) et `.update-notification` n'avait que `max-width` (largeur auto → la boîte se cale sur son contenu ≈ 304 px) : le lien, seul item compressible, passait sous la largeur de son texte et la césure prenait le milieu du mot.

**2. Correctif** (`UpdateNotification.svelte`) : `width: max-content` sur la bannière (plafond `24rem` conservé pour ne jamais déborder une fenêtre étroite), `flex-wrap: wrap` sur la ligne d'actions et `white-space: nowrap` sur le lien → le lien occupe sa propre ligne à sa largeur naturelle.

**3. Validation par harnais avant/après** (`%LOCALAPPDATA%\Temp\opencode\sidenav-harness\toast.html`, servi sur le port 8177, affiché au volet de revue) : réplique du DOM Carbon du toast avec les styles **anciens** et **nouveaux** côte à côte → page **`FIXED (old styles reproduce the bug)`** — avant : texte du lien sur **2 lignes**, boîte du lien **65 px** pour 133 px de largeur naturelle ; après : **1 ligne**, **133 px**, boîte **304 px** sous le plafond de 384 px, titre sur 1 ligne. Leçon : `getClientRects()` d'un item flex ne compte pas les lignes de texte (l'élément est *blockifié*), il faut un `Range.selectNodeContents()`.

**4. Portes** : `npm run check` 0/0 (versions 3.0.14) · web **2286 tests / 38 fichiers** · electron **30 tests**.

**Reste à confirmer** : (a) la bannière corrigée **dans l'app** — elle ne s'affichera que lors de la prochaine mise à jour disponible (la 3.0.14 étant à jour, aucune bannière) ; (b) entrée « Check for updates » en réel ; (c) composition/téléchargement FR (depuis 3.0.9).

## Addendum 30 sept. — v3.0.15 : panneau « What's new » sur la page d'accueil

**Statut** : release **poussée et publiée à la demande de l'utilisateur** — commits `fb9b36e61` (panneau + suppression de la doc amont) et `1edb9e95f` (bump 3.0.15 : 4 manifests + 2 changelogs), tag léger `3.0.15` → release **ChainsmokerNeko 3.0.15** (non brouillon, 30/09 **04:26:15 Z**, **10 artefacts**, `ChainsmokerNeko-v3.0.15-win32-x64.zip` 145 413 351 o) ; run tag **36667981841** et run branche **36667980211** toutes deux vertes.

**1. Constat de l'utilisateur** (« tout ce panneau ne sert a rien, on pourrait en faire quoi ») : le bloc « Guides / Advanced / Support » de la page d'accueil n'était pas du contenu du fork — `stores/Documentation.ts` fetchait `https://hakuneko.download/docs/haruneko/`, une page dite « Temporary documentation » datée du 01/12/2023, composée de « Temporary filler » et de lorem ipsum (« Find your source », « Select a plugin », « Download », « Preview », tout le bloc Support), écrite pour HakuNeko : un appel réseau hebdomadaire avec une semaine de cache en `localStorage` pour afficher du texte mort. Seul « Quickstart » avait un contenu réel.

**2. Remplacement** : nouveau composant `content-pages/WhatsNew.svelte` qui remplace le `Tile id="documentation"` — les notes de la **version courante** sont extraites du `CHANGELOG.en.md` **embarqué dans le bundle par import `?raw`** (hors ligne, aucun serveur tiers, `vite build` compris) et rendues par le helper pur `lib/changelog.ts` : **échappement HTML d'abord** (aucun contenu du changelog ne peut s'injecter), puis gras/code/liens, `## [x.y.z] - date` → `h4` avec la date, `###` → `h5`, et puces imbriquées construites en arbre. Version courante via `UI.WindowController.GetVersion()` (assignée dans un `$effect`, donc réactive), bouton **« Check for updates »** branché sur le store commun (une seule requête en vol avec l'entrée About, la bannière monte dès qu'une release plus récente existe), lien « All releases on GitHub ». Les notes tiennent dans une boîte `max-height: 16em` + `overflow-y: auto` : les sections longues ne poussent jamais la page.

**3. Carte d'accueil réécrite** : « ChainsmokerNeko is a fork of HaruNeko: same interface, same connectors, and its own releases — the application updates itself from them » + philosophie « ad-hoc consumption » reformulée (au lieu du texte amont « was made to help users who download media for circumstances that requires offline usage ») ; crédits HaruNeko/HakuNeko conservés.

**4. Suppressions approuvées par l'utilisateur** : `components/content-pages/Documentation.svelte` et `stores/Documentation.ts` (plus rien ne les importe, grep OK). **Harnais nettoyés avec son accord** : serveurs 8137 et 8177 arrêtés, `overlay-harness/` et `sidenav-harness/` supprimés de `%LOCALAPPDATA%\Temp\opencode`.

**5. Validation** : helper + **14 tests** `lib/changelog_test.ts` — extraction de section sans confusion `3.0.1` / `3.0.10` / `3.0.11`, anti-XSS (aucun `<script>` brut, `&lt;` / `&quot;`), gras/code/liens, listes imbriquées, CRLF/LF, et **un garde-fou qui fait échouer la suite si `CHANGELOG.en.md` ne documente plus la version de `web/package.json`** (bump sans entrée = test rouge). `npm run check` vert · web **2300 tests / 39 fichiers** · nw 1 · electron **30** · `vite build` vert (le changelog est bien présent dans `FrontendClassic.js`). Harnais de mesure généré depuis le helper lui-même : 3.0.14 → titre + contrôles sur la même ligne, boîte 168 px, **0 élément interdit**, aucun débordement horizontal ; section la plus longue **3.0.7** (13 315 caractères) → boîte scrollable 202 px pour 1 746 px de contenu, `scrollTop` OK, **14 puces dont 1 liste imbriquée**.

**✅ Validé en réel le 30/09 (retour utilisateur, capture)** : l'auto-update a porté l'install de **3.0.13 → 3.0.15** en un seul saut (la 3.0.15 étant devenue *Latest*), et la capture montre le panneau **dans l'app** : carte réécrite (logo + crédits), « What's new » avec `3.0.15 — 2026-09-30`, surtitre `ADDED`, puce contenant `CHANGELOG.en.md` en style code, **boîte bornée + barre de défilement** (rien ne déborde, la page reste courte), bouton « Check for updates » en fantôme Carbon aligné sur le titre, lien « All releases on GitHub » en pied. Clic sur **Check for updates** → `Checking for updates...` → **`Up to date — v3.0.15`** et **aucune bannière** : points (a) et (b) clos.

**✅ Point (c) clos le 30/09 à la demande de l'utilisateur** : plus aucun point ouvert — releases **3.0.9 → 3.0.15** publiées, auto-update et panneau « What's new » validés en réel, harnais nettoyés, documentation amont supprimée.

## Addendum 30 sept. — v3.0.16 : fix des timeouts JapScan + sonde de diagnostic

**Statut** : release **poussée et publiée à la demande de l'utilisateur** (« pousse la version ») — commits `5040a864f` (sonde), `544ba5882` (horodatage, jalons, heartbeat), `028d6c09c` (relais console + traces `runScript`), `749c357dd` (récap automatique), `cfb027cff` (fix navigation → re-dispatch), `dee648ec1` (bump 3.0.16 : 4 manifests + 2 changelogs), tag léger `3.0.16` → release **ChainsmokerNeko 3.0.16** (non brouillon, 30/09 **10:55:49 Z**, **10 artefacts**, `ChainsmokerNeko-v3.0.16-win32-x64.zip` 145 416 236 o, **Latest**) ; notes FR éditées après publication (`gh release edit --notes-file`) ; run tag **36704105482** vert du premier coup (13 min), run branche **36704103377** : job macOS en échec (`hdiutil`), relance intégrale → **verte au 2e essai** (macOS 3 min 07 s). Push uniquement sur `fork/chainsmoker`, `origin`/`master` intacts.

**1. Diagnostic des timeouts intermittents JapScan** (captures utilisateur Chapitres 86, 94, 115.5, 116 ; chronologie fournie par la sonde) : signature identique à chaque échec — défi anti-bot `Interactive` résolu → `runScript: executing` → **le site navigue 7 à 13 s après l'injection** (second `DOMReady`, `redirect: None`) → le document disparaît avec le contexte d'exécution → `ExecuteScript` ne se résout jamais → silence total jusqu'au timeout `chapter-update` à 300 001 ms, zéro ligne du lecteur. **Corrélation décisive** : les chapitres qui réussissent (les 10 du dernier lot) se chargent en `redirect: None`, sans navigation ; la navigation n'a lieu qu'après résolution d'un défi (redirection post-clearance) — d'où l'intermittence. Cause racine présumée **confirmée deux fois** avec la même signature.

**2. Correctif** (`FetchProviderCommon.ts`, tests d'intégration dédiés) : l'abonnement `BeforeWindowNavigate` (placé dans `FetchProviderCommon`, commun aux backends et déjà en fil de log) signale toute navigation de la trame principale pendant une injection en vol ; le bloc de récupération en tête du `DOMReady` suivant débloque le flux (détection de challenge, période de grâce, `runScript`) et **ré-injecte le script sur le nouveau document propre**. Chaque tentative porte un jeton `scriptAttempts` : seule la plus récente peut résoudre ou échouer la requête, une tentative abandonnée est écartée avec une trace (`superseded`), et l'échec dû à une navigation **attend** le nouveau document au lieu de faire échouer le chapitre. Jalons `runScript: executing/inject/returned attempt=N after Xms` pour distinguer l'injection réussie d'une exécution qui ne rend jamais la main. Risque connu et borné : si la récupération laisse `settled=false` au déclenchement du minuteur interactif (150 s), la fenêtre est détruite — budgets inchangés, cas pathologique.

**3. Sonde `[probe]`** (`TimeoutProbe.ts`, 20 tests) : 5 frontanches (`chapter-update` 300 s, `page-stall` 15 s, `reader-extract` 300 s, `drm-pages` 30 s, `chapter-list` 30 s) ; fil filtrable horodaté `+M:SS.s` avec jalons d'étape et heartbeat toutes les 30 s ; à chaque timeout, récap automatique du fil depuis le début de l'étape — **marge de 1,5 s en amont** pour inclure la ligne `begin` (imprimée juste avant le démarrage du chrono, tombait hors fenêtre), 30 lignes maximum, exclus pour `page-stall` et les échecs rapides — mêlé aux lignes console relayées (anneau 300 lignes ; préfixes `[KUMO]`, `[ReaderWindow:`, `[JapScan]`, `[DownloadTask]`, `[probe]` ; heartbeats/récaps exclus pour éviter la récursion). Relais de la console du lecteur via `OnConsoleMessage` (`RemoteBrowserWindow`) — c'est lui qui a permis d'attraper `runScript: executing` sans suite, révélateur de la cause racine.

**4. Validation** : `npm run check` 0/0 (versions 3.0.16) · web **2326 tests / 41 fichiers** (+2 intégrations « navigation → ré-injection → résultat livré » et « tentative périmée neutralisée », +1 récap avec marge) · electron **30 tests** · zip local reconstruit avec les hooks vérifiés (`document replaced while attempt=`, `inject/returned attempt=`, `trail since`, relais `[ReaderWindow:`) · **10 chapitres téléchargés par l'utilisateur sans timeout** : run sain observé `redirect: None` → `inject attempt=1 after 2502ms` (affichage 1,5 s + délai 1 s) → `returned attempt=1 after 2810ms` → `10 pages` ; les ~31 s par chapitre proviennent de la période de grâce de 16 s (détection asynchrone du puzzle), comportement voulu.

**Reste à confirmer** : (a) le correctif **exercé en réel** — il s'activera au prochain défi anti-bot (les 10 chapitres OK se sont chargés sans défi, donc sans navigation) : chercher `document replaced while attempt=1 … re-dispatching` → `executing attempt=2` → `returned attempt=2`, sinon le bloc `timeout … trail since` + filtre `runScript` ; (b) composition/téléchargement FR (en attente depuis la 3.0.9) ; (c) **flakiness macOS `hdiutil` toujours ouverte** : sur la run branche de la 3.0.16, les 3 retries de la 3.0.13 ont tous échoué — tentative 1 `Resource busy` (exit 16) puis tentatives 2/3 `No such file or directory` (le volume avait déjà disparu) : à traiter comme **succès** quand le point de montage n'existe plus ; la run **tag** du même code était verte.

## Addendum 30 sept. (2) — paste media link sans effet + résolution Cloudflare des requêtes simples via le plugin

**Statut** : travail en local sur `chainsmoker` — commit `680bfcd88` (**pas de push**, à la demande explicite) ; `npm run check` 0/0 (versions 3.0.16), web **2335 tests / 41 fichiers** (+9), electron **30 tests** ; zip local reconstruit `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip` (145 548 115 o) pour test utilisateur. Demandes initiales : « paste media link de `https://www.japscan.foo/manga/four-knights-of-the-apocalypse/` ne fait rien » + « la résolution cloudflare doit se faire via plugin » (précisé ensuite : garder la résolution par la fenêtre du plugin **et** faire marcher celle qui échoue « dans le fetch au bout de quelques minutes »).

**1. Diagnostic du paste** (`MediaSelect.svelte` → `onMediaPasteURL`) : `ValidateMangaURL` JapScan **accepte** bien l'URL (regex `[a-z]{2,4}` + 2 segments `manga/…`), donc l'échec vient après : `FetchManga` → `Common.FetchMangaCSS` = **fetch HTTP nu sans aucune résolution de défi** → Cloudflare répond 403 / `CF-Mitigated` → `Exception` → le `catch` ne fait que `console.warn` → **aucune erreur à l'écran** = « il ne se passe rien ». Aucun connecteur anime (`AnimePlugin.TryGetEntry` sans garde de validation) n'existe dans le fork — tous les autres plugins échouent proprement sur `ValidateMangaURL`, le parcours arrive bien à JapScan.

**2. Correctif — récupération de challenge dans le fetch** (`FetchProviderCommon.ts`, + electron/nw renommés en `FetchCore`) : `Fetch` devient une méthode à gabarit ; sur exception de type challenge (`Exception<FetchProvider_Fetch_CloudFlareChallenge|Forbidden>`, helper exporté `IsCloudFlareChallengeError`), `RecoverFromChallenge` ouvre la **fenêtre de challenge du plugin** (le flux fork, `FetchWindowScript` sur l'URL faillante, budget 180 s, cachée sauf défi interactif/automatique qui s'affiche de lui-même), puis **relance une seule fois**. Garde-fous : **single-flight par origine** (les requêtes concurrentes rejoignent la fenêtre en cours, une seule fenêtre), **cooldown 60 s** (`CHALLENGE_RECOVERY_COOLDOWN`), `GET` uniquement, et **opt-in** `ShouldUseForkChallengeHandling` (JapScan + sites fork) — les autres sites gardent le comportement amont. `FetchHTML` détecte en plus les pages de challenge servies **avec un statut de succès** (marqueurs structurels seuls : `cdn-cgi/challenge-platform`, `challenges.cloudflare.com`, `id="challenge-form"`, `cf-chl-` — les phrases localisées « Un instant… » sont volontairement exclues) et passe par la même récupération avant de parser.

**3. Correctif — feedback du paste** : la liste medias classique affiche désormais l'écran d'erreur (notification `InlineNotification` dans `#MediaList`, fermable, même motif que l'erreur `loadPlugin`) + un état `isPasting` (bouton désactivé, spinner « ... resolving link ») pendant la résolution, qui peut durer jusqu'à la fenêtre de challenge ; l'erreur reste aussi dans la console.

**4. Tests** (`FetchProviderCommon_test.ts`, 11 → 20) : helpers purs (marqueurs de page de challenge avec garde anti-faux-positif, détection d'exception challenge vs Vercel/`Error`) + 5 intégrations sur `FakeWindow` : récupération → relance réussie (fenêtre `opened=1`, script `() => true` injecté), site non-opt-in sans fenêtre, cooldown (2e échec sans nouvelle fenêtre), join de requêtes concurrentes (une seule fenêtre, 4 appels `FetchCore`), défi en HTTP 200 → récupération dans `FetchHTML` (avec stub `DOMParser` car l'environnement de test n'a pas de DOM). Attention : `Exception.message` passe par `GetLocale()` → le global `HakuNeko` mocké (montage de `Error_test.ts`) est désormais posé en tête du fichier.

**Reste à confirmer** : (a) le paste **en réel** avec Cloudflare actif — chercher dans le F12 `Fetch: retrying after challenge recovery` (relance) ou `FetchHTML: challenge page detected` (défi en 200), et voir la fenêtre du plugin s'ouvrir puis le manga apparaître ; toute autre panne du paste s'affiche maintenant à l'écran (clé `Exception<…>`) ; (b) **point d'attention noté mais non implémenté** : le helper « Cloudflare bypass » des Réglages est **hardcodé à `crunchyscan.org`** (`SettingsModal.svelte` : `let cfHost = $state('crunchyscan.org')`, aucune saisie possible) — si l'utilisateur voulait plutôt que le helper cible le domaine du plugin sélectionné, c'est un correctif distinct à faire ; (c) les points ouverts de l'addendum 3.0.16 restent en l'état.
