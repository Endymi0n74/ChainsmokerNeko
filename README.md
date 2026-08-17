# ChainsmokerNeko 🚬🐱

> Fork personnel de **HaruNeko** — téléchargeur de mangas, animes & romans (application desktop).

[![Push (CI)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml/badge.svg)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml)
![Release](https://img.shields.io/github/v/release/Endymi0n74/ChainsmokerNeko?display_name=tag)
![Téléchargements (dernière release)](https://img.shields.io/github/downloads/Endymi0n74/ChainsmokerNeko/latest/total?label=t%C3%A9l%C3%A9chargements)
![Licence](https://img.shields.io/badge/licence-Unlicense-blue)

**🌐 Langue / Language :** [**Français**](README.md) · [English](README.en.md)

---

## À propos

ChainsmokerNeko est un fork personnel de **HaruNeko** (le successeur de HakuNeko) :
une application desktop de scraping et de téléchargement de mangas, animes et romans.

- **Cœur** : application web (TypeScript, Svelte + quelques composants Vue)
- **Shell desktop** : Electron (le shell NW.js reste disponible mais secondaire)
- **Amont (upstream)** : [manga-download/haruneko](https://github.com/manga-download/haruneko)

Ce fork ne vise pas la couverture maximale de l'upstream : il se concentre sur un
petit nombre de sites **retravaillés en profondeur** (connecteurs sans DRM,
contournement Cloudflare, paywalls), fiabilisés et couverts par des tests de
régression.

## Téléchargement

Toutes les versions (Windows ia32/x64/arm64, macOS dmg, Linux AppImage) sont
publiées sur la page **Releases du fork** :

👉 **https://github.com/Endymi0n74/ChainsmokerNeko/releases**

La dernière version stable est marquée `Latest` ; la release `nightly` contient
le build du dernier push sur `master`. Les anciennes versions (0.1.0 → 0.1.11)
restent téléchargeables sur le dépôt archivé [ChainsmokerNeko-legacy](https://github.com/Endymi0n74/ChainsmokerNeko-legacy).

## Fonctionnalités

- 📚 Liste, recherche et bookmarks sur des dizaines de milliers de mangas
- ⬇️ Téléchargement de chapitres et d'images en un clic
- 🖼️ Lecteur d'images intégré (version de l'app affichée dans la barre latérale et le titre)
- 🛡️ Gestion des **challenges Cloudflare** : UA standard conservée, session partagée,
  persistance du cookie `cf_clearance` entre les redémarrages, import depuis le
  navigateur réel, boutons « Test now » et « Clear Cloudflare cache »
- 🔌 Architecture à connecteurs : un fichier par site, enregistré dans `_index.ts`

## Sites retravaillés

| Site | Notes |
|------|-------|
| **MangaFire** | ~71 000 mangas ; signature API `vrf` ; listing, chapitres et pages fiables |
| **Comix (comix.to)** | ~91 000 mangas ; connecteur réécrit **sans DRM** |
| **MangaDrama** | Paywall en coins débloqué ; chapitres anglais ; connexion au compte (les chapitres achetés se déverrouillent) |
| **CrunchyScan** | Challenge Cloudflare « managé » : fenêtre de résolution, import `cf_clearance`, retry de téléchargement |

La quasi-totalité des autres connecteurs de l'upstream reste disponible dans
`web/src/engine/websites/_index.ts`, mais **sans garantie de fonctionnement** —
seuls les 4 sites ci-dessus sont retravaillés et testés par ce fork.

## Cloudflare bypass (cf_clearance)

Quand un site boucle sur un challenge Cloudflare « managé » (« Un instant… »), le
cookie `cf_clearance` que ton navigateur réel a déjà obtenu peut être réutilisé :
**Paramètres → Général → Cloudflare bypass**.

- **Ouvrir le site depuis l'app** : dans le sélecteur de site, choisis le site puis
  clique sur son **URL** — une fenêtre s'ouvre où le challenge se résout, et le cookie
  est conservé dans la session partagée. C'est le moyen le plus simple de débloquer
  CrunchyScan.
- **Importer cf_clearance depuis le navigateur** : lit le cookie depuis Edge, Chrome
  ou Chromium et l'injecte dans la session de l'app (Windows/macOS/Linux — DPAPI,
  trousseau ou passphrase, sans dépendance externe). Ferme d'abord le navigateur :
  son stockage de cookies est verrouillé pendant qu'il tourne. ⚠️ Sur Windows, les
  Edge récents chiffrent les cookies en « v20 » (App-Bound Encryption), illisible
  automatiquement → colle la valeur à la main.
- **Coller manuellement** : la voie fiable dans tous les cas. DevTools (`F12`) sur le
  site → Application → Cookies → copie la valeur de `cf_clearance` → colle-la dans le
  champ et clique **Inject**.
- **Test now** : vérifie en un clic que le `cf_clearance` injecté débloque réellement
  le site.
- **Clear Cloudflare cache** : efface le snapshot `cloudflare-clearance.json` et les
  cookies `cf_clearance` de la session (à utiliser si le cookie est périmé).

Le cookie est **persisté sur disque** : une fois réchauffé, il survit aux redémarrages
de l'app (rechargé avec une expiration d'un mois). S'il est périmé côté Cloudflare,
le flux de challenge normal reprend simplement.

Statut complet, matrice de scénarios et historique des versions : voir
[`CLOUDFLARE.md`](CLOUDFLARE.md).

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
npm run check --workspace=web           # typecheck + eslint + svelte-check + vue-tsc + règles
npm run check --workspace=app/electron  # typecheck + lint (Electron)
npm run check --workspace=app/nw        # typecheck + lint (NW.js)
```

### Tests

```bash
npm run test            # tests unitaires (vitest)
npm run test:websites   # tests des connecteurs (listing, chapitres, pages, images)
npm run test:e2e        # tests de la web app (vraie application Electron)
```

Le test de régression [`CloudflareList_e2e.ts`](web/src/engine/websites/CloudflareList_e2e.ts)
vérifie que les sites Cloudflare (mangafire, comix, mangadrama) listent bien leurs
mangas dans le flux applicatif réel — toute régression de listing casse le CI.

### Intégration continue

[`.github/workflows/push-ci.yml`](.github/workflows/push-ci.yml) : à chaque push —
trois jobs en cascade (les commits purement documentaires `*.md` / `docs/**` sont ignorés) :
1. **Typecheck & Build** (`ubuntu-latest`) : typecheck (web/electron/nw) + eslint +
   svelte-check + vue-tsc + build web/electron (cache npm + binaire Electron) ;
2. **Bundles** (après le CI) : réutilise le build via artefact, génère les bundles
   **Windows** (ia32/x64/arm64), **macOS** (dmg) et **Linux** (AppImage) ;
3. **Release** (uniquement pour `master`) : publie les bundles sur la release roulante
   **`nightly`** (`latest` reste réservé aux versions taguées).

Autres workflows : [`pull-request-ci.yml`](.github/workflows/pull-request-ci.yml) (checks
+ tests e2e/websites sur les PR), [`create-release.yml`](.github/workflows/create-release.yml)
(release multi-OS manuelle), [`pull-request-deploy.yml`](.github/workflows/pull-request-deploy.yml)
(préviews Cloudflare, label « Deploy PR ») et [`website-metrics.yml`](.github/workflows/website-metrics.yml)
(métriques périodiques des sites).

## Structure du projet

```text
web/src/engine/websites/   → connecteurs/scrapers (1 fichier par site)
web/src/engine/platform/   → infrastructure de fetch + fenêtre navigateur distante
web/src/engine/providers/  → MangaPlugin, Chapter, Page, …
app/electron/src/          → main Electron (serveur local, IPC, user-agent)
app/nw/                    → shell NW.js (secondaire)
docs/                      → documentation (VitePress)
```

## Versions

Les versions stables sont taguées (`0.1.x`) et publiées sur la page
[Releases](https://github.com/Endymi0n74/ChainsmokerNeko/releases) avec les bundles
des trois OS. Les anciennes versions (0.1.0 → 0.1.11) restent téléchargeables sur
[ChainsmokerNeko-legacy](https://github.com/Endymi0n74/ChainsmokerNeko-legacy)
(archivé, conservé comme archive des releases historiques).

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[Unlicense](UNLICENSE) — domaine public.

## Remerciements

Projet dérivé de [HaruNeko](https://github.com/manga-download/haruneko) / [HakuNeko](https://github.com/manga-download/hakuneko).
