# Architecture validée

L’utilisateur a validé le 16 octobre 2026 TypeScript, React + Vite, Node.js + Fastify et une architecture hexagonale légère.

- `src/domain` : modèles et règles métier, aucune dépendance infrastructure.
- `src/application` : cas d’usage et ports, dépend uniquement du domaine.
- `src/adapters` : fichiers, Steam, HTTP et composition, implémente les ports.
- `web` : interface React, communique avec l’API HTTP uniquement.

Les dépendances vont vers le domaine. Aucun accès disque ou réseau dans le domaine. Les écritures sauvegardent le fichier avant modification et vérifient les modifications concurrentes. Serveur limité à 127.0.0.1, contrôle d’origine des mutations. Ne jamais exposer `.env` ni de clé Steam au navigateur.

Les transferts serveur sont des règles du domaine ; leurs cas d’usage analysent et exportent sans écriture. Les actions de compte Steam passent par les ports `SteamAccountPort` et `SteamCatalogPort`. L’adaptateur de navigateur utilise exclusivement un profil dédié ignoré par Git. Aucun cookie ou jeton ne franchit l’API HTTP. Les tests de ces ports utilisent des doubles et ne modifient jamais un compte Steam réel.

L’export de profils locaux est un cas d’usage distinct : le domaine encode le format natif, l’application contrôle les révisions et l’adaptateur met à jour uniquement le fichier `Lua/pz_modlist_settings.cfg` de la racine utilisateur configurée. Toute écriture partage le verrou des sauvegardes et de la configuration, exige le jeu fermé et préserve les autres profils et favoris avec une copie de sécurité. Les tests utilisent des fichiers temporaires, jamais le fichier de profils personnel.

La configuration des chemins passe par `SettingsService`, `SettingsStorePort` et `ConfigurableLibraryPort`. Le domaine valide la forme des réglages ; les adaptateurs valident les dossiers et enregistrent atomiquement la configuration locale ignorée par Git. Le changement de bibliothèque est verrouillé pendant les écritures et invalide les références de sauvegarde et caches locaux. Les thèmes, la langue et les préférences de navigation restent dans le navigateur ; ils ne sont pas des réglages serveur.

Les incompatibilités déclarées sont des constats ; les collisions sont des soupçons. Ne jamais garantir l’absence de conflits par analyse statique. Aucun retrait ou désabonnement réel pendant les tests sur les données utilisateur.

Respecter SOLID sans abstraction inutile, TypeScript strict, ESLint et Prettier. Tous les fichiers texte sont en UTF-8. Vérifier les accents.

Les collections locales du fichier natif de profils sont exposées comme sources par le décorateur `ProfileLibrary`, qui implémente `LibraryPort` et délègue les sauvegardes et l’inventaire à `LocalLibrary`. Le domaine analyse les profils sans exposer les favoris. Le port `ProfileStorePort` conserve les autres profils, les lignes inconnues, l’encodage et les fins de ligne lors des écritures ciblées. Les identifiants opaques des collections dépendent du nom et de l’identité canonique du répertoire utilisateur. Les mutations partagent le verrou de `LocalLibrary`, exigent le jeu fermé, contrôlent la révision complète du fichier et créent une copie avant écriture atomique. Une erreur de lecture des collections reste visible sans bloquer la liste des sauvegardes physiques.
