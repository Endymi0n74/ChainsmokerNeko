# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 6 septembre 2026 — état courant **v3.0.4** ; sessions du 1→4 sept condensées en §12 ; règles durables → AGENTS.md, leçons techniques → LESSONS.md
> 📚 Structure doc : **MEMORY.md** = état courant · **AGENTS.md** = règles durables · **LESSONS.md** = leçons techniques
> Dernière mise à jour (état) : 6 septembre 2026 (v3.0.4 — fusion upstream fork-first + restructuration 2 branches + suite de checks verte)
> ⚠️ **Règles durables** (langue, git/commits, push, suppressions, régression, versioning, release, i18n, build/CI, tests, pratiques agent) → voir **`AGENTS.md`**
> ⚠️ **Leçons techniques** (plateforme, Cloudflare, sites, CI/CD) → voir **`LESSONS.md`**

---

## 1. Le projet

Fork personnel de **Haruneko** (successeur de HakuNeko) : application desktop de
scraping de mangas. **Web app** (TypeScript, Svelte + quelques composants Vue)
dans un shell **Electron** (Chromium 150, Node 26 local / 24 CI).

- **Repo** : [Endymi0n74/ChainsmokerNeko](https://github.com/Endymi0n74/ChainsmokerNeko)
- **Upstream** : `manga-download/haruneko`
- **Version courante** : **3.0.4** (5 septembre 2026) — bumpé dans les 3 manifests (`package.json`, `web/package.json`, `app/electron/package.json`) + CHANGELOG ; tag 3.0.4 poussé sur `fork/chainsmoker` (release GitHub publiée automatiquement par la CI au push d'un tag `3.*` — voir push-ci.yml)
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
- **En attente de validation utilisateur** : JapScan — puzzle au 1er lancement, volume Dreamland 24 complet (204 pages), file non bloquée par les timeouts.
- **E2E** : ScanManga 5/5 + MangaNova 7/7 ✅ ; JapScan e2e 🚫 bloqué (Cloudflare interactif, profil temporaire sans `cf_clearance`) → validation runtime manuelle.

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
