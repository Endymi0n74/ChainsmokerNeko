# Contribuer à ChainsmokerNeko

Merci de vouloir contribuer ! 🚬🐱

## Workflow

1. Fork du dépôt, puis créez une branche dédiée :
   ```bash
   git checkout -b feat/ma-super-amelioration
   ```
2. Faites vos modifications, avec tests si pertinent.
3. Vérifiez la qualité avant de committer :
   ```bash
   npm run check:ts --workspace=web
   npm run check:lint --workspace=web
   npm run check:svelte --workspace=web
   npm run check:vue --workspace=web
   npm run check --workspace=app/electron
   ```
4. Committez avec un message conventionnel (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `refactor:`…).
5. Ouvrez une Pull Request vers `master`.

## Ajouter un site (connecteur)

- Créez `web/src/engine/websites/<Site>.ts` (hérite de `DecoratableMangaScraper`, décoré avec `@Common.*`).
- Enregistrez-le dans `web/src/engine/websites/_index.ts`.
- Ajoutez un test e2e `<Site>_e2e.ts` avec `TestFixture` (voir les exemples existants, ex. `Comix_e2e.ts`).
- Vérifiez avec `npm run test:websites`.

## Conventions git

- Ne faites **jamais** de `git add -A` : ne stager que les fichiers liés à la tâche.
- Ne poussez pas directement sur `master` ; passez par une Pull Request.
- Respectez le format de commit du dépôt (conventional commits, voir `git log`).
