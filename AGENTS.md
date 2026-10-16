# Architecture validée

L’utilisateur a validé le 16 octobre 2026 TypeScript, React + Vite, Node.js + Fastify et une architecture hexagonale légère.

- `src/domain` : modèles et règles métier, aucune dépendance infrastructure.
- `src/application` : cas d’usage et ports, dépend uniquement du domaine.
- `src/adapters` : fichiers, Steam, HTTP et composition, implémente les ports.
- `web` : interface React, communique avec l’API HTTP uniquement.

Les dépendances vont vers le domaine. Aucun accès disque ou réseau dans le domaine. Les écritures sauvegardent le fichier avant modification et vérifient les modifications concurrentes. Serveur limité à 127.0.0.1, contrôle d’origine des mutations. Ne jamais exposer `.env` ni de clé Steam au navigateur.

Les transferts serveur sont des règles du domaine ; leurs cas d’usage analysent et exportent sans écriture. Les actions de compte Steam passent par les ports `SteamAccountPort` et `SteamCatalogPort`. L’adaptateur de navigateur utilise exclusivement un profil dédié ignoré par Git. Aucun cookie ou jeton ne franchit l’API HTTP. Les tests de ces ports utilisent des doubles et ne modifient jamais un compte Steam réel.

Les incompatibilités déclarées sont des constats ; les collisions sont des soupçons. Ne jamais garantir l’absence de conflits par analyse statique. Aucun retrait ou désabonnement réel pendant les tests sur les données utilisateur.

Respecter SOLID sans abstraction inutile, TypeScript strict, ESLint et Prettier. Tous les fichiers texte sont en UTF-8. Vérifier les accents.
