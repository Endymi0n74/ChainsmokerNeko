# SYNC — Synchronisation avec l'upstream `manga-download/haruneko`

Ce document décrit la structure à deux branches du fork **Endymi0n74/ChainsmokerNeko**
et la procédure à suivre pour intégrer l'upstream sans casser la ligne produit.

> Complément de `MEMORY.md` (section « Procédure de sync upstream », 2026-09-05).
> À relire AVANT chaque intégration upstream.

## 1. Structure des branches

| Branche | Contenu | Tracking | Règle |
|---|---|---|---|
| `master` | Upstream **vierge** (zéro commit fork) | `origin/master` | `pull.ff only` — JAMAIS de commit fork |
| `chainsmoker` | Ligne produit v3 (releases 3.0.x, couche Cloudflare/électron, sites conservés, perf viewer…) | `fork/chainsmoker` | Toute la vie du produit |

Points d'ancrage de sécurité (ne jamais supprimer) :

- Tags `3.0.0` … `3.0.3` : releases de la ligne produit.
- Tags `archive/*` (5) : snapshots des branches `upstream/*` des PRs fermées
  (#1797 cloudflare, #1798 perf, #1804 crunchyscan, #1805 japscan, variante -local).
- Le commit de fusion `7d94f3a14` : première intégration fork-first (historique conservé).

## 2. Synchroniser `master` (trivial, jamais de conflit)

```bash
git checkout master
git pull            # fast-forward uniquement (branch.master.pull.ff = only)
git push fork master
```

Si `git pull` refuse (upstream a réécrit son historique) : ne rien forcer, investiguer
d'abord (`git log --oneline master..origin/master`).

## 3. Intégrer l'upstream dans `chainsmoker` (procédure fork-first)

Le fork et l'upstream ont divergé **architecturalement** : refactor IPC/FetchProvider
upstream incompatible avec la couche Cloudflare du fork ; l'upstream supprime des sites
que le fork maintient ; les deux lignes modifient le viewer et les settings. Une fusion
naïve casse le build. Politique : **le fork gagne sur tout ce qui touche à la couche
produit ; l'upstream apporte le reste (sites, fixes, dépendances).**

```bash
git checkout chainsmoker
git fetch origin --prune
git merge origin/master --no-commit --no-edit
```

### 3.1 Résolution des conflits — toujours vers le fork

```bash
# Conflits de contenu (UU/AA) : garder la version du fork
for f in $(git diff --name-only --diff-filter=U); do
    if git cat-file -e HEAD:"$f" 2>/dev/null; then
        git checkout HEAD -- "$f" && git add "$f"
    else
        git rm -f -- "$f"          # le fork avait supprimé ce fichier : on garde la suppression
    fi
done
```

Cas particuliers :

- **modify/delete** — upstream a supprimé un fichier que le fork utilise →
  `git checkout HEAD -- <fichier> && git add <fichier>` (restauration).
- **add/add** — les deux côtés ont ajouté le fichier → garder celui du fork.

### 3.2 Restaurer les fichiers supprimés par upstream mais encore utilisés

```bash
t=$(git write-tree)
comm -23 <(git ls-tree -r --name-only HEAD) <(git ls-tree -r --name-only "$t") \
    | xargs git checkout HEAD --
git add -u
```

Historique : `MangaFury`, `ManhwaHub` (2026-09), `Raw18`, `Syosetu`, `JManga`… les
sites supprimés par l'upstream restent **dans le produit du fork**.

### 3.3 Couche platform/IPC — le fork gagne en bloc

Si `tsc` échoue sur `web/src/engine/platform/**` ou `app/electron/src/**`
(symboles upstream absents de la couche fork, ex. `FetchConcealed`,
`InterProcessCommunicationChannels`), restaurer TOUTE la couche depuis HEAD :

```bash
git checkout HEAD -- web/src/engine/platform app/electron/src app/nw/src app/src/ipc \
    app/electron/vite.config.ts
git rm -f --ignore-unmatch \
    web/src/engine/platform/CookieHelper.ts \
    web/src/engine/platform/FetchConcealedRequest.ts \
    app/electron/src/ipc/InterProcessCommunicationChannels.ts
rm -f web/src/engine/platform/electron/FetchProvider_test.ts   # ajout upstream inutilisé
```

Puis supprimer les fichiers ajoutés par l'upstream dont le fork n'a pas besoin et qui
ne compilent plus seuls. Vérifier ensuite avec `tsc` (boucle 3.3 → 3.4).

### 3.4 i18n — ne JAMAIS toucher aux locales Crowdin

Les 13 fichiers `web/src/i18n/locales/{ar_SA,de_DE,es_ES,fil_PH,fr_FR,hi_IN,id_ID,
ja_JP,pt_PT,th_TH,tr_TR,zh_CN,zu_ZA}.ts` sont gérés par Crowdin : `check:rules` les
compare au master upstream et **refuse toute modification**. Les clés fork-specific
vont UNIQUEMENT dans `en_US.ts` (seule locale exemptée). Conséquence : ces langues
affichent la clé brute pour les réglages propres au fork tant que Crowdin ne traduit pas.

### 3.5 package-lock.json — régénérer APRÈS chaque fusion

La fusion absorbe les bumps de dépendances upstream (`web/package.json`,
`app/nw/package.json` : pdfkit, svelte, fluentui, nw-sdk…) mais le lockfile reste
celui du fork. `npm ci` échoue alors dans push-ci.yml dès « Install NPM Packages »
(`package.json and package-lock.json are not in sync`). Toujours régénérer le lock
après la résolution des conflits :

```bash
npm install --engine-strict=false --package-lock-only
git add package-lock.json
```

Le `--engine-strict=false` n'est nécessaire qu'en local (Node récent vs `engines` d'un
paquet upstream) ; la CI tourne sur Node 24.0.0 et n'en a pas besoin. `--package-lock-only`
suffit : node_modules local reste inchangé, la CI ré-installe depuis le lock régénéré.

### 3.6 Valider, commiter, pousser

```bash
# 1. Lockfile synchrone (sinon push-ci échoue à npm ci)
#    (npm ci n'accepte pas --dry-run : valider par un vrai npm ci sur Node 24,
#    ou localement avec --engine-strict=false une fois l'étape 3.5 faite)

# 2. Types (3 workspaces)
cd web && ../node_modules/.bin/tsc --noEmit && cd ..
cd app/electron && ../../node_modules/.bin/tsc --noEmit && cd ..
cd app/nw && ../../node_modules/.bin/tsc --noEmit && cd ..

# 3. Suite complète
npm run check:versions
cd web && ../node_modules/.bin/eslint . \
  && ../node_modules/.bin/svelte-check --tsconfig=tsconfig.json --compiler-warnings a11y-click-events-have-key-events:ignore \
  && ../node_modules/.bin/vue-tsc --skipLibCheck --noEmit \
  && node ./scripts/coding-rules.mjs && cd ..

# 4. Tests unitaires (rapide) — optionnel mais recommandé
cd web && ../node_modules/.bin/vitest run && cd ..

# 5. Commit + push (JAMAIS sur master)
git commit -m "Merge upstream manga-download/haruneko master into chainsmoker"
git push fork chainsmoker
```

## 4. Pièges connus

- `-X ours` ne suffit PAS : il laisse passer les hunks upstream non-conflictuels dans
  des fichiers semi-modifiés. Toujours restaurer explicitement depuis HEAD les fichiers
  en conflit (vérif : `git rev-parse HEAD:<fichier>` == `git rev-parse :0:<fichier>`).
- Volume attendu à la première intégration : 44 fichiers en conflit + 37 fichiers
  platform/IPC + 31 fichiers restaurés. Les suivantes sont bien plus légères
  (2 conflits pour `850e9ffcd..5969582ef` ; **0 conflit + 3 restaurations**
  `MangasScans.*` pour `5969582ef..a155548b1`).
- push-ci.yml rouge à « Install NPM Packages » (npm ci) = lockfile désynchronisé par
  les bumps de dépendances absorbés à la fusion → étape 3.5
  (`npm install --package-lock-only`), jamais un `package-lock.json` restauré à la main.
- `check:rules` crée une branche temporaire `master-local` depuis l'URL upstream en dur
  (`scripts/coding-rules.mjs`) — nécessite l'accès réseau à github.com.
- Les settings du viewer (ex. `ViewerPreloadNextItem`) doivent être déclarés dans
  `web/src/frontend/classic/stores/Settings.svelte.ts` (enum `Key` + `Initialize` +
  `SettingStore`) ET dans `en_US.ts`, sinon svelte-check échoue sur
  `ImageViewer.svelte` / `viewer/Settings.svelte`.
- Ne jamais pousser un commit fork sur `fork/master` : la prochaine intégration
  upstream redeviendrait conflictuelle.