# Changelog

Toutes les modifications notables de **ChainsmokerNeko** sont documentées dans ce fichier.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [3.0.10] - 2026-09-29

### Modifié

- **Menu « À propos » du panneau latéral** : une seule entrée commune à la version et au crédit — « Using version 3.0.10 — Vibe coding with Codebuff (Kumo) 🤖 » — remplace les deux lignes précédentes, et ouvre désormais `https://github.com/Endymi0n74/ChainsmokerNeko` au lieu du lien de remplacement `https://todo.com`.

### Fix

- **Mise à jour automatique limitée au fork** : la chaîne de mise à jour (interrogation de la dernière release comme téléchargement de l'archive) suivait le champ `repository` du manifeste ; elle est désormais bornée par la constante `UPDATE_REPOSITORY = Endymi0n74/ChainsmokerNeko`, la lecture du manifeste étant supprimée. Aucune valeur de configuration ne peut donc plus rediriger une mise à jour vers le projet d'origine (`manga-download/*`), et une application installée récupère bien les releases publiées sur ce dépôt — trois tests verrouillent l'URL d'appel de l'API et l'URL d'archive.

## [3.0.9] - 2026-09-29

### Ajouté

- **Composition des overlays traduits (KomaScans)** : les bulles des chapitres français et espagnols sont réellement traduites en anglais à l'affichage comme au téléchargement. Le décorateur `@Common.ImageAjax` est supprimé au profit d'un `FetchImage` surchargé (`Common.FetchImageAjax.call(this, page, priority, signal, true)` + composition) : la requête `translationOverlay` portée par `Page.Parameters` empile un calque de texte sur l'image source (canvas `fillText`, `convertToBlob({ type: 'image/webp', quality: 0.9 })`), tout échec — police, traduction ou rendu — retombant silencieusement sur l'image de base. Les polices du site (Comic Relief, Koma Patrick Hand SC, Oswald, Barlow Condensed) sont lues dans les propriétés CSS de la page (URL entre guillemets simples, regex `[\w-]+`), mises en cache par un `Map<string, Promise<void>>` commun pour que des compositions concurrentes attendent le même chargement, et verrouillées par `if (!keys.size)` contre la course qui vidait l'index — trois bugs trouvés et corrigés par le harnais visuel. Validé sur GEED ch.1 FR : 7 régions composées (722 316 octets en webp, ~700 ms), rendu identique quelle que soit la concurrence.
- **Drapeaux de langue dans la liste** : chaque entrée affiche le drapeau Unicode de sa locale (🇬🇧🇫🇷🇪🇸🇮🇩🇩🇪🇵🇹🇸🇦🇹🇷…), visible dès le démarrage sans rafraîchissement — y compris pour les Manga recréés depuis le cache. Le helper partagé `lib/flags.ts` (`ExtractUnicodeFlagFromTags`) reconnaît les séquences `^[\p{RI}\p{Extended_Pictographic}\uFE0F]+` et évite l'artefact « 🌐 M » du `slice(0, 4)`. Bug racine corrigé de façon additive : `MangaPlugin.Prepare()` recrée les Manga du cache local via `CreateEntry(id, title)` sans tags, d'où le hook `MangaScraper.GetMangaTags(identifier)` (défaut `[]`, sans impact sur les autres connecteurs) propagé par `MangaPlugin.CreateEntry` ; KomaScans surcharge `GetMangaTags` avec `[MapLanguageTag(identifier)]`. Format de cache inchangé.

### Modifié

- **Identité « ChainsmokerNeko » dans toute l'application** : barre de titre, en-tête, page d'accueil, guide de démarrage, fenêtre de réglages, fil d'ariane de la zone de contenu, splash Electron et écran de démarrage affichent désormais ChainsmokerNeko, de même que l'export de favoris (`ChainsmokerNeko (date).bookmarks`), la métadonnée `generator` des EPUB et le titre de la build NW.js. Les 13 locales Crowdin restent intactes : le remplacement du nom est appliqué une fois au chargement des ressources dans `Localization.ts` (`ApplyBrandName`), translittération arabe « هاكونيكو » comprise, tandis que l'extension externe « HakuNeko Assistant » conserve son nom dans toutes les langues (garde sur les formes `assistant`/`asistente`/`助理`/`مساعد`). Crédits du projet d'origine ajoutés sur la page d'accueil (HaruNeko puis HakuNeko, avec liens) et conservés dans `og:description` ; `productName` passe à `ChainsmokerNeko` → exécutable `ChainsmokerNeko.exe` et zip local `chainsmokerneko-electron-v{version}-win32-x64.zip`, la config utilisateur `%APPDATA%\ChainsmokerNeko` étant inchangée. Les identifiants internes (`window.HakuNeko`, clé de thème `hakuneko`, base IndexedDB `HakuNeko`, chemin RPC `/hakuneko`) sont conservés pour ne rien casser.
- **Validation** : `npm run check` vert (versions + ts + eslint + svelte-check + vue-tsc + règles de codage) et 2285 tests verts sur 37 fichiers.

### Fix

- **Auto-mise à jour en 404** : `AppUpdate` construisait `hakuneko-{plateforme}.zip` alors que la release publie `ChainsmokerNeko-v{version}-{plateforme}.zip` — le téléchargement de mise à jour échouait donc systématiquement depuis la bannière. Le nom d'asset, les User-Agent et le répertoire temporaire suivent désormais le nom réel du produit, la config `repository` visant déjà `Endymi0n74/ChainsmokerNeko`.

## [3.0.8] - 2026-09-28

### Ajouté

- **Nouveau connecteur KomaScans** (`komascans.com`) : le catalogue est reconstruit à partir des sitemaps — `series-0.xml` pour l'anglais (8 176 séries) et `series-{locale}-0.xml` par locale (~156 entrées chacune), soit ~3 s, les titres étant reconstitués depuis les slugs (`Log-Leveling-Lawyer` → `Log Leveling Lawyer`, ~90 % de fidélité), triés alphabétiquement par le connecteur (l'UI ne trie pas) et marqués du tag de langue de chaque locale (le site est déjà déclaré multilingue : `Tags.Language.Multilingual`). Les chapitres suivent un mode **hybride rapide puis complétion** : la page série ne hydrate que 50 chapitres au maximum (~1,5 s suffisent pour Nano Machine), et quand `firstChapter` est absent de cette liste partielle (séries tronquées : 331 chapitres réels pour 50 hydratés) la complétion passe par les sitemaps `chapters-N.xml` (anglais) / `chapters-{locale}-N.xml` (autres locales), par lots de 4 requêtes pour borner la mémoire — ~45 s pour Nano Machine complet. Chapitres ordonnés **décroissant** (convention du moteur), sans `publishedAt` (le `lastmod` des sitemaps est une date d'import, pas une date de publication). Pages extraites du payload RSC de l'épisode et ordonnées par `position` (le HTML ne contient que les lecteurs vidéo), images servies via `ImageAjax` avec détection du type réel ; `Initialize()` sans fenêtre navigateur (l'API est publique) et `ValidateMangaURL` acceptant aussi les URL `/read/...` (normalisées vers `/series/...`). **Intitulés de chapitre localisés** : le titre stocké par le site est anglais pour *toutes* les locales (la traduction n'existe que dans son HTML rendu — « Chapitre 1 VF », « Capítulo 1 en español »), d'où la fonction pure `LocalizeChapterWord` qui remplace le mot `Chapter` par celui que le site emploie lui-même pour la locale : `Chapitre` (fr) et `Capítulo` (es) **uniquement**, les sept autres locales étant affichées en `Chapter` sur le site — le connecteur ne diverge donc jamais de la source, et les titres sans mot de chapitre (`Start Reading`, `107: Special Forces <4>`) ou déjà localisés sont laissés intacts. **Limite connue — contenu non composé hors anglais** : la traduction n'existe que rendue **par le site** (`<img src={page.url}>` + overlay SVG dessiné dans le navigateur à partir de `translationOverlay.cleanLayerUrl`, couche de patch, et `translationOverlay.translation.regions[]`, texte positionné) ; aucun composite serveur n'est exposé (API limitées à `audience`/`views`/`progress`/`comments`, `renderKind: null`, aucun export), et `pages[].url` désigne **le même fichier** que la version anglaise (`sameUrl: true`, 622 704 o en webp pour le chapitre 1 de *The Greatest Estate Developer*) : HakuNeko télécharge donc l'image de base, **le contenu des chapitres fr/es/de/id/pt/ar/tr reste anglais** — seuls les intitulés sont localisés. Portée : 8 181 séries en contre 19 fr et 22 par autre locale (1 à 4 chapitres chacune). +31 tests unitaires sur les fonctions pures exportées (`SeriesTitleFromSlug`, `MapChapterNumber`, `MapChapterTitle`, `LocalizeChapterWord`, `ResolveSeriesIdentifier`, `HydratedChapter`) et fixture e2e ; `npm run check` sans erreur ni avertissement, 2 232 tests unitaires verts, e2e 5/5.

## [3.0.7] - 2026-09-27

### Fix

- **JapScan — le téléchargement s'annulait lui-même pendant la résolution des pages** (« le chapitre s'affiche dans le viewer, je résous le puzzle, puis le téléchargement timeout ») : deux garde-fous issus du **même** commit se contredisaient. `CHAPTER_UPDATE_TIMEOUT_MS` (300 s) autorisait `Media.Update()` à être long, mais le stall guard du `DownloadManager` (20 s sans progress) annulait la tâche **avant** — or pendant `Update()` il n'y a *aucun* progress, et c'est normal : JapScan ouvre une fenêtre de lecteur visible, attend la résolution du puzzle, puis lazy-charge les pages. La tâche était donc abortée ~20 s après le clic alors qu'`Update()` continuait en zombie jusqu'à ses 300 s, d'où `Chapter update for Volume 22 timed out after 300000ms` alors que l'extraction finissait par réussir (204/204). Les pages lancées ensuite recevaient un signal déjà annulé et échouaient **toutes** (204 erreurs en 17 ms), `errors` étant non vide `Media.Store()` n'était jamais appelé : rien n'était écrit sur le disque, il fallait recliquer — la seconde fois le puzzle étant déjà résolu, `Update()` passe sous les 20 s et tout fonctionne. La décision est désormais la fonction pure exportée `StallTimeoutFor(status, progress)` : tant qu'aucune page n'a été récupérée (`Downloading` à progress nul) la borne est celle de la résolution, dès qu'une page est passée ou que la tâche stocke son résultat les 20 s reviennent — l'intention d'origine (« ne jamais bloquer la file ») est préservée, seule sa contradiction supprimée.
- **JapScan — fin de la boucle Cloudflare (« puzzle à résoudre trop souvent » + fenêtre qui tourne en boucle quand on valide)** : deux causes complémentaires, aucune ne suffisant seule.
  - **Détection du puzzle par existence au lieu de visibilité** : `JapScan.ts` testait `!!document.querySelector('#jc-overlay')` alors que le nœud **persiste dans le DOM après résolution** (masqué en CSS — déjà documenté en 3.0.3 pour la collecte). `CheckAntiScrapingDetection` ne retournait donc jamais `None`, `cleared` ne devenait jamais vrai dans `PollForChallengeResolution` (qui exige `antiScraping === None`), chaque fenêtre finissait en timeout de 150 s et le connecteur en rouvrait une nouvelle. La détection est désormais tranchée sur la **visibilité** de l'overlay (display/visibility/opacity/offsetHeight), identiquement à `isBlocked()` de `JapScan.Extract.ts` ; l'annonce pré-rendu via `window.__captcha.needed` reste détectée puisque le n'existe pas encore à ce stade.
  - **`cf_clearance` pris pour « frais » alors qu'il était déjà là** : `PollForChallengeResolution` initialisait `lastClearance` à `''`, si bien que la **première** lecture CDP (~4 s après l'ouverture) faisait passer l'ancien cookie **persisté** pour une clearance fraîche → `cleared = true` → `runScript()` s'exécutait **pendant que l'utilisateur validait**, la fenêtre se détruisait, l'extraction tournait sur une page verrouillée (peu de pages) et déclenchait la fenêtre DRM suivante → un nouveau challenge à valider, en boucle. Même cause racine que le fix CrunchyScan du 27 sept. La baseline est désormais celle lue au `DOMReady` (même source que `ReloadStalledCloudFlareChallenge`) et seuls un changement réel ou une clearance émise après cette baseline terminent le poller.
