# Changelog

Toutes les modifications notables de **ChainsmokerNeko** sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [0.1.12] - 2026-08-17

### Ajouté

- **Notification de mise à jour** : au lancement, l'app vérifie la dernière
  release GitHub du fork (`Endymi0n74/ChainsmokerNeko` via le champ `repository`
  du manifest) et affiche un toast non bloquant « Update available — vX.Y.Z »
  avec un lien de téléchargement vers la release. Vérification silencieuse en
  cas d'échec (hors-ligne, rate-limit, panne réseau) — jamais d'erreur bloquante.
  Comparaison semver (préfixe `v` toléré), timeout 15 s, un seul appel à l'API
  GitHub par lancement.

## [0.1.11] - 2026-08-17

### Ajouté

- **Persistance du cookie `cf_clearance`** : le cookie obtenu en résolvant un
  challenge Cloudflare (flux « open the site » ou import) est désormais
  sauvegardé dans `cloudflare-clearance.json` (dossier userData) et réinjecté au
  démarrage avec une expiration fraîche de 30 jours. Plus besoin de réchauffer
  Cloudflare à chaque lancement ; un cookie devenu invalide (révoqué côté
  serveur ou lié à une autre IP/UA) retombe automatiquement sur le flux
  challenge normal qui re-peuple le snapshot.

### Corrigé

- Le `cf_clearance` posé par le site en **cookie de session** (sans expiration)
  était perdu à la fermeture de l'app → l'échauffement repartait de zéro à
  chaque redémarrage.

## [0.1.10] - 2026-08-17

### Ajouté

- **Import `cf_clearance` multiplateforme** : l'import automatique fonctionne
  désormais sur **Windows, macOS et Linux** (récupération de la clé AES propre à
  la plateforme : DPAPI / Keychain + PBKDF2 / passphrase `peanuts` + keyring),
  sans dépendance externe. Les profils Edge/Chrome (et Chromium sur Linux) sont
  détectés selon l'OS ; les cookies se déchiffrent en v10 AES-256-GCM (Windows)
  ou v10/v11 AES-128-CBC (macOS/Linux). Algorithmes vérifiés contre la source
  Chromium. Le chemin Windows est validé en réel (Edge v20 → Chrome v10, valeur
  injectée exacte, aucune régression).
- **Bouton « Test now »** dans Paramètres → Général → Cloudflare bypass :
  vérifie en un clic si le `cf_clearance` injecté débloque réellement le site
  (fetch via la session partagée + détection du challenge Cloudflare).

### Modifié

- Documentation Cloudflare (`CLOUDFLARE.md` + section README) traduite en
  anglais pour les utilisateurs non francophones.

## [0.1.9] - 2026-08-17

### Corrigé

- **Import `cf_clearance` v10 — préfixe d'intégrité retiré** : Chromium 130+
  préfixe les valeurs de cookies d'un bloc d'intégrité de 32 octets avant le
  chiffrement AES-256-GCM. Le décryptage v10 ne le retirait pas → la valeur
  injectée contenait 32 octets parasites. Le préfixe est désormais retiré après
  décryptage (validé en réel sur Chrome for Testing : import Edge v20 → Chrome
  v10, valeur injectée propre).

## [0.1.8] - 2026-08-17

### Amélioré

- **Import `cf_clearance` multi-navigateur** : si Edge échoue (verrouillé ou
  App-Bound Encryption v20), l'import essaie désormais **Chrome** avant
  d'abandonner. Documentation ajoutée (README + texte d'aide des paramètres) :
  l'auto-lecture v10 ne fonctionne qu'avec **Chrome** ou **Edge sans ABE** ;
  le collage manuel reste le fallback universel.

## [0.1.7] - 2026-08-17

### Corrigé

- **Import `cf_clearance` — crash corrigé** : `expires_utc` (microsecondes
  depuis 1601) dépasse `Number.MAX_SAFE_INTEGER` → node:sqlite levait un
  `RangeError` dès que l'auto-lecture lisait un cookie (Edge/Chrome fermé).
  Le timestamp est désormais casté en TEXT dans la requête et parsé en BigInt.

## [0.1.6] - 2026-08-17

