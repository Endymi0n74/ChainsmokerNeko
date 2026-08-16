# ChainsmokerNeko 🚬🐱

> Fork personnel de **HaruNeko** — téléchargeur de mangas, animes & romans (application desktop).

[![Push (CI)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml/badge.svg)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml)
![Licence](https://img.shields.io/badge/licence-Unlicense-blue)

---

## À propos

ChainsmokerNeko est un fork personnel de **HaruNeko** (le successeur de HakuNeko) :
une application desktop de scraping et de téléchargement de mangas, animes et romans.

- **Cœur** : application web (TypeScript, Svelte + quelques composants Vue)
- **Shell desktop** : Electron (historiquement NW.js)
- **Amont (upstream)** : [manga-download/haruneko](https://github.com/manga-download/haruneko)

## Fonctionnalités

- 📚 Liste, recherche et bookmarks sur des dizaines de milliers de mangas
- ⬇️ Téléchargement de chapitres et d'images (pages) en un clic
- 🖼️ Lecteur d'images intégré avec action **« Save all images »** (sauvegarde toutes les pages d'un chapitre)
- 🛡️ Gestion des **challenges Cloudflare** : UA standard conservée, session partagée, auto-résolution des challenges « managés » et reload opt-in par site
- 🔌 Architecture à connecteurs : un fichier par site, enregistré dans `_index.ts`

## Sites retravaillés

| Site | Notes |
|------|-------|
| **MangaFire** | ~71 000 mangas ; signature API `vrf` ; challenge Cloudflare auto-résolu |
| **Comix (comix.to)** | ~91 000 mangas ; connecteur réécrit **sans DRM** |
| **CrunchyScan** | Challenge Cloudflare « managé » + reload opt-in + retry de téléchargement |

… et 17 autres connecteurs ajoutés.

## Démarrage rapide

Prérequis : **Node.js ≥ 24**, **npm ≥ 11.3**.

```bash
# 1. Installer les dépendances (déterministe : package-lock.json committé)
npm ci

# 2. Builder (web puis electron — l'ordre compte, electron copie web/build)
npm run build --workspace=web
npm run build --workspace=app/electron

# 3. Lancer l'application (serveur HTTP local embarqué sur 127.0.0.1:<port>)
./node_modules/electron/dist/electron.exe ./app/electron/build
```

## Développement

### Vérifications de qualité

```bash
npm run check:ts --workspace=web        # typecheck TypeScript
npm run check:lint --workspace=web      # eslint
npm run check:svelte --workspace=web    # svelte-check
npm run check:vue --workspace=web       # vue-tsc
npm run check --workspace=app/electron  # typecheck + lint (Electron)
npm run check --workspace=app/nw        # typecheck + lint (NW.js)
```

### Tests e2e (vraie application Electron)

```bash
npm run test:websites   # tests des connecteurs (listing, chapitres, pages, images)
npm run test:e2e        # tests de la web app
```

Le test de régression [`CloudflareList_e2e.ts`](web/src/engine/websites/CloudflareList_e2e.ts)
vérifie que les sites Cloudflare (mangafire, comix, mangadrama) listent bien leurs mangas
dans le flux applicatif réel.

### Intégration continue

[`.github/workflows/push-ci.yml`](.github/workflows/push-ci.yml) : à chaque push — trois
jobs en cascade (les commits purement documentaires `*.md` / `docs/**` sont ignorés) :
1. **Typecheck & Build** (`ubuntu-latest`) : typecheck (web/electron/nw) + eslint +
   svelte-check + vue-tsc + build web/electron (cache npm + binaire Electron) ;
2. **Windows bundles** (`windows-latest`, après le CI) : réutilise le build via artefact,
   génère les **3 bundles Windows** (ia32/x64/arm64) ;
3. **Release** (uniquement pour `master`) : publie les bundles sur la release roulante
   **`nightly`** (`latest` reste réservé aux versions taguées).

## Structure du projet

```text
web/src/engine/websites/   → connecteurs/scrapers (1 fichier par site)
web/src/engine/platform/   → infrastructure de fetch + fenêtre navigateur distante
web/src/engine/providers/  → MangaPlugin, Chapter, Page, …
app/electron/src/          → main Electron (serveur local, IPC, user-agent)
app/nw/                    → shell NW.js (secondaire)
docs/                      → documentation (VitePress)
```

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[Unlicense](UNLICENSE) — domaine public.

## Remerciements

Projet dérivé de [HaruNeko](https://github.com/manga-download/haruneko) / [HakuNeko](https://github.com/manga-download/hakuneko).
