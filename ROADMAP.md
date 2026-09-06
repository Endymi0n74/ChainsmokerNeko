# Feuille de route — ChainsmokerNeko

> Document de vision. Dernière mise à jour : 6 septembre 2026 (v3.0.4).

## Pourquoi une v2.0.0 ?

ChainsmokerNeko a commencé comme un fork d'HakuNeko. Depuis, il a divergé au
point de devenir un produit à part entière : sa propre suite de contournement
Cloudflare, ses optimisations de performance massives, sa distribution 3 OS et
ses releases bilingues. La **v2.0.0** acte ce passage : ce n'est plus « un fork
d'HakuNeko avec quelques fixes », c'est **la version stable et autonome du
projet**, avec une promesse de non-régression.

## Point d'étape (v3.0.4 — 6 sept. 2026)

- **v2.0.x** (18 août) : installateur NSIS, série de correctifs — la convention passe au patch.
- **v3.0.0** (26 août) : majeure — les 17 connecteurs sont **câblés** dans `_index.ts` (opt-in fork challenge handling), tests de régression e2e (MangaNova, ScanManga, Cloudflare), fix VirtualList bookmarks, sentinel cookies ScanManga.
- **v3.0.1 → v3.0.4** (1→5 sept) : JapScan reader-first + probe harvest (volumes complets 204/204, validé utilisateur sur la 3.0.4), timeouts téléchargement (stall 15s, watchdog, `CHAPTER_UPDATE_TIMEOUT_MS = 300s`), exports PDF/CBZ/omnibus + `CloudFlareRenewal`, fusion upstream fork-first et restructuration **2 branches** (`master` = miroir pristine upstream, `chainsmoker` = ligne produit) — voir `SYNC.md`.
- Releases publiées par la CI au push d'un tag `3.*` sur `chainsmoker` (10 artefacts, 3 OS).

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

- **Validation runtime des connecteurs** : les 17 connecteurs sont câblés depuis
  la 3.0.0 ; reste à valider site par site en conditions réelles (listing →
  chapitres → pages), priorité aux sites français/anglais. Statut par site :
  `MEMORY.md` §3 — JapScan validé (v3.0.4).
- **Thèmes personnalisables** (le thème clair/sombre existe déjà).
- **Synchronisation multi-appareils** des bookmarks et réglages.
- **Relecture des chapitres** (position de lecture persistée par chapitre).
- Génération de coins MangaDrama : **abandonnée** (endpoints de jeu non fiables,
  score validé côté serveur) — on s'appuie sur l'achat via le navigateur réel.

## Convention de versioning

- **0.1.x** (historique) : correctifs fonctionnels et petites évolutions.
- **2.0.0** : majeure — suite Cloudflare + perf + distribution complètes.
- **2.0.x** (18 août) : toutes les évolutions post-2.0.0 sortent en **2.0.1, 2.0.2, …**.
- **3.0.0** (26 août) : majeure — câblage connecteurs, e2e, cleanup ; depuis,
  **convention actuelle : 3.0.x** (3.0.1, 3.0.2, …) — pas de saut mineur tant
  qu'un vrai périmètre n'est pas décidé.
- Chaque **gros changement** doit être versionné et accompagné d'une entrée
  CHANGELOG (FR/EN) ; la release GitHub (10 artefacts, 3 OS) est publiée par la
  CI au push du tag `3.*` sur `chainsmoker`.
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

Développé en vibe coding avec l'assistance de **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.

Developed with vibe coding, assisted by **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.
