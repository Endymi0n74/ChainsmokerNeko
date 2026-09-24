# ChainsmokerNeko 🚬🐱

[![Push (CI)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml/badge.svg)](https://github.com/Endymi0n74/ChainsmokerNeko/actions/workflows/push-ci.yml)
![Release](https://img.shields.io/github/v/release/Endymi0n74/ChainsmokerNeko?display_name=tag)
![Downloads](https://img.shields.io/github/downloads/Endymi0n74/ChainsmokerNeko/latest/total)

**🇫🇷 Français** · [🇬🇧 English](README.en.md)

**Fork de [HaruNeko](https://github.com/manga-download/haruneko)** — application desktop de téléchargement de mangas.

## 📥 Télécharger

👉 **[Releases](https://github.com/Endymi0n74/ChainsmokerNeko/releases/tag/3.0.4)** — Windows (x64/ia32/arm64)

## 📸 Aperçu

![Accueil](docs/screenshots/home.png)
![Plugins](docs/screenshots/plugins.png)
![Paramètres](docs/screenshots/settings-general.png)

> Les captures d'écran sont régénérées avec `node scripts/take-screenshots.mjs` (lance l'application Electron contre un serveur local `vite preview`).

## ✨ Ce que le fork ajoute

- **CrunchyScan** / **JapScan** — bypass Cloudflare + captchas résolus dans une fenêtre visible
- **MangaDrama** — connexion intégrée à l'application, chapitres achetés débloqués
- **MangaFire** / **Comix** — listing fiable, sans DRM
- Import automatique du cookie `cf_clearance` depuis Edge/Chrome
- Scan des nouveaux chapitres au démarrage (facultatif)

## 🔧 Développement

```bash
npm ci
npm run build --workspace=web
npm run build --workspace=app/electron
./node_modules/electron/dist/electron.exe ./app/electron/build
```

## 📄 Licence

[Unlicense](UNLICENSE) — domaine public.

---

*Développé en vibe coding avec [Codebuff](https://codebuff.com) (Kumo).*