- **JapScan — fenêtre non affichée en mode Automatic** : la branche Automatic de `FetchWindowPreloadScript` n'appelait plus `win.Show()` que pour les sites opt-in « stalled reload », alors que `1bb8d2fc1` l'avait ajouté pour tout site fork-handled et que `LESSONS.md` le documente comme requis (« JapScan et CrunchyScan ont besoin de cette fenêtre »). Le refactor `1dfea5555` l'avait perdu au passage → challenge Cloudflare tourné en arrière-plan sans fenêtre → jamais résolu → timeout → re-ouverture. Tous les sites fork-handled affichent de nouveau la fenêtre avant de lancer le poller.
- **JapScan — vignettes parasites sur les chapitres** (jusqu'à 4 pages en trop : cases vides, pub, « Resource is not an image ») : le lecteur monte ses propres images de chrome (`/images/top-banner-728x90.png`, `/images/donate.png`, créas pub sous `/imgs/japys/`) sur l'hôte du site, et elles passent le test CDN générique (hôte JapScan + extension d'image) → le chemin « DOM » les remontait comme des pages. Le filtre anti-chrome n'existait que dans la branche `adoptProbe` (déclenchée seulement si le probe couvre DOM+5 et l'annonce du site) : les trois autres branches (`drm`, DOM simple) renvoyaient la liste brute — d'où le reproche « toujours 4 vignettes » alors que `dom: 17` annonçait `total: 13`. Le filtre est désormais une fonction pure exportée `FilterSiteChrome()` appliquée **une fois** à `domLinks` avant toutes les branches : marqueurs `_banner_`/`/e44j82.jpg`, hôte du document / `www.` / apex hors arbre `/manga/`, répertoires d'assets statiques (`/images/`, `/imgs/`, `/ad/`, …) et noms de fichiers de chrome sur tout autre hôte ; l'entrée `/manga/` sur l'hôte du document est conservée pour ne jamais vider le résultat si le site passe en proxy same-origin. Le log et la diag annoncent désormais `chrome: N` + `chromeDropped` pour voir exactement ce qui a été retiré.

- **JapScan — la 4ᵉ vignette parasite (URL fetchée mais jamais montée)** : relevé de sonde sur un chapitre réel — `dom: 17` → `chrome: 3` retirés → **14** livrées contre `total: 13`, avec un recouvrement probe/DOM de 0,929 : une seule URL DOM manquait à la liste `imgUrls` du site, et cette liste contenait exactement `total` entrées (en accord avec le sélecteur du lecteur). C'est une URL que le script du site **fetch sans jamais l'affecter à un `<img>`** (c'est la même qui provoque l'erreur CORS du log) : jamais affichée par le lecteur, donc candidate — et aucune règle hôte/chemin ne peut la distinguer d'une vraie page. `adoptProbe` n'était déclenché que si le probe était **au moins 5 liens plus long** que le DOM ; la condition accepte désormais aussi le cas où le probe **couvre le total annoncé**, ce qui donne exactement `total` pages dans l'ordre propre du site. Les 4 vignettes d'origine sont donc toutes traitées : 3 par `FilterSiteChrome`, la 4ᵉ par l'adoption du probe.
- **JapScan — les gros chapitres (200+ pages) exigeaient 2-3 tentatives jusqu'au timeout** : toutes les conditions d'arrêt (drain du lazy-loader, marche du sélecteur de pages, boucle de scroll) testaient `seen.size`, qui **contient aussi le chrome du site** (3 à 4 entrées qui passent le test CDN). L'arrêt tombait donc N URLs trop tôt, `finalize()` retirait ensuite ce chrome du résultat, et `links.length` revenait inférieur à `total` → `IsIncompleteReaderResult` déclenchait la fenêtre DRM de secours (ou l'échec) alors que les pages existaient toutes. Les trois conditions passent à `contentSize()`, qui applique **exactement** la même filtration que `finalize()` : le compte testé et la liste livrée sont désormais toujours d'accord. Sondes ajoutées à la demande : `probeMiss` (URLs DOM absentes de la liste `imgUrls` du probe, c.-à-d. les candidates qui ne sont pas des pages) et `budget` — phase active, `DEADLINE` si le timer dur de 240 s a gagné, pourquoi le drain s'est arrêté (`total`/`stall`/`budget`/`drm`), nombre d'URLs trouvées par la marche, budget restant à son démarrage et raison de son arrêt (`timeout`/`complete`/`blocked`/`drm`/`no-urls`) — avec une ligne de log dédiée `[JapScan] … budget:`.
- **JapScan — garde-fous d'extraction** : `filterSiteChrome` est entourée d'un `try/catch` (une erreur de filtre ne doit jamais coûter tout le chapitre ; repli sur la liste brute) et `finalize()` annule désormais le timer dur — sans cela un finalize normal était suivi 240 s plus tard par le timer, qui ré-exécutait `finalize()` et écrasait la phase rapportée.
- **JapScan — le drain s'arrêtait pendant que le site construisait encore ses URLs** : les conditions d'attente (drain du lazy-loader et boucle de scroll) ne mesuraient que le DOM, qui plafonne vers ~110 images sur un volume alors que le lecteur continue d'affecter les URLs des pages annoncées. Sur un chapitre ralenti par Cloudflare, le drain est sorti sur `stall` à 24,1 s **au moment exact où le site achevait sa construction** (dernière affectation à 33,4 s après l'ouverture de la fenêtre, `fetch: 404 = 2` côté site) → `finalize()` a coupé l'extraction en plein travail. Les deux boucles utilisent désormais `progressSize()`, qui renvoie `max(contentSize(), probeSize())` tant que le probe reste en dessous du total annoncé : la croissance de la construction empêche le stall, et dès que le probe couvre le total il cesse de piloter l'attente — le chemin normal garde donc exactement son ancien rythme (sur les tentatives réussies, le probe est déjà complet avant le drain). Nouvelle sonde `probe@drain` (taille de la construction au moment où le drain a cédé) dans la ligne `[JapScan] … budget:`.
- **JapScan — un probe partiel était rejeté au profit du seul DOM** : `adoptProbe` exigeait que le probe **couvre le total annoncé**, si bien qu'une construction interrompue (167 URLs sur 204, cf. le fix précédent) était jetée en entier et que le résultat retombait sur les 106 liens DOM — la moitié du chapitre, les 61 autres URLs existant pourtant. La règle est désormais une fonction pure exportée `ProbeAdoption(probeLen, domLen, total, anchor, overlap)` avec une troisième voie : un probe **partiel** est accepté s'il domine encore le DOM (+5 liens), couvre au moins 70 % du total annoncé et recouvre le DOM à 90 % — au-delà de ces seuils les URLs supplémentaires sont du contenu de page, pas du trafic sans rapport. Le résultat reste incomplet (la fenêtre DRM de secours reste donc tentée), mais l'hôte annonce la liste longue au lieu de la liste courte. La diag marque `adopt: "partial"` pour distinguer ce cas d'une adoption complète, et `budget.probeAtDrain` permet de voir si le déficit venait du site ou de notre propre arrêt.

### Modifié

- **Journalisation du diagnostic** : `DownloadTask` n'écrivait **jamais** ses erreurs dans le log renderer, si bien qu'une tâche échouée était indistinguable d'une tâche lente en lecture de sortie — d'où l'impossibilité de trancher entre timeout de résolution, timeout de page et annulation. Une ligne `[DownloadTask] <titre>: N error(s) -> …` est désormais émise au `finally`, et `PollForChallengeResolution` logue **à chaque tour** `[KUMO] poll#N cf=… widget=… site=… clr=… cleared=…` pour dire laquelle de ses deux conditions bloque. Aucun changement de comportement.
- **Message d'annulation lisible** : `DeferredTask` rejetait avec `new DOMException(null, 'AbortError')` — WebIDL convertit `null` en la chaîne `"null"`, si bien que chaque page annulée remontait `null` comme message d'erreur sans jamais évoquer une annulation. Le message est `Aborted` (déjà employé par CrunchyScan).
- Décision de baseline `cf_clearance` extraite en fonctions pures exportées (`NormalizeClearance`, `NextClearanceState`) et script de détection JapScan exporté (`JAPSCAN_CHALLENGE_DETECTION_SCRIPT`) pour être couverts par les tests unitaires ; filtrage anti-chrome JapScan exporté (`FilterSiteChrome`) ; décision d'adoption du probe exportée (`ProbeAdoption`) ; script d'injection du lecteur exporté (`BuildReaderScript`) : son corps vit dans un template literal que `tsc` **ne** type-check **pas**, donc un backtick de trop dans un commentaire le ferme prématurément et le plantage n'apparaît qu'à l'injection — invisible de `tsc` comme de tous les autres tests. Décision du stall guard exportée (`StallTimeoutFor`). +4 tests de garde (le script rendu doit être analysable en JavaScript ; les conditions d'arrêt ne doivent plus lire `seen.size` ; l'attente doit suivre la construction du site ; le script doit passer par la règle d'adoption qui est elle-même testée) +4 tests de la borne de résolution et du message d'annulation ; +35 tests (2199 au total).

