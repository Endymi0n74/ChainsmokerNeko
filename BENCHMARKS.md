# Benchmarks — filtre de la liste des mangas

Mesures réelles prises sur l'app packagée en cours d'exécution (Electron 43.3.0 /
Chromium 150, Node 26), via le protocole CDP, sur la **vraie liste MangaFire
(70 234 titres)** chargée par le moteur. `performance.now()` côté page, une seule
passe (pas de moyenne) — ordres de grandeur fiables, à ±10 ms.

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

## Protocole

- Script de mesure : `app/electron/.tmp/bench_filter.mjs` (micro-benchmark) et
  `app/electron/.tmp/e2e_final.mjs` (latence E2E saisie → mise à jour du compteur
  `#MediaCount`).
- Lancement : `electron app/electron/build --remote-debugging-port=9222`.