### Ajouté

- **Import du `cf_clearance` depuis le navigateur réel** : nouvelle section
  « Cloudflare bypass » dans Paramètres → Général. Un bouton lit le cookie
  `cf_clearance` d'Edge/Chrome (décryptage DPAPI + AES-256-GCM du store
  SQLite) et l'injecte dans la session partagée de l'app ; un champ de
  **collage manuel** reste disponible quand le navigateur est ouvert (store
  verrouillé) ou protégé par l'App-Bound Encryption (v20, détecté avec un
  message explicite).

## [0.1.5] - 2026-08-17

### Corrigé

- **CrunchyScan — boucle Cloudflare résolue** : trois problèmes chaînés
  bloquaient le listing sur le challenge « Un instant… » :
  - le cookie `cf_clearance` n'est émis que lorsque la fenêtre distante est
    **visible** → la fenêtre s'affiche désormais pour les sites opt-in du
    reload (CrunchyScan), sans flash pour les autres sites (MangaFire,
    MangaDrama, Comix restent cachés) ;
  - `cf_clearance` est **httpOnly** → le poller le lit via le debugger CDP
    (`Network.getCookies`) au lieu de `document.cookie` (toujours vide) ;
  - budget de reload **borné globalement à 3** (au lieu d'une boucle
    non-bornée : ~35 navigations en 40 s) et arrêt de tous les pollers au
    `destroy()`.

## [0.1.4] - 2026-08-17

### Ajouté

- **Connexion MangaDrama dans l'app** : le connecteur vérifie la session via
  l'API REST (`/wp-json/wp/v2/users/me`). Si l'utilisateur n'est pas connecté,
  une **fenêtre visible s'ouvre sur `/my-account/`** pour se connecter depuis
  l'app — les cookies de session persistent dans la session partagée et les
  **chapitres achetés (coins) se déverrouillent** (`is_purchased`,
  `InitMangaEncryptedChapter`). La fenêtre se ferme automatiquement dès que la
  session est authentifiée (poll 5 s, max ~5 min).

### Modifié

- **MangaDrama — prix en coins visible** : les chapitres verrouillés par coins
  affichent désormais leur coût dans la liste (ex. « Chapter 76 - Title
  (3 coins) »), information fournie par l'API (`lock_type`/`lock_value`).

## [0.1.3] - 2026-08-16

### Modifié

- **Débounce adaptatif du filtre mangas** : le délai passe à **120 ms en mode
  sous-chaîne** (défaut) au lieu de 200 ms — la latence E2E saisie → mise à jour de
  la liste mesurée en réel passe de **~313 ms à ~192 ms** (voir `BENCHMARKS.md`
  §1). Le mode **flou** (opt-in) garde 200 ms : la recherche Fuse.js (~205 ms)
  tourne en Web Worker et un délai plus long évite d'empiler les recherches.

## [0.1.2] - 2026-08-16

### Modifié

- **Mise à jour différentielle des listes de mangas (`MediaLists`)** : lors d'un
  refresh, seuls les lots (`#0`, `#1`, …) dont le contenu a réellement changé sont
  réécrits (comparaison `id` + `title`), au lieu de réécrire la totalité des lots à
  chaque mise à jour. Chaque lot est comparé **un par un à la volée** (lecture puis
  éventuelle écriture), sans jamais matérialiser toute l'ancienne liste en mémoire.
- **Mesure du gain (live, IndexedDB réel — voir `BENCHMARKS.md` §2)** : sur une
  liste de 70 000 entrées, les écritures par refresh passent de **70** (réécriture
  complète des shards, v0.1.1) / 1 blob de 70 k (mono-clé, v0.1.0) à **0** sur une
  liste inchangée et **1–2** avec quelques changements. La durée mur-à-mur reste
  ~30 ms sur NVMe (le fetch réseau des 70 k titres, ~77 s, domine le refresh) — le
  gain est structurel : pas de réécriture/clone systématique, écritures en
  O(modifications) au lieu de O(liste), et l'ancienne liste n'est plus matérialisée
  en mémoire. Tests de régression couvrant aussi le rétrécissement (purge des shards
  périmés sans réécrire les shards inchangés).

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
