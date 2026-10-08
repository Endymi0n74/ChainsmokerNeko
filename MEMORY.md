# Mémoire du projet — ChainsmokerNeko (fork Haruneko)

> Fichier de contexte pour les sessions Freebuff. À lire en début de session.
> Dernière mise à jour : 8 octobre 2026 — état courant **v3.0.19 publiée** le 8 oct. à 07:32 Z (tag poussé, CI `37742508029` vert en 14m43, 10 artefacts, `Latest` : **fiabilisation Comix contre l'aléatoire** — requêtes images bornées à 15 s à partir de leur démarrage + hôte mort en refroidissement 20 s, throttle du pool 4 → 20 req/s, plafond des gros chapitres corrigé (58/183 → 183/183) → addendum 16 ; **3.0.18 publiée le 7 oct.** (tag poussé, CI vert, 10 artefacts) → addendum 15 ; 3.0.17 publiée le 1 oct. → addendum 14 ; 3.0.16 = release **poussée et publiée** : fix des timeouts JapScan — ré-injection du script du lecteur après navigation de la fenêtre — + sonde de diagnostic `[probe]` avec récap automatique ; 3.0.15 = panneau « What's new » sur la page d'accueil ; 3.0.14 = fix du lien « Download on GitHub » de la bannière (coupure en plein mot), validé au harnais avant/après ; 3.0.13 = retry `hdiutil detach` en CI + release déclencheur du test auto-update ; 3.0.12 = **fix de la bannière de mise à jour** (jamais affichée) + entrée manuelle « Check for updates » ; 3.0.11 = ligne About affichée en entier ; 3.0.10 = menu About fusionné + auto-update verrouillée sur le fork ; 3.0.9 = composition des overlays traduits + drapeaux de langue + identité ChainsmokerNeko, voir addenda en fin de fichier) ; sessions du 1→4 sept condensées en §12 ; règles durables → AGENTS.md, leçons techniques → LESSONS.md
> 📚 Structure doc : **MEMORY.md** = état courant · **AGENTS.md** = règles durables · **LESSONS.md** = leçons techniques — carte complète des docs racine en §0
> Dernière mise à jour (état) : 8 octobre 2026 (**v3.0.19 publiée 07:32 Z** — tag `3.0.19`, CI `37742508029` vert en 14m43, 10 artefacts, `Latest` — **fiabilisation Comix** : deux défauts mesurés au banc → (1) une panne d'hôte image bloquait **en permanence les 4 workers du pool** (le budget 15 s de l'engine annule la promesse, jamais la requête) et toute la suite des téléchargements échouait même sur des hôtes sains — chapitre suivant sain : 0/20 au banc → chaque requête bornée à 15 s à partir de son propre démarrage (attemptSignal) + **refroidissement 20 s par hôte** (`Image host unreachable`, reprise automatique, une reprise 500 ms pour l'erreur réseau passager) ; (2) throttle du pool à 4/s : toutes les pages au-delà de ~57 mouraient en file sans être demandées (chapitre 183 pages → 58 récupérées) → **throttle 20 req/s**, concurrence inchangée (4 workers) ; réponses HTTP non-`ok` rejetées avec le statut (fin des trous silencieux) → **addendum 16** ; **v3.0.18 publiée 7 oct. 20:52 Z** (tag, CI `37683656239` vert, 10 artefacts) — fix client HTTP par forme + images sans referer → addendum 15 ; **v3.0.17 publiée 1 oct.** → addendum 14 ; **v3.0.16 publiée** — **fix des timeouts intermittents des chapitres JapScan** : la navigation post-clearance, 7 à 13 s après l'injection, tuait le script d'extraction (`ExecuteScript` ne se résout plus → timeout 300 s sans un seul retour du lecteur, 4 chapitres ratés documentés) → re-dispatch au `DOMReady` suivant avec jeton de tentative `attempt=N`, + **sonde `[probe]`** (horodatage, jalons d'étape, heartbeat 30 s, récap automatique du fil, relais de la console du lecteur) ; tag `3.0.16` poussé, run tag **36704105482** vert, 10 artefacts, **Latest** à 10:55 Z · **v3.0.15 publiée** — panneau « What's new » sur la page d'accueil (changelog embarqué + garde-fou de version) et carte d'accueil réécrite ; tag `3.0.15`, 10 artefacts à 04:26 Z · **v3.0.14 publiée** — fix du lien « Download on GitHub » de la bannière (coupure en plein mot relevée sur la capture utilisateur), validé au **harnais avant/après** (2 lignes cassées / 65 px avant → 1 ligne / 133 px après) ; **✅ auto-update validée en réel 3.0.12 → 3.0.13** : bannière « Update available — v3.0.13 » au lancement → Install → l'utilisateur repassé en 3.0.13 après redémarrage — première exécution complète de la chaîne · **v3.0.13 publiée** — retry `hdiutil detach` (3 essais, `-force`, 5 s d'attente, dernière erreur relancée) contre la flakiness « Resource busy » de la 3.0.11, et release **déclencheur** du test auto-update ; tag `3.0.13` poussé, 2 CI vertes, 10 artefacts, **Latest** à 13:47 Z · **v3.0.12 publiée** — **la bannière de mise à jour ne s'affichait jamais, pour personne** (`Store.WindowController` assigné **après** `mount()` → `onMount` lisait `undefined` → chaîne optionnelle raccourcie sans trace) : correctif double (assignation avant le montage + `$effect` réactif, test d'invariant) **et** nouvelle entrée manuelle **« Check for updates »** dans le menu About (état partagé via le store, requête unique en vol, libellé = statut) ; tag `3.0.12` poussé, 2 CI vertes, 10 artefacts à 13:26 Z · **v3.0.11 publiée** — entrée About affichée en entier (fix troncature Carbon, validé au harnais), tag poussé, release 10 artefacts à 12:28 Z · **v3.0.10 publiée** — menu About fondu en une seule ligne « Using version X — Vibe coding with Codebuff (Kumo) » → GitHub, et auto-update verrouillée sur le fork par la constante `UPDATE_REPOSITORY` ; tag `3.0.10` poussé, 2 CI vertes, 10 artefacts · **v3.0.9 publiée** — composition des overlays traduits KomaScans (validée au harnais ; téléchargement FR en réel : à confirmer) + drapeaux de langue dans la liste (validés en réel) + **rebrand ChainsmokerNeko** dans toute l'UI et `productName`, fix auto-update (404) ; tag `3.0.9` poussé, CI release verte, 10 artefacts ; fix boucles Cloudflare CrunchyScan **puis JapScan** validés au premier coup)
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
| Comix | `Comix.ts` | ✅ validé 7 oct. | Client HTTP repéré **par forme** dans le chunk `env-` (l'export `x` n'est plus axios), images téléchargées en `no-referrer` (le CDN refuse tout `Referer` non vide) |
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

**5. Suite 30 sept. (soir) — diagnostic sur captures + 3 correctifs complémentaires (non committés)**

- **Bug de clonage IPC corrigé** (root cause du recovery toujours en échec) : le script de recovery `'() => true'` était évalué **brut** par `executeJavaScript` → renvoie un objet `Function` → le pont IPC ne peut pas le cloner (`Error: An object could not be cloned`) → `runScript` échouait à chaque tentative, la recovery « aboutissait » quand même et la relance retombait sur 403. Convention rappelée en commentaire : l'expression doit produire une **valeur clonable** → `'true'`.
- **Analyse des captures utilisateur** : badge « 15 warnings » = exactement 3 fenêtres × 5 traces (`redirect/poll/executing/inject/returned`), **zéro trace de recovery** sur toute la session → le déclin de `RecoverFromChallenge` était **silencieux**. Registre fork vérifié **partagé** dans le bundle construit (les 4 symboles `*ForkChallengeHandling`/`*StalledChallengeReload` ne vivent que dans `DownloadTask.js`, que `HakuNeko.js` importe — piste « registre dupliqué entre chunks » écartée par scan des chunks). Désormais **chaque déclin est journalisé** : `Fetch: challenge recovery not applicable … (method=…, opted-in=…)` en plus du déjà existant `suppressed by cooldown`.
- **Bug B — injection sur la page de défi (Items 0/0)** : le poller déclarait le défi résolu dès le changement de `cf_clearance` **sans vérifier que le document avait été remplacé** — or le changement peut arriver avant que la navigation post-solve ne s'engage (ou provenir d'une fenêtre précédente : chaque fenêtre prend sa baseline à l'ouverture). Le script s'exécutait alors sur l'interstitiel → extraction vide → `Items: 0/0`, et JapScan **mettait cette liste vide en cache 1 h**. Correctif : helper pur exporté `PlanScriptInjection(cleared, clearanceNote, cookieSolvedAt, now)` → **attente bornée** `COOKIE_CLEARANCE_DOM_GRACE = 30 s` (traces `CfClearanceHold` puis `CfClearanceGraceExpired`, injection quand même à la fin pour les solveurs sans navigation), l'injection par clairage DOM (`clr=skipped`) et `widgetGone` restent immédiats ; +5 tests (25 au fichier).
- **JapScan** : `FetchChapters` ne met plus en cache les listes **vides** (`if (chapters.length > 0)`), un extraction ratée ne bloque plus « 0 items » pendant le TTL.
- **Portes** : `npm run check` 0/0 (versions 3.0.16), web **2340 tests / 41 fichiers** (+5), electron **30 tests** ; zip reconstruit `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip` (**145 548 484 o**, hash de bundle `MUO7Y7G9` — l'ancien zip partagé était `MUO6RHAO`, à remplacer intégralement à l'installation).

**6. Suite 30 sept. (nuit) — « le défi ne se termine jamais » après le zip correctif : JapScan manquait à l'opt-in de rechargement**

- **Constat utilisateur** (zip `MUO7Y7G9` bien installé) : clic sur signet → fenêtre de défi Cloudflare (« Nous vérifions que vous êtes humain », gérée, sans widget) **qui ne se termine jamais**, et liste des chapitres **vide**.
- **Cause racine** : Cloudflare émet une nouvelle `cf_clearance` **sans jamais recharger l'interstitiel** (le stall documenté en `CLOUDFLARE.md` §7 pour CrunchyScan — « issue a fresh clearance but never redirects »). JapScan n'était inscrit qu'à `AddForkChallengeHandling`, **pas** à `AddStalledChallengeReload` (contrairement à CrunchyScan, Comix, MangaFire, MangaMoins) → aucun rechargement borné → la fenêtre reste bloquée sur l'interstitiel ; le garde-fou de tenue (`PlanScriptInjection`, 30 s) finit par lancer le script **sur la page de défi** → extraction vide (le cache vide n'est plus épinglé, mais ça reste « du vide »).
- **Correctif** : `JapScan.ts` bascule sur `AddStalledChallengeReload(/^https:\/\/(?:www\.)?japscan\.[a-z]{2,4}/)` (chaîne automatiquement le fork handling — les deux registres restent peuplés) + journal `[KUMO] ReloadStalledCloudFlareChallenge: reload #N/3 (fresh cf_clearance while the challenge page stays) for <url>` ajouté à la boucle de reload (qui n'avait que des `invocations`, aucun log console). Garde-fous inchangés : `isChallenge && !hasRealWidget` + clearance fraîche différant de la baseline de ce document, budget 3 reloads JapScan (1 pour CrunchyScan), re-baseline à chaque `DOMReady` → pas de boucle infinie.
- **Test** : `JapScan_test.ts` 8 → 9 (« JapScan challenge registration » : `ShouldReloadStalledChallenge` **et** `ShouldUseForkChallengeHandling` vrais sur `https://www.japscan.foo/…`, faux sur un hôte tiers — valide aussi le chaînage).
- **Portes** : `npm run check` 0/0, web **2341 tests / 41 fichiers** (+1), electron **30 tests** ; zip reconstruit `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip` (**145 548 510 o**, hash de bundle `MUOEP2H0` — l'ancien `MUO7Y7G9` à remplacer intégralement à l'installation).
- **Trace à chercher après le test** : `ReloadStalledCloudFlareChallenge: reload #1/3` puis, après la navigation, `poll#… cf=false … cleared=true` puis `runScript: returned attempt=1` — si le budget de 3 reloads est épuisé sans que la page passe, c'est que la clearance émise n'est pas acceptée côté Cloudflare (IP/fingerprint) → revenir à l'helper `CLOUDFLARE.md` §3/§8 (warm-up manuel ou import du navigateur).

**7. Suite 30 sept. (nuit, 2) — la case « Vérifiez que vous êtes humain » était visible mais déclarée absente : boucle de rechargement**

- **Constat utilisateur** (captures sur le zip `MUOEP2H0`) : pendant que la case à cocher Cloudflare s'affiche dans la fenêtre de défi, le fil tourne en boucle — `ReloadStalledCloudFlareChallenge: reload #1/3` → `redirect: Interactive` → `poll#N cf=true widget=false site=Interactive clr=changed cleared=true` → `poll: cf_clearance changed but the challenge is still the current document, waiting…`, puis indéfiniment ; `Items: 0/0`. Seconde capture (« et via l'ajout d'url ») : bannière `Exception<FetchProvider_Fetch_CloudFlareChallenge>` sur `https://www.japscan.foo/manga/one-piece/`, catalogue affiché (15589) mais Items 0/0 ; l'utilisateur précise que « le seul moment où les mangas s'affichent c'est en passant par plugin » — c'est le parcours par la fenêtre de défi qui aboutit, le fetch nu qui décline.
- **Cause racine** : `hasRealWidget` ne reposait que sur `document.querySelector(ChallengeWidgetSelectors)` (dont `iframe[src*="challenges.cloudflare.com"]`) — sur cet interstitiel **localisé en FR** aucun de ces sélecteurs ne matche, alors que la case est bien rendue et cliquable → `widget=false` → la garde `isChallenge && !hasRealWidget` de `ReloadStalledCloudFlareChallenge` est satisfaite → `window.location.reload()` **remet à zéro la case que l'utilisateur s'apprête à cocher** ; chaque rechargement fait émettre une nouvelle `cf_clearance` par Cloudflare → faux signal `clr=changed` → `cleared=true` → garde de 30 s (`PlanScriptInjection`) puis injection **sur la page de défi** → extraction vide, budget de 3 reloads dépensé en boucle.
- **Correctif** : expression unique exportée **`CHALLENGE_WIDGET_PROBE`**, injectée dans `checkScript` (boucle de stall) **et** dans `cloudflareDetectionScript` (classification) : descente récursive (frames same-origin imbriquées, shadow roots, profondeur bornée à 4), reconnaissance de la source de frame (`challenges.cloudflare.com`, `turnstile`, `recaptcha`, `hcaptcha`), et **tout checkbox rendu** ou wrapper `[class*="turnstile" i]` visible compte comme widget ; n'exécutée que si `isChallenge` (coût nul sur une page normale). Elle renvoie aussi l'inventaire des frames visibles, journalisé dans la trace : `poll#… cf=true widget=false frames=1600x900 <src>…` — un widget que les sondes manquent encore s'identifie dans la console au lieu de laisser un `widget=false` nu.
- **Interstitiel localisé** : `isChallenge` couvrait déjà les titres FR (`un instant`) mais pas le corps de page → ajout de marqueurs **dépourvus d'accents** (`verifiez que vous etes humain`, `verification de securite en cours`) obtenus par `normalize('NFD')` + suppression des diacritiques, dans les deux scripts — même logique que `just a moment` mais pour le français réellement servi.
- **Effets attendus** : plus aucun `reload #N/3` tant que la case est affichée (la garde devient `widget=true`), classification maintenue `Interactive` (fenêtre visible), et après le clic → navigation → `clr=changed` → `CfClearanceHold` éventuel (30 s) → injection sur le document propre → chapitres. `widgetGone`, le budget de reload et `ShouldReloadStalledChallenge` sont inchangés.
- **Tests** : `FetchProviderCommon_test.ts` 25 → 31 (+6 sur `CHALLENGE_WIDGET_PROBE` avec un DOM factice : frame Turnstile visible, frame 0×0 ni détectée ni listée, frame du widget dans une frame imbriquée same-origin, checkbox hors de tout sélecteur, shadow root, inventaire) ; portes `npm run check` 0/0 (versions 3.0.16), web **2347 tests / 41 fichiers** (+6), electron **30 tests** ; zip reconstruit `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip` (145 549 919 o, hash de bundle `MUOHK475` — l'ancien `MUOEP2H0` à remplacer intégralement à l'installation ; marqueurs `verifiez que vous etes humain`, `shadowRoot`, `frames=` vérifiés dans `DownloadTask.js` construit).
- **Trace à chercher après le test** : `poll#… cf=true widget=true frames=…` et **l'absence** de `ReloadStalledCloudFlareChallenge` tant que la case est affichée ; ensuite, après le clic : `clr=changed` → `poll: cf_clearance changed but the challenge is still the current document, waiting…` (jusqu'à 30 s) → `runScript: returned attempt=1` → chapitres listés. Si `widget=false` subsistait, la ligne `frames=` donne le marquage exact de la case pour l'ajouter aux sélecteurs.

**8. Suite 1 oct. — `widget=false frames=-` : le widget n'est ni une frame ni un contrôle, et le rechargement précède son rendu**

- **Trace sur le zip `MUOHK475`** (la clé `frames=` prouve le nouveau build) : `poll#1 cf=true widget=false frames=- site=Interactive clr=changed cleared=true` répété, chaque bloc séparé d'un `ReloadStalledCloudFlareChallenge: reload #1/3` et **redémarrant à `poll#1`** (le poller est recréé à chaque cycle). Deux informations décisives : (a) **inventaire de frames vide** — aucun iframe, aucune checkbox, aucun wrapper Turnstile dans le document sondé alors que la case est à l'écran ; (b) `site=Interactive` à chaque round vient de la détection **propre à JapScan** (`#jc-overlay` visible ou `window.__captcha.needed`) : le document de défi est la **page de sécurité du site**, dont l'overlay est une couche positionnée sans iframe ni contrôle de formulaire — donc invisible pour tous les sélecteurs du module.
- **Le rechargement précède le rendu du widget** : `poll#1` s'exécute ~4 s après le chargement et `doCheck` tire son premier coup à ~5 s (backoff 5/10/20/40/60 s) — le rechargement a donc lieu **avant** que le contrôle n'existe, ce qui remet la preuve à zéro à chaque cycle et dépense le budget à l'infini (chaque cycle recrée la fenêtre et donc son budget de 3).
- **Correctifs** :
  1. **`CHALLENGE_WIDGET_RENDER_GRACE = 12_000`** (exporté) : aucun rechargement tant que le document a moins de 12 s — âge mesuré dans le probe via `performance.now()` et rapporté sous `age=` ; trace `ReloadStalledCloudFlareChallenge: deferred, challenge document is only Nms old (waiting 12000ms for the widget to render) for <url>`, sans consommer le budget.
  2. **Probe enrichi `{ widget, frames, dom, age }`** : `frames` devient `child=N` (toutes les frames du document, masquées marquées `(hidden)`, sources tronquées) plus `err=` en cas d'échec de sélecteur ; `dom` inventorie les éléments de défi visibles (ids/classes portant cf/chl/captcha/challenge/widget/overlay, contrôles, canvas/svg, sinon structure peu profonde du body) **tant que aucun widget n'est trouvé**.
  3. **Couche de blocage = widget** : un élément *positionné* (`fixed`/`absolute`/`sticky`) couvrant ≥ 40 % du viewport est traité comme le contrôle interactif et se nomme dans la trace (`dom=overlay div#jc-overlay …`). Un wrapper **statique** (le `#cf-wrapper` centré de CrunchyScan) reste ignoré → le rechargement stall §7 de CrunchyScan, lui aussi opt-in, n'est pas dégradé. Testé dans les deux sens.
  4. Sélecteurs élargis : `frame`, `embed`, `object`, `input`, `label`, `[role="checkbox"]`, `[class*="checkbox" i]`, et variantes `id*=` ajoutées à la liste de description.
- **4ᵉ occurrence du piège backtick** : un backtick dans un **commentaire** situé *à l'intérieur* d'un template literal (`CHALLENGE_WIDGET_PROBE`, `checkScript`) ferme la chaîne prématurément → 9 erreurs `tsc` (`',' expected`) — même accident documenté pour `BuildReaderScript`, corrigé en remplaçant les guillemets simples dans ces commentaires.
- **Tests** : `FetchProviderCommon_test.ts` 31 → 34 (+couverture viewport positionnée vs statique, nommage `div#jc-overlay`, forme complète `{widget, frames, dom, age}`) ; portes `npm run check` 0/0 (versions 3.0.16), web **2350 tests / 41 fichiers** (+3), electron **30 tests** ; zip reconstruit `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip` (**145 551 511 o**, hash de bundle **`MUP2HX56`** — remplace intégralement `MUOHK475` ; marqueurs `child=`, `overlay `, `deferred, challenge document`, marqueurs FR vérifiés dans `DownloadTask.js` construit).
- **Trace à chercher après le test** : `poll#… cf=true widget=true frames=child=N … dom=overlay div#jc-overlay …` **sans** aucun `ReloadStalledCloudFlareChallenge` ni `deferred` ; si `widget=false` subsiste, la ligne `dom=` contient le marquage exact de l'élément à ajouter ; si le rechargement est légitime (pas de couche, clearance fraîche, document > 12 s), la trace `deferred`/`reload #N/3` montre le budget réellement consommé.

**9. Suite 1 oct. (2) — trace `MUP3JGTW` : la grâce fait son effet, mais `cf=true` n'a plus de coupable identifiable**

- **Trace sur le zip `MUP2HX56`** (clés `age=`/`dom=` = nouveau build) : `ReloadStalledCloudFlareChallenge: deferred, challenge document is only 7645ms old (waiting 12000ms …)` — **la grâce de 12 s fonctionne** et aucun `reload #1/3` n'apparaît dans la capture. Mais les champs disponibles ne suffisent plus : `frames=child=0` (aucune frame), `dom=div.main-wrapper.1Wx4 1264x914 | div.main-content 960x314 | div.footer 960x70 | div.footer-inner 896x70` = le **squelette de la page JapScan**, sans aucun élément de défi visible ; `site=Interactive` alors qu'aucun `#jc-overlay` n'est listé ; `cf=true` **sans que l'on sache lequel des marqueurs l'a déclenché** ; `clr=changed` à chaque round → `CfClearanceHold` en répétition ; enfin `PollForChallengeResolution: stopping poller … Error: Failed to find window with id 3` → le poller meurt sur une fenêtre déjà détruite (`poll#… cf=- clr=error:… cleared=false`).
- **Trois hypothèses non discriminables** avec les champs existants : (a) **faux positif** — `isChallenge` tenu par un marqueur *caché* (un sélecteur résiduel de `ChallengePageSelectors` sur une page propre) ou par le corps de texte, alors que rien à résoudre n'est à l'écran ; (b) **annonce sans rendu** — `window.__captcha.needed === true` (d'où `site=Interactive`) mais l'overlay n'est jamais rendu → fenêtre Interactive assise jusqu'au timer ; (c) **auto-navigation du site** — `age` repart à zéro, nouvelle `cf_clearance`, `clr=changed` → tenue à chaque round.
- **Instrumentation ajoutée** (`FetchProviderCommon.ts`) :
  1. **`why=`** (les deux scripts) : le marqueur exact qui rend `cf=true` — `title`, `body`, `sel:#challenge-stage`… (`ChallengePageSelectors` testé sélecteur par sélecteur via `split(',').find`). Un `sel:…` **seul** signe un résidu caché = faux positif ; `title+body` = interstitiel réel.
  2. **`announce=`** (probe) : ce que la page déclare *avant tout rendu* — `captcha=<needed>` (`window.__captcha`, annonce JapScan) et `cf-chl=1` (`__cf_chl_opt`/`_cf_chl_opt`, options de démarrage de Cloudflare) → « annoncé, contrôle pas encore rendu » vs « pas de défi ».
  3. **`nav=`** (poller) : un `age` qui **décroît** = document remplacé sans que ce soit nous → compteur des rechargements auto du site, pour ne jamais confondre une boucle qu'il provoque avec la nôtre.
  4. **`dom=` marque les éléments cachés** (`0x0 (hidden)`), les **visibles d'abord** : un conteneur de défi résiduel se voit sans pouvoir expulser le markup rendu du dump (les `input` de formulaire courants, très nombreux en caché, sont justement ce risque).
- **Validé en amont** : fragment généré `why` exécuté sur 4 DOM de contrôle (résidu caché → `sel:#challenge-stage`, interstitiel FR → `title+body`, page propre → `isChallenge=false`, titre seul → `title`) ; `npm run check` 0/0 (versions 3.0.16), web **2352 tests / 41 fichiers** (+2 : flags annoncés, marquage/ordonnancement caché-visible), electron **30 tests** inchangés.
- **Zip reconstruit** : `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip`, **145 552 324 o**, hash de bundle **`MUP3JGTW`** (remplace `MUP2HX56`, à extraire par-dessus le dossier déjà sorti) ; marqueurs `why=`, `announce=`, `nav=`, `captcha=`, `cf-chl=1`, `(hidden)`, `deferred, challenge document` vérifiés dans `web/MUP3JGTW/DownloadTask.js`.
- **Trace à chercher après le test** : `poll#… cf=true widget=… frames=child=N age=… nav=… why=… announce=… dom=… site=… clr=…` — `why=` dit qui a déclenché le défi, `announce=` si la page annonce encore un défi, `nav=` si elle se recharge toute seule. À noter aussi ce que la fenêtre **affiche** (case à cocher ? page de sécurité JapScan ? rien du tout ?) et si elle se ferme seule : `Failed to find window with id N` signe une fenêtre détruite pendant que le poller tournait (timer d'interaction 150 s, fermeture par le flux, ou fermeture manuelle).

**10. Suite 1 oct. (3) — trace `MUP4KESP` : défi Cloudflare confirmé réel, widget jamais rendu, et la tenue ne finissait jamais**

- **Trace sur le zip `MUP3JGTW`** (clés `why=`/`announce=`/`nav=` = nouveau build, 46 warnings) :
  - **`announce=cf-chl=1`** → l'objet d'options `__cf_chl_opt`/`_cf_chl_opt` de Cloudflare est dans la page : le défi est **réel**, l'hypothèse du faux positif (section 9 a) est **écartée**. `why=` montre l'escalade des marqueurs round après round : `title` (« Un instant… ») → `title+body` (phrases FR du corps) → `title+body+sel:[name="cf-turnstile-response"]` (Turnstile a créé son champ de réponse caché) — le nouveau sélecteur mis à nu sort exactement là où on l'attendait.
  - **`widget=false` + `frames=child=0` + `dom=` sans aucun contrôle** : à poll#1/poll#2 le dump ne contient que la structure du site (`div.main-wrapper.WXlV2 | div.main-content | div.footer | div.footer-inner`), donc **ni iframe, ni input, ni label, ni bouton** ; plus tard `input#cf-chl-widget-kaymjj_response 0x0 (hidden)` apparaît → **Turnstile crée sa réponse mais jamais son iframe, rien n'est cliquable**. `nav=1` : un document remplacé une fois.
  - **`site=Interactive`** alors que le probe ne voit ni `#jc-overlay` ni `window.__captcha` dans le même round (branche à identifier, cf. correctif 3).
  - **`clr=changed` à chaque round, y compris poll#1 (7340 ms) → poll#2 (11915 ms) du même document** : la `cf_clearance` tourne pendant que le défi siège.
  - Session terminée par `PollForChallengeResolution: stopping poller … Failed to find window with id 7` (`poll#1 cf=- clr=error … cleared=false`).
- **Correctif 1 — la tenue ne finissait jamais** (`PlanScriptInjection`) : chaque `changed` exécutait `cookieSolvedAt = now`, donc **la grâce de 30 s redémarrait à l'infini** → le `force` n'était jamais atteint → aucune injection → la fenêtre vivait jusqu'à son propre timer (150 s) → exception, jamais de résultat. La deadline est désormais **absolue** : ancrée au *premier* changement, et **appliquée même si le churn continue** (`changed` au-delà de l'échéance → `force`). +2 tests.
- **Correctif 2 — distinguer une nouvelle clearance d'un churn** (`NextClearanceState(previous, raw, seen?)` → `{ baseline, changed, reappeared }`) : la valeur diffère de la baseline mais **a déjà été lue** → `reappeared`. Deux cookies `cf_clearance` portés sur la même URL peuvent s'alterner entre deux lectures CDP (`ReadClearance` prend le premier `find`), ce qui donnait `changed` à chaque round. Le poller note alors `clr=reappeared`, **ne met pas `cleared`** et ne démarre pas de tenue. La trace dira donc si CF **tourne réellement** (`changed` partout) ou si notre lecture **oscille** (`reappeared`) → seule donnée qui décidera si un correctif de sélection du cookie dans `ReadClearance` se justifie. +1 test (39 au fichier).
- **Correctif 3 — `site=Interactive` s'expliquera** : `JAPSCAN_CHALLENGE_DETECTION_SCRIPT` journalise la branche qui a décidé — `[KUMO] JapScanChallenge overlay:visible|overlay:hidden|captcha:needed|captcha:absent -> Interactive|None` — relais par le filtre de préfixe de `RemoteBrowserWindow` (`[JapScan]`/`[KUMO]` → console hôte). Réponses attendues : l'overlay est-il rendu *pendant que le probe ne le voit pas* (trou de diagnostic, et c'est là que vit le contrôle cliquable) ou `window.__captcha` existe-t-il au moment de la détection ?
- **Portes** : `npm run check` 0/0 (versions 3.0.16), web **2355 tests / 41 fichiers** (+3), electron **30/30**.
- **Zip reconstruit** : `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip`, **145 552 729 o**, hash de bundle **`MUP4KESP`** (remplace `MUP3JGTW`) ; marqueurs `reappeared` (DownloadTask.js), `JapScanChallenge` + `reason = 'overlay:'` + `' -> Interactive'` (HakuNeko.js, le connecteur y vit) vérifiés dans le build.
- **Trace à chercher après le test** : `clr=reappeared` **ou** `clr=changed` (les deux cas ne mènent plus à une tenue infinie : l'injection part au bout de 30 s maximum), la ligne `[KUMO] JapScanChallenge …`, l'**absence** de `Failed to find window`, puis `runScript: returned attempt=1`. Deux observations que la trace ne donne pas restent demandées : ce que la fenêtre **affiche** à l'écran, et le **résultat final** (chapitres listés ou bannière `Exception<…>` avec ses lignes `Fetch:`).

**11. Suite 1 oct. (4) — trace `MUP4KESP` : `JapScanChallenge -> None` et `nav=0`, le rechargement stall n'a jamais tiré, `site=Interactive` vient de l'amont**

- **Trace sur le zip `MUP4KESP`** (clés `clr=reappeared` + `JapScanChallenge` = nouveau build), lue du plus ancien au plus récent : **trois fenêtres de défi successives** (`redirect: Interactive url: https://www.japscan.foo/manga/-/`), chacune suivant le même schéma — `poll#1 age=6683 … clr=changed cleared=true` → `poll: cf_clearance changed but the challenge is still the current document, waiting…` → `ReloadStalledCloudFlareChallenge: deferred, challenge document is only 7680ms old (waiting 12000ms …)` → `poll#2 age=11405 … clr=reappeared cleared=false` → `poll#3 age=19990 … clr=reappeared cleared=false`. **`nav=0` partout : aucun `reload #N/3` n'a été déclenché, budget de 3 intact.**
- **`clr=reappeared`** confirme l'oscillation de lecture annoncée en section 10 (correctif 2) : la valeur revient à celle déjà lue, `cleared` repasse à `false`, la tenue ne repart pas. Le bon de contrôle « CF tourne-t-elle la clearance ? » reste donc ouvert côté `clr=changed`.
- **`[KUMO] JapScanChallenge captcha:absent -> None` à chaque round alors que `site=Interactive`** : la détection **propre** de JapScan rend `undefined` (ni `#jc-overlay` rendu, ni `window.__captcha`) → ce document **n'est pas** la page de sécurité du site. C'est le défi Cloudflare servi *par-dessus* le squelette JapScan : `why=title+body`, `announce=cf-chl=1`, `dom=` = `div.main-wrapper.WXlV2 | div.main-content | div.footer | div.footer-inner`, `frames=child=0`, aucun contrôle cliquable (parfois `input#cf-chl-widget-kaymjj_response 0x0 (hidden)` seul).
- **`site=Interactive` : investigation close, pas un bug de notre côté.** `AntiScrapingDetection.js` (obfusqué) exporte `AddAntiScrapingDetection(z, e = /^https?:/)` — motif par défaut qui accepte **toutes les URLs** — et enregistre lui-même **4 détections internes sans motif**, dont une renvoie une `FetchRedirection` selon son script. Le filtre de motifs ne s'applique donc qu'aux connecteurs (CrunchyScan `crunchyscan.org`, JapScan `japscan.[a-z]{2,4}`, …), et `CheckAntiScrapingDetection` préfère `None` puis `Interactive` : JapScan rend `undefined`, l'interne rend `Interactive`. Aucun correctif ; `[KUMO] JapScanChallenge …` sert désormais à prouver que **notre** détection dit `None`.
- **Cause racine du blocage (la vraie) — le rechargement stall n'a jamais tiré** : `doCheck` exigeait une clearance **fraîche** (`clearance !== clearanceBaseline && !== lastReloadedClearance`) ; avec deux cookies qui s'alternent, cette condition ne se vérifie que ~50 % des checks, et le backoff (5 s → 10 s → 20 s) ne donne que ~2 checks dans les 20 s observés → ni l'un ni l'autre n'a coïncidé avec un âge ≥ 12 s → `nav=0`, silence total, fenêtre laissée à son propre timer.
- **Correctif — helper pur exporté `PlanStalledChallengeReload({ isChallenge, hasRealWidget, widgetEverSeen, age, freshClearance, remaining })` → `'reload' | 'defer' | 'wait'`, deux raisons indépendantes toutes deux bornées par la grâce de 12 s** :
  1. **Aucun contrôle n'a *jamais* été rendu ici** → après la grâce, il n'y a rien qu'un rechargement pourrait remettre à zéro → rechargement **déterministe**, sans clearance ; le tour CDP `ReadClearance` est même sauté tant que `widgetEverSeen` est faux.
  2. **Le stall documenté** (clearance fraîche sur le même document) reste valable **quand un contrôle a déjà été vu** — cas CrunchyScan, comportement inchangé.
  - `widgetEverSeen` est **par document** : l'âge du probe (`performance.now()`) qui *décroît* signe un nouveau document et remet le drapeau à zéro (donc aussi après un rechargement que nous avons déclenché). +8 tests.
  - Journal `reload budget exhausted (3/3), the challenge stays for <url>` : le budget parti n'est plus un silence inexplicable.
- **Diagnostic 1 — source des ressources** : le probe liste désormais `[src*="cloudflare" i]`, `[src*="cdn-cgi" i]`, `[href*="cdn-cgi" i]` et **append la source** à chaque entrée (`script 0x0 https://challenges.cloudflare.com/turnstile/v0/api.js (hidden)`) → distingue « l'api.js n'est jamais arrivée » (réseau/CSP) de « demandée mais refusée ». +1 test.
- **Diagnostic 2 — erreurs de la fenêtre lecteur** : `RemoteBrowserWindow` relaie en plus `level === 'error'` (au-delà des préfixes `[JapScan]`/`[KUMO]`) dans la console hôte → échec de chargement de l'api.js ou violation de CSP visible dans le F12 de l'application, pas seulement dans celui de la fenêtre.
- **5ᵉ occurrence du piège backtick** : un backtick dans un commentaire **intérieur** à `CHALLENGE_WIDGET_PROBE` ferme le template literal → `PARSE_ERROR` oxc au transform (retiré). Et 6 warnings `tsdoc-param-tag-with-invalid-name` pour les `@param options.x` du helper → réécrit en prose pour garder `check` 0/0.
- **Portes** : `npm run check` 0/0 (versions 3.0.16), web **2364 tests / 41 fichiers** (+9), electron **30/30**.
- **Zip reconstruit** : `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip`, **145 553 171 o**, hash de bundle **`MUP5YWG1`** (remplace `MUP4KESP`) ; marqueurs `PlanStalledChallengeReload`, `no control rendered for`, `reload budget exhausted`, `[src*="cloudflare" i]` (DownloadTask.js) et `|| level === "error"` (main.js) vérifiés dans le build. **L'ancien dossier extrait `bundle\chainsmokerneko-electron-v3.0.16-win32-x64` doit être supprimé avant l'extraction** (pas de recouvrement).
- **Trace à chercher après le test** : `[KUMO] ReloadStalledCloudFlareChallenge: reload #1/3 (no control rendered for 12xxxms) for <url>` **déterministe** ~12 s après chaque défi sans contrôle (au lieu du `nav=0` silencieux), puis soit `poll#… widget=true` (le widget finit par se rendre), soit `reload budget exhausted (3/3)` ; `dom=script … challenges.cloudflare.com/…` dira si l'api.js est au moins demandée et une ligne relayée en `[error]` si elle échoue. Budget épuisé sans résolution = clearance non acceptée côté CF → repli `CLOUDFLARE.md` §3/§8. Restent toujours demandés : ce que la fenêtre **affiche** à l'écran et le **résultat final** (chapitres ou `Exception<…>`).

**12. Suite 1 oct. (5) — trace `MUP5YWG1` : le rechargement tire enfin, l'api.js est bien chargée, et la fenêtre meurt vers 20 s**

- **Trace sur le zip `MUP5YWG1`** :
  - **`[KUMO] ReloadStalledCloudFlareChallenge: reload #1/3 (no control rendered for 13206ms) for …/manga/centuria/`**, précédé de `deferred, challenge document is only 8191ms old` → **le helper `PlanStalledChallengeReload` a tiré déterministement** là où `MUP4KESP` restait à `nav=0` : le correctif de la section 11 est validé en conditions réelles.
  - **`dom=` avec les sources** (diagnostic 1 de la section 11) : `script 0x0 /cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=… (hidden) | script 0x0 https://challenges.cloudflare.com/turnstile/v0/b/d76908a69eab/api.js?load=zQFR (hidden) | input#cf-chl-widget-f6qb8_response 0x0 (hidden) | div.main-wrapper.WXlV2 …` → **l'api.js Turnstile est chargée** et son champ de réponse existe : ce n'est donc ni un échec réseau/CSP du bootstrap, ni un script jamais demandé. Le widget, lui, **ne se montre toujours jamais** (`frames=child=0`, aucune iframe).
  - **Un `[error]` relayé** (diagnostic 2) : `%c%d font-size:0;color:transparent NaN` avec pour origine `https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av…` — cette URL de frame **contredit `child=0`** : la frame existe soit dans une shadow root fermée (inatteignable par `querySelector`), soit elle a existé entre deux sondages. Non tranchable avec les champs DOM actuels → d'où `cdpFrames=` plus bas.
  - **`[KUMO] JapScanChallenge captcha:absent -> None`** à chaque round, avec `why=title+body+sel:[name="cf-turnstile-response"]` puis `why=title` : les marqueurs de corps du défi disparaissent entre deux rounds (Cloudflare fait évoluer la page sans navigation), et notre détection propre dit toujours « pas de page de sécurité JapScan ».
  - **Nouveau blocage** : ~4 s après `redirect: Interactive` (donc après le rechargement) → `PollForChallengeResolution: stopping poller … Error: … Failed to find window with id 6!` puis `poll#1 cf=- widget=- site=- clr=error:… cleared=false` → **la fenêtre 6 a disparu** et `Items: 0/0` reste. Tous les chemins de fermeture côté web passent par `destroy()` ; les timers (60 s et 150 s) sont bien réinitialisés par `enterInteractive()`, donc la cause est soit `runScript`, soit une fermeture **externe** (clic sur la fenêtre, crash du renderer) — les deux étaient **indiscernables** dans la trace, et c'est ce point qui bloque à présent.
- **Instrumentation ajoutée** :
  1. **`destroy(reason)`** : les 10 appels (5 upstream + 5 fork) passent leur raison — `fetch timeout`, `interactive timeout (150s)`, `script settled attempt=N`, `script failed attempt=N: <err>`, `classification failed`, `open failed` — journalisée `[KUMO] FetchWindow: closing window (<raison>) for <url>` **avant** toute fermeture.
  2. **Côté electron** : un `closed` **non** provoqué par notre `CloseWindow` → `[ReaderWindow:N] [warning] window closed without CloseWindow (user, crash or OS)` relais dans la console hôte, et `render-process-gone` → `[ReaderWindow:N] [error] renderer gone: <raison>` ; `CloseWindow` marque `closingWindows` pour ne jamais signaler nos propres fermetures.
  3. **`cdpFrames=`** : quand `cf=true && widget=false`, le poller demande `Page.getFrameTree` au débogueur (même canal CDP que `Network.getCookies`) et journalise l'arbre réel des frames. Une frame `challenges.cloudflare.com` visible alors que `frames=child=0` prouverait qu'un widget **existe** et que nos sondes sont aveugles (shadow root fermée) — donc qu'un rechargement remettrait à zéro un contrôle cliquable ; `none` confirmerait qu'il n'y a vraiment rien.
- **Portes** : `npm run check` 0/0 (versions 3.0.16), web **2364 tests / 41 fichiers**, electron **30/30**.
- **Zip reconstruit** : `app/electron/bundle/chainsmokerneko-electron-v3.0.16-win32-x64.zip`, **145 553 676 o**, hash de bundle **`MUP7FWN6`** (remplace `MUP5YWG1`) ; marqueurs `FetchWindow: closing window`, `cdpFrames=`, `Page.getFrameTree`, `script settled attempt=`, `interactive timeout (150s)` (DownloadTask.js) et `closingWindows`, `window closed without CloseWindow`, `renderer gone:`, `level === "error"` (main.js) vérifiés dans le build. L'ancien dossier extrait `bundle\chainsmokerneko-electron-v3.0.16-win32-x64` doit être supprimé avant l'extraction.
- **Trace à chercher après le test** : la ligne **`[KUMO] FetchWindow: closing window (<raison>) for <url>`** qui précède immédiatement `Failed to find window with id N` (c'est elle qui dit *qui* a fermé la fenêtre), `cdpFrames=` à côté de `frames=child=0`, et `window closed without CloseWindow (user, crash or OS)` / `renderer gone:`si la fermeture vient d'ailleurs que l'application.

**13. Décision 1 oct. (6) — arrêt du sujet Cloudflare ; parcours `Plugin Selection` validé, ajout d'URL abandonné**

- **Décision de l'utilisateur** : on arrête de chercher la boucle de défi (aucun résultat reproductible : un run passe avec `cf=false`, le suivant tourne avec l'interstitiel). **Parcours retenu : la boîte `Plugin Selection`**, seul chemin qui liste les mangas, et **l'ajout d'URL est abandonné** — l'utilisateur cherchera le nom dans la liste. Aucun code lié à l'ajout d'URL n'a été écrit ni committé : rien à supprimer, rien à retirer dans les marqueurs d'injection. Le sujet n'est à rouvrir que sur demande explicite.
- **Observation consignée, sans suite** : sur `Four Knights Of The Apocalypse 255 VF`, la fenêtre de défi est passée seule à **`Vérification réussie. En attente de www.japscan.foo…`** — la vérification Cloudflare **peut** se terminer toute seule quand on la laisse vivre. C'est l'argument à retenir si le sujet est rouvert : le rechargement déclenché après `CHALLENGE_WIDGET_RENDER_GRACE` (12 s) peut interrompre une vérification en cours et produire exactement la boucle observée. Aucune modification effectuée pour autant.
- **État figé** : zip **`MUP7FWN6`** (145 553 676 o), `npm run check` 0/0, web 2364 tests / 41 fichiers, electron 30/30 ; 2 commits locaux (`680bfcd88`, `08ff821e8`) et les éditions de session **non committés** sur `chainsmoker` ; push uniquement sur demande explicite, jamais `origin` ni `master`.

**14. Publication de la 3.0.17 (1 oct.)**

- **Poussé sur `fork/chainsmoker` en deux fois** : `2a6c410b2..f7e43a7a1` (`680bfcd88` fix des requêtes simples, `08ff821e8` docs, `e88b1d589` fix du stall de défi, `f7e43a7a1` docs) puis `f7e43a7a1..be93864eb` avec le tag `3.0.17`. Rien sur `origin`, rien sur `master`.
- **Bump** : 4 manifests (`package.json`, `web/`, `app/electron/`, `app/electron/build/`) + sections `## [3.0.17] - 2026-10-01` dans `CHANGELOG.md` **et** `CHANGELOG.en.md`. Vérification faite au passage : `scripts/bump-version.mjs <version>` fait exactement les mêmes écritures (ces 4 manifests + une section du jour dans le seul `CHANGELOG.md`), l'EN se renseigne à la main — donc l'écriture manuelle était équivalente.
- **Portes** : `npm run check` vert (versions 3.0.17), web 2364 tests / 41 fichiers (garde-fou du changelog compris), electron 30/30.
- **CI run `36833494055`** : premier passage vert sur Windows (10m32) et Linux (1m52), **macOS échoué après la création du DMG** — `hdiutil detach` rendu « Resource busy », 3 tentatives, `app/tools.mjs` jette à la dernière → `Publish release` ignoré. **Relance du seul job en échec** (`gh run rerun --failed`) : macOS ✓ 3m15s puis **Publish release ✓ 37s**. Flaky du runner macOS, sans rapport avec le code (la 3.0.16 était passée du premier coup) — l'artefact Windows/Linux du premier passage est conservé par la relance.
- **Release publiée** : <https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.17>, 2026-10-01 08:16 UTC, 10 bundles (`win32-x64`/`ia32`/`arm64` setup + zip, `darwin-x64`/`arm64` .dmg, AppImage x64, .deb amd64), lien *Full Changelog* `3.0.16...3.0.17` automatique. **Aucun zip local** pour cette version : tout passe par la release du dépôt (décision utilisateur).
- **Nettoyage effectué (2,44 Go)** : dossier extrait `bundle\chainsmokerneko-electron-v3.0.16-win32-x64`, les 6 dossiers de staging `.tmp` (hakuneko 3.0.5 / 3.0.7 / 3.0.8, chainsmokerneko 3.0.9 / 3.0.15 / 3.0.16), `probe-install`, `probe-profile`, `probe.log`, `bundle-full.log`. Conservés : `.tmp\electron-zips` (cache du binaire Electron, réutilisé à chaque build), `.tmp\nsis`, les scripts `drm-grep.mjs` et `japscan-http-probe.mjs`, le zip `MUP7FWN6` et `web\build\MUP7FWN6`.
- **Auto-update validée en réel** : passage **3.0.16 → 3.0.17** par l'auto-update de l'application, confirmé par l'utilisateur. Ça valide la boucle complète de cette version en conditions réelles : tag poussé sur `fork` → CI → release publiée avec ses bundles → l'application propose la mise à jour et l'applique (canal = releases du fork, comme depuis la 3.0.10). si la fermeture vient d'ailleurs que l'application.

**15. Fix du connecteur Comix (7 oct.) — `__axios.get is not a function` puis images en `403`**

- **Symptôme** : `Plugin failed to load items — Error invoking remote method 'RemoteBrowserWindowController:ExecuteScript': TypeError: __axios.get is not a function` (Source : *Kamudo* - *Comix*) sur la liste des items, alors que la liste médias affichait encore 92 387 titres (restes du cache d'une session antérieure : les trois scripts partagent le même `ScriptAxios`).
- **Cause racine 1 — le build du site a regroupé ses exports** : dans le chunk `env-*`, l'export `x` qui portait l'instance axios est redevenu un helper `e=>aa(t,e)` — **une fonction**, donc le garde `typeof !== 'function'` passait — mais sans `.get` → exception dans `ScriptMangas`, `ScriptChapters` et `ScriptPages`. La cliente est désormais l'export `T` : `{ get, post, put, patch, delete }` avec `get = async (e,t) => (await ho.get(e,t)).data`, c'est-à-dire une cliente qui **renvoie directement la payload**, pas la réponse axios.
- **Correctif 1 (`ScriptAxios`)** : le client est repéré **par forme** — première valeur d'export (module + `default`) dont `get/post/put/patch/delete` sont des fonctions, sinon instance axios brute (`request` + `interceptors`) — et `__get` désencapsule selon la forme de la réponse (`status` number + `headers` + `config` → `.data`, sinon la valeur telle quelle). Les trois scripts passent à `const data = await __get(...)` ; plus aucun nom d'export en dur → reproductible au prochain déploiement du site.
- **Cause racine 2 — le CDN images refuse tout `Referer`** : hébergeurs tournants (`1xx.softvisualstudio.site` côté Cloudflare, `rnn-d.kkplayer.wtf` côté 31.43.191.33). Sans `Referer` → **200 `image/webp`** ; avec `https://comix.to/`, la page de chapitre, **ou l'origine de l'image elle-même** → **403** (`Attention Required! | Cloudflare`). Or `FetchPages` forçait `Referer: this.URI.href` et `@Common.ImageAjax()` joint toujours `Referer: paramètre ?? origine` → l'application recevait `Exception<FetchProvider_Fetch_Forbidden>` sur chaque image.
- **Correctif 2 (`FetchImage` maison)** : `@Common.ImageAjax()` retiré au profit d'un `FetchImage` avec `referrerPolicy: 'no-referrer'` (aucun `Referer` n'est plus attaché aux `Page`), la façon qu'a le lecteur du site de charger ses images ; `Fetch()` de la plateforme garde la validation (un `403` reste signalé, pas de blob HTML silencieux).
- **Échec e2e qualifié : hôte mort, pas de régression** — le chapitre 66 des fixtures est intégralement servi par `rnn-d.kkplayer.wtf`, injoignable depuis la machine, **le navigateur et curl**, avec une résolution DNS publique (Cloudflare **et** Google) identique à la locale : le site lui-même ne peut plus l'afficher. Sur HEAD propre, 4/5 tests Comix tombaient déjà (le bug API) ; avec le fix, seul le blob échouait. Décision utilisateur : `Comix_e2e` et le flux comix de `CloudflareList_e2e` repointés sur le **chapitre 232** (hôte sain), avec note dans les deux fichiers. Fichier de diagnostic temporaire `ComixProbe_e2e.ts` supprimé après validation.
- **Portes** : `npm run check` **0/0** (versions 3.0.18, `tsc` web + electron, `eslint`, `svelte-check` 0 erreur, `vue-tsc`, `check:rules`) · unitaires **web 2364 / 41 fichiers + nw 1 + electron 30** · e2e `Comix_e2e` **5/5** (avec PornComix 5/5 et GedeComix 5/5), `CloudflareList_e2e` **5 passed / 1 skipped** (crunchyscan skip par conception) dont le **listing comix complet (~93 396 titres, 122 s)** et le flux chapitres → pages → image.
- **État** : version **3.0.18** (4 manifests via `scripts/bump-version.mjs` + sections `## [3.0.18] - 2026-10-07` en FR et EN), fichiers modifiés **non committés** ; push uniquement sur demande explicite, jamais sur `origin` ni `master`.

**16. Fiabilisation du connecteur Comix (8 oct.) — l'aléatoire venait du pool, pas du site**

- **Constat utilisateur** : « c'est encore trop aléatoire pour comix » — `Page fetch from 18.1 timed out after 15000ms` en rafale sur le chapitre 18.1 de *Kamudo*, alors que le même chapitre passe en 3,7 s au banc dès que l'hôte répond (15/15 en 0,9 s avec le throttle corrigé).
- **Relevé de topologie du CDN (sondages via la page du site)** : les jetons `/hi/<jeton>` valent sur **tout hôte de la même famille** (swap `rxn.warmhomemarket` ↔ `rxn.andrewsnotes` : 200, mêmes octets) mais `404` hors famille (`rxn` ↔ `447.*` ↔ `c150.kkplayer.wtf`) — le préfixe d'hôte *est* le cluster de stockage. L'API ne tourne jamais les hôtes (4 appels consécutifs → identiques), aucun frère DNS (`c149/c151.kkplayer.wtf` : NXDOMAIN) : le chapitre 18.1 n'a qu'**un seul hôte**, et le site n'a ni miroir, ni `onerror`, ni champ miroir dans l'API → la résilience ne peut venir que du connecteur. Jetons multi-usage, déterministes, valides **≥ 14 min sans renouvellement** (sondage minuté, 200 constant) : aucun code de renouvellement nécessaire ; les `404` massifs de début de session venaient de jetons retranscrits à la main dans une sonde — toujours prendre les URL depuis la payload de l'API.
- **Bug n°1 reproduit au banc (interception CDP = hôte mort) : la panne se propage** — `FetchImage` s'exécutait sans borne dans `imageTaskPool` (le `WithTimeout` 15 s de `DownloadTask` ne rejette que la promesse, il n'annule jamais la requête) : les 4 requêtes en vol sur le domaine mort gardaient les workers bloqués, et le chapitre suivant — servi par un hôte en pleine santé — mourait **0/20 en attente de worker**, même après rétablissement de l'hôte. C'est la « randomité » : un chapitre tombé sur un hôte mort empoisonne toute la suite de la file d'attente.
- **Bug n°2 reproduit : le plafond des ~57 pages** — le budget de 15 s part au lancement de **toutes** les pages, alors que le throttle `RateLimit(4, 1)` ne démarrait les requêtes qu'à 4/s : au-delà de ~57 pages, la queue meurt en file avec `timed out after 15000ms` sans jamais avoir touché le réseau (mesuré : chapitre 232, 183 pages → **58 récupérées** alors que l'hôte répondait en 50 ms).
- **Correctif (`Comix.ts`, v3.0.19)** : (a) borne **par requête** de 15 s à partir du démarrage réel de la tâche (attemptSignal + `SetTimeout` de `BackgroundTimers`) : la requête est annulée et le worker libéré ; (b) **refroidissement 20 s par hôte** (`imageHostCooldowns`) après un échec réseau : les pages restantes échouent instantanément avec `Image host unreachable` au lieu d'empiler de nouvelles attentes sur un hôte mort, et la reprise est automatique à l'expiration — une erreur `TypeError` passager bénéficie d'une reprise unique à 500 ms, une réponse HTTP non-`ok` n'active **pas** le refroidissement (l'hôte a répondu, il est vivant) ; (c) throttle du pool **4 → 20 req/s** (concurrence inchangée : les 4 workers du `TaskPool` bornent les sockets) ; (d) non-`ok` rejeté avec le statut — fin des trous silencieux où un blob HTML passait pour une image ; (e) `signal` null toléré (`WebsitesFixture` appelle `entry.Fetch(priority, null)` — régression attrapée au premier passage e2e).
- **Banc de non-régression `ComixBench_e2e.ts` (supprimé après validation, décision utilisateur — comme `ComixProbe_e2e`, les chiffres restent ici)** : 3 scénarios — chapitre sain, panne simulée (interception CDP sur `kkplayer.wtf`, la panne **continue** pendant le chapitre suivant), gros chapitre 183 pages. **Avant** : 15/15 en 3,7 s · 0/15 puis **0/20** · **58/183**. **Après** : 15/15 en 0,9 s · 0/15 puis **20/20 en 1,2 s** · **183/183 en 11 s**.
- **Portes** : `npm run check` **0/0** (versions 3.0.19, `tsc` web + electron, `eslint`, `svelte-check` 0 erreur, `vue-tsc`, `check:rules`) · unitaires **web 2364 / 41 fichiers** · e2e zone **5 fichiers / 23 passed + 1 skipped, exit 0** (`Comix_e2e` 5/5, `ComixBench` 3/3, `CloudflareList` 5/1 dont listing comix ~93k titres, `PornComix` 5/5, `GedeComix` 5/5). Un premier passage e2e était sorti en code 1 malgré des tests verts : erreur de teardown intermittente (`Target.closeTarget`), absente du passage suivant (exit 0) — à relancer avant de conclure à une régression.
- **Limite connue (non corrigée, à décider)** : le budget 15 s de l'engine inclut toujours l'attente en file — un chapitre de plusieurs centaines de pages sur un hôte lent (>0,3 s/image) peut encore perdre sa queue ; corriger cela touche `DownloadTask`, partagé par tous les connecteurs, et n'a pas été fait sans instruction explicite.
- **État** : **3.0.19 publiée** — commit `7de443701` (« fix(comix): requetes images bornees, hote mort en refroidissement et throttle du pool », footer `🤖 Generated with Codebuff`) poussé sur `fork` uniquement, tag `3.0.19` poussé, CI tag `37742508029` **verte en 14m43**, release **Latest** avec 10 artefacts le 8 oct. à 07:32 Z ; banc `ComixBench_e2e.ts` supprimé après validation (décision utilisateur). Push uniquement sur demande explicite, jamais sur `origin` ni `master`.
- **Incident de clôture (8 oct., ~07:07→)** : pendant la validation finale, **l'API comix.to a répondu `500` sur toutes ses routes** (~130 ms, erreur immédiate), y compris depuis la page du site avec le client axios **du site** — aucune implication du code de la forge. `Comix_e2e` retombait alors 4/5 en `Error invoking remote method 'RemoteBrowserWindowController::ExecuteScript': AxiosError … status code 500` (liste manga/chapitre/pages + blob), `PornComix` et `GedeComix` verts. Ce n'est **pas une régression** : le code était déjà validé 5/5 et zone complète verte (exit 0) sur ce même build, et la CI de push ne lance **aucun e2e sur site vivant** (typecheck/lint/build/bundles seulement) — la release n'en dépendait pas. Re-tentative de `Comix_e2e` dès le retour de l'API.
