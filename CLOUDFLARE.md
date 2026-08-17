# Contournement Cloudflare — état et mode d'emploi

> Statut documenté au 17 août 2026 — versions **0.1.5 → 0.1.9**.

Ce document récapitule comment **ChainsmokerNeko** gère les challenges Cloudflare
(la page « Un instant… » qui bloque certains sites), et en particulier comment
réutiliser le cookie `cf_clearance` déjà obtenu par ton navigateur réel.

---

## 1. Le problème

Certains sites (CrunchyScan, parfois MangaFire/Comix) servent un challenge
Cloudflare **« managé »** : une page « Un instant… » sans widget interactif.
Ce challenge se résout automatiquement **uniquement** pour les sessions à forte
confiance (un vrai navigateur qui a déjà passé le challenge et accumulé
l'historique). Une session Electron neuve repart de zéro et peut boucler
indéfiniment.

Le cookie `cf_clearance` est la clé : dès que Cloudflare l'émet, le site se
charge. L'application dispose donc de **deux étages** :

1. les mécanismes automatiques embarqués (user-agent, session partagée,
   reload opt-in) ;
2. un helper de **réutilisation du cookie depuis ton navigateur réel**.

---

## 2. Mécanismes automatiques embarqués

| Mécanisme | Rôle |
|-----------|------|
| **User-agent standard conservée** | L'app garde le segment `Electron/x.y.z` au lieu de le retirer (le stripping déclenchait le challenge sur MangaFire). |
| **Session partagée** | Les fenêtres distantes partagent la session de l'app ; les cookies (`cf_clearance` y compris) sont injectés dans les requêtes fetch, le flag `partitioned` est retiré des `Set-Cookie`. |
| **Auto-résolution des challenges managés** | Le challenge s'auto-résout en arrière-plan sans flash de fenêtre (fenêtre masquée seulement pour les sites sans widget). |
| **Reload opt-in par site** | Seuls les sites qui le demandent (CrunchyScan) rechargent la page tant que le challenge est bloqué — budget borné à **3 navigations**, cookie lu via le debugger CDP (`Network.getCookies`) car `cf_clearance` est **httpOnly**. |

Ces mécanismes suffisent pour MangaFire et Comix (validés en réel). Pour
CrunchyScan, le challenge « managé » sans widget peut ne pas se résoudre depuis
une IP/session sans confiance — c'est là que le helper ci-dessous intervient.

---

## 3. Helper « Importer le `cf_clearance` depuis le navigateur »

Emplacement : **Paramètres → Général → Cloudflare bypass**.

Il réutilise le cookie `cf_clearance` que ton navigateur réel (Edge/Chrome) a
déjà obtenu pour `crunchyscan.org`, et l'injecte dans la session de l'app.

### 3.1 Deux chemins d'import

| Chemin | Fonctionnement | Fiabilité |
|--------|----------------|-----------|
| **Import automatique** (bouton) | Lit le cookie dans le store SQLite chiffré du navigateur (DPAPI + AES-256-GCM), le décrypte et l'injecte. | Fonctionne avec **Chrome**, ou **Edge sans App-Bound Encryption**. Navigateur **fermé** obligatoire. |
| **Collage manuel** (champ + bouton Inject) | Copie la valeur de `cf_clearance` depuis les DevTools (`F12` → Application → Cookies → crunchyscan.org → cf_clearance) et colle-la. | **Universel** — fonctionne dans tous les cas, navigateur ouvert ou non. |

### 3.2 Pipeline d'import automatique (v10)

1. Localise les profils : `%LOCALAPPDATA%\Microsoft\Edge\User Data` et
   `%LOCALAPPDATA%\Google\Chrome\User Data`.
2. Lit la clé AES dans `Local State` (`os_crypt.encrypted_key`) et la déchiffre
   via **DPAPI** (scope utilisateur courant).
3. Copie la base `Default/Network/Cookies` (verrouillée pendant que le
   navigateur tourne) dans un fichier temporaire, puis lit `cf_clearance` en
   SQLite (`node:sqlite`, lecture seule).
4. Déchiffre le cookie au format **v10** : `v10` + nonce 12 octets + ciphertext
   + tag 16 octets (AES-256-GCM), puis **retire le préfixe d'intégrité de
   32 octets** que Chromium 130+ ajoute aux valeurs avant chiffrement.
5. Injecte le cookie dans la session partagée : `httpOnly`, `secure`,
   `sameSite=no_restriction`, durée de vie ~30 jours.

### 3.3 Le cas « v20 » (App-Bound Encryption)

Les Edge/Chrome récents peuvent chiffrer les cookies en **v20**
(*App-Bound Encryption*) : la clé est dérivée par le service d'élévation du
navigateur, liée à l'identité de l'app, et **non décryptable depuis
l'extérieur**. Le helper détecte ce format (préfixe `v20`) et renvoie un
message clair au lieu d'échouer silencieusement :

> *« App-Bound Encryption (v20) is enabled — paste the cf_clearance value manually instead. »*

Dans ce cas, **le collage manuel reste le chemin fiable**.

### 3.4 Fallthrough multi-navigateur

L'import **essaie tous les navigateurs** avant d'abandonner : si Edge échoue
(verrouillé ou v20), Chrome est essayé ensuite, et inversement. Le message de
succès précise la source (« Imported … from Chrome ») ; les échecs sont
agrégés dans un résumé.

---

## 4. Matrice des scénarios

| Navigateur | Chiffrement | Navigateur ouvert ? | Résultat de l'import auto |
|-----------|-------------|---------------------|---------------------------|
| Chrome | v10 | Fermé | ✅ décryptage + injection |
| Chrome | v10 | Ouvert | ⚠️ « store verrouillé » → ferme Chrome ou colle manuellement |
| Edge (ancien / ABE désactivé) | v10 | Fermé | ✅ décryptage + injection |
| Edge (récent, ABE activé) | v20 | Fermé | ⚠️ message v20 → colle manuellement |
| Edge (récent, ABE activé) | v20 | Ouvert | ⚠️ message v20 → colle manuellement |
| Aucun navigateur détecté | — | — | ⚠️ « No Chromium browser profile found » → colle manuellement |

---

## 5. Limites connues

- **Il faut un vrai `cf_clearance`** : le helper déplace un cookie déjà obtenu,
  il ne le fabrique pas. Si ton navigateur n'a pas encore passé le challenge
  (ex. IP marquée par Cloudflare), il n'y a rien à importer.
- **`cf_clearance` peut être émis sans challenge résolu** (faux positif) : sa
  présence ne garantit pas le déblocage — seul un test réel de listing le
  confirme.
- **Auto-lecture Windows uniquement** : DPAPI + PowerShell sont spécifiques à
  Windows ; sur macOS/Linux, seul le collage manuel est disponible.
- **Auto-lecture = navigateur fermé** : le store de cookies est verrouillé
  (`EBUSY`) tant que le navigateur tourne.

---

## 6. Historique des versions

| Version | Apport |
|---------|--------|
| **0.1.5** | Fix de la boucle Cloudflare CrunchyScan (fenêtre visible, lecture httpOnly via CDP, budget de reload borné). |
| **0.1.6** | Ajout du helper d'import (`ImportFromBrowser` + collage manuel) et de la section « Cloudflare bypass ». |
| **0.1.7** | Fix du crash `expires_utc` (`RangeError` dès qu'Edge/Chrome était fermé). |
| **0.1.8** | Fallthrough multi-navigateur (Chrome essayé quand Edge échoue) + documentation v10/ABE. |
| **0.1.9** | Fix du préfixe d'intégrité 32 octets (Chromium 130+) : la valeur injectée est propre. |

---

## 7. Procédure recommandée pour débloquer CrunchyScan

1. Dans ton navigateur réel, ouvre `crunchyscan.org` et passe le challenge
   (page qui se charge normalement).
2. Ouvre les DevTools (`F12`) → **Application** → **Cookies** →
   `crunchyscan.org` → copie la valeur de **`cf_clearance`**.
3. Dans l'app : **Paramètres → Général → Cloudflare bypass** → colle la valeur
   → **Inject**.
4. Retourne sur CrunchyScan → **Update** : le listing se charge.

> Si ton navigateur est **Chrome** (ou Edge avec ABE désactivé) **fermé**, le
> bouton **Import cf_clearance from browser** fait la même chose sans copier.
