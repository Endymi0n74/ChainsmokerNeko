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

## Avant / après le débounce (commits `c712d5f7` + 0.1.3)

| Mode | Avant (sans débounce, par frappe) | Après débounce 200 ms | Après débounce 120 ms (0.1.3) |
|---|---|---|---|
| **Sous-chaîne (défaut)** | ~5 ms (étroite) à ~45 ms (large) de blocage par frappe | ~313 ms E2E | **~192 ms E2E** (185–204 ms) |
| **Flou (opt-in)** | ~200 ms de blocage par frappe → ≈ **1,8 s** pour `"one piece"` | 200 + 191 ≈ **391 ms** | inchangé (200 ms, le worker absorbe le coût) |

Depuis la 0.1.3, le débounce est **adaptatif** : **120 ms en mode sous-chaîne**
(défaut, filtrage rapide ~5 ms) et **200 ms en mode flou** (le worker Fuse prend
~200 ms, un délai plus long évite d'empiler les recherches pendant la frappe).
Mesuré en sous-chaîne (méthode in-page identique au 313 ms, moyenne de 3 passes) :
`1` → 192 ms (30 634 résultats), `one` → 193 ms (0), `manga 1234` → 202 ms (11),
`manga1234` → 186 ms (0), `x` → 188 ms (0). Gain E2E ≈ **120 ms**.

## Interprétation

1. **Le vrai goulot est la recherche floue Fuse.js : 205 ms par recherche** — il est
   désormais déporté dans un **Web Worker** (0.1.2, `1e1aee48`), l'UI ne bloque
   plus ; et `findAllMatches + ignoreLocation` très permissifs matchent 21 % de la
   liste (14 895 titres pour « one piece »).
2. Le tri (`localeCompare`) coûte 8–42 ms et était refait **à chaque frappe** avant ;
   il est désormais fait **une seule fois au chargement**.
3. Le débounce (120 ms sous-chaîne) est la latence dominante restante en mode
   défaut (~192 ms E2E mesurés) : acceptable et fluide.
4. Piste restante : Fuse renvoie 14 895 résultats pour « one piece » (21 %) — si le
   mode flou s'avère trop permissif au quotidien, resserrer `findAllMatches`/`threshold`.

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
