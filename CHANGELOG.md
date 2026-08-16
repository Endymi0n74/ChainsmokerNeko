# Changelog

Toutes les modifications notables de **ChainsmokerNeko** sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### Modifié

- **Mise à jour différentielle des listes de mangas (`MediaLists`)** : lors d'un
  refresh, seuls les lots (`#0`, `#1`, …) dont le contenu a réellement changé sont
  réécrits (comparaison `id` + `title`), au lieu de réécrire la totalité des lots à
  chaque mise à jour.

## [0.1.1] - 2026-08-16

### Ajouté

- **Téléchargement automatique des nouveaux chapitres** dans les paramètres (onglet
  Général) : un bouton détecte les chapitres publiés dans les **48 dernières heures**
  parmi les **bookmarks**, filtre les **versions anglaises** et les ajoute à la file de
  téléchargement.
- Champ `PublishedAt` sur le modèle `Chapter` : date de publication remontée depuis le
  site (MangaFire fournit `createdAt` par chapitre) et utilisée par le filtre « 48h ».
- Test unitaire du channel IPC `ApplicationWindow::GetVersion`
  (`ApplicationWindow_test.ts`, avec `app.getVersion` mocké).
- **Drapeaux de langue devant les chapitres** : le drapeau du pays (emoji) est
  désormais affiché devant le nom de chaque chapitre doté d'un tag de langue,
  pour distinguer les versions (auparavant réservé au mode multilingue).
- **Version dans la barre de titre et le titre de fenêtre** : la version de l'app
  (ex. `v0.1.1`) est affichée à côté du nom dans l'AppBar et dans le titre de la
  fenêtre (`document.title`).
- **Version en pied de page du lecteur** : en mode plein écran (lecture d'images),
  un pied de page discret affiche `v0.1.1` en bas à gauche.
- **Splash screen fonctionnel avec version** : la fenêtre de chargement Electron
  (`OpenSplash`) s'affiche réellement au démarrage (elle était ignorée par
  `ShowWindow` côté main) et affiche la version lue via IPC. La fenêtre est
  recréée proprement à chaque affichage (correction du `Object has been destroyed`
  sur rechargement).
- **Durée minimale du splash screen** : réglage « Splash screen » dans l'onglet
  Général des paramètres qui maintient l'écran de démarrage visible au moins la
  durée indiquée (0 = pas de minimum).

### Modifié

- Exécutables des bundles renommés **`hakuneko`** sur toutes les plateformes
  (`hakuneko.exe` sous Windows, binaire `hakuneko` dans le .app macOS et le snap
  Linux) au lieu de `hakuneko-electron` : l'appli tourne sous un nom de processus
  distinct d'`electron.exe`, ce qui évite de la fermer en tuant les sondes de test.
- **Recherche de mangas fluidifiée** : la saisie est débouncée (200 ms) et la liste
  n'est triée qu'une seule fois au chargement au lieu d'être re-triée à chaque frappe
  (le filtrage préserve l'ordre déjà trié).
- **Liste des chapitres virtualisée** : la liste des éléments d'un manga utilise
  désormais `VirtualList` (seules les lignes visibles sont rendues, au lieu des
  ~1 200 nœuds DOM d'une longue série). Les abonnements aux flags et à la file de
  téléchargement sont **centralisés dans la liste** (un par liste) et l'état est
  passé aux items en props, au lieu de ~2 abonnements par chapitre (milliers au total).
- **Liste des mangas shardée (`MediaLists`)** : la liste d'un site (ex. ~70 000
  entrées MangaFire) n'est plus chargée/réécrite en un seul blob mono-clé ; elle est
  découpée en lots de 1 000 entrées (clés `#0`, `#1`, … + méta `#meta`), avec repli
  sur l'ancien format mono-clé et purge des lots obsolètes lors d'une mise à jour.
- **Recherche floue dans un Web Worker** : l'indexation et la recherche Fuse.js
  tournent désormais dans un worker (`FuseSearchWorker`) au lieu du thread UI — la
  recherche (jusqu'à ~200 ms sur 70 000 titres) ne bloque plus l'interface. Le
  worker indexe les titres et renvoie des indices, remappés ensuite vers les items.

### Retiré

- Action **« Save all images »** du lecteur d'images (bouton superposé retiré : jugée
  superflue par rapport au téléchargement standard des chapitres).

### Corrigé

- **Réglages/bookmarks perdus à la fermeture** : le serveur local choisissait un
  **port aléatoire** à chaque lancement (`listen(0)`), ce qui changeait l'origin
  `http://127.0.0.1:<port>` et réinitialisait IndexedDB/localStorage (donc les
  réglages et les bookmarks) entre deux sessions. Le serveur écoute désormais un
  **port stable** (64210, avec repli 64211–64225 puis port libre en cas de collision),
  ce qui conserve l'origin et la persistance d'une session à l'autre.

## [0.1.0] - 2026-08-16

### Ajouté

- Version propre du projet (`0.1.0`) : les bundles sont désormais nommés
  `hakuneko-electron-v0.1.0-<plateforme>-<arch>.zip` au lieu de porter la version
  d'Electron (`v43.3.0`) ; la version est aussi propagée au manifest embarqué et au snap.
- La version de l'app est affichée dans les paramètres (« HakuNeko v0.1.0 ») et dans le
  menu « À propos » de la barre latérale (« Using version 0.1.0 »), lue depuis le manifest
  via le channel IPC `ApplicationWindow::GetVersion`.

- Connecteurs **CrunchyScan** et **MangaDrama** (scrapers + WAF), panneau « Nouveaux chapitres » et UX du lecteur améliorée.
- Connecteur **Comix** entièrement reconstruit **sans DRM** (~91 000 mangas, chapitres et pages via scripts axios du site).
- 17 nouveaux connecteurs.
- Menu contextuel du lecteur d'images : enregistrer / copier l'image.
- Bouton de téléchargement des éléments dans l'interface classique + affichage de la source en cas d'échec de la liste.
- Test e2e de régression de listing pour les sites Cloudflare (`web/src/engine/websites/CloudflareList_e2e.ts`).

### Corrigé

- **Challenges Cloudflare infinis** (MangaFire, Comix, CrunchyScan) :
  - UA standard conservée : retrait du token produit (`hakuneko-electron/…`) de l'user-agent au lieu du segment `Electron`.
  - Session Electron partagée avec les fenêtres distantes + cookies partitionnés (`cf_clearance`) inclus dans l'injection fetch.
  - Auto-résolution des challenges « managés » en arrière-plan : suppression du `win.Hide()` (qui mettait le challenge en pause) et délai de grâce avant inspection de la page.
  - Reload **opt-in** des challenges bloqués (`ChallengeReload.ts`, utilisé par CrunchyScan).
- Téléchargements CrunchyScan : retry (3×) avec backoff + timeout par tentative contre les 403 Cloudflare intermittents.
- Scrapers **MangaFire** et **MangaDrama**.
- CrunchyScan déplacé vers `crunchyscan.org`.

### Modifié

- La web app est servie par un **serveur HTTP local embarqué** dans le client Electron.
- Installation déterministe : `package-lock.json` committé + `npm ci` dans la CI.
- CI : typecheck + lint + svelte-check + vue-tsc + build (web/electron/nw) à chaque push, avec cache npm et binaire Electron.
- Retrait du workflow de déploiement Cloudflare hérité de l'upstream.

---

## Historique amont

L'historique complet (3 900+ commits) provient de [HaruNeko](https://github.com/manga-download/haruneko)
et de [HakuNeko](https://github.com/manga-download/hakuneko). Ce changelog ne couvre que les
modifications propres à ce fork.
