# AGENTS.md — Règles durables (fork ChainsmokerNeko / Haruneko)

> Règles invariantes du projet. À lire avec `MEMORY.md` en début de session, et à chaque bascule de modèle.
> L'état du projet (version, statut, historique de sessions, leçons techniques) reste dans `MEMORY.md`.

## 1. Langue & communication

- **Langue : français uniquement** — répondre toujours en français à l'utilisateur, quel que soit le modèle.

## 2. Process & mémoire

1. **MEMORY.md doit être mis à jour après chaque changement** — rafraîchir ≥ 2×/heure en session active. Pas d'exception, pas de raccourci.
2. Lire `MEMORY.md` + `AGENTS.md` en début de session et à chaque bascule de modèle Freebuff.
3. **Aucune régression** : tester l'existant AVANT de déclarer terminé (tsc ×2, vitest, e2e selon la zone modifiée).
4. **Convention anti-régression** : chaque changement vérifie les e2e existants AVANT déclaration de fin.
5. **Aucune suppression** sans approbation utilisateur (fichiers, branches, releases, tags).

## 3. Git & commits

- **Pas de `git add -A`** ; committer uniquement les fichiers liés.
- **Format de commit** : description concise + `🤖 Generated with Codebuff` / `Co-Authored-By: Codebuff <noreply@codebuff.com>`.
- **Pas de push** sans demande explicite.
- **Jamais de push sur `master`** (upstream vierge) — la ligne produit est `chainsmoker` (fork). La release est déclenchée par le push d'un tag `3.*` sur `chainsmoker`.

## 4. Versioning & release

- **Versioning** : bumper dans les 3 manifests (`package.json`, `web/package.json`, `app/electron/package.json`) + CHANGELOG pour tout fix fonctionnel. Ne PAS toucher au lockfile racine (garde l'ancienne version upstream).
- **Release** : « ChainsmokerNeko <version> » (sans v), FR+EN, 10 artefacts (3 zips + 3 NSIS + AppImage + .deb + 2 DMG).
- **Pas de userdata** dans les bundles distribués.

## 5. i18n

- **Ne JAMAIS éditer les 13 locales Crowdin** (ar_SA, de_DE, es_ES, fil_PH, fr_FR, hi_IN, id_ID, ja_JP, pt_PT, th_TH, tr_TR, zh_CN, zu_ZA) — `check:rules` compare au master upstream et refuse toute modification. Les clés fork-specific vont UNIQUEMENT dans `en_US.ts`.

## 6. Build & CI

- **Ordre build fiable** : `vite build` (web) → `build-app.mjs` → `vite build` (main + preload, config séparée `vite.preload.config.ts`) → copier `web/build` → `build/web`.
- **`npm run bundle` NE reconstruit PAS web** (il copie `web/build`) → toujours `npm run build:web` avant, et **vérifier le fix DANS les artefacts** (esbuild minifie les constantes : `300000` → `3e5`).
- **Pas d'unicode** dans les commentaires YAML GitHub ; **pas de `${{ runner.* }}`** dans un bloc `env:` de job.
- Validation CI : `check:versions` + `npm run check --workspaces` (versions, eslint, svelte-check, vue-tsc, coding-rules).

## 7. Tests

- Typecheck : web `tsc --noEmit` (depuis `web/`), electron `node node_modules/typescript/bin/tsc --noEmit -p app/electron/tsconfig.json` (depuis la racine).
- **ESLint = `eslint .` depuis `web/`** — PAS `--ext .ts,.svelte,.vue` (config flat : casse sur `.svelte`/`.vue`).
- E2E websites (depuis la racine `haruneko/`) :
  `export PATH="/c/Program Files/nodejs:$PATH" && node node_modules/vitest/vitest.mjs run --config test/vitest.websites.ts <Site>_e2e`
  — tuer electron.exe + le process sur le port 5000 avant ; le serveur preview sert du HTTPS (normal).
- CDP timeout 300s (`PuppeteerFixture.ts`) pour les listings longs (mangafire 70k+).
- `page.evaluate` : passer un **STRING script**, pas une fonction (sérialisation).

## 8. Pratiques agent/outils

- Bascules de modèle Freebuff → relire `MEMORY.md` (+ `AGENTS.md`) en début de session.
- `str_replace`/`write_file` peuvent échouer sur fichiers modifiés ou CRLF → re-lire avant de rééditer.
- Builds/powershell lents → `timeout_seconds` élevé, `BACKGROUND` pour polling.
- `suggest_prompts` nécessite un **array JSON**, pas une string.
- Interruptions réseau = les fichiers survivent → reprendre via `git status`.
- Windows/Git Bash : `tasklist`, `wmic`, `cmd //c`, `ps -W`, curl/netcat se figent souvent → `powershell -NoProfile -Command "Get-CimInstance Win32_Process ..."` ; chemins avec `//` ; `taskkill //F //IM` pour tuer l'app.
- Le shell agent garde un PATH obsolète (processus long) → `export PATH="$(echo "$PATH" | tr -d '"')"` avant toute commande npm/cmd ; les nouveaux terminaux sont OK sans workaround.
- Ne jamais faire `.then` sur le retour d'un wrapper de `SetTimeout` sans vérifier son type (mock vitest renvoie un objet Timeout, pas une Promise).

## Références

- `MEMORY.md` — état du projet (version, statut, historique de sessions).
- `LESSONS.md` — leçons techniques (plateforme, Cloudflare, sites, CI/CD).
- `SYNC.md` — procédure de sync upstream (fork-first, politique de fusion).
- `CLOUDFLARE.md` — architecture/détails Cloudflare.
- `CHANGELOG.md` — historique des releases.