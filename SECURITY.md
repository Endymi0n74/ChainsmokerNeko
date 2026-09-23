# Sécurité

## Signaler une vulnérabilité

Ouvrez une **issue privée** en décrivant le problème sans divulguer publiquement les
détails exploitables. Ne publiez pas de preuve de concept publique avant correction.

Merci de signaler notamment :

- exécution de code arbitraire via un connecteur/scraper ;
- élévation de privilèges depuis la fenêtre navigateur distante vers le processus principal Electron ;
- exfiltration de données utilisateur (cookies, fichiers locaux) ;
- écriture de fichiers hors du répertoire de téléchargement.

## Modèle de menace

L'application télécharge du contenu depuis des sites tiers. Les connecteurs exécutent des
scripts dans une fenêtre navigateur isolée (`sandbox`, `webSecurity`, `contextIsolation`).
Toute voie permettant d'échapper à cette isolation est considérée comme critique.