## [3.0.6] - 2026-09-27

### Fix

- **CrunchyScan — fin de la boucle Cloudflare (fenêtre qui clignote)** : le reload du challenge comparait le `cf_clearance` à une baseline vide, si bien que l'ancien cookie **persisté** déclenchait un `window.location.reload()` ~5 s après l'ouverture de la fenêtre → le Turnstile repartait de zéro (flash) et la validation que l'utilisateur était en train d'effectuer était systématiquement annulée → timeout. La baseline est désormais re-lue à chaque `DOMReady` (lecture CDP protégée par un timeout de 5 s) et le reload n'a lieu que si une **nouvelle** clearance a été émise par le document en cours — le cas réel « challenge résolu mais jamais redirigé ». Budget inchangé (1 navigation pour CrunchyScan, 3 pour les autres sites opt-in).
- **CrunchyScan — fin des échecs en série (timeout)** : chaque chapitre ouvrait sa propre fenêtre DRM (150 s chacune) quand la session n'est pas débloquée → autant de popups Cloudflare que de chapitres téléchargés. Après un échec, une **vérification sans fenêtre** (statut 403/503, en-tête `CF-Mitigated`, titre interstitiel) précède toute nouvelle ouverture : session toujours challengée → échec immédiat avec le message Cloudflare localisé ; session réchauffée (lien URL du plugin ou import `cf_clearance`) → la porte se rouvre d'elle-même. L'échec de `Initialize()` n'est plus conservé en cache pour toute la session, ce qui bloquait le connecteur jusqu'au redémarrage.

