# ChainsmokerNeko 🚬🐱

[![Push (CI)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml/badge.svg)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml)
![Release](https://img.shields.io/github/v/release/Endymi0n74/ChainsmokerNeko?display_name=tag)
![Downloads](https://img.shields.io/github/downloads/Endymi0n74/ChainsmokerNeko/latest/total)
![License](https://img.shields.io/github/license/Endymi0n74/ChainsmokerNeko)

Fork autonome de [HaruNeko](https://github.com/manga-download/haruneko) (ex-HakuNeko) :
application desktop de téléchargement de mangas, d'animes et de romans.

La ligne produit **`3.0.x`** vit sur la branche `chainsmoker` ; `master` reste un miroir
pristine de l'amont. Les paquets des trois OS sont construits par la CI à chaque tag,
et l'application installée se met à jour elle-même depuis les releases.

🇫🇷 Français · 🇬🇧 [English](README.en.md)

## 📥 Télécharger

👉 **[Dernière release](https://github.com/Endymi0n74/ChainsmokerNeko/releases/latest)**

| Plateforme | Paquets | État |
|---|---|---|
| Windows 10/11 x64 · ia32 · arm64 | `.zip` portable ou `setup.exe` (NSIS) | validé |
| Linux x64 | `.AppImage`, `.deb` (amd64) | non testé |
| macOS x64 · arm64 | `.dmg` | non testé |

Chaque release embarque dix artefacts. Seuls les paquets Windows sont validés en
usage réel : les builds Linux et macOS sont produits par la CI mais n'ont pas été
exercés — leur nom de fichier porte `.untested` pour que ce soit visible.

## 📸 Aperçu

![Accueil](docs/screenshots/home.png)
![Plugins](docs/screenshots/plugins.png)
![Paramètres](docs/screenshots/settings-general.png)

> Les captures se régénèrent avec `node scripts/take-screenshots.mjs` (lance
> l'application Electron sur un `vite preview` local).

## ✨ Ce que ce fork apporte

- **Suite Cloudflare** (le différenciateur) : fenêtre visible uniquement quand un
  widget de défi est réellement rendu, poller de rechargement des défis « managés »,
  persistance du `cf_clearance` entre les redémarrages, import du cookie depuis
  Chrome/Edge (déchiffrement v10/v20 + DPAPI), bouton « Clear Cloudflare cache ».
- **Connecteurs maintenus alors que l'amont les lâche** : CrunchyScan, YaoiScanFR
  et HentaiScantrad.
- **MangaDrama** : connexion au compte dans l'application, prix en coins affiché
  sur les chapitres verrouillés, chapitres achetés déverrouillés.
- **MangaFire / Comix** : catalogue et lecture fonctionnels, sans DRM.
- **Téléchargements** : exports PDF / CBZ / omnibus, timeouts de téléchargement
  (stall 15 s, watchdog de tâche), progression affichée dès le démarrage d'une tâche.
- **Releases bilingues** : `CHANGELOG.md` / `CHANGELOG.en.md`, versions alignées
  dans les trois manifests et vérifiées par la CI.

## 🔧 Développement

Node.js 24 requis.

```bash
npm ci
npm run build:web
npm run build --workspace=app/electron
./node_modules/electron/dist/electron.exe ./app/electron/build
```

Autres commandes utiles :

```bash
npm run check        # versions des manifests + typecheck/lint de chaque workspace
npm test             # suites unitaires (web, Electron, NW)
npm run bundle:x64   # bundle Windows x64 local
```

## 📚 Documentation

- [CHANGELOG.md](CHANGELOG.md) · [CHANGELOG.en.md](CHANGELOG.en.md) — notes de version
  (toute version publiée doit y être documentée, la CI le vérifie).
- [SYNC.md](SYNC.md) — politique de branches et procédure de fusion amont.
- [ROADMAP.md](ROADMAP.md) — périmètre et vision.
- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md).

## 📄 Licence

[Unlicense](UNLICENSE) — domaine public.

---

*Développé en vibe coding avec [Codebuff](https://codebuff.com).*
