# Benchmarks

Mesures réelles prises sur l'app packagée en cours d'exécution (Electron 43.3.0 /
Chromium 150, Node 26), via le protocole CDP. `performance.now()` côté page.

## 1. Filtre de la liste des mangas

Mesuré sur la **vraie liste MangaFire (70 234 titres)** chargée par le moteur, une
seule passe (pas de moyenne) — ordres de grandeur fiables, à ±10 ms.

- Version de Fuse.js : 7.5.0 (identique à celle du bundle).
- Réglage par défaut : **recherche floue désactivée** (`Settings.FuzzySearch = false`).

## Coût des opérations (70 234 titres)

| Opération | Coût | Résultats |
|---|---|---|
| Chargement réseau de la liste (`plugin.Update()`) | **77,5 s** (une fois) | 70 234 |
| Construction de l'index Fuse (une fois au chargement) | 22,9 ms | — |
| Recherche floue Fuse `"one piece"` | **205 ms** | 14 895 (21 % de la liste !) |
| Filtre sous-chaîne `"one piece"` | 4,7 ms | 19 |
| Filtre sous-chaîne `"a"` | 3,7 ms | 58 480 |
| Tri `localeCompare` du résultat | 8,4 ms (14 895) / **41,1 ms** (58 480) | — |
| Tri de la liste complète (70 k) | 41,9 ms | — |
| `filterMedia` complet (flou) | 191,1 ms | 14 895 |
| `filterMedia` complet (sous-chaîne) | 7,8 ms | 19 |

## Avant / après le débounce (commit `c712d5f7`)

| Mode | Avant (sans débounce, par frappe) | Après (débounce 200 ms) |
|---|---|---|
| **Sous-chaîne (défaut)** | ~5 ms (requête étroite) à ~45 ms (requête large) de blocage par frappe | frappes non bloquantes, **~313 ms** mesurés E2E après la dernière frappe |
| **Flou (opt-in)** | ~200 ms de blocage par frappe → taper `"one piece"` (9 touches) ≈ **1,8 s** cumulées | 200 ms + 191 ms ≈ **391 ms** une seule fois |

## Interprétation

1. **Le vrai goulot est la recherche floue Fuse.js : 205 ms par recherche** sur le
   thread UI, et elle renvoie 14 895 résultats (21 % de la liste) car
   `findAllMatches: true` + `ignoreLocation: true` sont très permissifs. C'est la
   cible prioritaire pour un déplacement en Web Worker.
2. Le tri (`localeCompare`) coûte 8–42 ms et était refait **à chaque frappe** avant ;
   il est désormais fait **une seule fois au chargement**.
3. Le débounce (200 ms) est la latence dominante en mode sous-chaîne par défaut
   (~313 ms) : léger coût de réactivité accepté contre la suppression des à-coups,
   et gain massif en mode flou (1,8 s → 0,39 s).
4. Piste d'amélioration : abaisser le débounce à ~120–150 ms pour le mode
   sous-chaîne, et déporter Fuse en Web Worker pour éliminer les 205 ms restants
   en mode flou.

## 2. Sauvegarde des `MediaLists` au refresh (diff vs réécriture complète)

Mesuré en live (CDP) dans l'app, sur le **vrai IndexedDB**
(`StorageControllerBrowser`), avec une liste synthétique de **70 000 entrées**
(70 lots de 1 000) sous un namespace dédié `bench-site` (données réelles intactes).
Algorithmes copiés **verbatim** depuis `MediaListStore.ts`. Chaque mesure :
1 échauffement + 3 passes chronométrées (moyenne / min). Le chrono couvre les
vraies transactions IndexedDB (1 transaction par opération).

| Scénario de refresh (70 000 entrées) | Écritures IDB par refresh | Durée moy. / min |
|---|---|---|
| **0.1.0 — blob mono-clé** (tout réécrit sous une clé) | 1 put() de 70 k objets | 11,9 ms / 10,6 ms |
| **0.1.1 — shards sans diff** (tous les lots réécrits) | **70** lots + méta | 32,1 ms / 31,0 ms |
| **0.1.2 — diff, liste inchangée** | **0** lot (+ méta seule) | 33,2 ms / 30,8 ms |
| **0.1.2 — diff, 3 entrées modifiées** | **1** lot + méta | 29,2 ms / 26,2 ms |
| Peuplement initial (70 shards, écriture à froid) | 71 | 26,9 ms |
| Lecture complète (70 shards parallèles, contexte) | — | 22,3 ms / 18,7 ms |

Vérifié en live : compteur d'écritures = 4 sur 4 passes pour « diff inchangé »
(uniquement la méta), 5 pour « diff modifié » (1 lot + méta), 284 pour
« shards sans diff » (70 + méta × 4 passes). Round-trip : 70 000 relus après
chaque scénario.

### Interprétation

1. **Le vrai gain du diff est structurel, pas la latence mur-à-mur** : sur ce
   matériel (NVMe local), une transaction IndexedDB de 1 000 objets coûte
   ~0,4 ms, donc 70 écritures ≈ 70 lectures + comparaisons (~30 ms dans les deux
   cas). La durée totale du refresh est dominée par le **fetch réseau des
   70 k titres (77,5 s** — voir §1), pas par la sauvegarde.
2. Ce que le diff élimine réellement : la **réécriture systématique** (70 lots
   réécrits à chaque refresh → 0), la **matérialisation en mémoire de toute
   l'ancienne liste** (chargée lot par lot à la volée), et le coût d'écriture qui
   passe de O(liste) à **O(modifications)**.
3. L'écart visible grandit sur des listes plus grandes (91 k+), des entrées plus
   riches, ou des disques plus lents / ARM où les écritures transactionnelles
   coûtent relativement plus cher que les lectures.
4. Le blob mono-clé (0.1.0) était le plus rapide en écriture pure (1 transaction),
   mais c'est lui qui posait le problème mémoire (clone intégral à chaque
   écriture) et le risque de corruption sur interruption — d'où le sharding.

## Protocole

- Script de mesure : `app/electron/.tmp/bench_filter.mjs` (micro-benchmark) et
  `app/electron/.tmp/e2e_final.mjs` (latence E2E saisie → mise à jour du compteur
  `#MediaCount`) ; `app/electron/.tmp/bench_medialist.mjs` (sauvegarde des
  `MediaLists`, résultats dans `bench_medialist_results.json`).
- Lancement : `electron app/electron/build --remote-debugging-port=9223`
  (9222 était pris par un Edge local), app sur `http://127.0.0.1:64210`.