## [3.0.5] - 2026-09-23

### Ajouté

- **Sync amont 91 commits** `e41bbc95f..d22ac64b2` (`manga-download/haruneko` #1823-#1842) : tri `DESC` chapitres (`b986a4c11`), `forward electron stdout` (`480992720`), bumps `web/package.json`/`app/electron` (pdfkit, svelte, fluentui), domaines, nouveaux sites `MistScans/Inkapk/VioletScans/MangaToon/WebComicsApp`, renames `Atikrost→HentaiVN`/`ManhuaNext→Inkapk`/`MeianPlus→Komiko`.
- **Nettoyage code mort** `knip 6.37` + `tsc --noUnusedLocals` : `VirtualList.svelte`/`Console.svelte`/`Network.svelte`/`mock.ts`, `RandomUTF8`, `ConvertImage`, `SetInterval/ClearInterval` + `BackgroundTimersWorker` — `+5 -376` lignes, `check`/`build`/`vitest 2153` verts.

### Modifié

- **JapScan préservé** : 0 commit JapScan dans le range amont — couche `JapScan.DRM.preload.ts`/`JapScan.Extract.ts` intacte (probe preload, reader-first, walk selector) — politique `SYNC.md` fork-first.
- **Fusion `chainsmoker` fork-first** : `_index.ts` régénéré après renames amont + suppressions fork (`ArthurScan` etc hors fork), `WordPressMadara_e2e` filtré, `package-lock.json` régénéré (`--engine-strict=false --package-lock-only`).

### Fix

- **Conflits `_index`/`WordPressMadara_e2e`** après renames amont : filtrage par existence fichier pour éviter `TS2307` sur sites supprimés côté fork.

## [3.0.4] - 2026-09-05

### Ajouté

- **Restructuration du fork en deux branches** : `master` redevient un miroir pristine d'`manga-download/haruneko` (synchronisation = `git pull` fast-forward, sans jamais de conflit) ; la ligne produit v3 (v3.0.x, plateforme Cloudflare/Electron, sites conservés) vit désormais sur `chainsmoker`. `SYNC.md` documente le workflow et la procédure de fusion fork-first.
- **Intégration de l'amont** (depuis v3.0.3) via deux fusions fork-first (`7d94f3a14`, `41431fcc8`) : refonte UI classique (migration Svelte 5, préchargement de l'item suivant dans le viewer, fondu accéléré des quickactions…), nouveaux connecteurs (Batcave, LeerManhwas, Onisaga, WhyToon, AeroToon, MerlinShoujo, ManhwaNex, RinkoComics, RawFree, template NovelDex…), dizaines de recodes/fixes de sites, suppression des sites morts, mise à jour des dépendances.
- **Sites conservés malgré leur suppression chez l'amont** : MangaFury, ManhwaHub, JManga — politique fork-first : on garde et on maintient ce que l'amont abandonne.

