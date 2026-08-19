# Feuille de route — ChainsmokerNeko

> Document de vision. Dernière mise à jour : 18 août 2026 (préparation de la v2.0.0).

## Pourquoi une v2.0.0 ?

ChainsmokerNeko a commencé comme un fork d'HakuNeko. Depuis, il a divergé au
point de devenir un produit à part entière : sa propre suite de contournement
Cloudflare, ses optimisations de performance massives, sa distribution 3 OS et
ses releases bilingues. La **v2.0.0** acte ce passage : ce n'est plus « un fork
d'HakuNeko avec quelques fixes », c'est **la version stable et autonome du
projet**, avec une promesse de non-régression.

## Périmètre embarqué dans la 2.0.0

### Connecteurs
- **MangaFire** — 71k mangas, signature API `vrf`, images via `ImageAjax`.
- **Comix** — réécrit sans DRM (91k mangas), chapitres et pages fonctionnels.
- **MangaDrama** — déblocage du paywall, chapitres anglais, **connexion au
  compte**, affichage du prix en coins sur les chapitres verrouillés et
  déverrouillage des chapitres achetés.
- **CrunchyScan** — challenge Cloudflare géré (voir section Cloudflare).
- **17 connecteurs additionnels** ajoutés dans le registre ; une partie reste à
  valider site par site (voir « Reporté »).

### Suite Cloudflare (le différenciateur)
- UA par défaut conservée (segment `Electron`) — élimine le challenge MangaFire.
- Poller de reload des challenges « managés » sans widget réellement rendu.
- Fenêtre visible **uniquement** quand un widget réel est présent.
- **Persistance du `cf_clearance`** entre les redémarrages (snapshot).
- **Import du cookie depuis Chrome/Edge** (déchiffrement v10/v20 + DPAPI),
  collage manuel en secours.
- Bouton « Clear Cloudflare cache » dans les paramètres.
- Scan de nouveau contenu **paresseux et silencieux** : plus aucune fenêtre au
  boot ni pendant la vérification des bookmarks.

### Performance (mesurée, sans régression)
- Liste des chapitres **virtualisée** (VirtualList) — abonnements centralisés,
  plus de milliers de souscriptions par item.
- Store MediaLists **shardé** + diff à la volée — plus de blob mono-clé de 91k
  entrées chargé/réécrit en entier.
- Recherche floue Fuse.js dans un **Web Worker** — le thread UI reste fluide.
- Débounce du filtre + tri unique au chargement.
- Singleton IndexedDB partagé (gain au boot).

### Application & distribution
- Renommage de l'exécutable en **hakuneko(.exe)**.
- Bundles **Windows (ia32/x64/arm64), macOS (dmg), Linux (snap)** via CI.
- **Mise à jour automatique** (electron-updater) + notification + bouton.
- Version affichée dans la barre latérale, le lecteur, le splash et les
  paramètres.
- Drapeaux de pays devant les noms de chapitres.
- Accent corail `#e5484d`.
- Téléchargement automatique des nouveaux chapitres (< 48 h) des bookmarks,
  anglais uniquement.
- Releases **bilingues FR/EN** + badges + changelog.
- Dépôt renommé **ChainsmokerNeko** (l'ancien dépôt a été supprimé).

## Reporté (2.0.x et au-delà)

- **Câblage des connecteurs restants** : les 17 connecteurs ajoutés mais non
  câblés dans `_index.ts` doivent être validés un par un (listing → chapitres →
  pages) avant d'entrer dans une release. Priorité aux sites français/anglais.
- **Thèmes personnalisables** (le thème clair/sombre existe déjà).
- **Synchronisation multi-appareils** des bookmarks et réglages.
- **Relecture des chapitres** (position de lecture persistée par chapitre).
- Génération de coins MangaDrama : **abandonnée** (endpoints de jeu non fiables,
  score validé côté serveur) — on s'appuie sur l'achat via le navigateur réel.

## Convention de versioning

- **0.1.x** : correctifs fonctionnels et petites évolutions (chaque correctif
  fonctionnel → bump + 3 bundles + release bilingue).
- **2.0.0** : majeure — suite Cloudflare + perf + distribution complètes.
- **2.0.x (convention actuelle, 18 août)** : TOUTES les évolutions et correctifs
  post-2.0.0 (installateur NSIS inclus) sortent en **2.0.1, 2.0.2, …** — pas de
  saut direct en 2.1 tant qu'un vrai périmètre mineur n'est pas décidé.
- Chaque **gros changement** doit être versionné et accompagné d'une release
  GitHub (3 zips + setup.exe) et d'une entrée CHANGELOG.
- **Aucune régression** : typecheck (web/electron), eslint, svelte-check,
  suite vitest (2150+ tests) verts avant tout bump.

## Risques & mitigations

| Risque | Mitigation |
|--------|-----------|
| Cloudflare change son challenge | Contrôle de widget réel, import v10/v20 multi-navigateurs, collage manuel |
| Un connecteur se casse | Test de listing e2e committé, non-régression vérifiée à chaque release |
| Comix / MangaFire changent d'API | Connecteurs isolés ; le reste de l'app n'en dépend pas |
| Paywall MangaDrama | Connexion compte + achat réel ; pas de contournement des coins |

## Crédits / Credits

Développé en vibe coding avec l'assistance de **Codebuff (Buffy)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.

Developed with vibe coding, assisted by **Codebuff (Buffy)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.