### Fix

- **svelte-check à 0 erreur / 0 warning** : port du réglage `ViewerPreloadNextItem` (clé enum + registre + bloc de réglage) manquant dans le store `Settings` — utilisé par `ImageViewer.svelte`/`viewer/Settings.svelte` ; `MediaSelect.svelte` : `scrollTop` rendu réactif (`$state`) et `on:scroll` déprécié remplacé par `onscroll`.
- **13 locales Crowdin réalignées sur l'amont** (`check:rules` interdit de les modifier à la main) ; les clés propres au fork restent dans `en_US.ts` — repli sur le nom de clé en attendant la traduction Crowdin.

### Modifié

- **Validation complète** : check:ts/eslint/svelte-check/vue-tsc/rules/versions verts sur les 3 workspaces, 2155+ tests unitaires web passés, builds web + electron OK et app démarrée en test de boot.
- **Sécurité** : aucun historique perdu — l'ancien tip fork `70b2ccb89`/`7d94f3a14` reste couvert par les tags `3.0.0`–`3.0.3`, `archive/*` et la branche `chainsmoker`.

> *Note (2026-09-05) : après la sortie de la v3.0.4, les tags `3.0.0`–`3.0.3` et `archive/*` ont été retirés du fork ; l'historique reste joignable via la branche `chainsmoker` et les SHA préservés dans `SYNC.md`.*

## [3.0.3] - 2026-09-04

### Ajouté

- **JapScan - extraction reader-first des volumes** (`JapScan.DRM.preload.ts`, `JapScan.Extract.ts`) :
  une seule fenêtre visible reader avec le bootstrap DRM en preload ; le script protégé du site
  décode la liste des pages via CustomEvent une fois le puzzle résolu — suppression de la 2e fenêtre
  DRM parallèle qui bloquait (budget 30s toujours dépassé par `captcha_d.js` async).
- **JapScan - page-selector walk** : quand le lazy-load du reader plafonne (~110 images) alors que
  le sélecteur de pages annonce le vrai total, les pages restantes sont récupérées via les URLs du
  sélecteur (3 workers, 15s/timeout, 100s budget).
- **JapScan - diagnostics source-breakdown** : `ReaderExtraction` expose `drm`/`dom`/`selector`/
  `probe` + durées de phase (`puzzle`/`drain`/`walk`/`scroll`) et `reader diag` JSON (scroll real,
  inventaire img, resource-timing, sélecteur, overlay) — log `[JapScan] /path/ -> N pages (...)`.
- **JapScan - récupération complète des volumes via probe preload** (`DRM_URL_PROBE_PRELOAD`) :
  un probe installé AVANT tout script page capture les URLs CDN construites par le site à l'init
  (204/204 pages sur Dreamland vol-24, 156/156 sur Saint Seiya Dark Wing vol-7). Le site construit
  toutes les URLs en un seul burst déterministe, mais n'en monte que ~110 (virtualisation reader) ;
  le probe récupère les ~90-94 manquantes.

### Fix

- **JapScan - timeout « Chapter update … timed out after 120000ms »** : `CHAPTER_UPDATE_TIMEOUT_MS`
  porté de 120s à 300s (budget réel du pipeline puzzle + drain + walk) dans `DownloadTask.ts` et
  `CollectionDownloadTask.ts` ; le stall par page reste borné à 15s.
- **JapScan - overlay résiduel bloquant la collecte** : la collecte ne démarre plus tant que le
  puzzle `#jc-overlay` est affiché et ne reste plus bloquée si l'overlay persiste dans le DOM après
  résolution.
- **JapScan - page parasite N+1** : les runs adoptés par le probe ne renvoient plus `total+1` pages
  (une image chrome du site ou un remount token-refreshé était apposé à la liste) — filtres `www.*`
  et marqueurs `_banner_`/`e44j82.jpg` sur l'append.
- **JapScan - garde d'adoption du probe robuste** : ancrage sur les 5 premières URLs DOM, match sans
  query (variantes token/redirect), détection forward/reversed, overlap ≥ 50%, deadline dure 240s
  (`EXTRACT_DEADLINE`) pour ne plus jamais dépasser le budget hôte de 300s.

## [3.0.2] - 2026-08-31

### Fix

- **JapScan - puzzle non proposé au changement de volume** : le puzzle anti-bot
  `#jc-overlay` est rendu de façon asynchrone (appel AJAX quelques secondes après
  DOMReady, typiquement sur la 2e requête du lecteur consécutive — télécharger un
  volume puis en demander un autre). La détection unique au DOMReady renvoyait
  `None` trop tôt : l'extraction démarrait sur une page sur le point d'être
  verrouillée. Ajout d'une période de grâce dans `FetchWindowPreloadScript`
  (sites fork-handled + fenêtre visible) : re-polling de la détection site toutes
  les 2 s pendant 16 s, upgrade vers le traitement Interactive/Automatic dès que
  le puzzle apparaît. Lint : parenthèses redondantes retirées dans la condition
  `cleared` (précédence `&&`/`||` inchangée).
- **JapScan - pages manquantes + 404 CDN** : la collecte s'arrêtait sur `atBottom`
  OU stabilité sans attendre la fin du lazy-load (images en attente perdues), et
  tournait sur une page verrouillée par le puzzle. Désormais : pause de la collecte
  tant que le puzzle est affiché (l'utilisateur le résout dans la fenêtre visible)
  avec sortie anticipée si de vraies images (`decodedBodySize > 10 ko`) sont
  re-décodées (l'overlay peut persister dans le DOM après résolution, comme le
  Turnstile) ; fin de collecte = bas de page ATTEINT et stable (8 rounds) ;
  collecte élargie aux holders génériques `data-src`.

## [3.0.1] - 2026-08-28

### Fix

- **Cloudflare PollForChallengeResolution** : revert du garde hadWidget qui bloquait
  les challenges manages (CrunchyScan). Retour au widgetGone original qui fonctionne
  pour tous les sites. Delai initial du poll augmente de 2s a 4s pour laisser le
  Turnstile se charger.
- **JapScan - pages manquantes** : les gros chapitres (150+ images) perdaient des pages
  car le scroll sarretait trop tot. Extraction DRM + scroll lancees en parallele,
  resultats fusionnes et deduplicates. Limite scroll augmente de 80 a 500 steps,
  detection de stabilite ajoutee (20 steps sans nouvelles images), timeout porte a 300s.
## [3.0.0] - 2026-08-26

> **Majeure.** Correction de non-régression, nouveaux connecteurs, fix Cloudflare avancé,
> virtual scroll bookmarks et cleanup complet du repo.

### Ajouté

- **Connecteur MangaNova** : listing, chapitres, pages (93 pages testées), logo WebP.
- **17 connecteurs câblés** dans `_index.ts` : Alphapolis, JapScan, MangaLi, MangaLink,
  MangaTR, MangaTilkisi, MangaTube, RainDropFansub, TruyenQQ — opt-in fork challenge
  handling pour la détection Cloudflare personnalisée.
- **Test de régression e2e MangaNova** : 7 tests (catalogue, chapitres, pages, image).
- **Test de régression e2e ScanManga** : 5 tests (chapter, pages, image).
- **Test de régression e2e Cloudflare** : flux complet manga → chapitres → pages → image
  pour MangaFire, Comix, MangaDrama.
- **Fix VirtualList bookmarks** : le composant VirtualList ne s'active plus quand le
  plugin Bookmarks est sélectionné — les bookmarks s'affichent tous sans scroll forcé.

### Fix

- **ScanManga — sentinel cookies** : le serveur ne sert les chapitres qu'aux requêtes
  sans cookies. Nouveau sentinel `Cookie: __hkn_no_session_cookies__` consommé dans
  `FetchProvider` Electron.
- **ScanManga — API lecteur** : nouveau endpoint `bqj.scan-manga.com/lel/<idc>.json`
  avec token `yf`, fingerprint WebGL/connection, décodage gzip. Pagescript réécrit.
- **ScanManga — injection cookies** : les cookies de session ne sont plus injectés dans
  les requêtes des fenêtres distantes (elles gardent leurs cookies natifs).
- **CrunchyScan — cache DRM** : les résultats du DRM sont cachés par URL de chapitre,
  empêchant les fenêtres multiples.
- **Classification Cloudflare** : les détections de site (AddAntiScrapingDetection) sont
  testées en priorité avant l'heuristique DOM générique (ChallengeReload).
- **CDP timeout** : `protocolTimeout` augmenté à 300s sur le `connect()` puppeteer de
  la fixture e2e, absorber les lenteurs réseau sur les gros listings (mangafire).

### Modifié

- **Injection cookies restreinte** : dans `FetchProvider`, l'injection des cookies de
  session fusionnés n'est appliquée qu'aux requêtes du renderer de l'app, pas aux
  fenêtres distantes.
- **Opt-in fork challenge** : 8 sites à détection custom (Alphapolis, JapScan, etc.)
  utilisent le fork challenge handling.

## [2.2.0] - 2026-08-22

### Retiré

- **VirtualList** : retiré des listes bookmarks et chapitres. Le composant
  n'était pas câblé dans l'upstream et causait un affichage tronqué
  (scrollTop=0 sans overflow-y:auto). Revenu au {#each} classique.

## [2.1.2] - 2026-08-22

### Fixed

- **MangaDrama FetchPages** : remplacer regex literals par string checks pour corriger "Script failed to execute".
- **FetchProviderCommon** : logs diagnostiques [KUMO] pour erreurs runScript et redirect.

## [2.1.1] - 2026-08-20

### Ajouté

- **Auto-update** : un bouton "Install v…" dans la notification de mise à jour
  télécharge le zip de la plateforme depuis GitHub Releases, remplace l'app
  et la redémarre automatiquement. Fallback vers le lien GitHub en NW.js.
- **Scroll persistence amélioré** : la position de scroll exacte (pixel)
  est sauvegardée par chapitre en plus de l'index d'image, pour une
  restauration précise sur les webtoons/long strips.
- **Connecteurs upstream** : DivaScans, RawFree, Voratoon, WhyToon câblés
  (cherry-picked depuis upstream). +8 sites disponibles.
- **Package Linux .deb** : ajouté au workflow de release pour les distros
  Debian/Ubuntu (dpkg-deb).

## [2.1.0] - 2026-08-20

### Amélioré

- **MangaFire — chargement de la liste** : la limite par page de l'API est
  passée de 100 à 500 titres, réduisant le nombre de requêtes de ~702 à
  ~141. Le temps de chargement passe d'environ 77 s à ~15 s (estimé).
  Dégradation gracieuse si le serveur impose une limite inférieure.
- **PR upstream relancées** : rebasées sur upstream/master (18 commits
  en retard) — PR #1797 (Cloudflare fixes) et #1798 (perf optimizations)
  prêtes pour review.

## [2.0.7] - 2026-08-20

### Corrigé

- **JapScan — fichier `.bin` résiduel** : le téléchargement produisait un
  fichier `01.bin` vide (0 octet) à côté des vraies images. Cause : la
  première URL collectée par le reader renvoyait un blob vide → fingerprint
  MIME échouait → extension `.bin`. Fix en deux couches : (1) filtre
  d'extension image (`.jpg/.png/.webp/...`) sur les URLs du CDN JapScan,
  (2) `DownloadTask` ignore les blobs vides (`size === 0`) et ré-indexe
  les fichiers restants pour une numérotation contiguë (01, 02, …).

### Amélioré

- **Recherche floue Fuse.js** : options resserrées (`threshold: 0.4`,
  `minMatchCharLength: 2`, `fieldNormWeight: 0.3`) — beaucoup moins de
  faux positifs en mode flou sur les 70k titres MangaFire.
- **Relecture persistée** : la position de lecture (image courante) est
  sauvegardée par chapitre dans `localStorage` et restaurée à
  l'ouverture — reprendre là où on s'était arrêté.
- **Doc Cloudflare** : guide pas-à-pas pour JapScan (puzzle anti-bot,
  warm-up initial) et CrunchyScan (même principe) ajoutés dans
  `CLOUDFLARE.md` §§7-8.
- **Build simplifié** : script unique `bash scripts/bundle-x64.sh`
  (web + electron + zip x64 en une commande, PATH npm géré).

## [2.0.6] - 2026-08-19

### Corrigé

- **JapScan — téléchargement des images** : `FetchPages` ouvre désormais le
  lecteur dans une **fenêtre visible**, le fait défiler pour déclencher le
  chargement paresseux, puis collecte les URLs du CDN image `*.japscan.foo`
  (`<img>` + timeline réseau, dédoublonnées) — avec `CreateImageLinks` (DRM) en
  repli. Le `Referer` est celui du **chapitre** (au lieu de la racine) — cause
  du 403 hotlink. `@Common.ImageAjax(true)` détecte le type par octets
  (fichiers `.jpg`, plus d'image noire).
- **Challenge interactif sans navigation** : en mode `Interactive`, la fenêtre
  s'affiche puis l'extraction est relancée dès que le challenge est levé
  (polling borné) — corrige le spinner infini des puzzles « in-place » comme
  celui de JapScan (`#jc-overlay`).
- **Diagnostics** : nouveau canal IPC `Diagnostics::WriteLog` qui écrit dans
  `userdata/diagnostics.log` (borné à 5 Mo, silencieux en cas d'erreur).
- Reste un `.bin` résiduel en tête de chapitre (URL non-image non reconnue) —
  cosmétique, sans impact sur la lecture.

## [2.0.5] - 2026-08-18

### Ajouté

- **Bump de version atomique** : nouveau script `scripts/bump-version.mjs`
  (alias `npm run bump:version`) — met à jour les trois `package.json`
  versionnés et insère l'entrée CHANGELOG en un seul pas, en refusant toute
  exécution si les manifests sont désalignés, si la version existe déjà ou si
  le format semver est invalide (`--dry-run` pour prévisualiser). Élimine la
  cause du désalignement de versions que le garde-fou CI détecte.

## [2.0.4] - 2026-08-18

### Ajouté

- **Tests de non-régression MangaDrama** : 12 tests unitaires verrouillent la
  logique de verrouillage/déverrouillage des chapitres selon `is_purchased`.
  La règle est extraite dans une fonction pure `MapMangaDramaChapter`,
  partagée entre le connecteur et les tests — le cadenas 🔒 ne peut plus
  régresser sans faire échouer la suite.
- **Garde-fou CI des versions** : les trois `package.json` versionnés (racine,
  web, electron) doivent partager la même version avant tout build/release.
  Un désalignement fait échouer `push-ci` et `create-release` dès le départ.

## [2.0.3] - 2026-08-18

### Corrigé

- **MangaDrama** : les chapitres **non achetés** affichent à nouveau le cadenas
  🔒 et le prix en coins — l'overlay DOM introduit en 2.0.1 écrasait l'état REST
  (les items DOM ne portent que `id`/`title`, donc leur état de verrou était
  toujours faux) et déverrouillait visuellement tous les chapitres. L'app fait
  désormais confiance au champ `is_purchased` de l'API, correctement rempli par
  la session connectée : verrouillé si non acheté, déverrouillé si acheté.

## [2.0.2] - 2026-08-18

### Ajouté

- **Suggestions** : bouton « Vérifier les nouveaux chapitres maintenant » sur la
  tuile Suggestions — déclenche le scan des bookmarks sans attendre la période
  configurée (respecte toujours le réglage « silencieux » qui ignore les sites
  nécessitant une fenêtre navigateur).

### Corrigé

- **Bundle snap Linux** : les dossiers de staging snapcraft (`parts/`, `stage/`,
  `prime/`, créés en root) sont supprimés après le build — le workflow de
  release 3 OS ne plante plus en tentant d'attacher un dossier à la release.

## [2.0.1] - 2026-08-18

### Corrigé

- **MangaDrama** : les chapitres achetés (coins) ne sont plus affichés comme
  verrouillés dans la liste — l'état de verrouillage respecte désormais le champ
  `is_purchased` de l'API et la page rendue (l'état réel pour l'utilisateur
  connecté), au lieu du seul `lock_type`.

### Ajouté

- **Installateur NSIS Windows** (per-user, bilingue FR/EN, Add/Remove Programs,
  raccourcis menu Démarrer, désinstallateur) : `hakuneko-electron-v2.0.1-win32-{ia32,x64,arm64}-setup.exe`
  en plus des zips portables.
- **Bundle Linux snap** (`.snap`) en plus de l'AppImage, attaché à la release
  GitHub (l'upload vers le Snap Store reste opt-in via `SNAPCRAFT_STORE_CREDENTIALS`).

## [2.0.0] - 2026-08-18

> **Majeure.** ChainsmokerNeko n'est plus un simple fork d'HakuNeko : cette
> version acte le passage au produit autonome — suite complète de contournement
> Cloudflare, optimisations de performance massives, distribution 3 OS et
> releases bilingues.

### Ajouté

- **Suite Cloudflare complète** : import du cookie `cf_clearance` depuis
  Chrome/Edge (déchiffrement v10/v20 + DPAPI, fallthrough multi-navigateurs),
  collage manuel en secours, persistance du cookie entre les redémarrages,
  bouton « Clear Cloudflare cache », fenêtre visible uniquement quand un
  widget réel est présent.
- **MangaDrama** : connexion au compte, affichage du prix en coins sur les
  chapitres verrouillés, déverrouillage des chapitres achetés.
- **Scan de nouveau contenu configurable** : récurrence (défaut 1440 min),
  paresseux (déclenché à l'ouverture de la vue Suggestions, plus jamais au
  boot) et silencieux (ignore les sites nécessitant une fenêtre visible —
  CrunchyScan, JapScan, MangaFire, MangaLink, MangaTilkisi, MangaTR,
  RainDropFansub).
- **Téléchargement automatique** des nouveaux chapitres de moins de 48 h des
  bookmarks (versions anglaises uniquement).
- **Mise à jour automatique** (electron-updater) avec notification et bouton
  dans l'app.
- **Avertissement localisé « environnement sans Electron »** quand un
  connecteur requiert une vraie fenêtre navigateur sur un runtime qui n'en
  fournit pas.
- **Drapeaux de pays** devant les noms des chapitres.
- **Version affichée** dans la barre latérale, le pied de page du lecteur, le
  splash screen et les paramètres.
- **Distribution 3 OS** : bundles Windows (ia32/x64/arm64), macOS (dmg),
  Linux (snap) construits par CI ; exécutable renommé `hakuneko(.exe)`.
- **Releases bilingues FR/EN**, badges version/téléchargements, changelog et
  feuille de route (`ROADMAP.md`).

### Modifié

- **Performance** : liste des chapitres virtualisée (VirtualList, abonnements
  centralisés), store MediaLists shardé avec diff à la volée (fini le blob
  mono-clé de 91k entrées), recherche floue Fuse.js déplacée dans un Web
  Worker, débounce du filtre avec tri unique, singleton IndexedDB partagé.
- **Accent corail `#e5484d`** (sémantique danger conservée).
- **UA par défaut conservée** (segment `Electron`) — élimine le challenge
  MangaFire.
- **Scan des bookmarks** : plus aucune fenêtre Cloudflare au lancement.

### Corrigé

- Boucles Cloudflare MangaFire / Comix / CrunchyScan (UA, poller de reload,
  contrôle du widget réel).
- Login MangaDrama (session non partagée).
- Persistance des réglages à la fermeture de l'app.
- Import v10 : `RangeError expires_utc` (Edge fermé) et préfixe 32 octets des
  cookies Chromium.
- Scan du nouveau contenu qui ouvrait la fenêtre à chaque démarrage ; un site
  en échec (ex. CrunchyScan sans `cf_clearance`) ne bloque plus la
  mémorisation de la vérification.

## [0.1.15] - 2026-08-18

### Modifié

- **Scan du nouveau contenu paresseux** : la vérification des bookmarks ne
  s'exécute plus au démarrage de l'app — elle ne tourne que quand la vue
  Suggestions est affichée, et au plus une fois par période
  (`check-new-content-period`, défaut 1440 min). Plus de fenêtre Cloudflare
  CrunchyScan qui s'ouvre au lancement.
- **Réglage « Vérifier les nouveaux chapitres sans ouvrir de fenêtre »**
  (activé par défaut) : pendant la vérification, les sites dont le
  fonctionnement nécessite une fenêtre navigateur visible (CrunchyScan) sont
  ignorés — aucune fenêtre ne s'ouvre pendant le scan. Désactivable dans
  Paramètres → Général.

## [0.1.14] - 2026-08-17

### Ajouté

- **Avertissement localisé « environnement sans Electron »** : quand un
  connecteur requiert une vraie fenêtre navigateur (`FetchWindowScript`) sur un
  runtime qui n'en fournit pas (aperçu web, Deno, Node…), l'app affiche un
  message clair et localisé au lieu de l'`InternalError` opaque. Traduit dans
  les 14 locales, couvert par 6 tests unitaires. Comportement desktop
  (Electron/NW.js) inchangé.

### Corrigé

- **CI remis au vert** : trois problèmes introduits par le rewrite 3-OS corrigés
  — caractères non-ASCII dans des commentaires YAML de workflows (runs fantômes
  en échec 0 s), `${{ runner.temp }}` dans un bloc `env:` de job interdit, et
  import top-level d'`extract-zip` cassant le job bundles Windows (passé en
  import lazy, macOS/Linux uniquement).

### Documentation

- Guide **pas-à-pas du réchauffage CrunchyScan** (CLOUDFLARE.md §7) + script de
  test live vérifiant le snapshot `cf_clearance` (valeur, domaine, persistance).
- **Badges de release** (version + téléchargements de la dernière version) dans
  les README français et anglais ; liens de téléchargement vérifiés (HTTP 200/206).

## [0.1.13] - 2026-08-17

### Ajouté

- **Bouton « Clear Cloudflare cache »** dans Paramètres → Général → Cloudflare
  bypass : efface en un clic le snapshot `cloudflare-clearance.json` et tous les
  cookies `cf_clearance` de la session partagée (à utiliser quand le cookie est
  périmé et que le site rechallenge). Retourne un résumé du nettoyage.

### Documentation

- **README bilingue** : ajout de `README.en.md` (traduction anglaise complète)
  avec sélecteur de langue en tête des deux fichiers. Les releases suivent la
  même convention FR + EN.

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


## Crédits / Credits

Développé en vibe coding avec l'assistance de **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.

Developed with vibe coding, assisted by **Codebuff (Kumo)** — 🤖 Generated with Codebuff · Co-Authored-By: Codebuff <noreply@codebuff.com>.
